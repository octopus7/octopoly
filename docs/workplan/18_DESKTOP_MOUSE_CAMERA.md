# 18 Desktop Mouse Camera

## Required

NO — iPad Safari의 Pencil-first Core 동작에는 필수 dependency가 아니지만, PC Chrome/Edge와 iPad의 외부
mouse/trackpad 사용성을 위해 우선순위가 높은 post-Core usability workstream이다.

이 작업을 생략해도 09 Core와 14 Full Optional candidate는 기존 Pencil/touch 입력으로 정상이어야 한다.
반대로 이 작업을 수행하더라도 기본 도형 생성, guided retopology 또는 Optional extension을 필수 dependency로
만들지 않는다.

## Policy Compatibility Gate

루트 `AGENTS.md`와 `00_MASTER.md`의 기존 00~15 실행·통합 규칙을 보존한다. 18은 09 이후 수행하는 additive
follow-up workstream이며 09/14의 immutable baseline이나 release 의미를 바꾸지 않는다.

- `docs/workplan/INTERFACE_CONTRACTS.md`와 `src/contracts/**`는 frozen 상태를 유지한다.
- canonical `PointerSample.buttons`, `PointerSample.modifiers`와 기존 `ToolInputResult` capture/release 의미만으로
  pointer drag를 분류한다. 첫 구현에서 `button`, wheel delta 또는 desktop 전용 필드를 공용 contract에
  추가하지 않는다.
- raw `PointerEvent`는 기존 `src/input/**` 경계 밖으로 노출하지 않는다.
- raw `WheelEvent`는 새 `src/input/mouse/**` local adapter 안에서만 소비하며 `PointerSample`로 위장하지 않는다.
- Core entrypoint는 `src/extensions/**`와 `src/optional/**`를 import하지 않는다.
- Pencil modeling과 touch navigation의 기존 의미를 보존하며 desktop 입력은 additive하게 연결한다.
- 정적 Cloudflare Pages SPA 조건을 유지하고 Worker, Pages Function, binding 또는 backend를 추가하지 않는다.
- public contract 변경이 실제로 불가피해지면 frozen contract를 즉흥 수정하지 않고 구체적인 change request를
  RESULT에 기록한다. contract 변경 없이 acceptance를 충족할 수 없는 상태에서는 구현을 과장해
  `COMPLETE`로 기록하지 않는다.

## Execution

```text
Mode: WORKTREE
Branch: wt/desktop-mouse-camera
Worktree: ../wt-desktop-mouse-camera
Order: AFTER PLANNING COMMIT PUSH; MAY RUN IN PARALLEL WITH 16 AND 17 EARLY CORE
Branch point: exact immutable `POST_PLAN_BASE_SHA` recorded after the planning commit push
Output: VERIFIED UNIT COMMITS + FINAL RESULT COMMIT; NO TAG
Push: origin/wt/desktop-mouse-camera AFTER ACCEPTANCE; NEVER FORCE-PUSH
```

공지된 exact `POST_PLAN_BASE_SHA`는 `baseline/optional-sdk-v1^{commit}`을 ancestor로 가져야 한다. mutable
`origin/main` tip을 다시 선택하지 않으며, 14의 `baseline/full-v1` 존재나 release readiness는 18의 시작
조건이 아니다.

16 기본 도형 추가와 17 guided retopology는 18의 선행 조건이 아니며 서로 독립 branch/worktree에서 병렬
진행할 수 있다. 18의 자체 acceptance는 reference fixture 또는 기존 mesh fixture로 완결한다. 다만 최종 제품
E2E에서는 16이 게시한 기본 도형과 다음 조합을 추가 검증할 수 있다.

```text
Add Plane/Cube
-> Frame 또는 현재 viewport render
-> middle-drag orbit
-> Shift + middle-drag pan
-> wheel/trackpad zoom
-> left-button modeling/select
```

이 조합 E2E는 16과 18 양쪽 산출물이 준비된 뒤 별도 main integration에서 실행할 수 있으며, 어느 한
workstream이 다른 worktree를 직접 merge하게 만들지 않는다. 17의 guided flow도 같은 입력 정책을 소비할 수
있지만 18은 17의 UI나 lesson state를 구현하지 않는다.

## Goal

