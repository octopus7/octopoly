# AGENTS.md — Retopology Tool Development Rules

이 파일은 저장소 루트에서 진행되는 모든 Codex 작업과 서브에이전트 작업에 적용한다.
설계 및 작업 명세는 저장소 루트의 `docs/workplan/` 아래에 있다.

## 0. 문서 위치와 경로 기준

- Master plan: `docs/workplan/00_MASTER.md`
- Bootstrap plan: `docs/workplan/00_BOOTSTRAP.md`
- Frozen contract: `docs/workplan/INTERFACE_CONTRACTS.md`
- Workstream: `docs/workplan/XX_*.md`
- Start prompts: `docs/workplan/START_PROMPTS.md`
- `src/**`, `tests/**`, 문서 및 설정 파일 경로는 모두 저장소 루트 기준이다.
- 모든 저장소 작업에서는 이 루트 `AGENTS.md`가 공통 지침으로 적용된다.

제품 표시 이름은 대소문자를 포함해 `OctoPoly`다. 기존 Cloudflare Pages project는 `octopoly`, production
URL은 `https://octopoly.pages.dev/`이다. 초기 제품은 정적 Pages SPA이며 Pages Functions/Workers/bindings를
필수 dependency로 추가하지 않는다. 동적 기능은 별도 승인된 후속 Cloudflare Worker/API 작업으로 분리한다.

## 1. 작업 대화 시작 절차

작업용 대화를 시작하면 구현 전에 아래 순서를 반드시 수행한다.

1. 사용자가 지정한 `XX_*.md`를 이번 대화의 단일 작업 명세로 확정한다.
2. 이 `/AGENTS.md`, `docs/workplan/00_MASTER.md`, `docs/workplan/00_BOOTSTRAP.md`,
   `docs/workplan/INTERFACE_CONTRACTS.md`, 지정 작업 MD를 순서대로 끝까지 읽는다.
3. 지정 작업 MD의 `Required`, `Execution`, `Ownership`, `Acceptance`, 현재 `RESULT`를 확인한다.
4. 01~08 작업이면 `docs/workplan/00_BOOTSTRAP.md`의 RESULT가 `COMPLETE`이고 immutable core baseline ref가
   존재하는지 확인한 뒤 그 ref를 commit SHA로 해석한다. 09 이후 후속 작업은 지정 작업 MD가 요구하는
   exact immutable input SHA와 선행 RESULT status를 확인하고, mutable branch 이름으로 대체하지 않는다.
5. 현재 branch/worktree가 `Execution`과 일치하며 위에서 해석한 exact input commit에서 시작했는지 확인한다.
6. baseline에 공용 contract/scaffold, 빌드 설정, 테스트 실행 경로가 준비되어 있는지 확인한다.
7. Agent A/B/C를 사용한다면 주 에이전트가 서로 겹치지 않는 구체적인 파일 소유 범위를 먼저 정한다.
8. 확인 결과와 이번 대화의 구현 범위를 짧게 알린 뒤 작업을 시작한다.

여러 workstream을 한 대화에서 수행하도록 명시된 문서(예: 12 + 13)가 아니면 작업별 대화를 분리한다.
사용자가 지정하지 않은 다른 번호의 작업까지 자동으로 범위를 넓히지 않는다.

### 시작 차단 조건

다음 조건에서는 누락된 설계를 추측해 구현하지 않는다.

- 지정된 작업 MD를 찾을 수 없음
- 현재 실행 위치를 지정 branch/worktree로 안전하게 맞출 수 없음
- 필요한 공용 contract가 없고 순수 내부 구현으로도 진행할 수 없음
- 00 Bootstrap 이외 작업인데 baseline scaffold가 없어 해당 workstream의 빌드나 테스트 경로를 정의할 수 없음

가능한 내부 작업과 실제 차단 항목을 구분해 보고하고, 필요한 변경은 작업 MD의
`Requested contract changes` 또는 `Integration notes`에 구체적으로 기록한다.

## 2. 작업 범위와 Ownership

