# 07 Renderer

## Required
YES

## Execution
```text
Mode: WORKTREE
Branch: wt/renderer
Worktree: ../wt-renderer
```

## Goal
Reference/Retopo mesh를 위한 기본 viewport renderer.

## Ownership
```text
src/renderer/core/**
src/renderer/reference/**
src/renderer/retopo/**
tests/renderer/**
```

## Agent Allocation

### Agent A — Renderer Core
- WebGPU/WebGL2 abstraction
- render loop
- resize/DPR
- camera matrices
- GPU resource lifecycle
- shading extension registry

### Agent B — Reference Renderer
- high-poly/reference rendering
- simple solid shading
- optional opacity/xray

### Agent C — Retopo Renderer
- retopo faces
- edge/wire
- vertex points
- editing visibility/depth strategy

## Required Shading
```text
solid
wireframe / overlay
```

PBR/MatCap/quality render는 Optional이다.

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
