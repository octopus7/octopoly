# 07 Renderer

## Required
YES

## Execution
```text
Mode: WORKTREE
Branch: wt/renderer
Worktree: ../wt-renderer
Branch point: `baseline/core-v1^{commit}`
```

## Inputs

- `/AGENTS.md`
- `docs/workplan/00_MASTER.md`
- `docs/workplan/00_BOOTSTRAP.md`의 완료된 browser/GPU baseline과 `baseline/core-v1`의 resolved commit
- `docs/workplan/INTERFACE_CONTRACTS.md`의 `RenderSceneSnapshot`, `RendererService`, `ToolPreview`,
  `RendererCapabilities`, `MeshTriangulationService`, `ImageAssetResolver`, `ShadingProvider`,
  `RenderExtensionRegistry`

## Goal

Reference/Retopo mesh와 typed tool preview를 위한 iPad Safari 우선 viewport renderer를 구현한다. Required
Core backend는 WebGL2이며 Optional shading이 없어도 solid/wireframe 경로가 독립적으로 동작해야 한다.

## Ownership
```text
src/renderer/core/**
src/renderer/reference/**
src/renderer/retopo/**
src/renderer/preview/**
tests/renderer/core/**
tests/renderer/reference/**
tests/renderer/retopo/**
tests/renderer/preview/**
tests/renderer/renderer-service.integration.test.*
```

Mesh/Selection/Tool 내부 상태를 소유하거나 GPU handle을 다른 module에 노출하지 않는다. WebGPU backend,
PBR, MatCap 및 quality render는 이 workstream의 Required 범위가 아니다.

## Backend and Resource Policy

- Required 구현과 acceptance는 WebGL2에서 통과해야 한다. `RendererCapabilities.backend`는 Core에서
  `"webgl2"`를 보고한다.
- WebGPU는 추후 Optional backend로만 추가할 수 있으며 WebGPU availability, adapter/device 획득 또는 WGSL
  provider가 Core 시작/빌드/렌더의 전제 조건이 될 수 없다.
- `RenderSceneSnapshot`의 immutable reference/retopo/selection/preview만 frame input으로 사용한다. CSS pixel과
  device pixel 변환 및 DPR clamp는 Renderer가 소유한다.
- retopo face upload와 generic corner attribute expansion은 주입된 `MeshTriangulationService`만 사용해
  raycast/paint가 보는 face/corner mapping과 일치시킨다.
- optional image uniform은 `initialize`에 주입된 `ImageAssetResolver`로만 resolve한다. cache key는
  `(id, revision)`이며 typed dirty/remove event와 context restore에서 stale GPU texture를 폐기·재생성한다.
  async resolve 완료 시 해당 revision이 여전히 active인지 확인해 stale upload를 막는다.
- `webglcontextlost`에서는 기본 동작을 중지하고 `handleContextLoss()`로 모든 GPU resource를 invalid 상태로
  전환한다. `restore()` 뒤 CPU snapshot/descriptor에서 program, buffer, texture를 재생성하고 render를 재개한다.
- `initialize/restore`는 `RendererInitResult`로 ready/unsupported/failed를 구분하고 `state()`와 nullable
  `capabilities()`를 일치시킨다. unsupported/failed는 정상 결과이며 partial resource를 남기지 않는다.
- context loss, restore 실패 및 dispose는 resource 누수나 stale callback을 남기지 않는다.
- `ToolPreview.primitives`의 `points`, `polyline`, `triangles`를 exhaustive하게 처리한다. point size와 line width는
  CSS pixel 의미를 유지하고 device pixel 변환은 한 번만 수행한다.

## Shading Registry Policy

- Core solid/wireframe shader는 registry provider의 존재와 무관한 항상 사용 가능한 fallback이다.
- `RenderExtensionRegistry`는 provider id 등록/조회/목록/해제와 provider disposal을 소유한다.
- WebGL2 backend에서는 `supports(capabilities)`가 true이고 `program().language === "glsl-es-300"`인 provider만
  shader 검증/실행 helper의 후보가 된다. WGSL은 Optional WebGPU backend가 없으면 unsupported 정상 결과다.
- provider의 `supports`, shader compile/link, `program` 또는 `uniforms` 실패는 해당 provider를 frame에서
  격리하고 Core solid/wireframe fallback을 유지한다.
- Renderer만 shader/program/uniform binding을 해석한다. Optional provider에 GPU context나 handle을 직접
  넘기지 않는다.