현재 touch-only camera routing을 보완해 desktop browser에서 기존 `OrbitCameraController`를 안전하게 재사용한다.
한 pointer가 camera와 Tool Runtime에 동시에 전달되지 않는 명시적인 owner/capture 규칙을 만들고 다음 canonical
mapping을 제공한다.

| 입력 | canonical 동작 |
|---|---|
| 가운데 버튼 drag | Orbit |
| Shift + 가운데 버튼 drag | Pan |
| Wheel / trackpad scroll | Zoom |
| 왼쪽 버튼 | 기존 selection·brush·modeling 입력 유지 |
| 오른쪽 버튼 | 향후 context menu용으로 예약; camera/modeling 시작 금지 |

`Alt + 왼쪽 버튼 drag` orbit과 관련 pan chord는 첫 구현에 hard-code하지 않는다. 가운데 버튼이 없는 장치를
위한 후속 configurable alias로만 검토한다.

## Non-Goals

- 16의 Plane/Cube/Sphere/Cylinder 생성, new scene 또는 frame-selection 구현
- 17의 tutorial, edge-loop lesson, guided retopology state 또는 onboarding UI 구현
- camera projection, orbit/pan 수학 또는 Renderer architecture 재작성
- 오른쪽 버튼 context menu 구현
- shortcut 설정 UI와 `Alt + left`, `Space + left` 등의 alias 기본 활성화
- touch gesture mapping의 제품 의미 변경 또는 Pencil barrel button을 mouse button으로 재해석
- wheel을 canonical `PointerSample` phase로 표현하거나 Tool Runtime에 전달
- native iPad/UIKit/Metal 전용 입력 구현
- Optional 10~13 내부 구현 수정
- Pages 배포, tag, release operations 또는 동적 backend 추가
- 래스터 asset, illustration 또는 texture 생성. 이 작업은 입력 상태·코드·테스트 중심이므로 ImageGen이
  필요하지 않으며 SVG/이미지 asset도 acceptance에 포함하지 않는다.

## Current Implementation Facts

- `normalizePointerEvent`는 browser mouse pointer를 이미 `pointerType: "mouse"`인 `PointerSample`로 만든다.
- `WorkspaceInputController`는 touch만 camera navigation으로 처리하고 모든 non-touch sample을 Tool Runtime으로
  보낸다.
- `OrbitCameraController`에는 `orbit`, `pan`, `zoom`이 이미 구현되어 있다.
- `NormalizedInputSurface`는 sink의 `capturePointer`/`releasePointer`를 DOM pointer capture에 반영하고
  lost capture를 normalized cancel로 전달한다.
- 저장소에는 wheel listener가 없으며 `PointerSample`에도 wheel delta가 없다.
- 공용 basic-tool helper는 mouse의 primary button을 엄격히 제한하지 않으므로 가운데/오른쪽 버튼이 tool down에
  섞일 수 있다.
- touch point가 먼저 등록된 뒤 tool capture가 우선되는 경로에서 terminal touch cleanup보다 capture 차단이
  먼저 실행되면 내부 touch map이 남을 위험이 있다.

따라서 새 camera math보다 입력 소유권, local wheel adapter, cleanup과 회귀 검증이 핵심 범위다.

## Start Gates

다음을 모두 충족하기 전에는 구현을 시작하지 않는다.

- `/AGENTS.md`, `00_MASTER.md`, `01_MAIN_LEAF.md`, `06_TOOL_RUNTIME.md`, `09_INTEGRATION.md`,
  `14_OPTIONAL_INTEGRATION.md`, `INTERFACE_CONTRACTS.md`, 이 문서와
  `docs/OCTOPOLY_DESKTOP_MOUSE_INPUT_ANALYSIS.md`를 끝까지 읽었다.
- `09_INTEGRATION` RESULT가 `COMPLETE`이고 `baseline/optional-sdk-v1`이 존재한다.
- planning push 뒤 공지된 exact `POST_PLAN_BASE_SHA`를 확인했고 그 commit이
  `baseline/optional-sdk-v1^{commit}`의 후손이다.
