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
v: 0.1
method: git-hosting
signer: github.com/alice
key_fp: SHA256:bbXpuKG6zhzdmnxq256TlqzFBzRl2f6OOg722cYNbU8
role: author
ts: 2026-11-16T09:00:00Z
require: |
  order mode=strict
  step
    dns:example.com role=approver
  step
    tofu:bob@laptop role=reviewer
alg: ed25519
hash: sha256:f06c734545219e83074ab04481e4b4715054a8f1ac88367c90d2ce24bc76705c
sig: |
  base64:mFFcerqArFWj8NP1lsB/YXAazBeQGE6lNlJVW1fSgZ3AI8Haup+UKqzUvIukDKLtaRSDF
  Equ3wdYU77AJQ5pDQ==
-->
<!-- md-signature
v: 0.1
method: tofu
signer: bob@laptop
pubkey: ed25519:/FHNjmIYoaONpH7QAjDwWAgW7RO6MwOsXeuRFUiQgCU=
role: reviewer
ts: 2026-11-16T09:20:00Z
alg: ed25519
hash: sha256:eb431d15561aee48ea17b6839276bfadf5cd835b9f6b5fc16f6df689d5b32269
sig: |
  base64:XoUpG3E+R3ZTg7L/ZsreE5F95A4gE65rubMqkBJVTArDA/ocepuSokt25neL4L7w93qPP
  ISimthCFFIpQmGFAw==
-->
<!-- md-signature
v: 0.1
method: dns
signer: example.com
selector: 2026
role: approver
ts: 2026-11-16T09:30:00Z
alg: ed25519
hash: sha256:06ebdb7ffcabbc26b47211141f9a23209f3bbfec3da9efa13f6f194037e17fc0
sig: |
  base64:5oc39XiI3jotIcM5HMRYb3rswEKKTZ4BIzcGfMQDWte5SpCHJhtTPO9T1sEKij7yQnCuN
  zhYcsFtCwiOIUijCw==
-->
