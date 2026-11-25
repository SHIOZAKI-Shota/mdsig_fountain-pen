import type { VerifyResult } from "@mdsig/core";
import type { Layout } from "./ranges.ts";

export interface NewKey {
  signer: string;
  key: string;
  fingerprint: string;
}

export interface Entry {
  text: string;
  online: boolean;
  result: VerifyResult;
  layout: Layout;
  newKeys?: NewKey[];
}
