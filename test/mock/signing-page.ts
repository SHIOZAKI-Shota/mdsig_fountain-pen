import { checkHandoffRequest, createSoftwareAuthenticator, handoffResponseUrl, payloadMatchesKey, sha256, toBase64Url, type WebAuthnSigner } from "@mdsig/core";

const authenticators = new Map<string, WebAuthnSigner>();
const credentials = new Map<string, string>();

export async function signingPage(raw: string, opts: { refuse?: "cancelled" | "invalid-request" | "unsupported"; flags?: number } = {}): Promise<string | null> {
  const rp = new URL(raw).hostname;
  const r = checkHandoffRequest(raw, rp);
  if (!r.ok) return r.returnUrl ? handoffResponseUrl(r.returnUrl, r.state!, { error: r.error }) : null;
  if (opts.refuse) return handoffResponseUrl(r.returnUrl, r.state, { error: opts.refuse });
  let auth = r.op === "key" && opts.flags !== undefined ? undefined : authenticators.get(rp);
  if (!auth) {
    auth = await createSoftwareAuthenticator(rp, `https://${rp}`, opts.flags);
    authenticators.set(rp, auth);
    credentials.set(rp, toBase64Url(crypto.getRandomValues(new Uint8Array(16))));
  }
  if (r.op === "key") return handoffResponseUrl(r.returnUrl, r.state, { rpId: rp, key: auth.publicKey, credential: credentials.get(rp)! });
  if (!payloadMatchesKey(r.fields, auth.publicKey)) return handoffResponseUrl(r.returnUrl, r.state, { error: "invalid-request" });
  return handoffResponseUrl(r.returnUrl, r.state, await auth.getAssertion(await sha256(r.payload), { userVerification: r.userVerification }));
}
