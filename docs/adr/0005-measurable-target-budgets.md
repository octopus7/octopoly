# ADR-0005: Measurable Target Budgets

- Status: Accepted
- Date: 2026-08-10

## Context

OctoPoly must remain practical on iPad Safari. Targets guide normal development; hard limits block integration or release.

## Decision

| Metric | Target | Hard limit | Measurement |
|---|---:|---:|---|
| Initial compressed JS+CSS | 120 KiB | 250 KiB | sum of gzip level-9 Vite entry JS/CSS |
| Parsed JS proxy | 500 KiB | 1000 KiB | uncompressed emitted entry/chunk JS bytes |
| Cold shell | 1.0 s | 2.5 s | navigation start to visible shell, cleared cache |
| First usable frame | 1.5 s | 3.0 s | navigation start to first ready interactive frame |
| Interactive frame rate | 60 fps | 30 fps minimum | p95 over representative gesture trace |
| CPU frame time | 8 ms | 20 ms | p95 Performance trace main/render work |
| GPU frame time | 8 ms | 20 ms | p95 timer query or Safari GPU instrument |
| Main-thread long task | 50 ms | 100 ms | maximum PerformanceObserver long task |
| JS heap | 256 MiB | 512 MiB | peak after forced idle/GC where available |
| GPU resources | 256 MiB | 512 MiB | renderer allocation ledger peak |
| Retained reference/image assets | 512 MiB | 768 MiB | decoded retained CPU asset ledger |
| Retopo vertices | 100,000 | 250,000 | loaded editable fixture |
| Retopo triangles | 200,000 | 500,000 | canonical triangulation count |
| Reference triangles | 2,000,000 | 5,000,000 | loaded immutable reference fixture |
| Pointer latency p95 | 16 ms | 33 ms | event timestamp to applied preview/frame |
| Coalesced batch processing | 4 ms | 8 ms | p95 one normalized dispatch batch |
| Stroke staged steps | 1,024 | 4,096 | accepted commits in one transaction |
| Stroke rollback | 50 ms | 100 ms | cancel to fully reverted/cleared state |
| Project file | 128 MiB | 256 MiB | encoded durable project bytes |
| Clean install | 120 s | 300 s | `npm ci`, warm regional registry network |
| Typecheck | 30 s | 90 s | `npm run typecheck` |
| Test suite | 60 s | 180 s | `npm run test`, 5 s per-test timeout |
| Production build | 30 s | 90 s | `npm run build` after install |
| Thermal observation | 20 min | 30 min release run | continuous representative edit loop |

Static artifact checks run on the baseline CI runner and record OS, CPU allocation, Node/npm, and commit. Device metrics
run on physical Safari/iPadOS 17.4+ with device model, OS build, battery/charging state, ambient condition, fixture, and
commit recorded. Browser caches are cleared for cold-start runs; at least five runs are reported with median and p95.

The hard thermal release run lasts 30 minutes. More than 20% degradation of frame-time or pointer-latency p95 from the
first stable five-minute window for three consecutive one-minute windows is a failure. Memory pressure, context loss,
page reload, or dropping below the 30 fps hard floor is also a failure.

Crossing a target requires a recorded warning and owner; crossing a hard limit blocks the applicable integration/release.
Stroke step hard-limit overflow cancels and rolls back rather than committing a partial transaction.

## Alternatives

Unmeasured qualitative goals and desktop-only benchmarks were rejected because they do not protect the primary device.

## Consequences

Agent C can enforce static artifact limits now. Runtime, real mesh, memory, and thermal measurements remain acceptance
evidence for their owning workstreams and integrations; unmeasured values are not passes.

## Validation

`scripts/verify-baseline.mjs` enforces bundle hard limits and reports target warnings. Later benchmark fixtures publish
machine-readable results under their owning validation paths and 09/14 record physical-device evidence.