- `wt/desktop-mouse-camera`가 exact `POST_PLAN_BASE_SHA`에서 분기했고 현재 작업 위치가 지정 worktree와 branch다.
- worktree에 관련 없는 미커밋 변경이 없고 16/17 또는 사용자 파일과 소유 범위가 겹치지 않는다.
- 현재 `PointerSample`, `ToolInputResult`, `NormalizedInputSurface`, `ToolRuntime.capturedPointerId()`와
  `OrbitCameraController` API가 아래 설계를 contract 변경 없이 표현할 수 있음을 확인했다.
- Agent A/B/C를 사용하기 전에 아래 disjoint ownership을 실제 파일 목록으로 재확인했다.
- desktop Chrome와 Edge smoke를 실행할 환경을 확인했다. 실제 precision trackpad와 iPad 외부 pointer 장치의
  유무도 시작 시 기록해 검증 claim의 범위를 고정한다.

16/17의 branch, RESULT 또는 완료 여부는 start gate가 아니다.

## Canonical Pointer Ownership and Routing

### Owner Model

workspace 입력에는 동시에 하나의 고수준 owner만 존재해야 한다.

```text
idle
  |-- left/pen down accepted by tool --> tool-capture(pointerId)
  |-- middle-only mouse down ---------> mouse-navigation(pointerId, orbit|pan)
  |-- touch down ----------------------> touch-navigation(pointerIds)
  `-- handled wheel with no owner ----> stateless zoom -> idle

tool-capture
  |-- owner move/up/cancel -----------> Tool Runtime
  `-- up/cancel/lostcapture/blur/dispose -> idle

mouse-navigation
  |-- owner move ---------------------> frozen orbit 또는 pan mode
  `-- up/cancel/middle-bit-loss/lostcapture/blur/dispose -> idle

touch-navigation
  |-- tracked touch move -------------> 기존 orbit 또는 pinch/pan
  `-- terminal cleanup/owner preemption/blur/dispose -> idle
```

공통 invariant:

> 하나의 pointer sample은 camera와 modeling tool 양쪽에서 동시에 처리되지 않는다. 모든
> `up`, `cancel`, lost capture, window blur, disconnect와 dispose 뒤에는 navigation owner, tracked touch와
> Tool Runtime logical capture가 허용된 lifecycle 순서에 따라 0으로 수렴한다.

### Routing Priority

1. Tool Runtime이 이미 pointer를 capture했으면 그 owner의 sample이 최우선이다. 새 mouse/touch camera gesture와
   wheel zoom을 시작하지 않는다.
2. terminal `up`/`cancel` cleanup은 owner 우선순위 검사보다 먼저 수행한다. tool capture가 활성화되어 있어도
   이미 추적 중인 touch/mouse navigation pointer를 map에 남기지 않는다.
3. owner가 없고 mouse `down`의 `buttons`가 middle-only bitmask `4`이면 tool보다 먼저
   mouse navigation으로 분류한다.
4. navigation 시작 시 `sample.modifiers.shift`를 snapshot하여 mode를 `orbit` 또는 `pan`으로 고정한다.
   drag 중 Shift 상태가 바뀌어도 mode를 바꾸지 않는다.
5. mouse-navigation owner의 move/up/cancel은 Tool Runtime으로 전달하지 않는다. move에서 middle bit가
   사라지면 비정상 release로 처리해 idempotent cleanup한다.
6. mouse modeling의 새로운 down은 primary-button-only인 `buttons === 1`일 때만 Tool Runtime으로 보낸다.
   capture가 시작된 뒤 동일 owner의 move/up/cancel은 정상 종료를 위해 계속 전달한다.
7. 오른쪽 버튼 `buttons === 2` 또는 owner가 없는 multi-button chord는 camera/modeling gesture를 시작하지
   않는다. browser/OS context-menu policy를 이 작업에서 강제로 재매핑하지 않는다.
8. mouse hover는 기존 tool hover 의미를 보존하되 capture를 만들지 않는다.
9. active touch navigation과 새 modeling capture가 충돌하면 tool 우선 정책을 일관되게 적용하고 기존 touch를
   suppressed/cleanup 상태로 전환한다. 이후 각 touch terminal event가 내부 map과 DOM capture를 반드시
   정리해야 한다.

`PointerSample`에는 raw `button`이 없으므로 첫 구현은 canonical `buttons` bitmask만 사용한다. 정확한
changed-button 정보가 필요한 새 UX가 생기기 전에는 공용 contract 확장을 요청하지 않는다.

