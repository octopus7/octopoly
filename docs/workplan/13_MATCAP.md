# 13 MatCap Rendering Mode

## Required
NO — OPTIONAL

13을 구현하지 않아도 01~09 또는 12에 문제가 없어야 한다. MatCap은 PBR을 import하지 않고 독립 provider로
등록된다.

## Start Gates

다음 조건을 모두 만족하기 전에는 branch/worktree를 만들거나 구현을 시작하지 않는다.

- `docs/workplan/09_INTEGRATION.md`의 `RESULT`가 `COMPLETE`이고 immutable ref
  `baseline/optional-sdk-v1`이 검증된 Core integration commit을 가리킨다.
- 09 완료 결과로 Optional SDK baseline이 canonical `ShadingProvider`, `RenderExtensionRegistry`,
  `OptionalExtension`, `ImageAssetService` export와 provider lifecycle test fake를 게시했다.
- Optional SDK baseline의 Core-only build와 provider-free solid/wireframe fallback이 검증되어 있다.
- WebGL2 `glsl-es-300` compile/link smoke 경로와 image/GPU budget이 ADR에 고정되어 있다.
- 실행 방식은 아래 default 또는 explicit combined mode 중 하나로 작업 시작 전에 확정한다.

## Execution

### Default — Dedicated Worktree

```text
Mode: WORKTREE
Branch: wt/matcap
Worktree: ../wt-matcap
Branch point: `baseline/optional-sdk-v1^{commit}`
```

### Explicit Combined Mode with 12

사용자가 작업 시작 전에 12와 13을 같은 대화로 명시적으로 지정한 경우에만 허용한다.

```text
Mode: WORKTREE
Branch: wt/lookdev-render
Worktree: ../wt-lookdev-render
Order: 12 write phase complete, then 13 write phase
Concurrent writes: FORBIDDEN
```

- combined mode에서도 12는 `src/extensions/lookdev/**`, 13은 `src/extensions/matcap/**`만 소유한다.
- 12의 agent가 파일을 쓰는 동안 13의 agent는 쓰기 작업을 시작하지 않는다. phase 전환은 주 에이전트가
  명시한다.
- `wt/matcap`과 combined mode를 동시에 사용하지 않는다.
- MAIN mode는 허용하지 않는다. 이 `Execution` 섹션이 13의 실행 위치에 대한 기준이다.

## Ownership
```text
src/extensions/matcap/**
tests/extensions/matcap/**
docs/workplan/13_MATCAP.md (주 에이전트가 RESULT만 갱신)
```

Core Renderer, public contract, 12 Lookdev, shared bootstrap 및 package/build 설정은 수정하지 않는다.

## Goal

모델링/리토폴로지 형태 확인을 위한 lightweight WebGL2 MatCap shading provider를 additive하게 제공한다.
Built-in preset과 custom image는 extension이 소유하며 실패/제거 시 Core solid/wireframe과 PBR provider에 영향을
주지 않는다.

## Features

Built-in preset 예시:

- Clay
- Neutral Gray
- Metallic
- Soft
- High Contrast

Custom:

- `ImageAssetService`를 통한 MatCap image import/resolve
- dimensions, color space, decode와 resource budget validation
- preset/custom switching과 이전 valid preset 유지

## Contract Use

### Public APIs Consumed

- `ShadingProvider`, `ShadingProgramDescriptor`, `ShadingFrameInput`, `UniformValue`
- `RendererCapabilities`, `RenderExtensionRegistry`, `ShadingSelectionLease`, `ShadingSelectionSnapshot`
- `OptionalExtension`, `ExtensionHost`, `PanelRegistry`, `ExtensionPanel`, `RenderExtensionControl`,
  `ExtensionStateProvider`
- `ImageAssetRef`, `ImageAssetService`, `ImageAssetResolver`

Renderer concrete implementation, GPU program/texture handle, Lookdev/PBR state 또는 Core private scene은 import하지
않는다.

### Public APIs Provided

- `MatcapExtension` — provider와 custom image lifecycle을 소유하는 `OptionalExtension`
- `MatcapPanel` — preset/custom image/fallback 상태를 mount하는 `ExtensionPanel`
- `WebGL2MatcapShadingProvider` — view-space normal과 MatCap image ref를 사용하는 `ShadingProvider`
- `MatcapPresetId`, `MatcapPreset`, `MatcapPresetCatalog` — built-in preset의 immutable metadata
- `MatcapController` — preset/custom selection, validation과 previous-valid fallback 상태
- `MatcapDisabledReason` — unsupported backend, invalid image, decode/resource-budget 실패 사유
- `MatcapStateProvider` — preset/custom image revision과 panel 설정을 project extension data로 저장

모든 export는 MatCap optional entrypoint에만 존재하며 Core 또는 Lookdev barrel에는 추가하지 않는다.

## ShadingProvider Lifecycle

- `supports(capabilities)`는 `backend === "webgl2"`와 필요한 texture size/budget을 검사한다.
- `program()`은 `language: "glsl-es-300"`인 immutable descriptor를 반환한다.
- `uniforms(frame)`는 active `ImageAssetRef`와 public frame snapshot만 반환하고 GPU resources를 만들지 않는다.
- `activate(host)`는 image/preset validation 후 provider를 ID 하나로 최대 한 번 등록한다.
- custom image import/resolve 실패 시 provider를 교체하거나 해제하지 않고 이전 valid preset을 유지한다.
- `dispose()`는 registry에서 unregister한 뒤 provider와 transient `ImageBitmap`/decode resource를 해제하며
  반복 호출에도 안전하다. project가 소유한 persistent `ImageAssetRef`는 임의로 삭제하지 않는다.