- provider descriptor의 generic mesh attribute binding을 snapshot에서 render vertex로 결정적으로 확장한다.
  누락/incompatible attribute는 provider unsupported/fallback으로 처리한다.
- `RenderExtensionRegistry.activateScoped/active`만 provider 선택 경계로 사용한다. 최상위 lease의 후보를
  순서대로 검증하며 모두 실패하면 Core solid/wireframe을 사용한다. 등록 목록의 첫 provider를 암묵
  선택하지 않고 missing/supports/compile/uniform/image 실패를 lease snapshot으로 게시한다.

## Agent Allocation

### Agent A — Renderer Core

소유 파일:

```text
src/renderer/core/**
tests/renderer/core/**
```

책임:

- WebGL2 `RendererService`, render loop, resize/DPR와 camera uniform
- context loss/restore/dispose resource lifecycle
- `ImageAssetResolver` revision cache/invalidation과 context restore
- `RenderExtensionRegistry`, candidate-list scoped activation/snapshot, provider capability/language 검사와 fallback
- WebGPU 없이도 required tests와 build가 통과하도록 backend 경계 유지

### Agent B — Reference Renderer

소유 파일:

```text
src/renderer/reference/**
tests/renderer/reference/**
```

책임:

- immutable `TriangleMeshSnapshot` upload/update
- Core solid reference shading과 depth/opacity/xray 정책
- version 변경과 context restore 시 resource 재생성

### Agent C — Retopo Renderer

소유 파일:

```text
src/renderer/retopo/**
src/renderer/preview/**
tests/renderer/retopo/**
tests/renderer/preview/**
```

책임:

- immutable `MeshSnapshot`과 `SelectionSnapshot`의 face/edge/vertex 표현
- injected `MeshTriangulationService` 기반 face/corner expansion
- solid + wireframe/overlay depth 및 editing visibility
- typed `ToolPreview` points/polyline/triangles rendering과 revision update

### Main Agent Reserved Files

```text
src/renderer/index.*
tests/renderer/renderer-service.integration.test.*
docs/workplan/07_RENDERER.md (RESULT만)
```

주 에이전트만 renderer facade/export와 세 pass를 조립한다. 위 Agent A/B/C 경로는 서로 겹치지 않는다.

## Required Shading
```text
solid
wireframe / overlay
```

PBR/MatCap/quality render는 Optional이다.

## Acceptance / Tests

- [ ] WebGL2만 제공되는 환경에서 initialize가 `ready`를 반환하고 resize, render, dispose가 성공하며
      backend가 `webgl2`다.
- [ ] reference, retopo face/edge/vertex, selection과 preview가 하나의 `RenderSceneSnapshot`으로 렌더된다.
- [ ] `ToolPreview`의 points/polyline/triangles와 revision 교체/제거를 typed fixture로 검증한다.
- [ ] CSS size와 DPR resize/orientation 변경이 framebuffer 크기와 overlay 크기에 정확히 한 번 반영된다.
- [ ] context loss 뒤 state가 `context-lost`이고 stale GPU resource를 사용하지 않으며 `restore()`의 ready
      결과 뒤 snapshot에서 resource를 재생성한다.
- [ ] initialize/restore의 unsupported와 failed 결과, nullable capabilities 및 lifecycle state 전이가
      contract와 일치하고 누수를 남기지 않는다.
- [ ] registry register/get/list/unregister/dispose와 duplicate id 정책을 검증한다.
- [ ] candidate lease가 quality→realtime→Core 순으로 fallback하고 중첩/비순차 dispose에서 이전 selection을
      정확히 복원하며 failure snapshot을 게시한다.
- [ ] image resolver notification과 context restore가 `(id, revision)` cache를 invalidation하고 재해석하며
      미주입 상태의 Core-only renderer도 정상 동작한다.
- [ ] out-of-order async resolve가 최신 revision texture를 덮지 않고 dirty rect/remove event가 정확한 cache만
      무효화한다.
- [ ] retopo render triangle/corner mapping이 canonical `MeshTriangulationService` fixture와 일치한다.
- [ ] unsupported WGSL, `supports === false`, shader compile/link 실패 및 uniforms 예외에서 Core solid/wireframe
      fallback이 계속 렌더된다.
- [ ] contract에 없는 active-provider 선택 API나 암묵적인 first-provider 정책을 추가하지 않는다.
- [ ] WebGPU implementation이나 Optional 10~13 없이 `typecheck`, `tests/renderer/**`, build가 통과한다.

