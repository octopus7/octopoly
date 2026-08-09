# 13 MatCap Rendering Mode

## Required
NO — OPTIONAL

13을 구현하지 않아도 01~09 또는 12에 문제가 없어야 한다.

## Execution

기본 권장:

```text
Mode: SAME CONVERSATION AS 12
Branch: wt/lookdev-render
```

12가 이미 완료/merge되었고 코드 영역이 독립적이면:

```text
Mode: MAIN
Ownership: src/extensions/matcap/**
```

별도 worktree는 기본적으로 만들지 않는다.

## Ownership
```text
src/extensions/matcap/**
```

## Goal
모델링/리토폴로지 확인을 위한 lightweight MatCap shading.

## Features

Built-in preset 예시:
- Clay
- Neutral Gray
- Metallic
- Soft
- High Contrast

Custom:
- MatCap image import
- image validation
- preset/custom switching

## Design
Core Renderer의 shading extension/provider registry만 소비한다.

```text
solid
wireframe
+ optional matcap
+ optional pbr
```

## Acceptance
- MatCap 제거 시 Core/PBR 무영향
- custom image import 실패가 Core를 깨뜨리지 않음
- iPad에서 lightweight viewport mode로 동작

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