- 현재 대화에 지정된 작업 MD만 구현 범위로 취급한다.
- 다른 workstream을 선행 구현하거나 대신 수정하지 않는다.
- 지정된 `Ownership` 밖 파일은 수정하지 않는다.
- 다른 에이전트가 소유한 파일을 임의로 수정하거나 리팩터링하지 않는다.
- 단, 주 에이전트는 상태 기록을 위해 **자신에게 지정된 작업 MD의 `RESULT` 섹션만** Ownership 밖
  수정 예외로 갱신할 수 있다. 작업 MD의 나머지 계획/설명 섹션은 수정하지 않는다.
- 범위 밖 문제가 보여도 코드까지 고치지 말고 `Integration notes`에 남긴다.

## 3. Worktree / Main 규칙

각 작업 MD의 `Execution` 섹션이 실행 위치의 유일한 기준이다.

### Mode: WORKTREE

- 구현 전에 현재 branch와 worktree 경로를 확인한다.
- 지정된 branch/worktree가 없다면 baseline commit에서 문서에 지정된 이름으로 생성한다.
- 지정된 worktree 안에서만 구현한다.
- main에서 직접 구현하거나 main에 직접 merge하지 않는다.
- 다른 worktree를 현재 worktree에 merge하지 않는다.
- 완료 후 주 에이전트가 RESULT를 먼저 갱신하고 소유 범위 변경을 자신의 branch에 commit한다.
- 사용자는 검증 완료된 단위 workstream의 commit과 해당 workstream branch push를 사전 승인했다. acceptance와
  RESULT가 완료되면 현재 branch만 같은 이름의 origin branch로 push할 수 있으며 force-push하지 않는다.
- 최종 응답에는 branch, `git rev-parse HEAD`의 commit SHA, 검증 결과를 보고한다. commit은 자신의 SHA를
  포함할 수 없으므로 RESULT 파일 안에 그 최종 commit의 SHA를 기록하려고 추가 commit을 만들지 않는다.

### Mode: MAIN

- 별도 worktree를 만들지 않는다.
- 구현 전에 현재 branch가 main인지 확인한다.
- main에서 지정 Ownership만 수정한다.
- 동시에 진행되는 다른 MAIN 작업의 소유 파일을 수정하지 않는다.
- push/deploy는 작업 MD와 사용자 지시가 명시한 경우에만 수행한다. 00은 `OctoPoly` 빈 shell의 최초
  Cloudflare Pages 배포가 acceptance에 포함되므로 검증된 main commit/tag push를 수행한다. 15는 09 또는
  14에서 확정한 제품 baseline의 Pages release/operations hardening만 수행한다.
- 사용자는 검증 완료된 단위 workstream의 commit/push를 사전 승인했다. MAIN 작업은 해당 작업 문서의
  acceptance, RESULT, tag/deploy 순서를 지킨 뒤 추가 승인 없이 push할 수 있다.

### Integration

- Core merge와 cross-module 수정은 `docs/workplan/09_INTEGRATION.md`, Optional 10~13의 merge와 조립은
  `docs/workplan/14_OPTIONAL_INTEGRATION.md`, 후속 제품 16/18과 이후 17 Standard의 merge 및 shared seam
  조립은 `docs/workplan/19_FOLLOW_UP_INTEGRATION.md`, 도구 완성 20~24의 merge와 shared seam 조립은
  `docs/workplan/25_PRACTICAL_TOOL_INTEGRATION.md` 작업만 수행한다.
- Pages production release, preview, rollback/roll-forward와 deploy tag는
  `docs/workplan/15_CLOUDFLARE_PAGES.md` 작업만 수행한다.
- 01~08, 10~13, 16~18 및 20~24 작업자는 integration이나 main merge를 수행하지 않는다.
- Integration은 각 작업 MD의 RESULT와 contract change request를 먼저 읽는다.

## 4. 공용 Contract

`docs/workplan/INTERFACE_CONTRACTS.md`는 병렬 구현 시작 후 frozen contract로 취급한다.

- 개별 workstream에서 임의로 수정하지 않는다.
- 09/14/19/25 Integration은 지정 작업 MD가 명시적으로 소유한 additive reconciliation만 수행할 수 있다.
  이때 `INTERFACE_CONTRACTS.md`, 실제 `src/contracts/**` source/export와 contract tests를 같은 commit에서 함께
  갱신하고 RESULT에 accepted request와 재동결 지점을 기록한다. breaking 변경은 별도 승인 없이 수행하지 않는다.
