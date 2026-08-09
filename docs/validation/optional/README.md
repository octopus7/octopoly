# Full Optional validation evidence

The 14 integration gate keeps three evidence classes separate:

1. deterministic automation (typecheck, 16 combinations, semantic integration, Core-only physical-removal build,
   09 vertical slice, and fake-GL recovery fixtures);
2. a real desktop browser WebGL2 run (shader compile/link, image upload/revision, fallback, and context restore);
3. physical iPad Safari and Apple Pencil runs, including five performance runs and a 30-minute thermal run.

Neither deterministic automation nor desktop Chromium/WebGL2 is physical-device evidence. The checked-in current
status files intentionally remain `NOT_RUN` until evidence is collected against an exact commit.

Run deterministic validation:

```text
node scripts/verify-optional.mjs
```

Require a completed desktop record:

```text
node scripts/verify-optional.mjs --require-desktop --desktop-evidence <desktop-evidence.json>
```

Require the release-gating physical record:

```text
node scripts/verify-optional.mjs --require-desktop --require-physical \
  --desktop-evidence <desktop-evidence.json> --physical-evidence <physical-evidence.json>
```

`--require-physical` returns nonzero when the record is absent, `NOT_RUN`, invalid, or contains any non-passing hard
gate. Do not edit a status to `PASS` without attaching the device/build identifiers and raw evidence paths.
