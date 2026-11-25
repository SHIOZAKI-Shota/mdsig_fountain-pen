use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::process::{Command, Stdio};

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use serde::Serialize;
use ssh_key::{private::KeypairData, PrivateKey, PublicKey};

const SERVICE: &str = "dev.mdsig.fountain-pen";

fn entry(id: &str) -> Result<keyring::Entry, String> {
    if id.is_empty() || id.len() > 64 || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
    {
        return Err("bad key id".into());
    }
    keyring::Entry::new(SERVICE, id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn keychain_set(id: String, secret: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        entry(&id)?.set_password(&secret).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn keychain_get(id: String) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || match entry(&id)?.get_password() {
        Ok(s) => Ok(Some(s)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn keychain_delete(id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || match entry(&id)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    })
    .await
    .map_err(|e| e.to_string())?
}

fn expand(p: &str) -> Option<PathBuf> {
    if let Some(rest) = p.strip_prefix("~/").or_else(|| p.strip_prefix("~\\")) {
        return dirs::home_dir().map(|h| h.join(rest));
    }
    if p == "~" {
        return dirs::home_dir();
    }
    Some(PathBuf::from(p))
}

#[derive(Serialize)]
pub struct KeyFile {
    path: String,
    name: String,
    public_key: Option<String>,
    comment: String,
    encrypted: bool,
}

fn ed25519_public(pk: &PublicKey) -> Option<String> {
    pk.key_data().ed25519().map(|k| B64.encode(k.0))
}

#[tauri::command]
pub fn ssh_key_files(configured: Option<String>) -> Vec<KeyFile> {
    let mut out = Vec::new();
    let mut paths: Vec<String> = Vec::new();
    if let Some(c) = configured.filter(|c| !c.trim().is_empty()) {
        paths.push(c);
    }
    paths.push("~/.ssh/id_ed25519".into());
    for p in paths {
        let Some(path) = expand(&p) else { continue };
        if out
            .iter()
            .any(|k: &KeyFile| k.path == path.to_string_lossy())
        {
            continue;
        }
        let Ok(pem) = fs::read_to_string(&path) else {
            continue;
        };
        let Ok(key) = PrivateKey::from_openssh(pem.trim()) else {
            continue;
        };
        out.push(KeyFile {
            path: path.to_string_lossy().into_owned(),
            name: path
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default(),
            public_key: ed25519_public(key.public_key()),
            comment: key.comment().to_string(),
            encrypted: key.is_encrypted(),
        });
    }
    out
}

#[derive(Serialize)]
pub struct Unlocked {
    seed: String,
    public_key: String,
}

#[tauri::command]
pub async fn ssh_key_unlock(path: String, passphrase: Option<String>) -> Result<Unlocked, String> {
    tauri::async_runtime::spawn_blocking(move || unlock(&path, passphrase))
        .await
        .map_err(|e| e.to_string())?
}

fn unlock(path: &str, passphrase: Option<String>) -> Result<Unlocked, String> {
    let path = expand(path).ok_or("bad path")?;
    let pem = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut key = PrivateKey::from_openssh(pem.trim()).map_err(|e| e.to_string())?;
    if key.is_encrypted() {
        let Some(pass) = passphrase.filter(|p| !p.is_empty()) else {
            return Err("passphrase-required".to_string());
        };
        key = key
            .decrypt(pass.as_bytes())
            .map_err(|_| "wrong-passphrase".to_string())?;
    }
    match key.key_data() {
        KeypairData::Ed25519(kp) => Ok(Unlocked {
            seed: B64.encode(kp.private.to_bytes()),
            public_key: B64.encode(kp.public.0),
        }),
        _ => Err("not-ed25519".into()),
    }
}

#[tauri::command]
pub fn ssh_key_export(
    name: String,
    private_pem: String,
    public_line: String,
) -> Result<String, String> {
    let base: String = name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
                c
            } else {
                '_'
            }
        })
        .take(32)
        .collect();
    let base = format!(
        "mdsig_{}",
        if base.is_empty() { "key".into() } else { base }
    );
    let dir = dirs::home_dir().ok_or("no home directory")?.join(".ssh");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let mut file = dir.join(&base);
    let mut i = 2;
    while file.exists() || file.with_extension("pub").exists() {
        file = dir.join(format!("{base}_{i}"));
        i += 1;
    }
    let write = |p: &PathBuf, data: &str, mode: u32| -> Result<(), String> {
        let mut opts = fs::OpenOptions::new();
        opts.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            opts.mode(mode);
        }
        #[cfg(not(unix))]
        let _ = mode;
        opts.open(p)
            .and_then(|mut f| f.write_all(data.as_bytes()))
            .map_err(|e| e.to_string())
    };
    write(&file, &private_pem, 0o600)?;
    write(
        &PathBuf::from(format!("{}.pub", file.to_string_lossy())),
        &format!("{}\n", public_line.trim()),
        0o644,
    )?;
    Ok(file.to_string_lossy().into_owned())
}

