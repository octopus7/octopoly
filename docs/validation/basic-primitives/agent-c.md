# Basic Primitives — Browser and UI Validation

## Scope

This evidence covers the package-local additive DOM adapter, its owned tests, and the real-browser Plane/Cube validation page. The adapter mounts inside an existing viewport and leaves the existing canvas and WebGL lifecycle intact.

## TDD evidence

The UI adapter slices were observed red before implementation for missing module/actions, presentation transitions, busy/accessibility behavior, 44 CSS pixel hit targets, and disposal. Cube Stage 2 used a separate red-green sequence for the exact recipe and `addCube()` composition entry.

Focused command:

```text
npx vitest run tests/app/composition/primitive-recipes.test.ts tests/app/composition/primitive-creation.test.ts tests/e2e/basic-primitives-browser.test.ts tests/bootstrap/basic-primitives-empty-state.test.ts
```

Result: 4 files, 21 tests passed.

## Real-browser harness

The harness is served by the existing Vite server without package, lockfile, Vite, or TypeScript configuration changes:

```text
/docs/validation/basic-primitives/browser-smoke.html?scenario=plane
/docs/validation/basic-primitives/browser-smoke.html?scenario=cube
```

It uses:

- `createProductionCoreWorkspace` and its existing WebGL2 renderer;
- `createBasicPrimitivesEntry` and the canonical mesh/history/selection services;
- `mountBasicPrimitivesUi` for the actual New Scene Add Plane/Add Cube buttons;
- normalized `PointerSample` dispatch and the real picking/tool runtime for reference-free Move/Extrude;
- existing save/load and OBJ/GLB export services;
- renderer-owned WebGL2 readback for non-background pixel evidence.

No allocator IDs are predicted, and no mesh kernel, history service, renderer, persistence path, or exporter is duplicated.

## Desktop browser evidence

Executed on Headless Chrome 145, Linux x86_64, WebGL2 ready.

Both scenarios passed this actual UI sequence:

```text
New Scene -> Add Plane or Add Cube -> Undo -> Redo -> Move -> Extrude
-> Save -> Reload -> Export OBJ -> Export GLB
```

Evidence:

- `desktop-chrome-plane-cube.json`
- earlier Stage 1 capture: `stage1-desktop-chrome.json`

Key observations:

- Plane create: 4 vertices, 4 edges, 4 corners, 1 selected face; undo returned to an empty mesh.
- Cube create: 8 vertices, 12 edges, 24 corners, 6 selected faces; undo returned to an empty mesh and redo restored the exact topology.
- Plane final export after editing: OBJ 511 bytes, GLB 856 bytes.
- Cube final export after editing: OBJ 798 bytes, GLB 1028 bytes.
- Save/reload preserved stable IDs in both scenarios.
- Frame plans were finite with 15% padding.
- WebGL2 readback contained non-background pixels after creation/editing.
- Captured warnings, page errors, console errors, and JavaScript errors: zero.

## Physical-device evidence

- Physical iPad Safari: **NOT_RUN / BLOCKED**
- Apple Pencil: **NOT_RUN / BLOCKED**

No physical-device PASS is claimed.
