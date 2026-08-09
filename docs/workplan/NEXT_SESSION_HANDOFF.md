# OctoPoly 다음 세션 재개 지침

## 문서 성격

이 문서는 2026-08-10 작업을 잠시 종료하고 다음 대화에서 설계 검토를 정확히 재개하기 위한 단일 handoff다.
현재 변경은 **계획 체크포인트**이며 16~19 구현 승인이나 최종 설계 승인으로 간주하지 않는다.

다음 세션은 다른 문서를 수정하기 전에 `/AGENTS.md`와 이 문서를 끝까지 읽는다.

## 다음 대화 첫 메시지

새 작업 대화에서는 아래 코드블록 하나를 복사해 시작한다.

```text
/AGENTS.md와 docs/workplan/NEXT_SESSION_HANDOFF.md를 순서대로 끝까지 읽고 중단된 16~19 설계 검토를
재개해. 구현 대화는 만들지 말고, handoff의 미해결 문제 1~5를 가능한 범위에서 병렬 에이전트로 재감사한 뒤
19 Follow-up Integration 계획, AGENTS/MASTER/README/START_PROMPTS, 16~18 Ownership·branch point·commit/push
규칙을 서로 일치시켜. 타임라인의 21개 주간 사용량 표본과 05:30 공통 축은 보존해. 전체 문서 검증과 독립
감사가 끝나면 단위 문서 commit을 만들고 origin/main에 non-force push한 뒤, 실제 구현 대화를 시작하기 전에
결과와 새 작업별 프롬프트 경로를 보고해. 15와 16~19 구현은 자동 시작하지 마.
```

## 현재 Git 및 제품 상태

- 저장소: `D:\github\octopoly`
- branch: `main`
- 체크포인트 작성 전 `HEAD` / `origin/main`: `e54edeed9094d71679b4b081729a34354e820e4a`
- 14 개발 통합 및 RESULT push: 완료
- 14 상태: `BLOCKED` — 실제 iPad Safari / Apple Pencil hard-gate evidence가 없음
- `baseline/full-v1`: 없음. 만들면 안 됨.
- 15 Cloudflare Pages release/operations: 시작하지 않음
- 16~18 기능 구현: 시작하지 않음
- 19 후속 기능 통합: 필요성이 확인됐지만 workplan 작성은 중단됨
- 실행 중 서브에이전트: 없음. 취침 전 모두 종료함.

이 handoff를 포함한 문서 체크포인트 commit/push 이후에는 다음 세션 시작 시 `git fetch` 후
`git rev-parse HEAD`, `git rev-parse origin/main`, `git status --short`를 다시 확인한다.

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

## 검토에서 확인된 미해결 문제

다음 항목은 발견만 했고 최종 수정·재감사를 끝내지 않았다.

### 1. 16~18 main 통합 owner 부재

현재 16~18은 WORKTREE이고 직접 main merge가 금지되어 있다. 그러나 `00_MASTER.md`와 `START_PROMPTS.md`는
정의되지 않은 coordinator merge를 전제로 한다. `/AGENTS.md`의 Integration 규칙도 09와 14만 허용한다.

해결 방향: `docs/workplan/19_FOLLOW_UP_INTEGRATION.md`를 MAIN workplan으로 추가하고 `/AGENTS.md`에 19가
16~18의 RESULT/branch commit을 조립할 유일한 후속 통합 owner임을 명시한다.

### 2. 16과 18의 shared-file Ownership 충돌

현재 두 계획에 다음 공용 seam 일부가 겹친다.

- `src/app/composition/core-workspace.ts`
- `src/camera/index.ts`
- `tests/camera/camera.test.ts`
- `tests/tools/basic/**`

해결 방향: leaf adapter와 unit test는 16/18에 분리하고, 공용 composition/camera/tool routing 조립은 19가
한 번만 소유한다. 최소한 18의 불필요한 camera math 변경과 broad `tests/tools/basic/**` 소유를 제거하고,
남는 shared seam은 19 reconciliation 대상으로 명시한다. 수정 뒤 18 Acceptance의 “16 소유 파일 미수정”
문구도 같은 정책으로 맞춘다.

### 3. 17 Standard branch point가 너무 이름

현재 17 Standard는 16 통합 뒤 시작하도록 되어 있지만 17 COMPLETE는 mouse-only lesson 완료도 요구한다.
18이 없는 post-16 branch에서는 이 gate를 통과할 수 없다.

해결 방향: 17 early core는 16/18과 병렬 유지하되, 17 Standard는 19 Phase A가 16과 18을 main에 통합한 exact
`PRODUCT_INPUT_BASE_SHA`에서 시작한다.

