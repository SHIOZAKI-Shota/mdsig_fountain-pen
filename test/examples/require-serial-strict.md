# Service Agreement

This agreement is made between **Example Corp** ("Provider") and **Alice** ("Client").

1. The Provider will deliver the service described in Appendix A.
2. The Client will pay the fees listed in Appendix B within 30 days.

| Item | Fee |
| --- | --- |
| Setup | 1,000 USD |
| Monthly | 200 USD |

日本語の本文も UTF-8 でそのまま署名されます。

<!-- md-signature
v: 0.0.2
method: git-hosting
signer: github.com/alice
key_fp: SHA256:bbXpuKG6zhzdmnxq256TlqzFBzRl2f6OOg722cYNbU8
role: author
ts: 2026-11-16T09:00:00Z
require: |
  order strict
  step 1
  dns:example.com approver
  step 2
  tofu:bob@laptop reviewer
alg: ed25519
hash: sha256:f06c734545219e83074ab04481e4b4715054a8f1ac88367c90d2ce24bc76705c
sig: |
  base64:9rcH0nttb3TuJviWwN9k8IpktLnD1xUydQK6rWypq4p0kcccXw/FOuyzKOcKN1waD1wQs
  b1awoXY7qpjgH6eDA==
-->
<!-- md-signature
v: 0.0.2
method: tofu
signer: bob@laptop
pubkey: ed25519:/FHNjmIYoaONpH7QAjDwWAgW7RO6MwOsXeuRFUiQgCU=
role: reviewer
ts: 2026-11-16T09:20:00Z
alg: ed25519
hash: sha256:d52e2cd074687ff7b762bb1ceb85259bc71c386945586c3072b31db74dab19d6
sig: |
  base64:qOZbC58FJtQ7hr32jpoHSXWyC8N7je8FNvpMGgyjeVLpcjSFKidMRg6v+LPz9jJyFwcOW
  cWzrdHFNRAdHP6sDg==
-->
<!-- md-signature
v: 0.0.2
method: dns
signer: example.com
selector: 2026
role: approver
ts: 2026-11-16T09:30:00Z
alg: ed25519
hash: sha256:46a1e27ce3fe6fdacc1c8c0f497410f6f1f6539ea325e6a4e89b3d7f01d48c5b
sig: |
  base64:uBz5tG3I4oisVwTF3BnCQLblr6ERDFCyeOYXgnm+Kb3rRvaeWvJeFZu8fPJPN45dEUmat
  PVogNBwvbVsOD2fDQ==
-->
