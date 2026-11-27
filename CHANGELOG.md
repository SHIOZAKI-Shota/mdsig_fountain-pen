# Changelog

## 0.2.0 (unreleased)

- Uses `@mdsig/core` 0.1.1 (format 0.1). Documents signed with format 0.0.x are reported as unsupported.
- Invisible characters are found by `@mdsig/core`: tag characters, ZWJ, ZWNJ, variation selectors, and Hangul fillers are now reported, except where they belong to an emoji or to a word in a script that uses joiners (Arabic, Indic, and others). Required signatures are described with the library's wording.
- Messages from the library (warnings, failure details, agreement details, signing errors) follow the display language. A signature that could not be checked yet is told apart from one that is not valid in "Signature status".
- New agreement results: "Could not fully check" when a member list or the network needed for `require` was not available, and "Not verified" when `require` uses rules this version does not support.
- "Signature status" shows the requirements per declaring signature: order mode, steps, `any=`, patterns, roles, `user_verified`, `member_of`, `pubkey`, which signature satisfied each line, and why others did not count. The side panel lists who signs next.
- Times of signatures come from a later `tsa` block.
- `display_name` is shown next to the verified signer, marked "(self-declared)"; the sign form has a display name field.
- The preview draws the signature table at `<!-- mdsig:signatures -->`, between the parts of the body before and after the marker, outside the sanitized body DOM. "Signature status" has a Table tab. The marker is no longer reported as a hidden comment.
- Verification warnings are shown in the side panel; warnings about one signature are in its card.
- The sign form builds `require` values in the 0.1 syntax with a form or as text, explains the value as you type, and refuses errors. Signers are written in canonical lower-case form and checked first; documents ending inside an open code fence cannot be signed. With a timestamp, a separate `tsa` block is appended.
- Passkey signing asks the signing page for user verification when the document requires it, and explains a refusal when the passkey signed without it.
- Local resources are read from the percent-decoded path; paths with `:` or `\` are refused.

## 0.1.0 (unreleased)

- First version: open, verify, preview, sign, timestamp, and edit md-signature documents on macOS and Windows.
