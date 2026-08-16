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
