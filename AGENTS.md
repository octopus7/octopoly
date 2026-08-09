# AGENTS.md — Retopology Tool Development Rules

이 파일은 저장소 루트에서 진행되는 모든 Codex 작업과 서브에이전트 작업에 적용한다.
설계 및 작업 명세의 원본은 `retopo_codex_plan/` 아래에 있다.

## 0. 문서 위치와 경로 기준

- Master plan: `retopo_codex_plan/docs/workplan/00_MASTER.md`
- Frozen contract: `retopo_codex_plan/docs/workplan/INTERFACE_CONTRACTS.md`
- Workstream: `retopo_codex_plan/docs/workplan/XX_*.md`
- Start prompts: `retopo_codex_plan/docs/workplan/START_PROMPTS.md`
- `src/**`, `tests/**`, 설정 파일 경로는 `retopo_codex_plan/`이 아니라 **저장소 루트 기준**이다.
- `retopo_codex_plan/AGENTS.md`는 배포된 계획 패키지의 원본이며, 실제 저장소 작업에서는 이 루트
  `AGENTS.md`가 우선한다.

## 1. 작업 대화 시작 절차

작업용 대화를 시작하면 구현 전에 아래 순서를 반드시 수행한다.

1. 사용자가 지정한 `XX_*.md`를 이번 대화의 단일 작업 명세로 확정한다.
2. 이 `/AGENTS.md`, `00_MASTER.md`, `INTERFACE_CONTRACTS.md`, 지정 작업 MD를 순서대로 끝까지 읽는다.
3. 지정 작업 MD의 `Required`, `Execution`, `Ownership`, `Acceptance`, 현재 `RESULT`를 확인한다.
4. 현재 branch/worktree가 `Execution`과 일치하는지 확인한다.
5. baseline에 공용 contract/scaffold, 빌드 설정, 테스트 실행 경로가 준비되어 있는지 확인한다.
6. Agent A/B/C를 사용한다면 주 에이전트가 서로 겹치지 않는 구체적인 파일 소유 범위를 먼저 정한다.
7. 확인 결과와 이번 대화의 구현 범위를 짧게 알린 뒤 작업을 시작한다.

여러 workstream을 한 대화에서 수행하도록 명시된 문서(예: 12 + 13)가 아니면 작업별 대화를 분리한다.
사용자가 지정하지 않은 다른 번호의 작업까지 자동으로 범위를 넓히지 않는다.

### 시작 차단 조건

다음 조건에서는 누락된 설계를 추측해 구현하지 않는다.

- 지정된 작업 MD를 찾을 수 없음
- 현재 실행 위치를 지정 branch/worktree로 안전하게 맞출 수 없음
- 필요한 공용 contract가 없고 순수 내부 구현으로도 진행할 수 없음
- baseline scaffold가 없어 해당 workstream의 빌드나 테스트 경로를 정의할 수 없음

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
- 완료 후 자신의 branch에 커밋 가능한 상태로 정리하고 주 에이전트가 RESULT를 갱신한다.

### Mode: MAIN

- 별도 worktree를 만들지 않는다.
- 구현 전에 현재 branch가 main인지 확인한다.
- main에서 지정 Ownership만 수정한다.
- 동시에 진행되는 다른 MAIN 작업의 소유 파일을 수정하지 않는다.

### Integration

- 최종 merge와 cross-module 수정은 `09_INTEGRATION.md` 작업만 수행한다.
- 01~08 작업자는 integration이나 main merge를 수행하지 않는다.
- Integration은 각 작업 MD의 RESULT와 contract change request를 먼저 읽는다.

## 4. 공용 Contract

`INTERFACE_CONTRACTS.md`는 병렬 구현 시작 후 frozen contract로 취급한다.

