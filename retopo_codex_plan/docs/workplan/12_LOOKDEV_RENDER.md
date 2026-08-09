# 12 Lightweight PBR / Quality Render

## Required
NO — OPTIONAL

12를 구현하지 않아도 01~09에는 문제가 없어야 한다.

## Execution
```text
Mode: WORKTREE
Branch: wt/lookdev-render
Worktree: ../wt-lookdev-render
```

## Ownership
```text
src/extensions/lookdev/**
tests/extensions/lookdev/**
```

## Goal
기본 viewport renderer 위에 lightweight PBR lookdev와 가능한 범위의 가벼운 quality render path 추가.

## Agent Allocation

### Agent A — Material Model
- Base Color
- Metallic
- Roughness
- Normal map
- Emissive
- optional opacity

### Agent B — Realtime PBR
- environment lighting
- simple direct light
- tone mapping
- lightweight shadow if feasible
- mobile GPU budget 우선

### Agent C — Quality Render
- progressive accumulation 또는 lightweight ray/path-like render
- low sample count
- cancel/restart
- unsupported fallback

Agent C 여유 시 13 MatCap을 같은 대화에서 수행할 수 있다.

## Degradation Rule

```text
Quality Render 미구현/실패
-> Realtime PBR 정상

PBR extension 제거
-> Core solid/wireframe 정상
```

## Acceptance
- Core Renderer에 shading provider로 additive registration
- iPad thermal/memory/GPU 부담 우선 고려
- extension 제거 시 core 무영향

## RESULT
Status: NOT_STARTED

### Implemented
-

### Files created or modified
-

### Public API
-

### Tests / validation
-

### Integration notes
-

### Requested contract changes
- NONE

### Known limitations
-
