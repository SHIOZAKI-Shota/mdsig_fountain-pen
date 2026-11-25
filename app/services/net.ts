import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { publicHostFetch } from "@mdsig/core";

type Init = RequestInit & { maxRedirections?: number; connectTimeout?: number };

export const netFetch: typeof fetch = (input, init) => {
  const o: Init = { ...(init ?? {}), connectTimeout: 15000 };
  if (o.redirect === "manual") o.maxRedirections = 0;
  delete o.redirect;
  return tauriFetch(input, o);
};

// security: hosts chosen by a document (key lookups, revocation lists, resources) must be public
export const documentFetch = publicHostFetch(netFetch);
