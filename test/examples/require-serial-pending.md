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
  step 1
  dns:example.com approver
  step 2
  tofu:bob@laptop reviewer
alg: ed25519
hash: sha256:f06c734545219e83074ab04481e4b4715054a8f1ac88367c90d2ce24bc76705c
sig: |
  base64:zIB6RIuQBpIWh6KVzCJk3+E7Gh6swEgcHRgoJp5xQeMsEhv1IFCAhkyBglhF6VT2tMiT9
  YMdWlF4W7djTZWyCQ==
-->
<!-- md-signature
v: 0.0.2
method: tofu
signer: bob@laptop
pubkey: ed25519:/FHNjmIYoaONpH7QAjDwWAgW7RO6MwOsXeuRFUiQgCU=
role: reviewer
ts: 2026-11-16T09:20:00Z
alg: ed25519
hash: sha256:21e784c7b4e36234ee0bd51b7b77fae433ccc2414f0da13b3693e5a5b0f83227
sig: |
  base64:e5haSCWqIDQNc+bg6YdLPI/4wddZI5HtPKfBV30zFqN7NxVi9EL7CJCo/fZnAZLvW7Hfn
  U7Afkc78SYrgOq8Ag==
-->
<!-- md-signature
v: 0.0.2
method: dns
signer: example.com
selector: 2026
role: approver
ts: 2026-11-16T09:30:00Z
alg: ed25519
hash: sha256:c9882c531261b9de4df137e60709826413e990ff3a2e3b8f73770386640df33e
sig: |
  base64:fFq9ZVZeuZ8eIckSi9Euk6yQrzlzDb4rr5VeCDv/zRyZ1VjLSFCaxdelXkH6R+uaumAAw
  eeSkk1eE3DQvYPADA==
-->
