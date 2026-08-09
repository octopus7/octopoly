# ADR-0007: Cloudflare Pages Static Delivery

- Status: Accepted
- Date: 2026-08-10

## Context

The GitHub repository is already connected to a Cloudflare Pages project, but the user-confirmed deployment predates the
application. Bootstrap must publish the first feature-free shell without replacing project configuration or adding a
server runtime.

## Decision

- Reuse existing Pages project `octopoly`, production branch `main`, and production URL
  `https://octopoly.pages.dev/`. Repository root is the build root, build command is `npm run build`, and output directory
  is `dist`.
- Existing dashboard Git integration remains the source of truth. No `wrangler.json`, `wrangler.jsonc`, or Wrangler TOML
  configuration is created, downloaded, or deployed.
- The artifact is static only. `functions/`, `_worker.js`, `_routes.json`, bindings, secrets, server APIs, and remote
  persistence are forbidden.
- Vite copies `public/_headers` to `dist/_headers`. The shell uses `Cache-Control: no-cache`; content-hashed `/assets/*`
  use `public, max-age=31536000, immutable`. Static responses receive CSP, Permissions-Policy, Referrer-Policy,
  X-Content-Type-Options, and X-Frame-Options headers.
- `dist/index.html` must exist. A top-level `404.html` and `_redirects` are intentionally absent so Pages' static SPA
  detection serves the same shell for navigation deep links. Asset references are root-absolute.
- Non-main branches and pull requests are preview deployments; only `main` updates production. Candidate and final
  deployment evidence records the Pages deployment URL/status and dashboard commit SHA. The final production body and
  assets must byte-match the local `dist` verified by `scripts/verify-pages.mjs`.
- The current user-confirmed production success is evidence that repository-to-Pages linkage exists, not evidence that
  the OctoPoly app is implemented or that Bootstrap acceptance passes.
- A failed candidate/final deployment receives no baseline tag. Use Pages rollback for immediate recovery, then a normal
  fix commit and roll-forward; never move the immutable tag.
- Future dynamic behavior is a separately approved Cloudflare Worker behind a versioned HTTP API and injected client
  adapter. It cannot become a Core or Optional startup/build prerequisite.

## Alternatives

Recreating the Pages project, adopting repository Wrangler config, adding a Pages Function, and adding `_redirects` for
SPA fallback were rejected because they overwrite existing control-plane state or add unnecessary runtime routing.

## Consequences

Git pushes to `main` use existing integration. Commit identity is established by Pages deployment details/build log and
artifact equality together; the public response alone does not prove a Git SHA.

## Validation

On every release candidate:

1. Run `npm run build` and `node scripts/verify-baseline.mjs dist`.
2. Confirm the Pages deployment detail identifies the expected commit SHA and `main` production environment.
3. Run `node scripts/verify-pages.mjs https://octopoly.pages.dev/ dist /__octopoly_bootstrap_probe__`.
4. Record root/deep-link status, headers, index hash, asset hashes, deployment URL/status, and commit SHA.

Cloudflare documentation is rechecked at execution time: [build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/),
[Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/),
[headers](https://developers.cloudflare.com/pages/configuration/headers/), and
[Pages serving behavior](https://developers.cloudflare.com/pages/configuration/serving-pages/).
