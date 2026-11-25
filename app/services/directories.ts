import { DEFAULT_KEY_DIRECTORIES, directoriesFromRecords, dohTxt, isKeyDirectoryUrl } from "@mdsig/core";
import { native, readJson } from "./native.ts";
import { documentFetch } from "./net.ts";
import { settings, saveSettings } from "./settings.ts";

export { DEFAULT_KEY_DIRECTORIES };

const clean = (u: string) => u.trim().replace(/\/+$/, "");

export async function storedKeyDirectories(): Promise<string[]> {
  const list = await readJson<unknown>(native.sharedRead("key_directories.json"), []);
  return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
}

export async function trustedKeyDirectories(): Promise<string[]> {
  return [...new Set([...DEFAULT_KEY_DIRECTORIES, ...(await storedKeyDirectories()).map(clean)])];
}

// SPEC 4.7: the directory named by the email domain's _mdsig record, otherwise the first trusted one
export async function registrationDirectory(email: string): Promise<string> {
  const domain = email.slice(email.lastIndexOf("@") + 1);
  const named = directoriesFromRecords(await dohTxt(`_mdsig.${domain}`, { fetch: documentFetch }).catch(() => [] as string[]));
  if (named.length > 1) throw new Error("several-directories");
  return named[0] ?? (await trustedKeyDirectories())[0]!;
}

async function writeStored(list: string[]) {
  await native.sharedWrite("key_directories.json", JSON.stringify(list, null, 2) + "\n");
}

export async function addKeyDirectory(url: string) {
  const u = clean(url);
  if (!isKeyDirectoryUrl(u)) throw new Error("https");
  const list = (await storedKeyDirectories()).map(clean);
  if (DEFAULT_KEY_DIRECTORIES.includes(u) || list.includes(u)) return;
  await writeStored([...list, u]);
}

export async function removeKeyDirectory(url: string) {
  const u = clean(url);
  await writeStored((await storedKeyDirectories()).map(clean).filter((x) => x !== u));
}

export interface SigningPage {
  url: string;
  from: "directory" | "added";
}

export async function signingPages(): Promise<SigningPage[]> {
  const out: SigningPage[] = (await trustedKeyDirectories()).map((d) => ({ url: `${d}/sign`, from: "directory" }));
  for (const p of settings.signingPages) if (!out.some((x) => x.url === clean(p))) out.push({ url: clean(p), from: "added" });
  return out;
}

export async function addSigningPage(url: string) {
  const u = clean(url);
  if (!isKeyDirectoryUrl(u)) throw new Error("https");
  if (!settings.signingPages.includes(u)) settings.signingPages = [...settings.signingPages, u];
  await saveSettings();
}

export async function removeSigningPage(url: string) {
  settings.signingPages = settings.signingPages.filter((x) => x !== clean(url));
  await saveSettings();
}