## RESULT
Status: COMPLETE

### Implemented
- WebGL2-only `RendererService` lifecycle with explicit ready/unsupported/failed states, RAF coalescing,
  resize/orientation handling, DPR clamp, framebuffer texture-limit clamp, context loss/restore, and idempotent disposal
- ADR-0005 target capabilities: 512 MiB application texture budget and 256 MiB application GPU budget
- Core render phases: reference base -> usable generic shading provider or solid fallback -> wire/selection/preview overlay
- `RenderExtensionRegistry` registration, candidate-order fallback, scoped LIFO leases, failure snapshots, and provider ownership
- GLSL ES 300 provider validation/execution with canonical triangulation, deterministic position/normal and
  vertex/corner/face generic attribute expansion, uniform/image isolation, and Core fallback
- `(id, revision)` image texture cache with dirty/remove invalidation, stale async resolve rejection, context rebuild,
  texture budget enforcement, and resolver/GPU cleanup
- Immutable reference mesh solid pass with versioned upload, degenerate filtering, and CPU-descriptor restore
- Retopo solid/wire/vertex/selection passes using only injected `MeshTriangulationService`; solid and overlay phases share
  one CPU/GPU cache so a provider can replace only the solid path
- Exhaustive typed `ToolPreview` points/polyline/triangles pass with atomic revision replacement/removal and one DPR
  conversion for CSS point/line sizes

### Files created or modified
- `src/renderer/core/**`
- `src/renderer/reference/**`
- `src/renderer/retopo/**`
- `src/renderer/preview/**`
- `src/renderer/index.ts`
- `tests/renderer/core/**`
- `tests/renderer/reference/**`
- `tests/renderer/retopo/**`
- `tests/renderer/preview/**`
- `tests/renderer/renderer-service.integration.test.ts`
- `docs/workplan/07_RENDERER.md` (RESULT only)

### Public API
- `createWebGL2Renderer(triangulation: MeshTriangulationService): RendererService`
- `WebGL2RendererService`
- `WebGL2RenderExtensionRegistry`
- `ReferenceRenderPass`, `RetopoRenderPass`, `PreviewRenderPass`
- Renderer-local `RenderPass` phase boundary for base/fallback/overlay composition

### Tests / validation
- `npm run typecheck`: PASS
- `npx vitest run tests/renderer`: PASS, 8 files / 45 tests
- `npm run ci`: PASS, 12 files / 67 tests; strict typecheck, full Vitest suite, Vite production build, and baseline
  artifact verification included
- Integration fixture: one `RenderSceneSnapshot` renders reference, retopo face/edge/vertex, selection, and all preview
  primitive kinds in the required phase order
- Provider integration fixture: usable canonical generic provider replaces only Core solid while retopo overlay remains;
  unsupported/failed candidates retain Core solid/wireframe rendering
- Context loss fixture: scheduled work is cancelled, GPU handles are invalidated, state/capabilities change consistently,
  and restore rebuilds retained CPU descriptors before rendering resumes
- Resource fixtures: partial allocation failure cleanup, stale image resolve rejection, exact revision invalidation,
  shared retopo phase disposal, provider/program/texture/buffer/VAO disposal, and repeated `dispose()` safety pass

### Integration notes
- 09 should construct the service through `createWebGL2Renderer` with the canonical `MeshTriangulationService` and pass
  the canvas plus optional `ImageAssetResolver` to `initialize`.
- Optional shading composition can instantiate the exported registry and inject it into `WebGL2RendererService`; provider
  registration alone does not activate a mode, and selection remains `activateScoped` candidate-list based.
- Required Core rendering has no WebGPU, PBR, MatCap, or Optional 10~13 dependency.

### Requested contract changes
- NONE

### Known limitations
- Physical iPad Safari/iPadOS 17.4 context-loss, orientation, memory-pressure, and long thermal-run validation was not
  available in this environment; tests use deterministic WebGL2 fakes.
- WebGL native line-width clamping varies by iPad GPU/driver. CSS-to-device-pixel conversion is verified, but final
  polyline visual width requires physical-device inspection.
- Representative maximum reference/retopo fixtures, real GPU allocation totals, frame time, and pointer-to-frame latency
  remain device/performance gates for 09 Integration; reported capability budgets are not a substitute for measurement.
