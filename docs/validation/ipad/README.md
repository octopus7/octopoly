# iPad validation evidence

This directory separates deterministic desktop automation from physical-device release evidence.

- `tests/device/fixtures/ipados-17.4-pencil.json` is replayed by Vitest in jsdom. It proves normalized input ordering,
  pressure/tilt retention, capture cancellation, Pencil/touch classification, viewport updates, and deterministic WebGL2
  context restoration. It is not Safari or Apple Pencil hardware evidence.
- `tests/optional-sdk/webgl2/**` runs the public Renderer API against a deterministic WebGL2 fake. It proves GLSL ES 300
  compile/link/fallback and image/context invalidation behavior, not a physical GPU driver.
- The bootstrap validation in `docs/validation/pages/2026-08-10-bootstrap-production.md` records desktop Chromium
  production evidence. It does not replace the minimum iPadOS line.
- `physical-device-checklist.md` is the required replay procedure. Copy `physical-evidence.template.json`, fill every
  `NOT_RUN`, and attach raw Safari/Instrument exports before changing the physical status to `PASS`.

Commands:

```text
npx vitest run tests/device tests/optional-sdk/webgl2
node scripts/verify-ipad.mjs
node scripts/verify-ipad.mjs --require-physical --evidence docs/validation/ipad/physical-evidence.json
```

Current physical status: `NOT_RUN`. Release readiness is therefore `BLOCKED` even when automated integration is green.
