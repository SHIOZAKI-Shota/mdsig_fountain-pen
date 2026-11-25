import { invoke } from "@tauri-apps/api/core";

export interface OpenedDoc {
  path: string;
  name: string;
  text: string;
}

export const native = {
  takePending: () => invoke<string[]>("take_pending"),
  recent: () => invoke<string[]>("recent"),
  openDocument: (path: string) => invoke<OpenedDoc>("open_document", { path }),
  openDialog: () => invoke<OpenedDoc | null>("open_dialog"),
  saveDocument: (path: string, text: string) => invoke<void>("save_document", { path, text }),
  saveDialog: (suggested: string, text: string) => invoke<OpenedDoc | null>("save_dialog", { suggested, text }),
  readResource: (doc: string, reference: string) => invoke<ArrayBuffer>("read_resource", { doc, reference }),
  sharedRead: (name: string) => invoke<string | null>("shared_read", { name }),
  sharedWrite: (name: string, text: string) => invoke<void>("shared_write", { name, text }),
  localRead: (name: string) => invoke<string | null>("local_read", { name }),
  localWrite: (name: string, text: string) => invoke<void>("local_write", { name, text }),
  hostName: () => invoke<string>("host_name"),
  keychainSet: (id: string, secret: string) => invoke<void>("keychain_set", { id, secret }),
  keychainGet: (id: string) => invoke<string | null>("keychain_get", { id }),
  keychainDelete: (id: string) => invoke<void>("keychain_delete", { id }),
  sshKeyFiles: (configured: string) => invoke<{ path: string; name: string; public_key: string | null; comment: string; encrypted: boolean }[]>("ssh_key_files", { configured }),
  sshKeyUnlock: (path: string, passphrase?: string) => invoke<{ seed: string; public_key: string }>("ssh_key_unlock", { path, passphrase: passphrase ?? null }),
  sshKeyExport: (name: string, privatePem: string, publicLine: string) => invoke<string>("ssh_key_export", { name, privatePem, publicLine }),
  agentKeys: () => invoke<{ public_key: string; comment: string }[]>("agent_keys"),
  agentSign: (publicKey: string, data: string) => invoke<string>("agent_sign", { publicKey, data }),
  gpgSecretKeys: () => invoke<string>("gpg_secret_keys"),
  gpgSign: (fpr: string, payload: string) => invoke<string>("gpg_sign", { fpr, payload }),
  gpgExport: (fpr: string) => invoke<string | null>("gpg_export", { fpr }),
};

export const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function readJson<T>(read: Promise<string | null>, fallback: T): Promise<T> {
  try {
    const s = await read;
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
}
