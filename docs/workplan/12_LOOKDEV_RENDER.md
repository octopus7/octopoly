# 12 Lightweight PBR / Quality Render

## Required
NO — OPTIONAL

12를 구현하지 않아도 01~09에는 문제가 없어야 한다. Core와 Renderer는 lookdev provider의 존재, material
schema 또는 image preset을 전제로 하지 않는다.

## Start Gates

다음 조건을 모두 만족하기 전에는 branch/worktree를 만들거나 구현을 시작하지 않는다.

- `docs/workplan/09_INTEGRATION.md`의 `RESULT`가 `COMPLETE`이고 immutable ref
  `baseline/optional-sdk-v1`이 검증된 Core integration commit을 가리킨다.
- 09 완료 결과로 Optional SDK baseline이 canonical `ShadingProvider`, `RenderExtensionRegistry`,
  `OptionalExtension`, `ImageAssetService` export와 provider lifecycle test fake를 게시했다.
- Optional SDK baseline의 Core-only build가 provider가 하나도 없는 상태에서 solid/wireframe으로 성공한다.
- WebGL2가 required fallback backend이고 `glsl-es-300` provider compile/link 검증 경로와 shader/resource budget이
  ADR에 고정되어 있다.
- 아래 worktree는 `baseline/optional-sdk-v1^{commit}`으로 해석한 정확한 commit에서 분기한다.

## Execution
```text
Mode: WORKTREE
Branch: wt/lookdev-render
Worktree: ../wt-lookdev-render
Branch point: `baseline/optional-sdk-v1^{commit}`
```

## Ownership
```text
src/extensions/lookdev/**
tests/extensions/lookdev/**
docs/workplan/12_LOOKDEV_RENDER.md (주 에이전트가 RESULT만 갱신)
```

Core Renderer, public contract, 13 MatCap, shared bootstrap 및 package/build 설정은 수정하지 않는다.

## Goal

Core viewport 위에 WebGL2 baseline의 lightweight realtime PBR provider와 지원 capability 안에서 동작하는
single-pass quality preset을 additive하게 등록한다. Mobile GPU/memory/thermal budget을 우선하며 provider가
실패해도 Core solid/wireframe 경로를 유지한다.

## Contract Use

### Public APIs Consumed

- `ShadingProvider`, `ShadingProgramDescriptor`, `ShadingFrameInput`, `UniformValue`
- `RendererCapabilities`, `RenderSceneSnapshot`, `RenderExtensionRegistry`
- `ShadingSelectionLease`, `ShadingSelectionSnapshot`, `OptionalExtension`, `ExtensionHost`, `PanelRegistry`, `ExtensionPanel`,
  `RenderExtensionControl`, `ExtensionStateProvider`
- `ImageAssetRef`, `ImageAssetService`, `ImageAssetResolver`, `MaterialId`

Provider는 Renderer concrete implementation, framebuffer/program/texture GPU handle 또는 Core scene 내부 상태를
import하거나 보관하지 않는다.

### Public APIs Provided

- `LookdevExtension` — providers를 등록하고 dispose 시 unregister 후 dispose하는 `OptionalExtension`
- `LookdevPanel` — material/provider/fallback 상태를 mount하는 `ExtensionPanel`
- `LookdevMaterial`과 `LookdevMaterialStore` — base color, metallic, roughness, normal, emissive, optional opacity와
  `ImageAssetRef` 기반 texture slots
- `WebGL2PbrShadingProvider` — realtime PBR용 `ShadingProvider`
- `WebGL2QualityShadingProvider` — capability/budget이 허용할 때만 노출되는 single-pass quality provider
- `LookdevFallbackReason` — unsupported backend/capability, invalid material, resource budget 사유
- `LookdevStateProvider` — material, texture refs와 active preset을 project extension data로 저장

모든 export는 `src/extensions/lookdev/**`의 optional entrypoint에만 존재한다. Core barrel이나 Core material
schema에는 추가하지 않는다.

## ShadingProvider Lifecycle

- realtime과 quality provider는 `supports(capabilities)`에서 `backend === "webgl2"`를 요구한다.
- `program()`은 `language: "glsl-es-300"`인 immutable descriptor를 반환한다. Backend별 shader를 런타임에
  추측하거나 Core shader를 patch하지 않는다.
- `uniforms(frame)`는 scene/material snapshot과 `ImageAssetRef`만 사용하며 GPU resource를 생성하지 않는다.
- `activate(host)`는 provider ID별로 최대 한 번 등록한다. 부분 등록 실패 시 이미 등록한 provider를 역순으로
  해제하고 extension을 disabled 상태로 둔다.
- `dispose()`는 registry에서 unregister한 뒤 provider resources를 dispose하며 반복 호출에도 안전하다.
- panel/controller의 realtime mode는 `[realtime]`, quality mode는 `[quality, realtime]` 후보를 가진
  `RenderExtensionRegistry.activateScoped` lease만 사용하고 dispose 시 직전 provider를 복원한다.