## Capture and Cleanup Semantics

- middle down을 navigation으로 수락하면 현재 sample에 `capturePointer: true`를 반환해 기존
  `NormalizedInputSurface`의 DOM capture 경계를 재사용한다.
- normal up은 camera mutation 없이 마지막 position bookkeeping을 지우고 `releasePointer: true`를 반환한다.
- `pointercancel`과 `lostpointercapture`의 normalized cancel은 같은 종료 함수로 정확히 한 번 처리한다.
- `window.blur`는 input surface가 보유한 모든 captured pointer에 normalized cancel을 전달하고 DOM capture와
  sample cache를 정리한다. 반복 blur/cancel/release는 side effect가 없어야 한다.
- element disconnect, input connection dispose, workspace document replacement와 workspace dispose도 같은
  cleanup invariant를 사용한다.
- camera gesture는 history transaction이나 ToolPreview를 만들지 않는다.
- cleanup 중 callback이나 camera update가 실패해도 owner/touch map/listener가 남지 않도록 `finally` 경계를
  사용한다.
- dispose 후 pointer/wheel callback, `preventDefault`, camera mutation 또는 render request가 발생하지 않는다.

## Wheel / Trackpad Zoom Adapter

Wheel은 pointer phase가 아니며 `PointerSample`로 위장하지 않는다. 새 `src/input/mouse/**` local adapter가
viewport element의 raw `WheelEvent`를 소유하고 기존 camera callback을 호출한다.

필수 처리 순서:

1. viewport element에 `wheel` listener를 `{ passive: false }`로 등록한다.
2. `deltaY`와 `deltaMode`를 CSS pixel 단위로 정규화한다.
   - `DOM_DELTA_PIXEL`: 그대로 사용
   - `DOM_DELTA_LINE`: 명시된 finite positive line-height multiplier 사용
   - `DOM_DELTA_PAGE`: 현재 viewport CSS height multiplier 사용
3. non-finite, zero 또는 unsupported delta는 처리하지 않는다.
4. normalized delta를 명시된 대칭 범위로 clamp한다.
5. `scale = exp(clampedDelta * sensitivity)` 형태의 positive finite 연속 scale로 변환한다. 양의 vertical
   delta는 기존 `camera.zoom(scale)` 의미에 맞춰 zoom-out, 음의 delta는 zoom-in으로 고정한다.
6. Tool Runtime capture 또는 mouse/touch navigation owner가 있으면 wheel을 무시한다.
7. camera zoom과 render request가 실제 성공한 event만 `preventDefault()`한다. 미처리 event는 page scroll과
   browser 기본 동작을 막지 않는다.
8. high-resolution trackpad delta를 integer step으로 반올림하지 않고 첫 구현에서 별도 inertia를 합성하지
   않는다.
9. dispose에서 listener와 callback reference를 제거하고 반복 dispose를 허용한다.

adapter의 option/result type은 `src/input/mouse/**` 내부 local API로 유지한다. 첫 구현에서
`NormalizedInputSurface`, `PointerInputSink`, `Tool`, `CameraSnapshot` 계약을 변경하지 않는다.

## Touch Map Hardening

현재 touch path는 Tool Runtime capture 확인이 tracked-touch terminal cleanup보다 앞에 있어 touch map이 남을 수
있다. 18은 mouse 기능을 붙이는 동시에 다음 회귀를 닫는다.

- tracked touch의 `up`/`cancel`은 현재 tool owner 유무와 무관하게 map에서 제거된다.
- lost capture, blur, disconnect와 dispose 뒤 tracked touch count가 0이다.
- tool capture 중 새 touch가 camera를 움직이거나 tool owner를 탈취하지 않는다.
- touch navigation 중 modeling owner를 허용하는 정책을 선택하면 기존 touch는 명시적인 suppressed state로
  이동하며 terminal cleanup만 수행한다.
- 두 손가락 중 하나가 취소되면 남은 한 손가락의 previous position과 mode가 결정적으로 재기준화되어 camera
  jump가 발생하지 않는다.
- touch orbit/pinch/pan과 Pencil pressure/coalesced dispatch의 기존 테스트가 회귀 없이 통과한다.