- panel/controller의 MatCap mode 전환은 `RenderExtensionRegistry.activateScoped([matcapProviderId])` lease만
  사용하고 dispose 시 직전 PBR/Paint/Core selection을 복원한다.
- custom image uniform은 `(id, revision)` ref만 반환하고 Renderer의 injected `ImageAssetResolver`가 decode,
  GPU cache invalidation과 context restore를 소유한다.
- shader compile/link 실패의 최종 fallback은 Renderer가 Core solid/wireframe으로 처리한다.

## Graceful Disabled / Fallback Behavior

```text
custom image invalid/decode 실패/budget 초과
-> 이전 valid built-in/custom preset 유지

MatCap provider unsupported/compile 실패 또는 extension 제거
-> Core solid/wireframe

PBR provider 존재 여부
-> MatCap activation/disposal과 무관
```

WebGL2가 unavailable인 backend에서는 MatCap만 disabled하고 Core renderer나 다른 provider의 backend 선택을
강제로 바꾸지 않는다.

## Agent Allocation

주 에이전트는 시작 시 아래 경로를 실제 담당자에게 선언한다. dedicated/combined mode 모두 같은 소유권을
사용하며 같은 파일에 concurrent write를 허용하지 않는다.

### Agent A — Presets / Image Validation

소유 파일:

```text
src/extensions/matcap/presets/**
src/extensions/matcap/image/**
tests/extensions/matcap/presets/**
tests/extensions/matcap/image/**
```

책임: preset metadata/assets, custom image import/validation, previous-valid fallback와 budget checks.

### Agent B — WebGL2 MatCap Provider

소유 파일:

```text
src/extensions/matcap/webgl2/**
tests/extensions/matcap/webgl2/**
```

책임: view-normal MatCap mapping, GLSL ES 3.00 shader, provider supports/program/uniforms.

### Agent C — Controller / Extension Lifecycle

소유 파일:

```text
src/extensions/matcap/controller/**
src/extensions/matcap/extension/**
tests/extensions/matcap/controller/**
tests/extensions/matcap/extension/**
```

책임: mode switching, disabled reasons, registration rollback, unregister/dispose와 PBR-independent lifecycle.

### Main Agent Reserved

```text
src/extensions/matcap/index.*
tests/extensions/matcap/integration/**
docs/workplan/13_MATCAP.md (RESULT만)
```

## Acceptance Gates

- [ ] default 실행이 `wt/matcap` 전용 WORKTREE이며 MAIN 구현 경로가 없다.
- [ ] combined mode는 명시적 사전 지정, `wt/lookdev-render`, 12 완료 후 13 순차 write로만 수행된다.
- [ ] provider가 public `ShadingProvider`만 구현하고 Core Renderer/PBR concrete code를 import하지 않는다.
- [ ] descriptor가 WebGL2 baseline의 `glsl-es-300`이고 real WebGL2 compile/link smoke를 통과한다.
- [ ] built-in preset 전환과 custom valid image 전환이 deterministic하고 resource leak가 없다.
- [ ] invalid/decode-failed/oversized image가 이전 valid preset을 유지하고 Core/PBR을 중단하지 않는다.
- [ ] activation은 한 번만 register하고 partial failure/dispose는 unregister와 resource cleanup을 수행한다.
- [ ] unsupported backend/provider compile failure에서 Core solid/wireframe fallback이 검증된다.
- [ ] scoped activation/dispose가 이전 selection을 복원하고 candidate failure snapshot이 panel
      disabled/fallback 상태에 반영된다.
- [ ] preset/custom image revision state가 project save/load 뒤 복원되고 unknown extension data를 보존한다.
- [ ] state contribution schema migration과 custom image ref dedupe/flush가 결정적이다.
- [ ] MatCap extension 제거 시 Core-only typecheck/test/build가 성공하고, 12가 branch point 또는 combined
      worktree에 존재하는 경우 Lookdev-only typecheck/test/build도 성공한다.
- [ ] iPad Safari 성능은 실제 기기에서 측정한 항목만 통과로 기록한다.

## Tests / Validation Plan

Optional SDK baseline의 canonical 명령으로 다음 경로와 사례를 실행한다.

```text
tests/extensions/matcap/presets/**
  - stable IDs, immutable catalog, preset switching
tests/extensions/matcap/image/**
  - valid import, decode failure, dimensions/color space, oversize budget, previous preset retention
tests/extensions/matcap/webgl2/**
  - supports matrix, GLSL ES 3.00 compile/link, view-normal mapping, finite uniforms
tests/extensions/matcap/controller/**
  - built-in/custom switching, unsupported and disabled reasons
tests/extensions/matcap/extension/**
  - register once, partial failure rollback, unregister-before-dispose, repeated dispose
tests/extensions/matcap/integration/**
  - fake public registry/image service, PBR absent/present independence, Core fallback
```

추가로 canonical typecheck/test/build, MatCap 없는 Core-only build, 12가 존재할 때 MatCap 없는 Lookdev-only
build와 WebGL2 browser smoke를 실행한다. iPad 결과에는 기기/OS, viewport 크기, frame time, peak memory와
thermal 관찰을 기록한다.

## RESULT
Status: NOT_STARTED

### Implemented
-

### Files created or modified
-

### Public API
-

### Tests / validation
-

### Integration notes
-

### Requested contract changes
- NONE

### Known limitations
-
