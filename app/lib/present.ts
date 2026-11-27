import { describeRequirement, documentVerdict, localizeMessage, type BlockResult, type DeclarationStatus, type Lang, type OrderMode, type RejectReason, type Requirement, type VerifyResult } from "@mdsig/core";

export type T = (message: string, ...args: (string | number)[]) => string;

let messageLang: Lang = "en";

export function setMessageLang(lang: Lang) {
  messageLang = lang;
}

export function coreText(text: string): string {
  return localizeMessage(text, messageLang);
}

export type Tone = "ok" | "bad" | "warn" | "muted";

export function mark(s: BlockResult): string {
  if (s.status === "valid") return "✓";
  if (s.status === "unresolved") return s.code === "offline" ? "−" : "?";
  return "✗";
}

export function tone(s: BlockResult): Tone {
  if (s.status === "valid") return "ok";
  if (s.status === "unresolved") return s.code === "offline" ? "muted" : "warn";
  if (s.status === "unsupported") return "muted";
  return "bad";
}

export function methodLabel(t: T, method: string | undefined): string {
  switch (method) {
    case "git-hosting":
      return t("Git hosting account");
    case "dns":
      return t("Domain");
    case "pgp":
      return t("OpenPGP");
    case "tofu":
      return t("Key only (identity not proven)");
    case "directory":
      return t("Email address (key directory)");
    case "tsa":
      return t("Timestamp");
    default:
      return method ?? "";
  }
}

export function statusText(t: T, s: BlockResult): string {
  if (s.status === "valid") {
    if (s.partial) return t("Valid for part of the document: {0}", s.partial.sections.join(", "));
    return s.fields.method === "tsa" ? t("Timestamp verified") : t("Valid signature");
  }
  switch (s.code) {
    case "hash-mismatch":
      return t("The document was changed after this signature");
    case "bad-signature":
      return t("The signature does not match the signer's key");
    case "malformed":
    case "unknown-field":
      return t("The signature block is broken");
    case "scope-missing":
      return t("A signed section is missing");
    case "resource-mismatch":
      return t("A referenced file has changed");
    case "resource-missing":
      return t("A referenced file is missing");
    case "expired":
      return t("The signature has expired");
    case "revoked":
      return t("The signer withdrew this signature");
    case "key-changed":
      return t("The signer's key differs from the one seen before");
    case "key-not-published":
      return t("The embedded key is not published for this signer");
    case "unsupported-version":
    case "unsupported-alg":
    case "unsupported-hash":
    case "unsupported-method":
      return t("Not supported by this version of the app");
    case "network":
      return t("Could not fetch the public key. Check the network connection");
    case "not-found":
      return t("The signer's public key was not found");
    case "offline":
      return t("Not checked (offline)");
    default:
      return s.status === "invalid" ? t("Invalid signature") : t("Could not check this signature");
  }
}

export function signerLabel(s: BlockResult): string {
  const f = s.fields;
  return f.method === "tsa" ? (s.tsa?.signer ?? f.signer ?? "") : (f.signer ?? "");
}

export function declaredName(t: T, s: BlockResult): string {
  return s.fields.display_name ? t("“{0}” (self-declared)", s.fields.display_name) : "";
}

export function timeText(t: T, s: BlockResult): string | undefined {
  if (s.fields.method === "tsa") return s.tsa?.verified && s.tsa.genTime ? s.tsa.genTime : undefined;
  return s.time ? t("{0} (timestamp #{1})", s.time.at, s.time.block) : undefined;
}

export function lensText(t: T, s: BlockResult): string {
  const f = s.fields;
  const parts = [`${mark(s)} #${s.index}`, f.role ?? "", declaredName(t, s), signerLabel(s), "·", methodLabel(t, f.method)];
  const at = s.fields.method === "tsa" ? timeText(t, s) : s.time?.at;
  if (at) parts.push("·", `⏱ ${at}`);
  if (s.status !== "valid") parts.push("·", statusText(t, s));
  return parts.filter(Boolean).join(" ");
}

