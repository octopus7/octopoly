# OctoPoly 다음 세션 재개 지침

## 문서 성격

이 문서는 2026-08-10 후속 기능 planning anchor와 구현 재개를 위한 handoff다. 이 문서를 포함한 planning
commit을 push한 직후 그 exact commit을 `POST_PLAN_BASE_SHA`로 사용한다. commit은 자기 SHA를 내용에 기록할
수 없으므로 이 문서에 값을 추측해 넣지 않고 live Git에서 해석한다.

다음 세션은 다른 문서를 수정하기 전에 `/AGENTS.md`와 이 문서를 끝까지 읽는다.

## 다음 대화 첫 메시지

```text
/AGENTS.md와 docs/workplan/NEXT_SESSION_HANDOFF.md를 끝까지 읽고 live Git을 검증해. main은 문서 전용
진행상태 checkpoint 이후 clean/equal이어야 한다. wt/basic-primitives의 checkpoint 3e4655a는 25종 catalog
후보를 원격 보존한 IN_PROGRESS 상태이며 main에 merge하면 안 된다. 리뷰를 재개하라는 새 사용자 지시가
없으면 추가 리뷰·보완을 시작하지 마. 18 physical Windows Chrome/Edge mouse gate가 끝나기 전에는 19
Phase A도 시작하지 말고, tag/Pages deploy도 하지 마.
```

## 현재 Git 및 제품 상태

- 저장소: 문서에 고정된 장비 경로를 사용하지 않는다. 현재 세션에서 repository root를 live Git 상태로 확인한다.
- branch: `main`
- 현재 상태 문서 갱신 전 `HEAD` / `origin/main`: `20149e71b830548dd109125f72c6b8006bb69011`
- exact `POST_PLAN_BASE_SHA`: `b78cff6dba292ffdab9bc5cd58830c56bff9ee3f`
- 14 개발 통합 및 RESULT push: 완료
- 14 상태: `BLOCKED` — 실제 iPad Safari / Apple Pencil hard-gate evidence가 없음
- `baseline/full-v1`: 없음. 만들면 안 됨.
- 15 Cloudflare Pages release/operations: 시작하지 않음
- Workstream 16 remote tip: `3e4655aab7019f8aa3cdefdc4af105f5f6f40a83` (`wt/basic-primitives`)
- Workstream 17 Early Core remote tip: `d142ca607593167ee0d86ad11cd3c4526a2ab661`; 전체 상태 `IN_PROGRESS`
- Workstream 18 remote tip: `e35f0f9034fa50e621dd5adbd5d994c7cbbcbdf3`; physical mouse evidence 부재로 `BLOCKED`
- `PRODUCT_INPUT_BASE_SHA`: `NOT_SET`; 19 Phase A는 시작하지 않음
- `PRACTICAL_TOOL_BASE_SHA`: `NOT_SET`; 20~25는 시작하지 않음
- `/AGENTS.md` 보호 승인: Discord message `1536230618839646248`; authority/exact-input 규칙 적용 완료

이 handoff를 포함한 문서 체크포인트 commit/push 이후에는 다음 세션 시작 시 `git fetch` 후
`git rev-parse HEAD`, `git rev-parse origin/main`, `git status --short`를 다시 확인한다.

## 2026-08-10 21:23 KST 실행 현황

### Workstream 16 — 25종 built-in catalog checkpoint

- 기존 검증 완료 범위는 Plane, Cube, Duck, Frog, Pig, Cow, Rabbit이며 RESULT tip은
  `165508b5a489f9d39b6491531aa1356ceb6f2d0b`이다.
- Cat, Dog, Fish, Turtle, Elephant와 Cup, Chair, Flowerpot, Kettle, Sneaker, Backpack, Helmet, Gamepad,
  Camera, Bicycle Saddle, Car, Rocket, Treasure Chest를 추가한 25종 catalog 후보는
  `3e4655aab7019f8aa3cdefdc4af105f5f6f40a83`에 `[checkpoint]`로 원격 보존했다.
- checkpoint 시 branch status는 `IN_PROGRESS`, review state는 `PENDING_AFTER_FIX`다. `[verified]`, `PASS`,
  `COMPLETE`를 주장하지 않는다.
- branch CI 결과는 typecheck/build 포함 137 test files / 767 tests PASS였지만, 독립 review acceptance와는
  별개다.
- 독립 리뷰 `deleg_848b155f`, `deleg_d554e228`, `deleg_6fda7d16`은 모두 FAIL이었다.
- 세 번째 리뷰의 미해결 blocker:
  1. Redo/Extrude/Reload selected face IDs와 해당 checkpoint live face IDs의 exact 관계 검증 부족
  2. Undo fingerprint와 authoritative pre-creation empty checkpoint의 exact 비교 부재
  3. GLB accessor `bufferView`/`type`/`componentType`, byte range 및 decoded index→POSITION 범위 검증 부족