- 다른 module의 concrete implementation에 직접 의존하지 않는다.
- shadow type이나 중복 interface를 만들어 contract를 우회하지 않는다.
- contract에 없는 cross-module method, event, data shape을 추측해 public API로 만들지 않는다.
- 각 workstream은 자기 소유 package 안에서 implementation class, factory, pure operator를 local public
  export로 게시할 수 있다. 단, 그 입출력은 canonical contract type만 사용하고 새로운 cross-module
  record/service/event shape을 만들지 않아야 한다.
- contract가 부족해도 가능한 순수 내부 구현과 테스트는 계속할 수 있지만, 외부 연결은 adaptor 경계에서
  멈추고 Integration으로 넘긴다.
- baseline에 실제 공용 contract 소스가 있으면 문서 계약과 동일한 이름과 의미를 사용한다. 작업별
  복사본을 만들지 않는다.
- 변경 요청에는 제안 signature/data shape, 이유, 현재 가능한 우회, 영향을 받는 workstream을 적는다.
- contract 부족만 제외하고 소유 구현·테스트가 완료된 작업은 `READY_WITH_CONTRACT_REQUEST`로 기록할 수
  있다. 이 상태에서 contract를 우회하거나 `COMPLETE`로 과장하지 않는다.

## 5. 공유 설정 파일

작업 MD에서 명시적으로 허용하지 않는 한 다음 파일을 수정하지 않는다.

- `package.json` 및 lockfile
- `tsconfig*`
- Vite/build 설정
- CI 설정
- 공용 barrel `index.ts`
- 공용 project bootstrap
- 공용 contract 소스

필요한 변경은 RESULT의 integration 요청사항으로 남긴다. 초기 scaffold/baseline을 만드는 별도 작업과
09 Core Integration, 14 Optional Integration, 19 Follow-up Integration, 25 Practical Tool Integration 또는
15 Pages Release/Operations만 각 작업 MD의 명시적 Ownership 범위에서 이 파일들을 수정할 수 있다.

## 6. 병렬 서브에이전트 운영

- 주 에이전트는 모든 요청을 시작할 때 독립적으로 병렬화할 수 있는 조사, 구현, 검증 작업이 있는지
  먼저 평가한다.
- 서로 의존하지 않고 파일 소유 범위를 분리할 수 있는 작업은 기본적으로 서브에이전트에 병렬 할당한다.
- 경로 점검, 문서 검토, 테스트/검증처럼 쓰기 범위가 겹치지 않는 보조 작업도 병렬화가 실질적인 이득을
  주면 에이전트에 할당한다.
- 최대 3개의 서브에이전트를 사용할 수 있지만, 병렬화가 안전할 때만 사용한다.
- 작업 MD의 Agent A/B/C 분배를 기본값으로 사용한다.
- 주 에이전트는 실행 전에 에이전트별 파일/디렉터리 소유 목록을 명시한다. 역할 이름만으로 파일 소유를
  대신하지 않는다.
- 각 서브에이전트는 이 `/AGENTS.md`, 지정 작업 MD,
  `docs/workplan/INTERFACE_CONTRACTS.md`를 읽고 배정 범위만 수행한다.
- 공용 파일은 한 에이전트만 소유하거나 Integration으로 넘긴다.
- 작업 MD의 RESULT와 공용 barrel은 주 에이전트 한 명만 수정한다.
- 파일 소유를 안전하게 분리할 수 없으면 에이전트 수를 줄이고 순차 작업한다.

## 7. 구현 및 검증 원칙

- 각 workstream은 `순수 모듈 + public API + 내부 테스트/검증`을 목표로 한다.
- 개별 작업에서는 전체 앱 조립이나 전체 빌드를 성공 조건으로 삼지 않는다.
- 다른 module이 아직 없으면 public boundary/adaptor까지 구현하고 연결은 Integration으로 넘긴다.
- 없는 dependency를 임의로 재구현하지 않는다.
- 내부 테스트는 다른 workstream의 concrete implementation 대신 contract 기반 fake/stub을 사용할 수 있다.
- 정상 경로뿐 아니라 실패/취소 경로와 경계 조건을 검증한다.
- 성능이나 iPad 동작을 직접 검증하지 못했으면 통과로 추정하지 않고 `Known limitations`에 남긴다.

### 디자인 이미지와 ImageGen

