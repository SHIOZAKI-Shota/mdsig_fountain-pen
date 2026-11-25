import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { signingPage } from "./signing-page.ts";
import { handleHandoffUrl } from "../../app/services/handoff.ts";

const docs = import.meta.glob(["../examples/*.md", "./*.md"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const byName = (n: string) => docs[`../examples/${n}`] ?? docs[`./${n}`];

export function install() {
  const params = new URLSearchParams(location.search);
  const files = new Map<string, string>();
  const secrets = new Map<string, string>();
  const shared = new Map<string, string>();
  const local = new Map<string, string>([["settings.json", JSON.stringify({ network: false, lang: params.get("lang") ?? "auto" })]]);
  const pending = params.get("doc") ? [`/Users/demo/Documents/${params.get("doc")}`] : [];
  mockWindows("main");
  mockIPC((cmd, args) => {
    const a = (args ?? {}) as Record<string, string>;
    switch (cmd) {
      case "take_pending":
        return pending.splice(0);
      case "recent":
        return ["/Users/demo/Documents/valid-cosigned.md", "/Users/demo/Documents/pending-require.md", "/Users/demo/Documents/tampered.md"];
      case "open_document": {
        const name = a.path!.split("/").pop()!;
        const text = files.get(a.path!) ?? byName(name);
        if (text === undefined) throw "not found";
        return { path: a.path, name, text };
      }
      case "open_dialog":
        return null;
      case "save_document":
        files.set(a.path!, a.text!);
        return null;
      case "save_dialog":
        return null;
      case "local_read":
        return local.get(a.name!) ?? null;
      case "local_write":
        local.set(a.name!, a.text!);
        return null;
      case "shared_read":
        return shared.get(a.name!) ?? null;
      case "shared_write":
        shared.set(a.name!, a.text!);
        return null;
      case "host_name":
        return "demo-mac";
      case "keychain_set":
        secrets.set(a.id!, a.secret!);
        return null;
      case "keychain_get":
        return secrets.get(a.id!) ?? null;
      case "keychain_delete":
        secrets.delete(a.id!);
        return null;
      case "plugin:opener|open_url":
        setTimeout(() => void signingPage(String(a.url)).then((r) => r && handleHandoffUrl(r)), 400);
        return null;
      case "ssh_key_files":
      case "agent_keys":
        return [];
      case "gpg_secret_keys":
      case "gpg_export":
      case "read_resource":
        throw "not available";
      default:
        if (cmd.startsWith("plugin:event") || cmd.startsWith("plugin:window") || cmd.startsWith("plugin:webview")) return 0;
        throw `mock: ${cmd}`;
    }
  });
}
