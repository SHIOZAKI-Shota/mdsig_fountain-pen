import { reactive } from "vue";
import { openUrl } from "@tauri-apps/plugin-opener";
import { HandoffError, SignError, type HandoffRequest, type HandoffTransport } from "@mdsig/core";
import { t } from "../lib/i18n.ts";

export const HANDOFF_SCHEME = "mdsig+fountain-pen";
export const RETURN_URL = `${HANDOFF_SCHEME}://handoff`;
const TIMEOUT = 10 * 60 * 1000;

interface Pending {
  resolve: (answer: string) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const pending = new Map<string, Pending>();
let opener: (url: string) => Promise<void> = (url) => openUrl(url);

export function setHandoffOpener(f: (url: string) => Promise<void>) {
  opener = f;
}

export const waiting = reactive({ current: null as null | { state: string; host: string; op: "key" | "sign"; userVerification: boolean } });

export class HandoffCancelled extends Error {}

export const transport: HandoffTransport = (req: HandoffRequest) => {
  const u = new URL(req.url);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(req.state, null, new HandoffCancelled(t("The signing page did not answer in time."))), TIMEOUT);
    pending.set(req.state, { resolve, reject, timer });
    waiting.current = { state: req.state, host: u.hostname, op: u.searchParams.get("op") === "key" ? "key" : "sign", userVerification: u.searchParams.get("user_verification") === "required" };
    opener(req.url).catch((e) => finish(req.state, null, new Error(String(e))));
  });
};

function finish(state: string, answer: string | null, error?: Error) {
  const p = pending.get(state);
  if (!p) return;
  pending.delete(state);
  clearTimeout(p.timer);
  if (waiting.current?.state === state) waiting.current = null;
  if (error) p.reject(error);
  else p.resolve(answer!);
}

export function cancelHandoff() {
  const w = waiting.current;
  if (w) finish(w.state, null, new HandoffCancelled(t("Cancelled")));
}

// security: only answers to a request this app is waiting for are used, and each only once
export function handleHandoffUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  const state = u.searchParams.get("state") ?? "";
  if (u.protocol !== `${HANDOFF_SCHEME}:` || !pending.has(state)) return false;
  finish(state, raw);
  return true;
}

export async function viaPage<T>(f: () => Promise<T>): Promise<T> {
  try {
    return await f();
  } catch (e) {
    if (e instanceof HandoffError) {
      if (e.code === "cancelled") throw new HandoffCancelled(t("Cancelled"));
      if (e.code === "bad-response") throw new Error(t("The signing page did not answer this request correctly."));
      throw new Error(t("The signing page refused the request ({0}).", e.code));
    }
    if (e instanceof SignError && /user verification was required/.test(e.message)) throw new Error(t("This document asks for user verification, but the passkey signed without it. Sign again and unlock the passkey with your fingerprint, face, or PIN."));
    if (e instanceof SignError && /does not verify/.test(e.message)) throw new Error(t("The signature from the signing page does not verify."));
    throw e;
  }
}