- 이 규칙은 모든 작업 대화와 서브에이전트에 적용한다.
- 디자인 작업에 새로운 래스터 이미지, 일러스트, 텍스처, 스프라이트, 사진형 asset 또는 기존 래스터
  이미지 편집이 실제로 필요하면 `imagegen` 스킬과 제공 도구를 사용한다.
- 단순 도형, 아이콘, 로고 시스템, 다이어그램, wireframe 또는 UI 장식처럼 SVG, HTML/CSS, canvas나 기존
  코드 기반 asset이 더 적합하면 코드-native 방식을 사용한다.
- 이미지가 제품 목표나 사용자 경험에 실질적으로 필요하지 않으면 ImageGen 사용을 억지로 추가하지 않는다.
- 생성 asset을 제품에서 사용할 때는 작업 Ownership 안의 저장소 경로로 옮기고 consuming code와 검증을
  함께 갱신한다. 미선택 variant나 외부 임시 경로를 제품 dependency로 남기지 않는다.
- 기존 편집 가능한 SVG/vector/code asset을 ImageGen 결과로 임의 교체하지 않는다.

## 8. Optional 기능 규칙

10~13은 Optional Extension이고 14는 이 산출물을 main에 조립하는 Optional Integration이다.

- 01~09는 Optional 기능이 하나도 없어도 정상 빌드/사용 가능해야 한다.
- Core는 Optional module을 import하지 않는다.
- Core contract는 Optional 기능의 존재를 요구하지 않는다.
- Optional 기능은 Core public API를 소비하는 방향으로만 의존한다.
- Optional directory 제거로 Core가 깨지면 안 된다.
- Optional 기능만을 위해 Core를 임의 수정하지 않는다.
- Core 변경이 필요하면 proposal로 기록하고 14가 Core-only 호환성을 보존하는 additive SDK 변경만 판정한다.
  breaking Core 변경은 자동 적용하지 않는다.

## 9. 브라우저 / iPad 원칙

- primary target은 iPad Safari다.
- raw `PointerEvent`는 input normalization 계층 밖으로 직접 노출하지 않는다.
- Pencil, touch, mouse를 구분한다.
- Pencil pressure/tilt/coalesced samples는 normalized sample로 전달한다.
- touch navigation과 Pencil modeling의 역할을 명확히 분리한다.
- mobile memory, GPU, thermal 부담을 우선 고려한다.

## 10. 완료와 RESULT

작업이 끝나면 주 에이전트가 지정 작업 MD의 `RESULT` 섹션을 갱신한다.

- Status는 `NOT_STARTED | IN_PROGRESS | READY_WITH_CONTRACT_REQUEST | COMPLETE | BLOCKED` 중 하나다.
- Acceptance를 충족하고 관련 테스트가 통과한 경우에만 `COMPLETE`로 기록한다.
- `READY_WITH_CONTRACT_REQUEST`는 frozen contract의 구체적인 누락만 남고 소유 범위 구현·테스트와
  change request가 완료된 경우에만 사용한다.
- 구현 내용, 실제 수정 파일, public API를 적는다.
- 실행한 검증 명령과 결과를 적는다. 실행하지 못한 검증은 이유를 적는다.
- Integration에 필요한 연결 작업과 contract 변경 요청을 적는다.
- contract 변경 요청이 없으면 `NONE`이라고 적는다.
- 미완성 기능, 기기 미검증, 성능 위험은 `Known limitations`에 적는다.
- 한 commit에는 완료된 현재 단위 workstream과 그 RESULT만 포함하고 관련 없는 변경이나 다른 workstream을
  섞지 않는다. 미완성 상태는 사용자가 checkpoint commit을 요청한 경우가 아니면 완료 commit으로 만들지 않는다.
- WORKTREE 작업은 RESULT 갱신을 포함한 branch commit과 같은 이름의 origin branch push까지 완료하되 main
  merge, main push, tag 생성과 force-push는 수행하지 않는다.

## 11. 금지 사항

- 작업 범위 밖의 선행 수정
- 다른 workstream 내부 구현 변경
- frozen contract 즉흥 변경
- 전체 구조 리팩터링
- Optional 기능을 Core 필수 dependency로 만들기
- worktree 작업자의 main merge
- Integration 전 cross-worktree 조립
- 검증하지 않은 항목을 완료로 기록하기