const REQUEST_IDENTITIES: u8 = 11;
const IDENTITIES_ANSWER: u8 = 12;
const SIGN_REQUEST: u8 = 13;
const SIGN_RESPONSE: u8 = 14;
const MAX_MESSAGE: usize = 256 * 1024;

trait Duplex: Read + Write {}
impl<T: Read + Write> Duplex for T {}

fn connect() -> Result<Box<dyn Duplex>, String> {
    #[cfg(unix)]
    {
        let sock = std::env::var("SSH_AUTH_SOCK").map_err(|_| "no-agent".to_string())?;
        let s =
            std::os::unix::net::UnixStream::connect(sock).map_err(|_| "no-agent".to_string())?;
        s.set_read_timeout(Some(std::time::Duration::from_secs(30)))
            .ok();
        Ok(Box::new(s))
    }
    #[cfg(windows)]
    {
        let path =
            std::env::var("SSH_AUTH_SOCK").unwrap_or_else(|_| r"\\.\pipe\openssh-ssh-agent".into());
        let f = fs::OpenOptions::new()
            .read(true)
            .write(true)
            .open(path)
            .map_err(|_| "no-agent".to_string())?;
        Ok(Box::new(f))
    }
}

fn request(body: &[u8]) -> Result<Vec<u8>, String> {
    let mut conn = connect()?;
    let mut msg = (body.len() as u32).to_be_bytes().to_vec();
    msg.extend_from_slice(body);
    conn.write_all(&msg).map_err(|e| e.to_string())?;
    let mut len = [0u8; 4];
    conn.read_exact(&mut len).map_err(|e| e.to_string())?;
    let n = u32::from_be_bytes(len) as usize;
    if n > MAX_MESSAGE {
        return Err("ssh-agent message too large".into());
    }
    let mut out = vec![0u8; n];
    conn.read_exact(&mut out).map_err(|e| e.to_string())?;
    Ok(out)
}

struct Reader<'a> {
    b: &'a [u8],
    o: usize,
}

impl<'a> Reader<'a> {
    fn u8(&mut self) -> Result<u8, String> {
        let v = *self.b.get(self.o).ok_or("short agent message")?;
        self.o += 1;
        Ok(v)
    }
    fn u32(&mut self) -> Result<u32, String> {
        let s = self
            .b
            .get(self.o..self.o + 4)
            .ok_or("short agent message")?;
        self.o += 4;
        Ok(u32::from_be_bytes([s[0], s[1], s[2], s[3]]))
    }
    fn bytes(&mut self) -> Result<&'a [u8], String> {
        let n = self.u32()? as usize;
        let s = self
            .b
            .get(self.o..self.o + n)
            .ok_or("short agent message")?;
        self.o += n;
        Ok(s)
    }
}

fn ssh_string(out: &mut Vec<u8>, b: &[u8]) {
    out.extend_from_slice(&(b.len() as u32).to_be_bytes());
    out.extend_from_slice(b);
}

#[derive(Serialize)]
pub struct AgentKey {
    public_key: String,
    comment: String,
}

#[tauri::command]
pub async fn agent_keys() -> Result<Vec<AgentKey>, String> {
    tauri::async_runtime::spawn_blocking(list_agent)
        .await
        .map_err(|e| e.to_string())?
}

