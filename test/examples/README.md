# Test vectors (format 0.1)

Cross-implementation vectors for md-signature. `npm run examples` in `packages/core` regenerates every file here (it contacts a real TSA; `-- --no-tsa` skips the TSA vectors). Both the TypeScript and the Go test suites verify each file listed in `expected.json`.

## How to run them

- `keys.json` holds the public test keys and the stubs a verifier under test must use instead of the network: `dns` (TXT records by `<selector>._mdsig.<signer>`), `git-hosting` (key lists), `fetch` (URL to file; `"404"` is an HTTP 404, URLs not listed are network errors), `dns_records` (DoH answers: a list of TXT strings, `[]` for NODATA, `"SERVFAIL"`; names not listed are NXDOMAIN), and `now` (the current time). Local resources resolve against this directory.
- `expected.json` has, per file, the hand-written verdicts (`ok`, `signatures` as `status` or `status:code`, `agreement`, and where relevant `tsa`, `partial`, `resources`, `revocation`, `pgp`, `warnings`) and the details recorded from the TypeScript implementation that other implementations must reproduce: `agreement_json` (the `agreement` object of CLI_SPEC 5), `table` (signature table rows, snake_case), `times` (`T(k)` per block, SPEC 4.6), `marker` (line of the signature table marker, SPEC 5.11), and `verdict` (the verdict on the whole document, matching the exit codes of CLI_SPEC 4: `valid` 0, `pending` 5, `unresolved`, `offline` and `undetermined` 3, the rest 1).
- JavaScript tools can take these files from the npm package: `@mdsig/core` ships them as `@mdsig/core/examples/*`, and `vectorOptions(keys, readFile)` from `@mdsig/core/testing` builds `VerifyOptions` with the stubs above (`readFile` gets a path relative to this directory and returns the bytes, or null when there is no such file).
- These keys are public. Never use them for real signatures.

## Basics

| File | Purpose |
| --- | --- |
| `valid-single.md` | One `tofu` signature. |
| `valid-cosigned.md` | `git-hosting` then `dns`, and a `tsa` block appended by `sign --tsa` (SPEC 4.6); `T(k)` for blocks 1 and 2. |
| `valid-crlf.md` | CRLF document; normalization (SPEC 5.1). |
| `tampered.md`, `tampered-metadata.md` | Body changed (hash mismatch); a signed field changed (bad signature). |
| `unsigned-trailer.md` | Text after the last block: no chain, verification fails. |
| `unclosed-fence.md` | The body ends inside a code fence: still valid, with a warning (SPEC 5.5). Made by hand, since generators refuse it. |

## Grammar and identifiers (SPEC 3.2 to 3.5)

| File | Purpose |
| --- | --- |
| `valid-double-hyphen.md` | `--` is allowed in values in 0.1. |
| `malformed-value-comment-close.md` | `-->` in a value. |
| `malformed-zero-width.md`, `malformed-bidi-control.md` | Cf characters (U+200B, U+202E) in a value. |
| `malformed-trailing-space-folded.md` | Trailing space on a continuation line. |
| `malformed-missing-alg.md` | `alg` is required. |
| `malformed-duplicate-version.md`, `unsupported-version-new-field.md` | Repeated `v` (malformed); `v: 9.9.9` with an unknown field (unsupported version first). |
| `unsupported-version-v004.md` | A format 0.0.4 block: unsupported, with a hint to use mdsig v0.0.5. |
| `unknown-field.md` | A key that is neither defined nor `x_*`. |
| `valid-display-name.md`, `malformed-display-name.md` | `display_name`; over 64 code points is malformed. |
| `malformed-signer-uppercase.md`, `malformed-signer-star.md` | Non-canonical `dns` signer; `*` in a signer. |
| `valid-xn-signer.md` | A `dns` signer with an A-label (`xn--`). |
| `malformed-git-hosting-ip.md`, `malformed-directory-signer.md` | IP literal host; upper-case email address. |

## Resources and sections (SPEC 5.6, 5.7)

| File | Purpose |
| --- | --- |
| `valid-resources.md` | A local file (checked) and a URL (not fetched). |
| `tampered-resource.md`, `missing-resource.md` | Hash mismatch; missing file. |
| `valid-resource-query.md` | A remote reference with a query string: the target is the first item and may contain `=` (SPEC 3.5). Not fetched by default. |
| `valid-resource-percent.md` | `assets/meeting%20notes.txt` decodes to a name with a space. |
| `malformed-resource-percent.md` | `..%2F` in a local reference. |
| `malformed-resource-colon.md` | `%3A` (`:`) in a local reference: a Windows alternate data stream (SPEC 5.7). |
| `valid-scoped-edited.md`, `tampered-scoped.md`, `malformed-unclosed-section.md` | `scope`: editable text outside sections, a changed section, an unclosed section. |

