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
<!-- md-signature
v: 0.1
method: dns
signer: agent.example
selector: 2026
display_name: Buyer Agent
role: accept
ts: 2026-11-16T09:10:00Z
alg: ed25519
hash: sha256:c0c0b46b2614b9ce8eabbe17c5487b28770170086a369b47d14beb56b14351d3
sig: |
  base64:EdK+4V3ZNxz6UZ0S+Td0X/G62t6ut6Ld6puNaDh0Ae3LN8ArJ4Wc2P+Ke3Xd+zHfrRplJ
  tAu0Jpgi/1FDo3mDg==
-->
