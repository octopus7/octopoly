# Core integration automated validation — 2026-08-10

## Outcome

The deterministic desktop gates for the 09 Core integration pass. Physical Safari/iPadOS 17.4 and Apple Pencil
validation was not available in this environment, so release readiness remains `BLOCKED`.

This record intentionally does not claim that jsdom, a deterministic WebGL2 fake, or the earlier desktop Chromium
Pages smoke is physical-device evidence.

## Commands and results

| Command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npx vitest run tests/optional-sdk/webgl2 tests/device tests/e2e` | PASS — 3 files / 15 tests |
| `npm run test` | PASS — 87 files / 432 tests |
| `npm run build` | PASS — Safari 17 / ES2022 Vite production build |
| `npm run ci` | PASS — typecheck, 432 tests, build, artifact limits |
| `npm run verify:core` | PASS — source isolation scan, temp Core typecheck/test/build, artifact gate |
| `npm run verify:ipad` | automated fixture PASS; physical device `NOT_RUN`; release readiness `BLOCKED` |
| Production preview browser smoke | PASS — 1024×1366 portrait and 1366×1024 landscape, WebGL2 ready, zero X/Y overflow |

CI artifact evidence: 61,175 compressed JS+CSS bytes, 221,238 parsed JS bytes, no budget warning or hard-limit failure.
The Core-only verifier found no `src/extensions/**` dependency and no WGSL source; it built into a unique temporary
directory and removed that directory without deleting or moving source files.

## Automated coverage

- Actual `CoreWorkspace` composition: reference persist/resolve, non-identity world-space bake, WebGL2 reference draw,
  normalized Pencil samples including a coalesced sample, tool capture, picking ray, surface hit, staged retopo mutation
  feedback, one-stroke/one-history-entry, undo/redo stable IDs, selection/render, project save/reload, OBJ and GLB export.
- Cancel path: DOM lost pointer capture becomes one normalized cancel, clears preview, rolls back an already-applied patch,
  and leaves mesh/history unchanged.
- Renderer path: Core WebGL2 context loss/restore redraws the retained CPU scene without WebGPU or WGSL.
- Optional SDK WebGL2 harness: contract-only GLSL ES 300 providers, candidate `[quality, realtime]` ordering,
  supports/missing/compile/link/uniform/image failures, Core fallback, image revision notification, and context reacquire.
- iPad fixture: down/move/coalesced/up, pressure, tilt, capture/lost capture/explicit cancel, Pencil-versus-touch routing,
  CSS-pixel resize/orientation recovery, DPR separation, and deterministic context restoration.
- Desktop Chromium production preview: `OctoPoly` title, WebGL2 ready with 16,384px max texture, 14 accessible
  toolbar controls, `touch-action: none`, tool activation, portrait/landscape canvas resize, zero document overflow,
  and zero console warning/error. This verifies the responsive browser path but is not Safari/Pencil evidence.

## Physical-device status

- Minimum-line physical iPad on Safari/iPadOS 17.4: `NOT_RUN`
- Current representative physical iPad: `NOT_RUN`
- Apple Pencil edge-of-screen capture, background/foreground, and driver-level context recovery: `NOT_RUN`
- Five-run cold/interactive metrics, Safari GPU/CPU traces, memory ledgers, and 30-minute thermal run: `NOT_RUN`
- Release readiness: `BLOCKED`

Run `physical-device-checklist.md` on both required devices and validate the completed machine-readable record with
`node scripts/verify-ipad.mjs --require-physical --evidence <path>` before any release-readiness claim.
