import type { VerifyResult } from "@mdsig/core";
import type { DocumentLayout as Layout } from "@mdsig/core";

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
