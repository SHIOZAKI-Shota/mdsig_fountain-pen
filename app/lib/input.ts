import { canonicalSignerInput, checkSignInput } from "@mdsig/core";
import { draftFromSpec, type Draft } from "./requireDraft.ts";

export const signerId = (r: { method: string; signer: string }) => canonicalSignerInput(r.method, r.signer.trim());

export interface InputCheck {
  signer: string | null;
  displayName: string | null;
  require: { draft: Draft | null; explanation: string; errors: string[]; warnings: string[]; blocking: boolean } | null;
}

export function checkInput(req: { method: string; signer: string; displayName?: string; require?: string }, lang: "ja" | "en"): InputCheck {
  const c = checkSignInput(req, lang);
  const r = c.require;
  return {
    signer: c.signerError,
    displayName: c.displayNameError,
    require: r && { draft: r.spec ? draftFromSpec(r.spec) : null, explanation: r.explanation, errors: r.errors, warnings: r.warnings, blocking: !r.ok },
  };
}