### 4. commit/push 규칙과 START_PROMPTS 불일치

16~18 prompt의 branch push 문구가 불완전하고, 17/18 prompt의 “단위별 commit”과 각 plan의 “one final
commit” 문구가 어긋난다.

해결 방향: 사용자 사전 승인에 맞춰 검증된 기능 단위 commit을 허용하고, 최종 RESULT commit 뒤 같은 이름의
origin branch로 non-force push하도록 plan과 prompt를 동일하게 고친다. main merge/push는 19만 수행한다.

### 5. 16~18 복사용 prompt의 필수 읽기 문서 누락

`START_PROMPTS.md`의 16~18 코드블록에 `docs/workplan/00_BOOTSTRAP.md`가 빠져 있다. `/AGENTS.md`를 먼저
읽더라도 복사 단위 자체가 완결되도록 각 prompt의 읽기 순서에 추가해야 한다.

## 이미 적용했지만 재검토가 필요한 수정

- 16과 18 전체 구현, 17 early core를 병렬 시작하는 방향을 `00_MASTER.md`에 추가함
- 17 early-core checkpoint commit 및 `IN_PROGRESS` 규칙을 추가함
- 17 early scope에 local UI/accessibility shell을 포함함
- 14 RESULT의 실제 push 완료 SHA를 반영함
- README에 16~18과 분석 문서를 추가함
- 10~14 타임라인 및 주간 사용량 SVG를 갱신함

위 수정은 미해결 문제 1~5와 함께 다시 읽어야 하며 아직 최종 승인 상태가 아니다.

## 다음 세션 실행 순서

1. `/AGENTS.md`와 이 handoff를 완독한다.
2. `git fetch`, HEAD/origin/status 확인 후 문서 체크포인트 commit의 변경 목록을 읽는다.
3. 중단된 독립 감사를 재개해 위 5개 발견 사항을 현재 줄 기준으로 다시 확인한다.
4. `19_FOLLOW_UP_INTEGRATION.md`를 작성한다.
   - Phase A: 16 + 18 main 통합, shared seam reconciliation, 실제 browser/E2E, 정확한
     `PRODUCT_INPUT_BASE_SHA` 기록·push
   - Phase B: post-Phase-A에서 만든 17 Standard 산출물 통합, 전체 조합 E2E, main commit·push
   - 두 phase 모두 tag/deploy 금지
5. `/AGENTS.md`, `00_MASTER.md`, `README.md`, `START_PROMPTS.md`에 19의 권한·순서·복사용 prompt를 연결한다.
6. 16/18 Ownership 충돌을 제거하고 17 Standard branch point를 Phase A SHA로 변경한다.
7. 16~19의 commit/push, RESULT, no-tag, physical-device claim 규칙을 서로 대조한다.
8. Markdown local link, code fence, UTF-8, `git diff --check`, SVG XML과 21개 data/point/polyline을 재검증한다.
9. 독립 감사 결과가 `no findings`이거나 수용된 known limitation만 남으면 계획 수정 commit을 만들고
   `origin/main`에 non-force push한다.
10. 그 뒤에만 새 구현 대화를 만든다. 15 또는 16~19를 자동 시작하지 않는다.

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
        ├─ 17 Standard: start from PRODUCT_INPUT_BASE_SHA
        │
        └─ 19 Phase B: merge 17 + combined E2E
```

15 Pages release/operations와 실제 iPad/Pencil release gate는 별도다. 19가 개발 통합을 완료해도
`baseline/full-v1` 또는 deploy tag를 만들지 않는다.

## 검증 체크포인트

이번 세션 중 다음 검사는 한 차례 통과했다.

- Markdown 10개 파일의 local link와 code-fence 짝
- 분석 문서의 source line anchor 범위
- SVG XML UTF-8 parse
- MD 원자료 21행
- SVG usage point 21개
- SVG polyline 좌표 21개
- 오래된 `04:15`, 375분, 18표본 문구 부재
- `git diff --check`

그러나 이 검사 뒤에도 handoff 및 일부 정합성 수정이 추가됐으므로 다음 세션에서 전체를 다시 실행한다.

## 금지 사항

- 검토가 끝나기 전 15 또는 16~19 구현 대화를 생성하지 않는다.
- `baseline/full-v1`을 만들거나 기존 tag를 이동하지 않는다.
- 16/17/18 worktree가 직접 main을 merge/push하지 않는다.
- 실제 기기 evidence 없이 iPad/Pencil 또는 iPad external mouse/trackpad를 PASS로 기록하지 않는다.
- ImageGen은 필요한 raster 생성·편집에만 사용한다. SVG/HTML/CSS/canvas가 맞는 도표·UI에는 억지로 쓰지 않는다.