export type Summary = "verified" | "pending" | "violated" | "unsupported" | "undetermined" | "failed" | "incomplete" | "offline" | "unsigned" | "broken";

export function summarize(r: VerifyResult): Summary {
  const k = documentVerdict(r).kind;
  return k === "valid" ? "verified" : k === "unresolved" ? "incomplete" : k;
}

export function summaryTone(k: Summary): Tone {
  return k === "verified" ? "ok" : k === "pending" || k === "incomplete" || k === "undetermined" ? "warn" : k === "offline" || k === "unsigned" ? "muted" : "bad";
}

export function summaryMark(k: Summary): string {
  return k === "verified" ? "✓" : k === "pending" ? "…" : k === "offline" || k === "unsigned" ? "−" : k === "incomplete" || k === "undetermined" ? "?" : "✗";
}

export function summaryText(t: T, r: VerifyResult): { title: string; detail: string } {
  const k = summarize(r);
  const n = r.signatures.length;
  const missing = r.agreement.missing.reduce((a, m) => a + (m.need ?? 1), 0);
  switch (k) {
    case "verified":
      return { title: t("Verified"), detail: n === 1 ? t("1 signature is valid") : t("All {0} signatures are valid", n) };
    case "pending":
      return { title: t("Waiting for signatures"), detail: t("{0} more signature(s) needed to complete", Math.max(missing, 1)) };
    case "violated":
      return { title: t("Not verified"), detail: t("Signatures were made out of the required order") };
    case "unsupported":
      return { title: t("Not verified"), detail: t("The required signatures use rules this version does not support") };
    case "undetermined":
      return { title: t("Could not fully check"), detail: t("A member list or the network needed to check the required signatures was not available") };
    case "failed": {
      const bad = r.signatures.filter((s) => s.status !== "valid" && s.status !== "unresolved").length;
      return { title: t("Not verified"), detail: t("{0} of {1} signatures failed", bad, n) };
    }
    case "incomplete": {
      const u = r.signatures.filter((s) => s.status === "unresolved").length;
      return { title: t("Could not fully check"), detail: t("{0} of {1} signatures could not be checked", u, n) };
    }
    case "offline":
      return { title: t("Checked offline"), detail: t("Hashes match; the signers' keys were not checked") };
    case "broken":
      return { title: t("Not verified"), detail: t("There is unsigned content after the last signature") };
    default:
      return { title: t("Not signed"), detail: t("This document has no signatures") };
  }
}

export function requirementText(r: Pick<Requirement, "method" | "signer" | "pattern" | "attributes">): string {
  return describeRequirement(r, messageLang);
}

export function rejectText(t: T, index: number, reason: RejectReason): string {
  switch (reason) {
    case "early":
      return t("#{0} came before the previous step was complete", index);
    case "blocked":
      return t("#{0} already counts for an earlier step", index);
    case "not-member":
      return t("#{0} is not on the member list", index);
    case "roster-unavailable":
      return t("#{0}: the member list could not be obtained", index);
    case "not-user-verified":
      return t("#{0} was signed without user verification", index);
    case "key-mismatch":
      return t("#{0} uses a different key than the one required", index);
    case "self":
      return t("#{0} is the signer who set the requirement and does not count", index);
    case "scoped":
      return t("#{0} covers only part of the document", index);
    case "unresolved":
      return t("#{0} could not be checked yet", index);
    default:
      return t("#{0} is not a valid signature", index);
  }
}

export function declarationText(t: T, status: DeclarationStatus): string {
  switch (status) {
    case "complete":
      return t("Complete");
    case "pending":
      return t("Waiting for signatures");
    case "violated":
      return t("Signatures were made out of the required order");
    case "undetermined":
      return t("Could not be determined");
    default:
      return t("Uses rules this version does not support");
  }
}

export function orderText(t: T, order: OrderMode): string | undefined {
  return order === "strict" ? t("Order is enforced: an early signature fails the document") : order === "guide" ? t("Order is a guide: early signatures count but are reported") : undefined;
}