- controller는 lease snapshot을 구독해 effective provider와 failure reason을 표시한다. quality가 실패하면
  같은 lease가 realtime을 선택하고 realtime도 실패하면 Core solid/wireframe으로 내려간다.
- image uniform은 `(id, revision)` ref만 게시하고 decode/GPU cache는 주입된 `ImageAssetResolver`를 사용하는
  Renderer가 소유한다.

## Quality Scope and Degradation

현재 `ShadingProvider` 계약은 custom render pass, framebuffer ownership 또는 progressive accumulation lifecycle을
제공하지 않는다. 따라서 이 workstream의 quality mode는 동일한 single-pass WebGL2 boundary 안의 더 높은
샘플/조명 preset으로 한정한다. Progressive/path-like render는 별도의 additive Optional render-pass SDK가
게시되기 전에는 구현하거나 Core Renderer를 수정해 우회하지 않는다.

```text
Quality provider unsupported/budget 초과/compile 실패
-> Realtime PBR provider

Realtime PBR unsupported/compile 실패 또는 extension 제거
-> Core solid/wireframe
```

Missing/invalid texture는 해당 channel의 scalar/default value로 대체하며 전체 material 또는 Core render를
실패시키지 않는다.

## Agent Allocation

주 에이전트는 시작 시 아래 경로를 실제 담당자에게 선언한다. 같은 파일에 concurrent write를 허용하지 않는다.

### Agent A — Material Model

소유 파일:

```text
src/extensions/lookdev/material/**
tests/extensions/lookdev/material/**
```

책임: material validation/defaults, texture slot과 ImageAssetRef, uniform-ready immutable snapshots.

### Agent B — WebGL2 Realtime PBR

소유 파일:

```text
src/extensions/lookdev/webgl2/realtime/**
tests/extensions/lookdev/webgl2/realtime/**
```

책임: GLSL ES 3.00 shader, environment/simple direct light, tone mapping, mobile-budget realtime provider.

### Agent C — Quality / Extension Lifecycle

소유 파일:

```text
src/extensions/lookdev/webgl2/quality/**
src/extensions/lookdev/extension/**
tests/extensions/lookdev/webgl2/quality/**
tests/extensions/lookdev/extension/**
```

책임: single-pass quality provider, capability/budget selection, register/unregister/dispose와 fallback state.

### Main Agent Reserved

```text
src/extensions/lookdev/index.*
tests/extensions/lookdev/integration/**
docs/workplan/12_LOOKDEV_RENDER.md (RESULT만)
```

13을 같은 대화에서 명시적으로 결합하더라도 13의 별도 Ownership을 따르며, 12와 13 파일에 대한 concurrent
write를 금지한다.

## Acceptance Gates

- [ ] provider가 `ShadingProvider`만 구현하고 Renderer concrete/GPU resource ownership에 의존하지 않는다.
- [ ] 모든 shader descriptor가 WebGL2 baseline의 `glsl-es-300`이며 real WebGL2 compile/link smoke를 통과한다.
- [ ] realtime/quality provider의 `supports()`가 backend/capability fixture에서 deterministic하다.
- [ ] material defaults와 missing/invalid texture fallback이 finite uniform을 만들고 Core render를 중단하지 않는다.
- [ ] activation이 각 provider를 한 번만 등록하고 partial failure/dispose가 모두 unregister/cleanup한다.
- [ ] quality unsupported/failure에서 realtime PBR, realtime failure에서 Core solid/wireframe fallback이 검증된다.
- [ ] 중첩 scoped activation/dispose가 이전 Paint/MatCap/Core selection을 복원하고 candidate failure
      snapshot이 controller에 전달된다.
- [ ] material/texture/preset state의 save/load가 unknown extension data와 image revision을 보존한다.
- [ ] state contribution schema migration과 contributed image ref dedupe/flush가 결정적이다.
- [ ] progressive accumulation을 위해 Core Renderer를 수정하거나 private render target을 탈취하지 않는다.
- [ ] extension directory가 없는 Core-only typecheck/test/build가 성공한다.
- [ ] iPad Safari GPU/memory/thermal 예산은 실제 측정한 항목만 통과로 기록한다.

## Tests / Validation Plan

Optional SDK baseline의 canonical 명령으로 다음 경로와 사례를 실행한다.

```text
tests/extensions/lookdev/material/**
  - defaults, clamp/validation, missing maps, ImageAssetRef slots, immutable snapshot
tests/extensions/lookdev/webgl2/realtime/**
  - supports matrix, GLSL ES 3.00 compile/link, finite uniforms, shader budget
tests/extensions/lookdev/webgl2/quality/**
  - capability/budget gate, single-pass descriptor, realtime degradation
tests/extensions/lookdev/extension/**
  - register once, partial failure rollback, unregister-before-dispose, repeated dispose
tests/extensions/lookdev/integration/**
  - fake registry/image service, compile failure fallback, provider-free Core path
```