- 사용자 지시에 따라 추가 review와 보완을 중단했다. 재개 지시 전까지 이 checkpoint를 수정하거나 main에
  merge하지 않는다.
- checkpoint의 production catalog 코드까지 포함한 모든 local 변경은 같은 이름의 원격 branch에 non-force
  push했다. 문제 있는 evidence/evaluator도 이 branch에 격리돼 있다.

### Main 보존 상태와 다음 gate

- Workstream 16 checkpoint는 main에 merge/cherry-pick하지 않았다.
- 상태 문서 갱신 직전 main local/remote는 모두 `20149e71b830548dd109125f72c6b8006bb69011`, clean이었다.
- 이 문서와 `OCTOPOLY_TASK_TIMELINE.md`만 별도 docs commit으로 main에 반영한다.
- 18 physical Windows Chrome/Edge mouse smoke는 `NOT_RUN`; synthetic CDP PASS로 대체하지 않는다.
- 다음 구현 gate는 18 physical evidence 완료다. 그 전에는 19 Phase A를 시작하지 않는다.

## 이번 세션에서 작성된 문서

- `docs/OCTOPOLY_FOLLOW_UP_FEATURE_ANALYSIS.md`
  - 기본 도형 구현 경로와 전체 기능 공백·우선순위 분석
- `docs/OCTOPOLY_DESKTOP_MOUSE_INPUT_ANALYSIS.md`
  - 현재 마우스 미지원 원인과 orbit/pan/wheel 입력 정책 분석
- `docs/OCTOPOLY_IPAD_COMMERCIAL_VIABILITY.md`
  - 네이티브 iPad 앱 수요·경쟁·가격·상용화 가능성 검토
- `docs/workplan/16_BASIC_PRIMITIVES.md`
  - Plane/Cube, atomic command/history, selection/frame, construction-plane fallback 계획
- `docs/workplan/17_GUIDED_RETOPO.md`
  - 단일 Guided/Pro core, lesson/preview/accessibility/offline/first-asset E2E 계획
- `docs/workplan/18_DESKTOP_MOUSE_CAMERA.md`
  - middle orbit, Shift+middle pan, wheel zoom, owner/capture/cleanup 계획
- `docs/workplan/19_FOLLOW_UP_INTEGRATION.md`
  - 16/18 Phase A, product contracts, 17 Standard Phase B 통합 계획
- `docs/workplan/20_TOPOLOGY_ACTIONS.md` ~ `24_RETOPO_VISIBILITY.md`
  - topology actions, transform/refinement, project safety, import/interop, visibility의 병렬 leaf 계획
- `docs/workplan/25_PRACTICAL_TOOL_INTEGRATION.md`
  - 20~24 shared composition, browser/data-safety E2E와 practical anchor 계획
- `docs/workplan/OCTOPOLY_TASK_TIMELINE.md`
  - 10~14 시작·종료·초 단위 소요시간과 전체 절대 시계열
- `docs/workplan/assets/codex-weekly-usage.svg`
  - Gantt와 같은 절대 시간 범위의 Codex 주간 사용량 그래프

`README.md`, `docs/workplan/00_MASTER.md`, `docs/workplan/START_PROMPTS.md`,
`docs/workplan/14_OPTIONAL_INTEGRATION.md`도 위 문서와 현재 상태를 연결하도록 수정됐다.

## 타임라인 확정 데이터

10~14 상위 task의 KST 구간과 밀리초 절삭 소요시간은 다음 값으로 고정한다.

| 작업 | 시작(KST) | 종료(KST) | 소요 |
|---:|---|---|---:|
| 10 UV Editor | 2026-08-10 03:06:04 | 2026-08-10 03:36:05 | 00:30:00 (1,800초) |
| 11 Texture Paint | 2026-08-10 03:06:08 | 2026-08-10 04:09:22 | 01:03:14 (3,794초) |
| 12 Lookdev / PBR | 2026-08-10 03:06:08 | 2026-08-10 03:34:17 | 00:28:08 (1,688초) |
| 13 MatCap | 2026-08-10 03:06:10 | 2026-08-10 03:35:53 | 00:29:42 (1,782초) |
| 14 Optional Integration | 2026-08-10 04:10:33 | 2026-08-10 04:54:25 | 00:43:52 (2,632초) |

주간 사용량 원자료는 21개이며 마지막 세 표본은 `04:35 28%`, `04:50 29%`, `05:20 30%`다. 그래프와
Gantt의 공유 표시 범위는 `2026-08-09 22:00:00 ~ 2026-08-10 05:30:00 KST`다. 첫 표본 전과 마지막 표본 후 10분은
빈 공간이고, 불규칙 표본 간격은 실제 시간에 비례한다. 이 값은 작업 진행률이 아니라 Codex 주간 사용량이다.

## 독립 감사에서 해결한 정합성 문제