fn list_agent() -> Result<Vec<AgentKey>, String> {
    let res = request(&[REQUEST_IDENTITIES])?;
    let mut r = Reader { b: &res, o: 0 };
    if r.u8()? != IDENTITIES_ANSWER {
        return Err("ssh-agent refused to list keys".into());
    }
    let n = r.u32()?.min(1000);
    let mut out = Vec::new();
    for _ in 0..n {
        let blob = r.bytes()?;
        let comment = String::from_utf8_lossy(r.bytes()?).into_owned();
        let mut br = Reader { b: blob, o: 0 };
        if br.bytes().ok() != Some(b"ssh-ed25519".as_slice()) {
            continue;
        }
        match br.bytes() {
            Ok(pk) if pk.len() == 32 => out.push(AgentKey {
                public_key: B64.encode(pk),
                comment,
            }),
            _ => continue,
        }
    }
    Ok(out)
}

#[tauri::command]
pub async fn agent_sign(public_key: String, data: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || sign_agent(&public_key, &data))
        .await
        .map_err(|e| e.to_string())?
}

fn sign_agent(public_key: &str, data: &str) -> Result<String, String> {
    let pk = B64.decode(public_key).map_err(|e| e.to_string())?;
    let data = B64.decode(data).map_err(|e| e.to_string())?;
    if pk.len() != 32 {
        return Err("bad public key".into());
    }
    let mut blob = Vec::new();
    ssh_string(&mut blob, b"ssh-ed25519");
    ssh_string(&mut blob, &pk);
    let mut body = vec![SIGN_REQUEST];
    ssh_string(&mut body, &blob);
    ssh_string(&mut body, &data);
    body.extend_from_slice(&0u32.to_be_bytes());
    let res = request(&body)?;
    let mut r = Reader { b: &res, o: 0 };
    if r.u8()? != SIGN_RESPONSE {
        return Err("ssh-agent refused to sign".into());
    }
    let mut sig = Reader {
        b: r.bytes()?,
        o: 0,
    };
    let format = sig.bytes()?;
    let raw = sig.bytes()?;
    if format != b"ssh-ed25519" || raw.len() != 64 {
        return Err("ssh-agent returned an unexpected signature".into());
    }
    Ok(B64.encode(raw))
}

fn gpg_path() -> Option<PathBuf> {
    let name = if cfg!(windows) { "gpg.exe" } else { "gpg" };
    let mut dirs: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|p| std::env::split_paths(&p).collect())
        .unwrap_or_default();
    if cfg!(target_os = "macos") {
        dirs.extend(
            [
                "/opt/homebrew/bin",
                "/usr/local/bin",
                "/usr/local/MacGPG2/bin",
            ]
            .map(PathBuf::from),
        );
    }
    if cfg!(windows) {
        dirs.extend(
            [
                r"C:\Program Files (x86)\GnuPG\bin",
                r"C:\Program Files\GnuPG\bin",
            ]
            .map(PathBuf::from),
        );
    }
    dirs.into_iter().map(|d| d.join(name)).find(|p| p.is_file())
}

fn gpg(args: &[&str], input: Option<&[u8]>) -> Result<Vec<u8>, String> {
    let bin = gpg_path().ok_or("gpg-not-found")?;
    let mut cmd = Command::new(bin);
    cmd.args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let mut child = cmd.spawn().map_err(|_| "gpg-not-found".to_string())?;
    let mut stdin = child.stdin.take().ok_or("gpg stdin")?;
    let input = input.map(|b| b.to_vec());
    let writer = std::thread::spawn(move || {
        if let Some(b) = input {
            let _ = stdin.write_all(&b);
        }
    });
    let out = child.wait_with_output().map_err(|e| e.to_string())?;
    let _ = writer.join();
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        return Err(err
            .trim()
            .lines()
            .last()
            .unwrap_or("gpg failed")
            .to_string());
    }
    Ok(out.stdout)
}

fn check_fpr(fpr: &str) -> Result<(), String> {
    if (fpr.len() == 40 || fpr.len() == 64) && fpr.chars().all(|c| c.is_ascii_hexdigit()) {
        Ok(())
    } else {
        Err("bad fingerprint".into())
    }
}