추가로 canonical typecheck/test/build, provider를 제외한 Core-only build와 WebGL2 browser smoke를 실행한다.
iPad 실기기 결과에는 기기/OS, scene 규모, frame time, peak GPU/JS memory와 thermal 관찰 시간을 기록한다.

## RESULT
Status: COMPLETE

### Implemented
- immutable `LookdevMaterial`/texture slot normalization과 `LookdevMaterialStore`
- WebGL2 `glsl-es-300` lightweight realtime PBR provider: direct/environment light, GGX-style specular,
  ACES tone mapping, scalar/default texture fallback과 mobile shader/resource budget gate
- float color-buffer/capability/resource budget이 허용할 때만 선택되는 single-pass quality provider와
  quality -> realtime -> Core solid/wireframe candidate degradation
- scoped provider controller, material/provider/fallback 상태 panel, schema v1 -> v2 material/preset state migration,
  image revision 보존과 deterministic dedupe
- provider/panel/state register-once, partial activation reverse rollback, unregister-before-dispose와 idempotent cleanup

### Files created or modified
- `src/extensions/lookdev/material/**`
- `src/extensions/lookdev/webgl2/realtime/**`
- `src/extensions/lookdev/webgl2/quality/**`
- `src/extensions/lookdev/extension/**`
- `src/extensions/lookdev/index.ts`
- `tests/extensions/lookdev/**`
- 이 문서의 `RESULT` 섹션

### Public API
- Material: `LookdevMaterial`, `LookdevMaterialInput`, `LookdevTextureSlots`, `LookdevMaterialStore`,
  `createLookdevMaterial`, `DEFAULT_LOOKDEV_MATERIAL_ID`
- Providers: `WebGL2PbrShadingProvider`, `WebGL2QualityShadingProvider`,
  `LOOKDEV_REALTIME_PROVIDER_ID`, `LOOKDEV_QUALITY_PROVIDER_ID`와 capability/shader budget helpers
- Extension: `LookdevExtension`, `LookdevPanel`, `LookdevController`, `LookdevStateProvider`,
  `LookdevFallbackReason`, preset/state/panel/extension ID constants
- Optional-only entrypoint: `src/extensions/lookdev/index.ts`; Core barrel에는 export를 추가하지 않음

### Tests / validation
- Start gate: `baseline/optional-sdk-v1^{commit}`, `wt/lookdev-render` branch point와 확정 SHA가 모두
  `175ecff7613c15d5afd39327e957885c6eed4e50`로 일치
- `npm ci`: PASS — 86 packages
- `npm run ci`: PASS — strict typecheck, 96 files / 463 tests, production build, artifact failures 0
- Artifact: compressed JS+CSS 61,175 bytes, parsed JS 221,238 bytes; Core entry가 Optional을 import하지 않아
  baseline artifact와 동일
- `npm run verify:core -- --scan-only`: PASS — Core source 146 files, Optional import/WGSL failure 0
- 실제 extension 제거 gate: `src/extensions`와 `tests/extensions`를 임시 분리한 뒤 canonical typecheck,
  87 files / 432 tests, production build PASS; 검증 후 두 directory를 원위치 복원
- Browser WebGL2 smoke: Chromium `WebGL 2.0`, GLSL ES 3.00, max texture 16,384px에서 realtime/quality
  vertex+fragment compile 및 program link 모두 PASS, console warning/error 0
- Fallback/lifecycle/state: quality compile/capability/budget failure -> realtime, realtime missing/uniform failure -> Core,
  Paint/MatCap/Core nested lease 복원, partial rollback, image revision dedupe/flush와 unknown state round trip PASS
- `git diff --check`: PASS

### Integration notes
- 14 Optional Integration이 optional entrypoint에서 `LookdevExtension`을 선택적으로 activate해야 한다.
- 현 `scripts/verify-core.mjs`의 execute mode는 `src/extensions/**`는 제외하지만 `tests/extensions/**`를
  제외하지 않는다. 이번 작업은 실제 두 directory 제거로 Core-only gate를 별도 통과했으며, 14는 verifier가
  Optional test root도 제외하도록 additive하게 갱신해야 한다.
- Opacity uniform은 게시하지만 frozen `ShadingProvider`에 blend-state 소유권이 없으므로 실제 blending policy는
  Core를 우회해 추가하지 않았다. Progressive/path-like render도 additive render-pass SDK 전까지 범위 밖이다.
- 새 bitmap asset이 필요하지 않아 ImageGen은 사용하지 않았다.

### Requested contract changes
- NONE

### Known limitations
- 실제 iPad Safari/Apple Pencil에서 scene 규모별 frame time, peak GPU/JS memory와 30-minute thermal run은
  이번 환경에서 `NOT_RUN`이며 통과로 기록하지 않는다.
- Browser smoke는 desktop Chromium WebGL2 compile/link 증거이며 최소 지원 iPadOS 17.4 Safari driver 검증을
  대체하지 않는다.
- Frozen shading contract에 blend state/custom render pass/progressive accumulation lifecycle이 없으므로
  opacity blending과 progressive/path-like quality render는 제공하지 않는다.
