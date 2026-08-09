# OctoPoly Bootstrap Production Evidence — 2026-08-10

## Candidate identity

- Git branch: `main`
- Git commit: `db201e7db61321438c51eaea7d87c242d45a7cd6`
- GitHub Actions `validate`: SUCCESS
- Cloudflare Pages check: SUCCESS
- Cloudflare deployment ID: `e08ad106-a69d-4657-88cc-fb0877e2226f`
- Production URL: `https://octopoly.pages.dev/`
- Project: `octopoly`
- Functions / Workers / bindings / secrets: NONE

The first candidate deployment exposed the repository root because the Pages build output setting was incorrect. The
user corrected the existing Git-integrated project to run `npm run build` and publish `dist`, then retried the same
commit. No project recreation or Direct Upload was used.

## Canonical validation

- `npm ci`: PASS, 86 packages, 0 audit vulnerabilities
- `npm run ci`: PASS
- TypeScript strict typecheck: PASS
- Vitest: 4 files, 22 tests PASS
- Vite production build: PASS
- `scripts/verify-baseline.mjs`: PASS
- Compressed JS+CSS: 2,525 bytes
- Parsed JS: 3,680 bytes
- Local `dist/index.html` SHA-256: `667decf3c8ff2db7ee7cd151773b94d80ca013609650834194a6ecbc76d98d3f`

## Production comparison

Checked at `2026-08-09T16:24:08.925Z` (`2026-08-10T01:24:08.925+09:00`) with:

```text
node scripts/verify-pages.mjs https://octopoly.pages.dev/ dist /__octopoly_bootstrap_probe__
```

Result: PASS with no failures.

- `/` and `/__octopoly_bootstrap_probe__`: HTTP success and byte-identical to local `dist/index.html`
- JavaScript: `/assets/index-BsoOfCr_.js`
  - SHA-256: `b4f95f882c6a388c092c05f772794deb52bf772e91956bcbea904c8a41608d1a`
  - Cache-Control: `public, max-age=31536000, immutable`
- CSS: `/assets/index-C-uoTc6u.css`
  - SHA-256: `276e3757304c72c4cc2c41b7cf5d198ec4fdfbea8bb3a8b5aba131f64642b0da`
  - Cache-Control: `public, max-age=31536000, immutable`
- Shell headers: revalidation plus CSP, Permissions-Policy, Referrer-Policy, X-Content-Type-Options, and X-Frame-Options
- Forbidden dynamic/routing artifacts: none

## Browser evidence

- Visible title/product name: `OctoPoly`
- Capability result: `WebGL2 ready`
- Reported maximum texture size: 16,384px
- WebGPU: optional and available
- Root and deep-link shells use root-absolute hashed assets with no horizontal overflow in local automated smoke

## Known limitation

No physical iPad or Safari/iPadOS 17.4 device run was available in this environment. This remains an explicit device
gate for integration/release and is not reported as passed.

The final RESULT commit and immutable `baseline/core-v1` tag are verified against a subsequent successful Pages
deployment and reported externally to avoid embedding a self-referential commit SHA in that commit.