- 개별 workstream에서 임의로 수정하지 않는다.
- 다른 module의 concrete implementation에 직접 의존하지 않는다.
- shadow type이나 중복 interface를 만들어 contract를 우회하지 않는다.
- contract에 없는 cross-module method, event, data shape을 추측해 public API로 만들지 않는다.
- contract가 부족해도 가능한 순수 내부 구현과 테스트는 계속할 수 있지만, 외부 연결은 adaptor 경계에서
  멈추고 Integration으로 넘긴다.
- baseline에 실제 공용 contract 소스가 있으면 문서 계약과 동일한 이름과 의미를 사용한다. 작업별
  복사본을 만들지 않는다.
- 변경 요청에는 제안 signature/data shape, 이유, 현재 가능한 우회, 영향을 받는 workstream을 적는다.

## 5. 공유 설정 파일

작업 MD에서 명시적으로 허용하지 않는 한 다음 파일을 수정하지 않는다.

- `package.json` 및 lockfile
- `tsconfig*`
- Vite/build 설정
- CI 설정
- 공용 barrel `index.ts`
- 공용 project bootstrap
- 공용 contract 소스

필요한 변경은 RESULT의 integration 요청사항으로 남긴다. 초기 scaffold/baseline을 만드는 별도 작업이나
09 Integration만 합의된 범위에서 이 파일들을 수정할 수 있다.

## 6. 병렬 서브에이전트 운영

- 최대 3개의 서브에이전트를 사용할 수 있지만, 병렬화가 안전할 때만 사용한다.
- 작업 MD의 Agent A/B/C 분배를 기본값으로 사용한다.
- 주 에이전트는 실행 전에 에이전트별 파일/디렉터리 소유 목록을 명시한다. 역할 이름만으로 파일 소유를
  대신하지 않는다.
- 각 서브에이전트는 이 `/AGENTS.md`, 지정 작업 MD, `INTERFACE_CONTRACTS.md`를 읽고 배정 범위만
  수행한다.
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

## 8. Optional 기능 규칙

10 이상 번호는 Optional Extension이다.

- 01~09는 Optional 기능이 하나도 없어도 정상 빌드/사용 가능해야 한다.
- Core는 Optional module을 import하지 않는다.
- Core contract는 Optional 기능의 존재를 요구하지 않는다.
- Optional 기능은 Core public API를 소비하는 방향으로만 의존한다.
- Optional directory 제거로 Core가 깨지면 안 된다.
- Optional 기능만을 위해 Core를 임의 수정하지 않는다.
- Core 변경이 필요하면 proposal로 기록하고 자동 적용하지 않는다.

## 9. 브라우저 / iPad 원칙

- primary target은 iPad Safari다.
- raw `PointerEvent`는 input normalization 계층 밖으로 직접 노출하지 않는다.
- Pencil, touch, mouse를 구분한다.
- Pencil pressure/tilt/coalesced samples는 normalized sample로 전달한다.
- touch navigation과 Pencil modeling의 역할을 명확히 분리한다.
- mobile memory, GPU, thermal 부담을 우선 고려한다.

## 10. 완료와 RESULT

작업이 끝나면 주 에이전트가 지정 작업 MD의 `RESULT` 섹션을 갱신한다.

- Acceptance를 충족하고 관련 테스트가 통과한 경우에만 `COMPLETE`로 기록한다.
- 구현 내용, 실제 수정 파일, public API를 적는다.
- 실행한 검증 명령과 결과를 적는다. 실행하지 못한 검증은 이유를 적는다.
- Integration에 필요한 연결 작업과 contract 변경 요청을 적는다.
- contract 변경 요청이 없으면 `NONE`이라고 적는다.
- 미완성 기능, 기기 미검증, 성능 위험은 `Known limitations`에 적는다.

## 11. 금지 사항

- 작업 범위 밖의 선행 수정
- 다른 workstream 내부 구현 변경
- frozen contract 즉흥 변경
- 전체 구조 리팩터링
- Optional 기능을 Core 필수 dependency로 만들기
- worktree 작업자의 main merge
- Integration 전 cross-worktree 조립
- 검증하지 않은 항목을 완료로 기록하기
