import { spawnSync } from "node:child_process";
import { homedir } from "node:os";

const existing = process.env.CARGO_ENCODED_RUSTFLAGS
  ?? (process.env.RUSTFLAGS ?? "").split(" ").filter(Boolean).join("\x1f");
// security: keeps the builder's home directory (user name) out of panic locations in the binary.
const remap = `--remap-path-prefix=${homedir()}=~`;
const env = { ...process.env, CARGO_ENCODED_RUSTFLAGS: [existing, remap].filter(Boolean).join("\x1f") };
delete env.RUSTFLAGS;

const result = spawnSync("tauri", ["build", ...process.argv.slice(2)], { stdio: "inherit", shell: true, env });
process.exit(result.status ?? 1);