## Integration Ownership

18에 한해 아래 파일을 조정할 수 있다.

```text
src/input/mouse/**
src/input/surface/normalizedInputSurface.ts
src/input/surface/index.ts
src/app/composition/workspace-input.ts
src/tools/basic/gesture.ts

tests/input/mouse/**
tests/input/normalizedInput.test.ts
tests/app/composition/workspace-input.test.ts
tests/tools/basic/gesture-mouse-routing.test.*
tests/integration/desktop-mouse-camera.integration.test.ts
tests/e2e/desktop-mouse-camera.browser.test.ts
tests/device/desktop-mouse-camera/**
scripts/verify-desktop-mouse*
docs/validation/desktop-mouse/**

docs/workplan/18_DESKTOP_MOUSE_CAMERA.md (RESULT만)
```

`src/contracts/**`, `INTERFACE_CONTRACTS.md`, Renderer 내부, Optional extension 내부와 16/17 소유 파일은
Ownership이 아니다. 조건부 파일은 필요성, 변경 이유와 focused validation을 RESULT에 기록한다.

## Agent Allocation

주 에이전트는 시작 시 실제 파일 목록과 branch revision을 선언하고 아래 경로가 겹치지 않는지 확인한다.

### Agent A — Mouse/Wheel Adapter and DOM Cleanup

소유 파일:

```text
src/input/mouse/**
src/input/surface/normalizedInputSurface.ts
src/input/surface/index.ts
tests/input/mouse/**
tests/input/normalizedInput.test.ts
```

책임:

- `deltaMode` normalization, clamp, exponential scale와 handled-only `preventDefault`
- `{ passive: false }` listener 연결과 idempotent dispose
- window blur/disconnect/lost-capture의 normalized cancel 및 DOM capture cleanup
- raw `WheelEvent`와 raw `PointerEvent`가 input 경계 밖으로 누출되지 않는지 검증

### Agent B — Workspace Pointer Ownership

소유 파일:

```text
src/app/composition/workspace-input.ts
tests/app/composition/workspace-input.test.ts
```

책임:

- tool/mouse-navigation/touch-navigation의 mutually exclusive owner state
- middle-only orbit, Shift snapshot pan, primary-left tool routing, right-button reservation
- tool logical capture 우선과 navigation sample의 Tool Runtime 비전달
- terminal-before-arbitration touch cleanup, suppressed touch와 공통 owner invariant
- up/cancel/middle-bit-loss/lost-capture/blur/dispose에 연결 가능한 idempotent navigation cleanup

### Agent C — Integration and Browser Evidence

소유 파일:

```text
tests/integration/desktop-mouse-camera.integration.test.ts
tests/e2e/desktop-mouse-camera.browser.test.ts
tests/device/desktop-mouse-camera/**
scripts/verify-desktop-mouse*
docs/validation/desktop-mouse/**
```

책임:

- 실제 workspace/canvas의 pointer capture, camera snapshot 변화와 left-modeling 무회귀 검증
- Chrome/Edge 실제 browser smoke 절차와 결과 기록
- 실제 mouse wheel과 가능한 경우 precision trackpad의 고해상도 scroll 증거 분리
- 16 기본 도형 산출물이 함께 있는 integration revision에서 실행할 optional combination fixture 준비
- iPad Magic Keyboard trackpad 또는 외부 mouse 검증은 실제 physical evidence가 있을 때만 기록

### Main Agent Reserved

```text
src/tools/basic/gesture.ts
tests/tools/basic/gesture-mouse-routing.test.*
docs/workplan/18_DESKTOP_MOUSE_CAMERA.md의 RESULT
```

주 에이전트 책임:

- exact baseline/branch/start gate 판정과 ownership freeze
- Agent A local wheel adapter와 Agent B owner controller를 branch-local input entry에 연결
- primary-button helper가 pen/Pencil behavior를 바꾸지 않는지 검토
- shared CoreWorkspace/camera/config 변경은 19 Phase A integration note로 넘기고 이 branch에서 수정하지 않음
- A/B 결과가 고정된 revision에서 C browser evidence를 실행
- 전체 acceptance, RESULT, final workstream commit과 branch push 준비

