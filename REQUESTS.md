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
- 2026-08-17 `main` commit `9d7f0b3`을 push했고 GitHub Actions CI run `31954809330`이 성공했다. Cloudflare production이 `index-Cz9816yW.js`로 전환된 뒤 <https://octopoly.pages.dev/>에서 Facial 진입, 기본 마스크·opening·panel 및 console 오류 0건을 재확인했다.
- Responsive CSS는 구현했으나 browser tool의 CSS viewport가 1280px로 고정되어 physical iPad/mobile 검증은 `NOT_RUN`이다.

## Facial 기본 진입·Luna 프리셋·편집 표시 개선 | 시작: 2026-08-17 23:12:15 KST | 종료: 2026-08-18 01:52:22 KST | 소요: 160분

- 앱 mount 시 기존 cancelable mode transaction을 통해 Facial runtime을 정확히 한 번 기본 시작한다. 초기 Facial 시작 실패 시 선택 상태를 rollback하고 기본 cube fallback으로 복구하며, fallback disposer 실패도 retry 가능한 상태로 유지한다.
- 파일 메뉴에 explicit preset ID `luna`를 사용하는 `프리셋 > Luna`를 추가했다. 사용자 제공 원본 OBJ를 same-origin asset으로 byte-identical하게 보존하고 `SKM_Luna.Face.eye` object만 compact/remap해 기존 parse/validate/save-before-publish/import-epoch 경로로 가져온다.
- Luna 원본과 production artifact는 모두 1,038,090 bytes, SHA-256 `4cb6861d8363bbd5a37afcd317dd7c4a5ab32db5f6d7cc6f8c017a7f09df7c53`로 일치하며, 추출 결과는 130 vertices / 224 triangles / max index 129다.
- camera를 정면 초기 orientation과 projected AABB close framing으로 바꾸고, orbit·resize·0×0 mount recovery 및 same-center/same-radius이지만 AABB 비율이 다른 scene replacement에서 clipping과 non-finite state를 방지했다. geometry 편집과 camera state의 완전한 분리 및 추가 근접 zoom은 `ROADMAP.md`의 `+6차`로 분리했다.
- vertex handle을 일반 5 CSS px, 선택 8 CSS px 정사각형으로 변경했다. DPR은 2배로 제한하고 point pass는 `DEPTH_TEST`·`LEQUAL`을 사용하며, editable edge/point pass의 성공과 예외 모두에서 `LESS`·`CULL_FACE`·null program을 복원한다.
- view-plane mode에서는 `VIEW` text와 X/Y/Z bubble/line을 제거하고 선택 정점 중심의 viewport-independent 4방향 2D move affordance만 표시한다.
- constrained-plane 기본 표시는 선택 world plane과 두 axis의 camera projection 및 foreshortening을 반영한다. 별도 기본-off `스크린 스페이스` 체크박스를 켜면 고정된 직교 2D plane을 표시하며, plane body는 true edge-on에서도 두 world axes를 한 transaction으로 이동하고 개별 axis segment는 해당 axis만 이동한다.
- 후속 순서를 `ROADMAP.md`에 기록했다: texture load/render, embedded-texture `.octopoly` save/load, proportional multi-vertex edit, 전체/Base+모든 모델 또는 active-only export, GLB import/export, camera 근접 zoom 및 geometry-edit 독립성.
- 최종 CI에서 typecheck, **20 test files / 263 tests**, production build, artifact baseline 및 `git diff --check`를 통과했다. local production bundle은 `index-BTOIdPGT.js` / `index-BZFj_gyb.css`다.
- 실제 production preview에서 Facial 기본 시작, Luna 130/224 close framing, orbit containment, depth-tested square points, view-plane 2D affordance, camera-projected plane, screen-space XY/YZ/XZ axis identity, axis-only drag, plane-body two-axis drag 및 true edge-on YZ screen-space movement을 확인했고 JavaScript 오류는 0건이었다.
- 최신 complete diff에 대한 독립 fail-closed review는 security concern 0건, logic error 0건으로 `passed:true`였다. Physical iPad Safari와 Apple Pencil 검증은 장치 부재로 `NOT_RUN`이다.

## Active model PNG/JPEG 텍스처 로드·UV WebGL 렌더링 | 시작: 2026-08-18 01:55:25 KST | 종료: 2026-08-18 03:00:51 KST | 소요: 65분

