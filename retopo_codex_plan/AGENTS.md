# AGENTS.md — Retopology Tool Parallel Development Rules

이 저장소에서 Codex와 모든 서브에이전트는 아래 규칙을 공통으로 따른다.
개별 작업 MD가 더 구체적인 지시를 제공하면, 그 범위 안에서 개별 작업 MD를 우선한다.

## 1. 작업 범위

- 현재 대화에 지정된 `docs/workplan/XX_*.md`만 구현 범위로 취급한다.
- 다른 번호의 workstream을 선행 구현하거나 대신 수정하지 않는다.
- 지정된 `Ownership` 밖 파일은 수정하지 않는다.
- 다른 에이전트가 소유한 파일을 임의로 수정하지 않는다.

## 2. Worktree / Main 규칙

각 작업 MD의 `Execution` 섹션이 실행 위치의 유일한 기준이다.

### Mode: WORKTREE

- 지정된 branch/worktree 안에서만 작업한다.
- main에서 직접 구현하지 않는다.
- main에 직접 merge하지 않는다.
- 다른 worktree를 현재 worktree에 merge하지 않는다.
- 완료 후 자신의 branch에 커밋 가능한 상태로 정리하고 RESULT를 남긴다.

### Mode: MAIN

- 별도 worktree를 만들지 않는다.
- main에서 지정 Ownership만 수정한다.
- 동시에 진행되는 다른 MAIN 작업의 소유 파일을 수정하지 않는다.

### Integration

- 최종 merge와 cross-module 수정은 `09_INTEGRATION.md` 작업만 수행한다.
- 01~08 작업자는 integration을 수행하지 않는다.

## 3. 공용 Contract

`docs/workplan/INTERFACE_CONTRACTS.md`는 병렬 구현 시작 후 frozen contract로 취급한다.

- 임의 수정 금지.
- 필요한 변경이 있으면 해당 작업 MD의 `Requested contract changes`에 기록한다.
- 다른 module의 concrete implementation에 직접 의존하지 않는다.
- 임시 shadow type / 중복 interface를 만들어 contract를 우회하지 않는다.

## 4. 공유 설정 파일

작업 MD에서 명시적으로 허용하지 않는 한 다음 파일을 수정하지 않는다.

- `package.json`
- lockfile
- `tsconfig*`
- Vite / build 설정
- CI 설정
- 공용 barrel `index.ts`
- 공용 project bootstrap

필요하면 RESULT에 integration 요청사항으로 남긴다.

## 5. 병렬 서브에이전트 운영

- 가능한 경우 최대 3개의 서브에이전트를 사용한다.
- 작업 MD의 Agent A/B/C 분배를 기본값으로 사용한다.
- 에이전트별 파일 소유 범위를 겹치지 않게 유지한다.
- 한 에이전트가 다른 에이전트의 작업을 리팩터링하지 않는다.
- 공용 파일 수정이 필요한 경우 한 에이전트만 소유하거나 integration note로 넘긴다.

## 6. 구현 철학

- 개별 workstream은 `순수 모듈 + public API + 내부 테스트/검증`을 목표로 한다.
- 개별 작업 단계에서는 전체 앱 조립이나 전체 빌드를 성공 조건으로 삼지 않는다.
- 다른 module이 아직 없으면 public boundary/adaptor까지 구현하고 연결은 Integration으로 넘긴다.
- 없는 dependency를 임의로 재구현하지 않는다.

## 7. Optional 기능 규칙

`10` 이상 번호는 Optional Extension이다.

- 01~09는 10+ 기능이 하나도 없어도 정상 빌드/사용 가능해야 한다.
- Core는 Optional module을 import하지 않는다.
- Core contract는 Optional 기능의 존재를 요구하지 않는다.
- Optional 기능은 Core public API를 소비하는 방향으로만 의존한다.
- Optional directory 제거로 Core가 깨지면 안 된다.
- Optional 기능만을 위해 Core를 임의 수정하지 않는다.
- Core 변경이 필요하면 proposal로 기록하고 자동 적용하지 않는다.

## 8. 브라우저 / iPad 원칙

- primary target은 iPad Safari다.
- raw `PointerEvent`는 input normalization 계층 밖으로 직접 노출하지 않는다.
- Pencil / touch / mouse를 구분한다.
- Pencil pressure/tilt/coalesced samples는 normalized sample로 전달한다.
- touch navigation과 Pencil modeling의 역할을 명확히 분리한다.
- mobile memory / GPU / thermal 부담을 우선 고려한다.

## 9. 완료 시 필수 작업

각 작업이 끝나면 해당 작업 MD의 `RESULT` 섹션을 갱신한다.

형식:

```md
## RESULT

Status: NOT_STARTED | IN_PROGRESS | COMPLETE | BLOCKED

### Implemented
- ...

### Files created or modified
- ...

### Public API
- ...

### Tests / validation
- ...

### Integration notes
- ...

### Requested contract changes
- NONE

### Known limitations
- ...
```

## 10. 하지 말아야 할 것

- 작업 범위 밖의 친절한 선행 수정
- 타 workstream 내부 구현 변경
- frozen contract 즉흥 변경
- 전체 구조 리팩터링
- optional 기능을 core 필수 dependency로 만들기
- worktree 작업자가 main merge 수행
- integration 전 cross-worktree 조립
