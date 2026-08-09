# Retopology Tool — Master Work Plan

## Goal

iPad 웹에서 Apple Pencil 중심으로 동작하는 low-poly / retopology modeling tool.

핵심:

- Pencil-first retopology
- surface snapping
- quad-oriented workflow
- low-poly editing
- touch navigation
- modular architecture
- 최대 병렬 개발
- optional 기능과 core 완전 분리

## Document Roles

- `/AGENTS.md` — 모든 대화/에이전트의 공통 운영 규칙
- `00_MASTER.md` — 전체 관계, 의존 방향, 조립 순서
- `INTERFACE_CONTRACTS.md` — frozen public boundary
- `01~08` — 필수 구현 workstream
- `09_INTEGRATION.md` — 필수 core 최종 조립
- `10~13` — 진행 상황에 따라 생략 가능한 Optional Extension
- `START_PROMPTS.md` — 새 대화 첫 프롬프트 복사용

## Execution Matrix

| No | Workstream | Required | Mode | Branch |
|---|---|---:|---|---|
| 01 | Main Leaf | YES | MAIN | `main` |
| 02 | Mesh Kernel | YES | WORKTREE | `wt/mesh-kernel` |
| 03 | Surface Engine | YES | WORKTREE | `wt/surface-engine` |
| 04 | Selection Engine | YES | WORKTREE | `wt/selection-engine` |
| 05 | History Engine | YES | WORKTREE | `wt/history-engine` |
| 06 | Tool Runtime | YES | WORKTREE | `wt/tool-runtime` |
| 07 | Renderer | YES | WORKTREE | `wt/renderer` |
| 08 | Retopo Engine | YES | WORKTREE | `wt/retopo-engine` |
| 09 | Integration | YES | MAIN | `main` |
| 10 | UV Editor | NO | WORKTREE | `wt/uv-editor` |
| 11 | Texture Paint | NO | WORKTREE | `wt/texture-paint` |
| 12 | Lightweight PBR / Quality Render | NO | WORKTREE | `wt/lookdev-render` |
| 13 | MatCap | NO | SAME CHAT AS 12 or MAIN | additive |

## Required Core Relationship

```text
01 Main Leaf ──────────────────────────────┐
                                          │
02 Mesh Kernel ─────┬─► 04 Selection      │
                    └─► 08 Retopo ────────┤
03 Surface Engine ─────► 08 Retopo         │
05 History ────────────────────────────────┤
06 Tool Runtime ───────────────────────────┤
07 Renderer ───────────────────────────────┤
                                          ▼
                                   09 Integration
```

Concrete implementation 간 직접 의존이 아니라 `INTERFACE_CONTRACTS.md`의 public boundary를 통해 연결한다.

## Data Ownership

```text
Mesh topology            -> 02 Mesh Kernel
Reference/high-poly      -> 03 Surface Engine
Selection state          -> 04 Selection Engine
Undo/redo history        -> 05 History Engine
Tool lifecycle/state     -> 06 Tool Runtime
GPU/render resources     -> 07 Renderer
Retopo inference         -> 08 Retopo Engine
Raw device normalization -> 01 Main Leaf
```

## Required Merge Order

Integration 권장 순서:

1. 02 Mesh Kernel
2. 03 Surface Engine
3. 07 Renderer
4. 04 Selection Engine
5. 05 History Engine
6. 06 Tool Runtime
7. 08 Retopo Engine
8. 01 Main Leaf wiring
9. contract reconciliation
10. 전체 typecheck/build
11. iPad Safari validation

## Optional Feature Rule

10~13은 **전부 생략 가능**하다.

```text
01~09 Core ─────────► Optional Extensions
Optional ─────X─────► Core 필수 조건
```

Core가 Optional module을 import하거나 존재 여부를 전제로 해서는 안 된다.

## Optional Relationships

```text
                     01~09 CORE
                         │
             ┌───────────┼───────────┐
             ▼           ▼           ▼
           10 UV       12 PBR      13 MatCap
             │
             └─────┐
                   ▼
             11 Texture Paint
```

11은 10에 강제 의존하지 않는다.

```text
Imported UV 존재 + 11 -> Paint 가능
10 + 11              -> UV 생성/편집 후 Paint
UV 없음 + 10 없음    -> Paint만 비활성
```

## Reserved Core Extension Points

Optional 구현 여부와 무관하게 다음 generic boundary는 Core에서 허용할 수 있다.

- generic mesh attributes
- image asset handle
- optional material reference
- shading provider registry
- tool/extension registration

구체적인 UV/PBR/MatCap 구현은 Core에 포함하지 않는다.
