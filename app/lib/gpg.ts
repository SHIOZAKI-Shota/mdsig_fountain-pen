export interface GpgKey {
  fpr: string;
  primary: string;
  keyAlg: string;
  uids: string[];
  emails: string[];
}

const ALG: Record<string, string> = { "1": "rsa", "19": "ecdsa", "22": "ed25519", "27": "ed25519" };

export function parseGpgSecretKeys(colons: string): GpgKey[] {
  const keys: GpgKey[] = [];
  let cur: { primary: string; uids: string[]; candidates: { fpr: string; alg: string }[] } | null = null;
  let pending: { alg: string; usable: boolean } | null = null;
  const done = () => {
    if (cur && cur.candidates.length) {
      const c = cur.candidates.at(-1)!;
      const emails = cur.uids.map((u) => (/<([^>]+)>/.exec(u)?.[1] ?? u).toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+$/.test(e));
      keys.push({ fpr: c.fpr, primary: cur.primary, keyAlg: c.alg, uids: cur.uids, emails });
    }
  };
  for (const line of colons.split("\n")) {
    const f = line.split(":");
    if (f[0] === "sec") {
      done();
      cur = { primary: "", uids: [], candidates: [] };
      pending = { alg: ALG[f[3]!] ?? f[3]!, usable: !/[rei]/.test(f[1] ?? "") && (f[11] ?? "").includes("s") };
    } else if (f[0] === "ssb") {
      pending = { alg: ALG[f[3]!] ?? f[3]!, usable: !/[rei]/.test(f[1] ?? "") && (f[11] ?? "").includes("s") };
    } else if (f[0] === "fpr" && cur && pending) {
      if (!cur.primary) cur.primary = f[9]!;
      if (pending.usable) cur.candidates.push({ fpr: f[9]!, alg: pending.alg });
      pending = null;
    } else if (f[0] === "uid" && cur && !/[re]/.test(f[1] ?? "")) {
      cur.uids.push(f[9]!.replace(/\\x([0-9a-f]{2})/gi, (_m, h: string) => String.fromCharCode(parseInt(h, 16))));
    }
  }
  done();
  return keys;
}

export function dearmorSignature(b: Uint8Array): Uint8Array {
  const s = new TextDecoder("latin1").decode(b);
  const m = /-----BEGIN PGP SIGNATURE-----\r?\n(?:[^\r\n]*: [^\r\n]*\r?\n)*\r?\n([\s\S]+?)\r?\n(?:=[^\r\n]*\r?\n)?-----END PGP SIGNATURE-----/.exec(s);
  if (!m) return b;
  return Uint8Array.from(atob(m[1]!.replace(/\s+/g, "")), (c) => c.charCodeAt(0));
}
