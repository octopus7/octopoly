# ADR-0001: Toolchain and Repository Commands

- Status: Accepted
- Date: 2026-08-10

## Context

01~08 must branch from one reproducible baseline and run the same checks locally, in CI, and in Cloudflare Pages.
The bootstrap must remain small and must not add a product framework or runtime backend.

## Decision

- Runtime is Node.js `22.18.0` LTS, pinned by `.node-version`.
- Package manager is npm `11.18.0`, declared by `packageManager`; `package-lock.json` lockfile v3 is the only lockfile.
- Dependencies and devDependencies use exact versions and `npm ci` is the canonical clean install.
- TypeScript targets `ES2022`, emits ES modules, uses bundler module resolution, DOM libraries, and all strict checks.
- Vite builds the static SPA from the repository root to `dist`; Vitest uses exactly `jsdom@29.1.1` for DOM bootstrap
  tests and Node for pure contract tests. `jsdom@30.0.1` is excluded because its engine requirement does not match the
  pinned Node.js `22.18.0` baseline.
- No UI framework, CSS framework, lint package, formatter package, runtime polyfill, or Cloudflare runtime package is
  part of the bootstrap. TypeScript strict checking is the baseline static-quality gate; lint/format tooling can be
  proposed later with measured value.
- Canonical commands are `npm ci`, `npm run typecheck`, `npm run test`, `npm run build`, and `npm run ci`.
  `npm run ci` performs typecheck, one-shot tests, production build, and `scripts/verify-baseline.mjs`.
- Test timeout is 5 seconds per test. Tests do not watch in CI.
- Source paths are rooted at `src`; tests are rooted at `tests`. The canonical public contract import is
  `@octopoly/contracts`, mapped to `src/contracts/index.ts`. Relative imports do not cross workstream package roots.

## Alternatives

- A UI framework was rejected because the bootstrap has no feature UI and the extra runtime would consume budget.
- pnpm and Yarn were not selected because the existing Pages command and requested workflow use npm.
- Node 26 Current was not selected because production tooling uses the LTS line.

## Consequences

Agent A must materialize these versions and commands in its owned configuration. Agent C code is framework-free and
can be tested with the shared Vitest runner when that configuration lands.

## Validation

Run `npm ci` from a clean checkout, then `npm run ci`. Pages must use `npm run build` with output directory `dist`.