실행 순서는 `preflight -> ownership freeze -> Agent A/B 병렬 -> main-agent composition -> Agent C validation ->
RESULT/final commit`이다.

## Internal Work Sequence and Gates

1. **Gate 0 — Baseline and boundary:** 공지된 exact `POST_PLAN_BASE_SHA`, 09 ancestry, clean WORKTREE,
   frozen contract와 current capture semantics를 확인한다.
2. **Gate 1 — Ownership freeze:** A/B/C/Main의 파일 목록과 public/local API를 선언한다. Wheel adapter는
   local API이고 공용 contract request가 없음을 확인한다.
3. **Gate 2 — Parallel implementation:** Agent A는 DOM/wheel 경계, Agent B는 pure owner/router state를 서로의
   concrete code에 의존하지 않고 구현한다.
4. **Gate 3 — Composition:** 주 에이전트가 CoreWorkspace initialize/document replacement/dispose lifecycle에
   두 결과를 연결하고 primary mouse button 제한을 적용한다.
5. **Gate 4 — Automated validation:** unit, integration, existing Core/Optional regression과 typecheck/build를
   실행한다.
6. **Gate 5 — Browser evidence:** 같은 candidate commit에서 실제 Chrome와 Edge mouse smoke를 수행하고
   hardware trackpad/iPad 외부 pointer 결과를 자동 fixture와 분리해 기록한다.
7. **Gate 6 — Final audit:** owner/capture leak 0, raw event boundary, Optional isolation, changed-file ownership,
   RESULT와 no-tag 조건을 확인한다.

## Tests and Validation

### Unit — Mouse/Wheel

- pixel/line/page `deltaMode`가 같은 CSS-pixel 단위와 방향으로 정규화된다.
- non-finite/zero delta는 unhandled이고 clamp 뒤 scale은 positive finite다.
- 연속 trackpad delta를 정수 step으로 양자화하지 않는다.
- tool 또는 navigation owner가 있으면 zoom과 `preventDefault`가 모두 발생하지 않는다.
- 실제 camera callback이 성공한 event만 `preventDefault`된다.
- repeated dispose, callback failure와 dispose 이후 event가 listener/owner를 남기지 않는다.

### Unit — Pointer Ownership

- middle-only down은 orbit capture, Shift+middle-only down은 pan capture를 반환한다.
- 시작 후 Shift 변경은 mode를 바꾸지 않는다.
- navigation owner의 move/up/cancel은 Tool Runtime에 전달되지 않는다.
- tool-captured owner는 camera drag와 wheel보다 우선한다.
- left mouse down만 새 modeling gesture를 시작하고 right/middle/multi-button down은 tool에 전달되지 않는다.
- hover와 captured left owner의 terminal sample은 기존 tool behavior를 유지한다.
- middle bit loss, up, cancel, lost capture, blur와 dispose가 owner를 정확히 한 번 정리한다.
- tool capture 중 도착한 tracked touch terminal도 touch map을 정리한다.
- 모든 cleanup 뒤 tool capture, mouse owner와 tracked touch count가 0이다.

### Integration

- actual `NormalizedInputSurface -> WorkspaceInputController -> OrbitCameraController -> render request` 경로에서
  middle drag 후 camera position, Shift+middle drag 후 camera target, wheel 후 camera distance가 기대 방향으로
  변한다.
- DOM `setPointerCapture`/`releasePointerCapture`, normalized lost capture와 window blur cleanup이 일치한다.
- active left-button tool gesture 중 middle/wheel/touch가 mesh/history/preview와 camera를 동시에 바꾸지 않는다.
- camera navigation은 history entry를 생성하지 않는다.
- 기존 Pencil retopo vertical slice, touch orbit/pinch/pan, save/reload/export와 context restore가 통과한다.
- Core-only verification과 Full Optional candidate가 있는 baseline의 Optional test가 회귀 없이 통과한다.
- 16이 아직 없으면 fixture mesh/reference로 독립 검증한다. 16이 같은 integration baseline에 있으면
  Add Plane/Cube 후 모든 면을 orbit/pan/zoom으로 확인하고 left modeling이 유지되는 조합 E2E를 추가한다.

### Actual Browser Smoke

동일 candidate commit과 build에서 다음을 기록한다.

- Windows Chrome: middle orbit, Shift+middle pan, wheel zoom, left modeling, right reserved, capture release
- Windows Edge: 같은 항목
- 실제 precision trackpad가 있으면 Chrome 또는 Edge에서 high-resolution scroll zoom, page-scroll suppression,
  gesture 종료와 방향을 확인
- context menu, text selection, browser page scroll과 focus/blur에 불필요한 부작용이 없는지 확인
- console warning/error, stuck pointer, camera jump와 post-dispose callback이 없는지 확인

synthetic `WheelEvent`, jsdom, Playwright/CDP event injection은 자동 회귀 evidence이며 실제 mouse/trackpad claim을
대체하지 않는다. actual trackpad가 없으면 `Trackpad validation: NOT_RUN`으로 기록하고 validated라고 표현하지
않는다.

### iPad External Pointer Evidence

iPad Magic Keyboard trackpad 또는 외부 mouse 지원을 주장하려면 최소 지원 iPadOS/Safari의 실제 기기에서
별도 physical evidence를 남긴다.

- pointer 종류와 middle/left/right 또는 device가 실제 제공하는 button mapping
- trackpad scroll zoom, focus/blur, app background/foreground와 capture cleanup
- Pencil modeling, touch navigation과 외부 pointer navigation 사이의 owner 충돌 없음
- orientation/resize 뒤 camera와 picking 정렬

desktop Chrome/Edge와 자동 fixture는 이 evidence를 대체하지 않는다. physical device가 없다는 이유만으로
desktop mouse MVP의 완료를 과장하거나 iPad external-pointer support를 claim하지 않는다.

## Acceptance Gates

다음을 모두 충족해야 `COMPLETE`다.

- [ ] exact main baseline SHA, 09 ancestry, WORKTREE 위치와 clean start를 확인했다.
- [ ] 16/17을 import하거나 기다리지 않고 독립 구현·검증했으며 16/17 소유 파일을 수정하지 않았다.
- [ ] middle drag orbit, Shift+middle drag pan, wheel/trackpad-scroll zoom, left modeling, right reserved mapping이
      구현되었다.
- [ ] gesture 시작 시 mode가 snapshot되고 Shift 변화가 active mode를 바꾸지 않는다.
- [ ] Tool Runtime logical capture가 camera/wheel보다 우선하며 한 sample이 tool과 camera 양쪽에서 처리되지 않는다.
- [ ] primary-button-only modeling 시작과 right/middle/multi-button 차단이 Pencil behavior를 회귀시키지 않는다.
- [ ] Wheel은 `PointerSample`로 위장되지 않고 `src/input/mouse/**` local adapter에서 deltaMode normalization,
      clamp, exponential scale, `{ passive: false }`, handled-only `preventDefault`를 지킨다.
- [ ] up/cancel/middle-bit-loss/lostcapture/blur/disconnect/dispose 뒤 owner, touch map, logical/DOM capture와
      listener가 남지 않는다.
- [ ] touch map 잔존 회귀와 공통 owner invariant가 unit/integration test로 닫혔다.
- [ ] frozen contract를 변경하지 않았고 raw DOM event가 input 경계 밖으로 누출되지 않는다.
- [ ] targeted unit/integration, canonical typecheck/test/build와 Core-only regression이 통과했다.
- [ ] 실제 Windows Chrome와 Edge mouse smoke가 같은 candidate commit에서 통과하고 evidence가 기록되었다.
- [ ] actual precision trackpad 또는 iPad external pointer 결과는 physical evidence가 있는 범위에서만 claim했다.
- [ ] 16 산출물이 있는 경우 기본 도형 조합 E2E 결과를 기록하고, 없는 경우 이를 18 자체 실패로 취급하지
      않았다.
- [ ] 검증된 기능 단위 commit과 RESULT를 포함한 final commit을 만들었고 tag를 만들지 않았다.

## Failure and Stop Rules

- current `PointerSample.buttons`와 local adapter로 안전한 routing을 표현할 수 없으면 공용 contract를 즉흥
  변경하지 않고 concrete request와 재현 fixture를 RESULT에 남긴다.
- middle/right button이 Tool Runtime에도 전달되어 mesh/history와 camera가 함께 변하는 경우 acceptance 실패다.
- cancel/lostcapture/blur/dispose 뒤 owner, touch map, capture 또는 listener가 하나라도 남으면 memory leak 여부와
  무관하게 acceptance 실패다.
- wheel을 처리하지 않았는데 `preventDefault`하여 page scroll을 막거나 active tool capture 중 camera가
  움직이면 acceptance 실패다.
- 기존 Pencil/touch vertical slice, Core-only build 또는 Optional isolation이 깨지면 18을 `COMPLETE`로
  기록하지 않는다.
- 실제 Chrome/Edge 환경이 없어 required desktop smoke를 실행하지 못하면 automated test만으로 실제 browser
  validation을 통과했다고 기록하지 않는다.
- precision trackpad나 iPad 외부 pointer가 없으면 해당 claim만 `NOT_RUN`으로 남긴다. desktop mouse acceptance와
  physical-device claim을 분리한다.
- 16/17 작업자가 18 branch를 merge하거나 18 작업자가 16/17 내부 구현을 수정하지 않는다.
- 관련 없는 dirty file, ownership 충돌 또는 판정 불가능한 shared-file conflict가 있으면 해당 변경을 덮어쓰지
  않고 구현/merge를 중지해 사용자에게 보고한다.

## Final Commit and No-Tag Rule

1. 모든 acceptance evidence와 미실행 physical-device 항목을 구분해 수집한다.
2. 이 문서의 `RESULT`를 먼저 갱신한다. final commit SHA를 RESULT 안에 자기 참조로 기록하지 않는다.
3. 18 Ownership 안에서 검증된 기능 단위 commit을 허용하고, RESULT를 포함한 final commit을
   `wt/desktop-mouse-camera`에 생성한다.
4. targeted tests, canonical CI-equivalent와 changed-file audit를 final tree에서 다시 확인한다.
5. 루트 `AGENTS.md`의 사전 승인에 따라 같은 이름의 origin branch로 non-force push할 수 있다.
6. main merge와 main push는 이 WORKTREE가 수행하지 않는다.
7. `baseline/*`, `deploy/*` 또는 다른 어떤 tag도 만들거나 이동하지 않는다.
8. 최종 응답에 branch, resolved input SHA, `git rev-parse HEAD`, tests, browser/device evidence와 remaining
   limitations를 보고한다.

## RESULT

Status: NOT_STARTED

### Baseline and execution
- Input `POST_PLAN_BASE_SHA`: NOT_SET
- 09 baseline ancestry: NOT CHECKED
- Start-SHA ancestry check: NOT_RUN
- Branch/worktree: `wt/desktop-mouse-camera` / `../wt-desktop-mouse-camera`
- 16/17 dependency: NONE

### Implemented
- NOT STARTED

### Canonical mapping delivered
- Middle drag orbit: NOT STARTED
- Shift + middle drag pan: NOT STARTED
- Wheel/trackpad scroll zoom: NOT STARTED
- Left modeling preserved: NOT STARTED
- Right button reserved: NOT STARTED

### Files created or modified
- NONE

### Public and local API
- Public contract changes: NONE PLANNED
- Local mouse/wheel adapter: NOT STARTED

### Tests / validation
- Unit: NOT RUN
- Integration: NOT RUN
- Canonical typecheck/test/build: NOT RUN
- Core-only regression: NOT RUN
- Optional regression where present: NOT RUN

### Browser validation
- Windows Chrome mouse: NOT RUN
- Windows Edge mouse: NOT RUN
- Precision trackpad: NOT RUN

### Physical iPad external pointer evidence
- Magic Keyboard trackpad: NOT RUN
- External mouse: NOT RUN
- Claim: NONE

### 16/17 combination evidence
- Basic primitive + camera E2E: NOT RUN; not a standalone 18 start gate
- Guided retopology + desktop input: NOT RUN; not a standalone 18 acceptance dependency

### Requested contract changes
- NONE

### Integration notes
- NONE

### Known limitations
- Implementation and validation have not started.

### Final disposition
- Final local branch tip: NOT_SET
- Pushed `origin/wt/desktop-mouse-camera` tip: NOT_SET
- Local/remote tip equality: NOT_CHECKED
- Branch push: NOT PERFORMED
- Main merge: NOT PERFORMED
- Tag: NOT CREATED — prohibited for this workstream
