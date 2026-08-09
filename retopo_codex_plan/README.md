# Retopology Codex Parallel Work Plan

## 포함 파일

```text
AGENTS.md
README.md
docs/workplan/
  00_MASTER.md
  01_MAIN_LEAF.md
  02_MESH_KERNEL.md
  03_SURFACE_ENGINE.md
  04_SELECTION_ENGINE.md
  05_HISTORY_ENGINE.md
  06_TOOL_RUNTIME.md
  07_RENDERER.md
  08_RETOPO_ENGINE.md
  09_INTEGRATION.md
  10_UV_EDITOR.md
  11_TEXTURE_PAINT.md
  12_LOOKDEV_RENDER.md
  13_MATCAP.md
  INTERFACE_CONTRACTS.md
  START_PROMPTS.md
```

## 사용 순서

1. 이 폴더 구조를 저장소 루트에 복사한다.
2. 초기 Core contract/scaffold를 main에 준비하고 baseline commit을 만든다.
3. `START_PROMPTS.md`에서 해당 대화의 첫 프롬프트를 복사한다.
4. 01~08을 병렬 진행한다.
5. 09에서 필수 Core를 통합한다.
6. 일정/상태에 따라 10~13을 선택적으로 진행한다.

공통 지시는 루트 `AGENTS.md`에 있으므로 대화별 프롬프트에 반복하지 않는다.