- File 메뉴에 현재 active Facial model용 별도 PNG/JPEG texture picker를 추가했다. input은 접근 가능한 label과 PNG/JPEG accept contract를 가지며 선택 후 같은 파일을 다시 고를 수 있게 reset하고 File 메뉴를 닫은 뒤 trigger focus를 복원한다.
- OBJ의 complete usable UV를 position/UV reference pair로 compact remap해 seam과 negative UV references를 보존한다. no/partial/out-of-range/non-finite/malformed UV는 hardened position/face validation과 유효 geometry를 유지한 geometry-only import로 fallback한다.
- optional aligned UV를 workspace validation, defensive copy, storage round trip 및 scene publication에 전달한다. Luna preset은 기존 계약대로 geometry-only 130 vertices / 224 triangles를 유지한다.
- texture는 active model ID별 **session-only** resource다. `localStorage`나 object URL에 image binary/texture truth를 저장하지 않으며 reload 또는 해당 topology replacement 뒤에는 다시 선택한다.
- decoder는 production에서 `createImageBitmap(File)`을 주입한다. latest request, model switch/ABA, topology replacement 및 runtime disposal 뒤 stale completion/rejection을 폐기하고, successful/stale/upload-failed bitmap 모두 필요한 경로에서 `ImageBitmap.close()`로 해제한다. MIME/decode/upload/WebGL 오류는 기존 status error lifecycle로 보고한다.
- WebGL texture upload는 candidate를 성공적으로 올린 뒤에만 model key에 publish하는 transaction이다. 실패 시 prior/default surface를 유지하고 successful replacement, explicit model/topology deletion 및 viewport disposal에서 GL texture를 삭제한다. textured face 뒤 기존 wire, depth-tested points 및 selected vertex를 그려 편집 표시 우선순위를 보존한다.
- strict RED→GREEN에서 OBJ seam/fallback/UV validation, workspace copy/storage, renderer upload/draw/resource lifecycle, panel accessibility/focus, runtime MIME/no-UV/latest/ABA/topology/disposal/synchronous error 경로를 focused tests로 고정했다. 첫 독립 review의 4 blockers(non-finite/malformed `vt`, ABA stale upload, topology stale rejection, synchronous decoder throw)를 각각 재현 test로 RED 확인 후 GREEN으로 수정했다.
- 최종 CI는 typecheck, **21 test files / 288 tests**, production build `index-Di4JQFL_.js`, artifact 6 files / 1,201,386 bytes / warnings 0 / failures 0 및 `git diff --check`를 통과했다.
- 실제 production preview에서 non-finite `vt` geometry-only fallback, PNG checker `texImage2D=1` / `ImageBitmap.close=1` / persistence 0, base→copy→base ABA upload 0 / close 1, synchronous decode status routing, topology stale rejection suppression, texture face 위 wire·vertex handle 표시 및 console/page error 0건을 확인했다.
- 두 번째 complete-diff 독립 fail-closed review는 이전 4 blockers를 별도 probe로 재검증하고 security concern 0건, logic error 0건, `passed:true`를 반환했다. Physical iPad Safari와 Apple Pencil 검증은 장치 부재로 `NOT_RUN`이다.

## `.octopoly` 자체 작업 파일 저장·로드 | 시작: 2026-08-18 06:22:41 KST | 종료: 2026-08-18 09:03:54 KST | 소요: 161분

- `format: "octopoly"`, `formatVersion: 1`, `historyPolicy: "reset-on-load"` manifest와 complete Facial workspace, active model, selected vertex, movement/tool state 및 모델별 원본 PNG/JPEG bytes를 함께 보존하는 inspectable standard ZIP single-file container를 구현했다. migration과 undo history serialization은 포함하지 않고 unsupported version을 fail closed로 거절한다.
- texture archive path는 generated ordinal만 사용하고 원본 filename은 정제된 metadata로만 보존한다. exact-pinned MIT `fflate` 0.8.3을 사용하되 내장 unzip의 CRC/size 검증에 의존하지 않고 EOCD·central/local header·descriptor·path·disk·method·count·size·CRC를 직접 교차 검증한다.
- stored size contradiction은 payload copy 전에 거절하고, deflate는 1KiB chunk streaming actual-output budget으로 forged-size ZIP bomb를 차단한다. fatal UTF-8, duplicate canonical JSON key, exact-v1 known-key schema, `__proto__`, preamble, traversal, duplicate/unexpected entry 및 malformed texture signature를 모두 fail closed로 처리한다.
- load는 모든 texture decode/GPU upload와 scene buffers를 먼저 stage한 뒤 movement, texture map, scene/camera/selection, workspace callback, durable storage를 reversible transaction으로 publish한다. decode/upload/autosave/publication/cleanup 실패와 workspace·movement·picker·keyboard·Focus·texture·OBJ 명령의 stale race에서 기존 project, localStorage, camera, scene, selection, movement, GL resources 및 current status를 보존한다.
- direct texture와 project texture에 동일한 PNG/JPEG signature, compressed byte, 4096×4096 dimension 및 전체 32Mi pixel budget을 적용한다. original texture bytes와 pixel ownership은 runtime memory에만 두고 `localStorage`에는 workspace만 저장한다.
- File 메뉴에 deterministic `octopoly-project.octopoly` 저장과 accessible hidden `.octopoly` input을 연결했다. temporary anchor와 object URL은 creation/setup/append/click/remove/microtask/revoke 실패를 서로 독립적으로 정리한다.
- strict RED→GREEN과 adversarial fault injection으로 parser, storage, async stale, bitmap, WebGL scene/texture ownership 및 rollback 경계를 고정했다. 최종 CI는 typecheck, **23 test files / 342 tests**, production build `index-01rPl6dp.js`, artifact 6 files / 1,235,535 bytes / warnings 0 / failures 0, `git diff --check` 및 `npm audit --omit=dev` 0 vulnerabilities를 통과했다.
- exact production bundle preview에서 valid two-texture project의 QA Copy, selected vertex 2, movement state, blue textured surface와 wire/selection overlay를 확인했다. CRC-corrupt load는 localStorage와 visible state를 byte-identical하게 보존했고 console/JavaScript error는 0건이었다.
- immutable exact candidate `3d423d0ad2d7fd53551be5b7e081e9b064619a0f746d4ffe119b1c4d00cedf96`에 대한 최종 complete-diff 독립 fail-closed review는 security concern 0건, logic error 0건, test gap 0건으로 `passed:true`를 반환했다. Physical iPad Safari와 Apple Pencil은 장치 부재로 `NOT_RUN`이다.
