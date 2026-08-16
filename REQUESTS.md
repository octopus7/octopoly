# 작업 요청 기록

## 기본 큐브 및 마우스·iPad 카메라 조작 | 시작: 2026-08-11 20:00:00 KST | 종료: 2026-08-11 20:13:11 KST | 소요: 13분

- 빈 문서의 기본 장면에 WebGL2 큐브를 표시하고, 마우스 드래그/휠과 iPad 한 손가락 드래그/두 손가락 핀치로 회전·줌할 수 있게 구현했다.
- 뷰포트가 화면 전체를 사용하도록 하고 로고, 상태, 조작 안내는 뷰포트 위의 오버레이로 배치했다. 이후 메뉴도 같은 방식으로 공간을 차지하지 않고 확장할 수 있다.
- ImageGen으로 만든 흰색 `OctoPoly` 워드마크의 검은 배경 밝기를 알파로 사용했다. 생성 원본은 `assets/source/octopoly-wordmark-source.png`에 보존하고, 앱은 1024px 폭으로 리샘플한 `public/assets/octopoly-wordmark.png`를 사용한다.
- Apple Pencil은 향후 모델링 입력과 충돌하지 않도록 카메라 조작에서 제외하고, iPad 카메라 조작은 터치 입력에 할당했다.

## 한 손가락 터치 카메라 상하 회전 반전 | 시작: 2026-08-16 20:24:04 KST | 종료: 2026-08-16 20:26:50 KST | 소요: 3분

- 한 손가락 touch drag의 Y delta만 반전해 상하 orbit 방향을 사용자 요청과 맞췄다.
- 좌우 touch yaw, 기존 mouse drag의 상하 방향, 두 손가락 pinch zoom은 그대로 유지했다.
- 회귀 테스트를 RED→GREEN으로 확인하고 전체 CI의 typecheck, 7 tests, production build와 artifact 검증을 통과했다.

## 브라우저 전체 화면 토글 버튼 | 시작: 2026-08-16 20:28:26 KST | 종료: 2026-08-16 20:34:53 KST | 소요: 7분

- 하단 `기본 큐브` 상태칩 옆에 동일한 32px 높이의 32×32px 정사각형 전체 화면 토글 버튼을 overlay로 추가했다.
- Fullscreen API 진입·해제와 `fullscreenchange`를 연결하고 `aria-label`, `aria-pressed`, title을 현재 상태에 맞게 동기화했다. API 미지원 환경에서는 버튼을 숨기고 요청 거부 시 앱 동작을 유지한다.
- RED→GREEN shell 테스트, 전체 CI 8 tests, production build와 artifact 검증을 통과했다. 실제 브라우저에서 진입·해제, 동일 높이 실측, JavaScript 오류 0건을 확인했다.

## 페이셜 작업 모드 메뉴 | 시작: 2026-08-16 20:58:30 KST | 종료: 2026-08-16 21:02:26 KST | 소요: 4분

- 워드마크 아래 확장 가능한 작업 모드 메뉴에 Retopo(리토포), Facial(페이셜), Paint(페인트) 분류를 표시했다.
- 현재 제공되는 Facial만 선택 가능하게 하고, Retopo와 Paint는 `준비 중`으로 표시한 실제 비활성 버튼으로 구성했다. 기본 큐브 기준선은 어떤 특화 모드도 선택하지 않은 초기 상태로 유지한다.
- Facial 선택 시에만 pressed/current 상태를 갱신하고 문서에 `octopoly:mode-change` 이벤트와 `{ mode: "facial" }` 상세를 전달한다.
- 요구사항 회귀를 focused RED→GREEN으로 확인하고 전체 CI 12 tests, production build, artifact 검증, `git diff --check`를 통과했다. 실제 브라우저에서 접근성 구조, 비활성 버튼 무동작, Facial 이벤트·상태, 전체 뷰포트와 전체 화면 컨트롤 보존, JavaScript 오류 0건을 확인했다.

## 페이셜 메시 편집 모드 | 시작: 2026-08-16 20:35:58 KST | 종료: 2026-08-16 22:42:59 KST | 소요: 2시간 7분

- 좌우 대칭 저폴리 기본 얼굴 마스크에 topology상 실제 눈 두 개와 입 opening을 구성하고, WebGL2 indexed face·wire·vertex renderer로 표시했다.
- OBJ base mesh 가져오기, immutable `Base Mask` 복제, copy 이름 변경 및 active mesh 전환을 구현했다. OBJ import 시 기존 copy를 제거하고 base identity/name을 복구한다.
- 단일 vertex tap 선택과 mesh/revision-qualified stale-event guard, X/Y/Z pointer·keyboard gizmo 이동을 구현했다. Camera drag·multitouch와 picker ownership을 분리하고 gizmo pointer capture lifecycle을 정리했다.
- workspace validation, Float32-safe geometry, fail-closed localStorage recovery, transactional autosave, async OBJ import revision/dispose cancellation을 적용했다.
- Retopo와 Paint는 기능을 구현하지 않고 메뉴에서 `준비 중`인 disabled 상태로 유지했다. 내보내기, undo/redo, edge/face 선택, UV, 재질 및 미러 편집은 이번 범위에 포함하지 않았다.
- 독립 review에서 발견된 pending import race, failed mode startup/disposer wedge, move invariant, autosave failure feedback, camera/resize gizmo drift, million-offset·portrait·tiny-scale OBJ framing 및 Float32 camera bounds overflow를 RED→GREEN으로 수정했다.
- Canvas keyboard vertex selection과 adaptive-precision 좌표 live announcement, camera-projected X/Y/Z gizmo axis, mesh-scale-aware pointer/keyboard 이동, current-mode/Escape menu dismissal, shell listener teardown 및 panel-over-gizmo stacking contract를 추가했다.
- 최종 CI에서 typecheck, **17 test files / 158 tests**, production build, artifact 검증 및 `git diff --check`를 통과했다.
- 실제 desktop browser와 production `dist` preview에서 cube→Facial 전환, 전체 기본 마스크 framing, 눈·입 opening, duplicate/rename/select, pointer·keyboard vertex 선택과 adaptive 좌표 announcement, camera-projected X/Y/Z 이동, zoom 후 gizmo 재투영, autosave, million-offset·tiny-scale OBJ framing, extreme Float32 bounds import rejection 및 기존 workspace 보존, `200×400` portrait framing, panel input stacking, reload recovery, same-mode/Escape 메뉴 닫힘 및 JavaScript 오류 0건을 확인했다.
- Responsive CSS는 구현했으나 browser tool의 CSS viewport가 1280px로 고정되어 physical iPad/mobile 검증은 `NOT_RUN`이다.