#[tauri::command]
pub async fn gpg_secret_keys() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(|| {
        gpg(
            &[
                "--batch",
                "--with-colons",
                "--fixed-list-mode",
                "--list-secret-keys",
            ],
            None,
        )
        .map(|b| String::from_utf8_lossy(&b).into_owned())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn gpg_sign(fpr: String, payload: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        check_fpr(&fpr)?;
        let data = B64.decode(payload).map_err(|e| e.to_string())?;
        let user = format!("{fpr}!");
        gpg(
            &[
                "--no-tty",
                "--detach-sign",
                "--digest-algo",
                "SHA256",
                "--local-user",
                &user,
                "--output",
                "-",
            ],
            Some(&data),
        )
        .map(|b| B64.encode(b))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn gpg_export(fpr: String) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        check_fpr(&fpr)?;
        match gpg(&["--batch", "--export", "--", &fpr], None) {
            Ok(b) if !b.is_empty() => Ok(Some(B64.encode(b))),
            _ => Ok(None),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::process::Command;

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("fp-test-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    fn keygen(dir: &std::path::Path, name: &str, pass: &str) -> PathBuf {
        let p = dir.join(name);
        let ok = Command::new("ssh-keygen")
            .args(["-q", "-t", "ed25519", "-N", pass, "-C", "test", "-f"])
            .arg(&p)
            .status()
            .unwrap()
            .success();
        assert!(ok);
        p
    }

    #[test]
    fn unlocks_plain_and_encrypted_keys() {
        let d = tmp("unlock");
        let plain = keygen(&d, "plain", "");
        let enc = keygen(&d, "enc", "secret");
        let a = unlock(plain.to_str().unwrap(), None).unwrap();
        assert_eq!(B64.decode(a.seed).unwrap().len(), 32);
        assert_eq!(
            unlock(enc.to_str().unwrap(), None).err().unwrap(),
            "passphrase-required"
        );
        assert_eq!(
            unlock(enc.to_str().unwrap(), Some("wrong".into()))
                .err()
                .unwrap(),
            "wrong-passphrase"
        );
        let b = unlock(enc.to_str().unwrap(), Some("secret".into())).unwrap();
        let pubfile = fs::read_to_string(format!("{}.pub", enc.display())).unwrap();
        let pk = PublicKey::from_openssh(pubfile.trim()).unwrap();
        assert_eq!(ed25519_public(&pk).unwrap(), b.public_key);
        let files = ssh_key_files(Some(enc.to_string_lossy().into_owned()));
        assert!(files
            .iter()
            .any(|f| f.encrypted && f.public_key.as_deref() == Some(b.public_key.as_str())));
        fs::remove_dir_all(d).ok();
    }

    #[test]
    fn lists_and_signs_through_ssh_agent() {
        let d = tmp("agent");
        let key = keygen(&d, "agent", "");
        let sock = d.join("agent.sock");
        let mut agent = Command::new("ssh-agent")
            .arg("-D")
            .arg("-a")
            .arg(&sock)
            .spawn()
            .unwrap();
        for _ in 0..50 {
            if sock.exists() {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        std::env::set_var("SSH_AUTH_SOCK", &sock);
        assert!(Command::new("ssh-add")
            .arg("-q")
            .arg(&key)
            .env("SSH_AUTH_SOCK", &sock)
            .status()
            .unwrap()
            .success());
        let keys = list_agent().unwrap();
        assert_eq!(keys.len(), 1);
        let sig = B64
            .decode(
                sign_agent(&keys[0].public_key, &B64.encode(b"md-signature/v1\nhello")).unwrap(),
            )
            .unwrap();
        assert_eq!(sig.len(), 64);
        let vk = ed25519_dalek::VerifyingKey::from_bytes(
            &B64.decode(&keys[0].public_key).unwrap().try_into().unwrap(),
        )
        .unwrap();
        vk.verify_strict(
            b"md-signature/v1\nhello",
            &ed25519_dalek::Signature::from_bytes(&sig.try_into().unwrap()),
        )
        .unwrap();
        agent.kill().ok();
        agent.wait().ok();
        fs::remove_dir_all(d).ok();
    }
}