## require (SPEC 5.8, Appendix C)

| File | Purpose |
| --- | --- |
| `pending-require.md`, `complete-require.md` | One named line with `role=`. |
| `pending-require-scoped.md` | A scoped block never satisfies (`rejected` reason `scoped`). |
| `require-serial-complete.md`, `require-serial-pending.md` | Two steps under `pending`; an early signature (`early`). |
| `require-serial-guide.md`, `require-serial-strict.md` | The same early signature under `guide` (reported) and `strict` (violated). |
| `require-any-pending.md`, `require-any-complete.md` | `step any=2`. |
| `malformed-require-steps.md`, `malformed-require-strict-pattern.md` | `any` larger than the signers named; a pattern under `strict`. |
| `unsupported-require-attribute.md` | An unknown attribute: the block stays valid, the agreement is `unsupported`. Made by hand. |
| `require-pattern-subdomain.md`, `require-pattern-boundary.md`, `require-pattern-self.md` | `dns:*.example.com`: a subdomain counts, `badexample.com` does not match, the declarer does not count (`self`). |
| `require-greedy-vs-matching.md` | A first-fit choice would leave a line empty; the matching completes. |
| `require-canonical-assignment.md` | Two maximum matchings; `satisfied` shows the canonical Kuhn result. |
| `require-user-verified-complete.md`, `require-user-verified-pending.md` | `user_verified` with a pinned passkey: UV set, and UP only (`not-user-verified`). |
| `require-declarer-unresolved.md` | The declaring block cannot be checked (its key directory is unreachable): the agreement is `undetermined` although the approval is present (SPEC 5.8.5). |
| `require-rejected-reasons.md` | The two required signers signed, but one key cannot be found (`unresolved`) and the other signature is broken (`not-valid`): the agreement is `pending` and `rejected` gives both reasons (SPEC 5.8.9). |
| `require-tofu-key-mismatch.md` | `pubkey=` differs from the block's key (`key-mismatch`). |

## Rosters and signed lists (SPEC 5.8.8, 5.10)

| File | Purpose |
| --- | --- |
| `require-member-https.md`, `require-member-https-not-member.md` | Roster `lists/members.md`, signed by `dns:example.com`. |
| `require-member-unreachable.md` | The roster URL cannot be fetched: `undetermined`. |
| `roster-wrong-type.md`, `roster-bad-line.md`, `roster-two-fences.md`, `roster-scoped-issuer.md`, `roster-other-issuer.md` | Rosters that must not be trusted: wrong `type`, an invalid entry, two fences, an issuer block with `scope`, a block by another signer. All `undetermined`. |
| `require-member-dns.md` | DNS roster `dns:corp.example` with a matching `m=` record. |
| `require-member-dns-wildcard.md` | A record answers but names someone else (a wildcard): not a member. |
| `require-member-dns-servfail.md` | SERVFAIL: `undetermined`. |
| `not-revoked.md`, `revoked.md` | Revocation list `revocation/example.com.md` (a signed list). |

## Signature table and agent commerce (SPEC 5.11, AGENT_COMMERCE)

| File | Purpose |
| --- | --- |
| `table-marker.md` | One marker, one inside a fence and one repeated (both ignored with warnings); rows with `display_name` and unsigned rows from `next`. |
| `agent-terms.md`, `agent-accepted.md`, `agent-approved.md` | Terms signed by the provider with `dns:* role=accept` then a named final confirmation: pending, still pending after the agent accepts, complete after the confirmation. |

## Keys and methods

| File | Purpose |
| --- | --- |
| `valid-key-snapshot.md`, `key-not-published.md` | Key snapshots (SPEC 4.5). |
| `valid-tsa-block.md`, `valid-tsa-renewal.md`, `tampered-tsa-block.md` | `tsa` blocks and a SHA-512 renewal (need a TSA when generated). |
| `expired.md` | `expires` in the past. |
| `valid-webauthn.md`, `tampered-webauthn.md` | Passkey signatures (`webauthn-es256`). |
| `directory-*.md`, `malformed-directory-signer.md` | Key directories (SPEC 4.7). |
| `dns-unknown-tag.md` | A DNS key record with unknown tags. |
| `valid-pgp-*.md`, `pgp-*.md`, `tampered-pgp.md`, `malformed-pgp-alg.md` | OpenPGP (SPEC 4.3, 6.2); keys in `pgp/`. |
