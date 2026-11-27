import { serializeRequire, type RequireSpec, type RequirementAttributes } from "@mdsig/core";

export type DraftOrder = "pending" | "guide" | "strict";

export interface DraftLine {
  method: string;
  signer: string;
  role: string;
  userVerified: boolean;
  memberOf: string;
  pubkey: string;
}

export interface DraftStep {
  any: string;
  lines: DraftLine[];
}

export interface Draft {
  order: DraftOrder;
  steps: DraftStep[];
}

export const REQUIRE_METHODS = ["dns", "git-hosting", "directory", "pgp", "tofu"] as const;

export const emptyLine = (): DraftLine => ({ method: "dns", signer: "", role: "", userVerified: false, memberOf: "", pubkey: "" });
export const emptyDraft = (): Draft => ({ order: "pending", steps: [{ any: "", lines: [emptyLine()] }] });

function toInput(l: DraftLine): { method: string; signer: string; attributes: RequirementAttributes } {
  const a: RequirementAttributes = {};
  if (l.role.trim()) a.role = l.role.trim();
  if (l.userVerified) a.user_verified = true;
  if (l.memberOf.trim()) a.member_of = l.memberOf.trim();
  if (l.method === "tofu" && l.pubkey.trim()) a.pubkey = l.pubkey.trim();
  return { method: l.method, signer: l.signer.trim(), attributes: a };
}

export function serializeDraft(d: Draft): string {
  return serializeRequire({
    order: d.order,
    steps: d.steps.map((s) => ({ any: s.any.trim() ? Number(s.any.trim()) : null, lines: s.lines.filter((l) => l.signer.trim()).map(toInput) })),
  });
}

export function draftFromSpec(spec: RequireSpec): Draft {
  return {
    order: spec.order,
    steps: spec.steps.map((s) => ({
      any: s.any === null ? "" : String(s.any),
      lines: s.lines.map((r) => ({
        method: r.method,
        signer: r.signer,
        role: r.attributes.role ?? "",
        userVerified: r.attributes.user_verified === true,
        memberOf: r.attributes.member_of ?? "",
        pubkey: r.attributes.pubkey ?? "",
      })),
    })),
  };
}
