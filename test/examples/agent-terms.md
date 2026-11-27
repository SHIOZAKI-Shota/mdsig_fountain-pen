# Data access terms (offer 7f3c)

Provider: example.com. Counterparty: the agent that accepts below.

- Price: 0.002 USD per request, settled by x402.
- Rate limit: 10 requests per second.
- The provider confirms each acceptance before access starts.

<!-- mdsig:signatures -->

<!-- md-signature
v: 0.1
method: dns
signer: example.com
selector: 2026
display_name: Example Data
role: offer
ts: 2026-11-16T09:00:00Z
require: |
  step
    dns:* role=accept
  step
    dns:example.com role=confirm
alg: ed25519
hash: sha256:1337085b3d6b72b70ba73dd0bd5dec87fc1dd5262e893ac35d0e1204eeb66412
sig: |
  base64:pVTrUqHTCgntZimY722EZKPob9FMMF3k5k1PRAbeF7+NTxGgpIQ6HwIGpSnhoKE4RQIZR
  cCu6Ii5EMJrwo1eAQ==
-->
