# ADR-0002: Browser and GPU Baseline and Fallback

- Status: Accepted
- Date: 2026-08-10

## Context

OctoPoly is Pencil-first and targets iPad Safari. A missing or failed GPU initialization must never produce a blank
screen or silently select an unplanned backend.

## Decision

- Minimum supported platform is Safari on iPadOS `17.4` or newer.
- Release evidence must include a physical iPad running the minimum OS line and a current representative iPad. Desktop
  development smoke covers current Safari, Chrome, Edge, and Firefox, but does not replace iPad evidence.
- WebGL2 is the required Core renderer backend. A successfully created WebGL2 context with a finite positive maximum
  texture size produces `ready`.
- A null WebGL2 context produces `unsupported`. An exception or malformed capability result produces `failed`.
- WebGPU detection is informational and optional only. WebGPU is not initialized, imported, or required by Core build,
  startup, tests, or deployment.
- There is no CPU renderer in Required scope. Unsupported/failed states keep the accessible shell visible, explain the
  reason, and disable future modeling entry points.
- Context loss and restoration belong to Renderer workstream 07. The bootstrap only validates the initial boundary.
- Static HTML contains a visible `OctoPoly` and checking state before JavaScript runs. JavaScript replaces it only after
  the shell is mounted; rejected capability probes become visible `failed` results.

## Alternatives

- WebGPU-first was rejected because it cannot be the required iPadOS 17.4 baseline.
- A silent WebGL1 or CPU fallback was rejected because it would not satisfy the frozen Renderer contract.

## Consequences

Required modeling is unavailable on unsupported devices, while the page remains usable enough to communicate status.
Optional WebGPU work can be added later without changing the Core startup contract.

## Validation

Bootstrap tests inject ready, null, throwing, and malformed context probes. Browser smoke records the device, OS,
browser build, reported state, and visible fallback. Renderer tests later own context-loss recovery.