- 19를 16/18 및 이후 17의 유일한 단계별 main integration owner로 정의했다.
- 16/18 shared files를 leaf ownership과 19 reconciliation으로 분리했다.
- 16/18/17 early-core를 동일 exact `POST_PLAN_BASE_SHA`에서 시작하도록 통일했다.
- 19 Phase A가 20~24 공통 `ReferenceSceneService`와 `DurableChangeSource` contract를 게시하도록 했다.
- 20~24를 practical leaf workstream으로 분리하고 25만 shared composition/main merge를 소유하게 했다.
- 17 Standard를 25의 exact `PRACTICAL_TOOL_BASE_SHA` 뒤로 이동했다.
- integration anchor와 descendant RESULT metadata commit을 분리해 Git SHA 자기참조를 제거했다.
- 20~24 branch-local acceptance와 25 real-workspace/browser integration gate를 분리했다.
- branch push/local·remote tip/ancestry provenance와 external/device-ready status를 구조화했다.
- 16 primitive rollback의 allocator rewind 요구를 stable-ID 비재사용 정책과 맞췄다.
- 00/09 baseline resolved SHA와 00 final Cloudflare deployment SHA/check를 기록했다.

## Planning push 후 실행 단계

1. `git fetch` 후 `HEAD == origin/main`과 clean 상태를 확인한다.
2. 이 문서를 포함한 exact planning commit을 `POST_PLAN_BASE_SHA`로 공지한다.
3. 그 SHA에서만 16, 18, 17 early-core worktree/대화를 시작한다.
4. 이후에는 각 RESULT와 integration anchor protocol을 따라 19A → 20~24 → 25 → 17 Standard → 19B를 진행한다.

## 잠정 구현 순서

설계 검토가 끝났을 때의 권장 순서는 다음과 같다.

```text
POST_PLAN_BASE_SHA
├─ 16 Basic Primitives
├─ 18 Desktop Mouse Camera
└─ 17 Guided Retopo early core
        │
        ├─ 19 Phase A: merge 16 + 18 -> PRODUCT_INPUT_BASE_SHA
        │
        ├─ 20~24 practical worktrees
        │       │
        │       └─ 25: merge 20 -> 21 -> 22 -> 23 -> 24 -> PRACTICAL_TOOL_BASE_SHA
        │
        ├─ 17 Standard: start from PRACTICAL_TOOL_BASE_SHA
        │
        └─ 19 Phase B: merge 17 + Guided E2E
```

15 Pages release/operations와 실제 iPad/Pencil release gate는 별도다. 19가 개발 통합을 완료해도
`baseline/full-v1` 또는 deploy tag를 만들지 않는다.

## 검증 체크포인트

planning anchor 후보 전체에 다음 검사를 반복 실행해 통과했다.

- 전체 Markdown의 UTF-8 read, local link와 code-fence 짝
- 분석 문서의 source line anchor 범위
- SVG XML UTF-8 parse
- MD 원자료 21행
- SVG usage point 21개
- SVG polyline 좌표 21개
- 오래된 `04:15`, 375분, 18표본 문구 부재
- `git diff --check`
- roadmap cross-reference와 20~24 exact ownership overlap
- canonical `npm run ci`, `verify:core`, `verify:optional`, `verify:ipad`

실제 physical iPad/Pencil은 `NOT_RUN`이며 release readiness는 `BLOCKED`로 유지한다.

## 금지 사항

- planning commit/push 전 15 또는 16~25 구현 대화를 생성하지 않는다.
- `baseline/full-v1`을 만들거나 기존 tag를 이동하지 않는다.
- 16/17/18 및 20~24 worktree가 직접 main을 merge/push하지 않는다.
- 실제 기기 evidence 없이 iPad/Pencil 또는 iPad external mouse/trackpad를 PASS로 기록하지 않는다.
- ImageGen은 필요한 raster 생성·편집에만 사용한다. SVG/HTML/CSS/canvas가 맞는 도표·UI에는 억지로 쓰지 않는다.

## 재개 결과

- 미해결 문제 1~5를 재검토해 `19_FOLLOW_UP_INTEGRATION.md`를 추가했다.
- 16/18 shared seam을 leaf adapter와 19 Phase A ownership으로 분리했다.
- 17 Standard branch point를 25의 exact `PRACTICAL_TOOL_BASE_SHA`로 변경했다.
- 실사용 툴 공백을 20 Topology Actions, 21 Transform/Refinement/Symmetry, 22 Project Lifecycle,
  23 Import/Interop, 24 Visibility로 확정하고 25 integration owner를 추가했다.
- Sphere/Cylinder, full outliner/hierarchy, cloud 기능은 현재 필수 범위에서 제외했다.
- `/AGENTS.md`에 19와 25 integration authority 및 exact input SHA baseline 규칙을 연결했고 사용자 승인
  message `1536230618839646248`을 기록했다.
