# Cloudflare Pages Validation Evidence

## Existing connection evidence

- Recorded: 2026-08-10
- Source: user-provided Cloudflare success message
- Project: `octopoly`
- Production URL: `https://octopoly.pages.dev/`
- Repository state: current GitHub repository was deployed successfully before application implementation
- Interpretation: Git integration/project reachability evidence only; it is not OctoPoly Bootstrap deployment evidence

No Pages project, binding, secret, Function, Worker, or Wrangler configuration is created from this repository.

## Required Bootstrap production record

The main Bootstrap agent records all of the following after Agent A/B/C reconciliation and final push:

- final Git commit SHA and `main` ancestry
- Pages deployment identifier, production URL, status, and dashboard commit SHA
- `npm ci`, typecheck, test, build, and baseline verifier output
- local `dist/index.html` SHA-256
- production root and `/__octopoly_bootstrap_probe__` status/body equality
- production security/cache headers and immutable asset hashes
- physical iPad checks that were run, and explicit limitations for those not run
- annotated `baseline/core-v1` tag and `git rev-parse baseline/core-v1^{commit}` output

Canonical commands:

```text
npm ci
npm run ci
node scripts/verify-pages.mjs https://octopoly.pages.dev/ dist /__octopoly_bootstrap_probe__
```

The JSON output from both verification scripts is copied into the dated deployment record without editing measured
values. The deployment detail screenshot or exported text must identify the same commit SHA; matching public bytes alone
does not prove commit identity.

Bootstrap production evidence: [`2026-08-10-bootstrap-production.md`](2026-08-10-bootstrap-production.md)
