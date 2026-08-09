# iPadOS 17.4 Safari / Apple Pencil physical-device checklist

Use `PASS`, `FAIL`, or `NOT_RUN` for every row. A blank field is not a pass. This checklist must be executed both on a
physical iPad on the minimum iPadOS 17.4 line and on a current representative iPad. Desktop emulation is not accepted.

## Run identity

- Status: `NOT_RUN`
- Commit SHA:
- Date/time/time zone:
- Device model and RAM tier:
- iPadOS version and build:
- Safari version and build:
- Apple Pencil model:
- Battery percentage / charging state:
- Ambient temperature and enclosure/case:
- Reference, retopo, image, and project fixture hashes:
- Raw evidence locations (screen recording, Web Inspector, Instruments, exported metrics):

## Functional replay

| Gate | Status | Required evidence |
|---|---|---|
| WebGL2 ready / unsupported / failed shell | `NOT_RUN` | Visible state and `MAX_TEXTURE_SIZE`; no WebGPU/WGSL requirement |
| down / move / coalesced / up | `NOT_RUN` | Ordered normalized samples and visible stroke |
| pressure / tilt | `NOT_RUN` | Raw and normalized traces with non-constant pressure and both tilt axes |
| pointer capture / screen-edge release | `NOT_RUN` | Capture begins on down and releases once on up |
| pointercancel / lost capture | `NOT_RUN` | Preview clears, transaction rolls back, mesh/history remain unchanged |
| background / foreground | `NOT_RUN` | Active gesture cancels and a new gesture works after foregrounding |
| Pencil / touch separation | `NOT_RUN` | Touch navigates without stealing or modeling during active Pencil input |
| resize / orientation | `NOT_RUN` | CSS/device pixels recover and picking/overlay remain aligned |
| context loss / restore | `NOT_RUN` | GPU handles invalidate and CPU scene/image revision is rendered after restore |
| project save / reload / export | `NOT_RUN` | Topology, stable IDs, attributes, reference transform, images and extension data preserved |

## Performance and capacity replay

Clear browser caches for cold runs. Record at least five runs and report median and p95. Use the ADR-0005 canonical
representative fixtures and record exact vertex/triangle/project byte counts.

| Metric | Target | Hard limit | Status |
|---|---:|---:|---|
| Cold shell | 1.0 s | 2.5 s | `NOT_RUN` |
| First usable frame | 1.5 s | 3.0 s | `NOT_RUN` |
| Interactive frame rate p95 | 60 fps | 30 fps minimum | `NOT_RUN` |
| CPU frame time p95 | 8 ms | 20 ms | `NOT_RUN` |
| GPU frame time p95 | 8 ms | 20 ms | `NOT_RUN` |
| Main-thread long task max | 50 ms | 100 ms | `NOT_RUN` |
| Pointer latency p95 | 16 ms | 33 ms | `NOT_RUN` |
| Coalesced batch p95 | 4 ms | 8 ms | `NOT_RUN` |
| Stroke rollback | 50 ms | 100 ms | `NOT_RUN` |
| Peak JS heap | 256 MiB | 512 MiB | `NOT_RUN` |
| Peak GPU resources | 256 MiB | 512 MiB | `NOT_RUN` |
| Retained image/reference assets | 512 MiB | 768 MiB | `NOT_RUN` |

## 30-minute thermal release run

- Status: `NOT_RUN`
- Run a continuous representative edit loop for at least 30 minutes.
- Compare every one-minute window with the first stable five-minute window.
- Fail if frame-time or pointer-latency p95 degrades by more than 20% for three consecutive one-minute windows.
- Fail on any memory pressure, unexpected context loss, page reload, or drop below 30 fps.
- Attach battery, thermal state, FPS, frame-time, latency, heap/GPU ledger, and context-loss timeline exports.

## Decision

- Automated desktop/jsdom gates: `NOT_RUN`
- Minimum-line physical iPad: `NOT_RUN`
- Representative physical iPad: `NOT_RUN`
- Release readiness: `BLOCKED`
- Reviewer and date:
