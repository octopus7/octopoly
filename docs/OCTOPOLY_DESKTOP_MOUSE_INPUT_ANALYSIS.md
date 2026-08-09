# OctoPoly 데스크톱 마우스 카메라 입력 분석

- 작성일: 2026-08-10
- 대상: PC Chrome/Edge 등 Pointer Events 지원 데스크톱 브라우저
- 상태: 분석 완료, 구현 미시작
- 목적: 마우스 orbit/pan/wheel zoom 미지원 원인, 안전한 입력 정책, 구현 및 검증 범위를 기록한다.
- 주의: 이 문서는 실행 승인을 받은 신규 workplan이 아니다.

## 결론

현재 PC 마우스 카메라 조작은 지원되지 않는다. 브라우저의 마우스 `PointerEvent` 정규화는 이미 되지만 정책상 `pen/mouse`를 모델링 입력, `touch`만 카메라 navigation으로 분류한다. 실제 workspace 조립부도 non-touch 입력을 모두 Tool Runtime으로 보내므로 마우스 orbit/pan이 발생하지 않는다. 저장소에는 wheel listener와 `WheelEvent` 정규화 경로도 없다.

권장 MVP 매핑은 다음과 같다.

| 입력 | 동작 |
|---|---|
| 가운데 버튼 drag | Orbit |
| Shift + 가운데 버튼 drag | Pan |
| Wheel / trackpad scroll | Zoom |
| 왼쪽 버튼 | 선택·브러시·모델링 도구 유지 |
| 오른쪽 버튼 | 향후 context menu용으로 예약 |

이 매핑은 Blender 계열 사용자에게 익숙하고 기존 왼쪽 버튼 모델링 입력과의 충돌이 가장 적다. `Alt + 왼쪽 버튼 orbit`은 접근성 또는 Maya 계열 alias로 후속 제공할 수 있으나 첫 MVP에 섞지 않는다.

## 현재 입력 경로

### 마우스 정규화는 이미 존재한다

브라우저 마우스 `PointerEvent`는 `pointerType: "mouse"`인 normalized sample로 변환된다. [`normalizePointer`](../src/input/pen/normalizePointer.ts#L14)

따라서 DOM event를 받지 못하는 문제가 아니다.

### 정책이 마우스를 모델링 입력으로 고정한다

현재 gesture policy는 다음처럼 분류한다. [`gesturePolicy`](../src/input/touch/gesturePolicy.ts#L3)

- pen: modeling
- mouse: modeling
- touch: navigation

workspace 입력 조립부도 touch만 카메라 분기로 보내고 non-touch sample은 Tool Runtime으로 전달한다. [`workspace input`](../src/app/composition/workspace-input.ts#L30)

### touch 카메라는 이미 구현돼 있다

현재 touch mapping은 다음과 같다. [`workspace touch navigation`](../src/app/composition/workspace-input.ts#L65)

- 한 손가락: orbit
- 두 손가락: pinch zoom + pan

`OrbitCameraController`에는 orbit, pan, zoom 계산이 이미 구현돼 있다. [`OrbitCameraController`](../src/camera/index.ts#L98)

마우스 MVP는 새 카메라 수학을 만드는 작업이 아니라 기존 controller에 안전한 desktop gesture adapter를 추가하는 작업이다.

### Wheel 경로는 없다

- 저장소 전체에 `wheel` listener가 없다.
- canonical 입력 계약은 `PointerSample` 중심이며 wheel delta를 표현하지 않는다. [`input contracts`](../src/contracts/input.ts#L15)
- Wheel을 가짜 PointerSample로 변환하면 의미가 흐려지고 pointer capture와 phase 규칙을 오염시킨다.

따라서 wheel은 mouse adapter 내부에서 별도 event로 처리하고 기존 `camera.zoom(scale)`을 호출하는 것이 적합하다.

### 초기 Retopo Stroke는 왼쪽 마우스도 사용하지 않는다

시작 시 활성화되는 Retopo Stroke는 pen sample만 받는다. [`retopo tool`](../src/app/composition/retopo-tool.ts#L64)

따라서 현재 기본 화면에서는 다음이 모두 성립한다.

- 마우스로 카메라를 움직일 수 없음
- Retopo Stroke 활성 상태에서 왼쪽 마우스도 modeling stroke로 사용되지 않음

PC 사용자는 viewport를 보기만 하고 상호작용이 막힌 것으로 느낄 수 있다.

## 권장 입력 소유권 규칙

모델링 도구와 카메라가 같은 pointer를 동시에 소비하면 selection click, brush stroke, orbit가 섞인다. 입력 라우터는 pointer마다 한 owner만 가져야 한다.

우선순위는 다음으로 고정한다.

1. Tool Runtime이 이미 pointer를 capture한 상태면 새 camera drag를 시작하지 않는다.
2. 아직 owner가 없고 가운데 버튼이 눌렸으면 tool보다 먼저 navigation으로 분류한다.
3. 시작 시 `orbit` 또는 `pan` mode를 고정한다.
4. 해당 pointer의 move/up/cancel은 끝까지 tool에 전달하지 않는다.
5. 왼쪽 버튼과 hover는 기존 modeling/selection tool로 전달한다.
6. navigation 종료 또는 cancel 뒤에만 새 tool gesture를 허용한다.
7. wheel은 active tool capture 중에는 무시한다.

개념적으로 다음 상태가 필요하다.

```text
idle
  ├─ middle down ───────────────→ mouse-navigation(owner=pointerId, mode=orbit)
  ├─ shift + middle down ───────→ mouse-navigation(owner=pointerId, mode=pan)
  ├─ left down accepted by tool → tool-capture(owner=pointerId)
  └─ wheel with no capture ─────→ stateless zoom

mouse-navigation
  ├─ move → orbit/pan
  └─ up/cancel/lost capture/dispose → idle

tool-capture
  ├─ tool move/up/cancel
  └─ release → idle
```

## 버튼 판정

현재 일부 기본 도구는 `pointerType === "mouse"` 여부를 보지만 어떤 button이 눌렸는지 충분히 제한하지 않는다. [`basic tool gesture`](../src/tools/basic/gesture.ts#L19)

이 상태에서 가운데/오른쪽 버튼을 navigation에 추가하면 tool도 같은 sample을 받을 위험이 있다.

권장 판정은 다음과 같다.

- 시작 event에서는 `button`으로 바뀐 버튼을 판정한다.
- move 중에는 `buttons` bitmask로 owner button이 계속 눌렸는지 확인한다.
- modeling tool의 mouse down은 기본적으로 primary button만 받는다.
- pen의 barrel button 규칙은 mouse secondary/middle 규칙과 섞지 않는다.
- macOS trackpad의 control-click 등 OS context menu 동작은 억지로 재매핑하지 않는다.

## Pointer capture와 cleanup

기존 normalized input surface의 DOM pointer capture 경계는 재사용할 수 있다. adapter가 `capturePointer`를 반환하면 `setPointerCapture`를 호출하고, pointercancel, lostpointercapture, disconnect/dispose를 normalized cancel로 정리한다. [`normalized input surface`](../src/input/surface/normalizedInputSurface.ts#L253)

mouse navigation adapter는 다음을 보장해야 한다.

- 가운데 버튼 down에서 capture 성공/실패를 명시적으로 처리
- up에서 release
- pointercancel과 lostpointercapture에서 camera gesture 정확히 한 번 종료
- window blur, element disconnect, workspace dispose에서 owner와 누적 delta 제거
- 반복 cancel/release는 side effect 없음
- cancel된 camera gesture가 history entry를 만들지 않음

### 함께 정리해야 할 touch 잔존 상태 위험

현재 touch가 먼저 시작된 뒤 pen/tool capture가 활성화되면 일부 touch up/cancel이 조기에 차단돼 내부 touch map이 남을 가능성이 있다. desktop 입력을 붙일 때 touch/mouse/tool을 하나의 명시적인 navigation-owner 규칙으로 정리하는 것이 안전하다.

최소 수정으로 mouse만 붙일 수는 있지만, 아래 invariant는 공통으로 검증해야 한다.

> dispose, cancel 또는 lost capture 이후 active pointer와 navigation owner는 반드시 0이다.

## Wheel zoom 설계

MVP에서는 frozen canonical input contract를 바꾸지 않고 새 mouse adapter 내부에서 raw `WheelEvent`를 처리한다.

### 권장 처리

1. `wheel` listener를 `{ passive: false }`로 등록한다.
2. `deltaMode`를 CSS pixel 단위로 정규화한다.
   - `DOM_DELTA_PIXEL`: 그대로 사용
   - `DOM_DELTA_LINE`: 구성 가능한 line height를 곱함
   - `DOM_DELTA_PAGE`: viewport height를 곱함
3. 비정상적으로 큰 delta를 clamp한다.
4. `scale = exp(normalizedDelta * sensitivity)`와 같은 연속 scale을 계산한다.
5. 기존 `camera.zoom(scale)`을 호출한다.
6. 실제 처리한 wheel만 `preventDefault()`한다.
7. Tool Runtime 또는 navigation pointer가 capture 중이면 wheel을 무시한다.
8. dispose 시 listener를 제거한다.

### 방향과 trackpad

- wheel down/up 방향은 기존 camera zoom의 scale 정의에 맞춰 명시적으로 test한다.
- high-resolution trackpad delta를 정수 step으로 반올림하지 않는다.
- 짧은 연속 event를 자연스럽게 적용하되, 첫 MVP에서 inertia를 새로 만들지 않는다.
- browser page scroll은 viewport 위에서 wheel zoom을 처리할 때만 막는다.

## Orbit과 Pan 변환

기존 touch navigation의 pixel delta와 sensitivity 정책을 재사용한다.

### Orbit

- `dx`, `dy`를 viewport 크기 또는 현재 touch sensitivity 기준으로 정규화
- 기존 `camera.orbit(deltaYaw, deltaPitch)` 호출
- pitch clamp와 camera up 안정성은 controller가 소유

### Pan

- Shift 상태는 gesture 시작 시 snapshot하고 drag 중 mode를 바꾸지 않는다.
- 기존 `camera.pan(dx, dy)` 또는 동등한 screen-space pan 경로 호출
- 중간에 Shift를 놓더라도 해당 gesture는 pan으로 끝낸다.

gesture 중 mode 전환을 허용하면 갑작스러운 camera jump와 tool 충돌을 재현하기 어렵다.

## 접근성 및 대체 매핑

가운데 버튼이 없는 장치와 일부 trackpad 사용자를 위해 후속 alias가 필요하다.

| Alias 후보 | 장점 | 위험 | 권고 |
|---|---|---|---|
| Alt + 왼쪽 drag orbit | Maya·일부 DCC 사용자에게 익숙함 | browser/OS shortcut, 왼쪽 tool과 충돌 | 설정 가능한 후속 alias |
| Shift + Alt + 왼쪽 drag pan | 키보드+trackpad 가능 | chord가 복잡함 | orbit alias와 함께만 제공 |
| 오른쪽 drag orbit | 버튼 접근 쉬움 | context menu와 충돌 | 기본값 비권장 |
| Space + 왼쪽 drag | Pencil/keyboard workflow와 유사 | active tool 임시 전환 설계 필요 | Pro shortcut 단계에서 검토 |

첫 MVP는 중클릭과 wheel을 canonical mapping으로 두고, 설정 UI 없이 alias를 여러 개 hard-code하지 않는다.

## 예상 수정 파일

### 필수

| 경로 | 변경 |
|---|---|
| `src/input/mouse/**` 신규 | wheel 정규화, mouse navigation gesture, listener lifecycle |
| `src/app/composition/workspace-input.ts` | mouse navigation owner와 tool routing 우선순위 |
| `src/app/composition/core-workspace.ts` | camera/tool capture 상태 연결과 dispose |
| `tests/input/mouse-navigation.test.ts` 신규 | button/mode/wheel/cancel/dispose 단위 검증 |
| `tests/app/composition/workspace-input.test.ts` 신규 | camera와 Tool Runtime routing 경계 |
| `tests/integration/core-workspace.integration.test.ts` | 실제 workspace orbit/pan/zoom과 modeling 유지 |

### 조건부

| 경로 | 조건 |
|---|---|
| `src/camera/index.ts` | zoom distance limit, sensitivity 또는 controller API 보완이 필요할 때만 |
| `tests/camera/camera.test.ts` | camera clamp나 새 public behavior를 추가할 때 |
| `src/tools/basic/gesture.ts` 및 도구 tests | primary mouse button 제한을 공통 helper로 동결할 때 |

canonical `PointerSample`에 Wheel을 추가하거나 Tool 계약을 변경하는 것은 첫 MVP에서 불필요하다.

## 구현 단위 권장

기본 도형 기능과 사용자 가치상 함께 필요하지만 수정 파일과 회귀 위험이 다르므로 별도 commit이 적합하다.

### 단위 1 — Mouse orbit/pan

- 가운데 버튼 owner/capture
- Shift mode snapshot
- camera orbit/pan
- up/cancel/lost capture/dispose cleanup
- 왼쪽 modeling 보존

### 단위 2 — Wheel/trackpad zoom

- deltaMode 정규화
- clamp와 exponential scale
- active capture 중 차단
- passive listener와 preventDefault 정책
- 실제 Chrome/Edge trackpad smoke

### 단위 3 — Input ownership hardening

- mouse modeling primary button 제한
- touch/mouse/tool 공통 owner invariant
- touch 잔존 map 회귀 test
- configurable desktop aliases는 이후 결정

## Acceptance 기준 초안

### Mouse orbit/pan

- [ ] 가운데 버튼 drag가 orbit만 수행한다.
- [ ] Shift + 가운데 버튼 drag가 pan만 수행한다.
- [ ] gesture 시작 후 Shift 변경이 mode를 바꾸지 않는다.
- [ ] navigation pointer는 Tool Runtime에 전달되지 않는다.
- [ ] 왼쪽 버튼 modeling/selection은 기존과 동일하다.
- [ ] 오른쪽 버튼은 modeling이나 navigation을 우발적으로 시작하지 않는다.
- [ ] up/cancel/lost capture/blur/dispose 후 owner가 남지 않는다.

### Wheel/trackpad zoom

- [ ] pixel/line/page deltaMode가 같은 방향과 유사한 체감 scale로 정규화된다.
- [ ] wheel과 trackpad의 고해상도 delta가 부드럽게 확대/축소된다.
- [ ] 과도한 delta가 camera를 near/far limit 밖으로 보내지 않는다.
- [ ] active tool capture 중 wheel이 camera를 움직이지 않는다.
- [ ] viewport에서 처리한 wheel만 page scroll을 막는다.
- [ ] dispose 후 wheel listener가 남지 않는다.

### 실제 브라우저

- [ ] Windows Chrome에서 중클릭 orbit, Shift+중클릭 pan, wheel zoom 통과
- [ ] Windows Edge에서 동일 smoke 통과
- [ ] 사용 가능한 경우 precision touchpad scroll 통과
- [ ] context menu, text selection, page scroll에 불필요한 부작용 없음
- [ ] 기본 도형 생성 후 reference 없이 camera로 모든 면을 확인할 수 있음

## 최종 판단

마우스 카메라 미지원은 구조적 한계가 아니라 입력 routing과 wheel adapter의 구현 공백이다. 기존 pointer 정규화, DOM capture cleanup, OrbitCameraController를 재사용할 수 있으므로 범위가 비교적 명확하다.

가장 안전한 순서는 다음과 같다.

```text
middle-drag orbit / Shift+middle pan
→ wheel/trackpad zoom
→ primary-button tool 제한
→ touch/mouse/tool owner invariant
→ 실제 Chrome/Edge smoke
```

이 기능은 PC 개발·테스트 편의만이 아니라 Magic Keyboard와 mouse/trackpad를 사용하는 iPad 사용자, 네이티브 iPad 앱의 외부 입력 지원에도 그대로 재사용되는 제품 기능이다.
