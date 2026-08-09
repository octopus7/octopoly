# Codex Conversation Start Prompts

이 문서는 새 Codex 대화를 시작할 때 **해당 코드블록만 복사**하기 위한 문서다.

공통 운영 규칙은 루트 `/AGENTS.md`에 있으므로 여기서 반복하지 않는다.

---

## 01 — Main Leaf

```text
docs/workplan/01_MAIN_LEAF.md를 이번 대화의 작업 명세로 사용해서 01 작업만 수행해.
문서의 Agent A/B/C 분배대로 최대 3개 서브에이전트를 병렬 사용하고, 완료 후 해당 문서의 RESULT를 갱신해.
```

---

## 02 — Mesh Kernel

```text
docs/workplan/02_MESH_KERNEL.md를 이번 대화의 작업 명세로 사용해서 02 작업만 수행해.
문서의 Execution과 Agent A/B/C 분배를 그대로 따르고, 완료 후 해당 문서의 RESULT를 갱신해.
```

---

## 03 — Surface Engine

```text
docs/workplan/03_SURFACE_ENGINE.md를 이번 대화의 작업 명세로 사용해서 03 작업만 수행해.
문서의 Execution과 Agent A/B/C 분배를 그대로 따르고, 완료 후 해당 문서의 RESULT를 갱신해.
```

---

## 04 — Selection Engine

```text
docs/workplan/04_SELECTION_ENGINE.md를 이번 대화의 작업 명세로 사용해서 04 작업만 수행해.
문서의 Execution과 Agent A/B/C 분배를 그대로 따르고, 완료 후 해당 문서의 RESULT를 갱신해.
```

---

## 05 — History Engine

```text
docs/workplan/05_HISTORY_ENGINE.md를 이번 대화의 작업 명세로 사용해서 05 작업만 수행해.
문서의 Execution과 Agent A/B/C 분배를 그대로 따르고, 완료 후 해당 문서의 RESULT를 갱신해.
```

---

## 06 — Tool Runtime

```text
docs/workplan/06_TOOL_RUNTIME.md를 이번 대화의 작업 명세로 사용해서 06 작업만 수행해.
문서의 Execution과 Agent A/B/C 분배를 그대로 따르고, 완료 후 해당 문서의 RESULT를 갱신해.
```

---

## 07 — Renderer

```text
docs/workplan/07_RENDERER.md를 이번 대화의 작업 명세로 사용해서 07 작업만 수행해.
문서의 Execution과 Agent A/B/C 분배를 그대로 따르고, 완료 후 해당 문서의 RESULT를 갱신해.
```

---

## 08 — Retopo Engine

```text
docs/workplan/08_RETOPO_ENGINE.md를 이번 대화의 작업 명세로 사용해서 08 작업만 수행해.
문서의 Execution과 Agent A/B/C 분배를 그대로 따르고, 완료 후 해당 문서의 RESULT를 갱신해.
```

---

## 09 — Integration

```text
docs/workplan/09_INTEGRATION.md를 이번 대화의 작업 명세로 사용해서 필수 Core 01~08만 조립해.
00_MASTER.md의 관계와 merge 순서를 참고하고, 각 작업 MD의 RESULT를 먼저 읽은 뒤 최대 3개 서브에이전트로 integration을 진행해.
10~13 Optional 기능은 이번 성공 조건에서 제외해.
```

---

# Optional Conversations

아래는 Core 진행 상황을 보고 선택적으로 시작한다.

## 10 — UV Editor

```text
docs/workplan/10_UV_EDITOR.md를 이번 대화의 작업 명세로 사용해서 Optional 10만 수행해.
Core 01~09를 변경하거나 필수 의존성을 추가하지 말고, 문서의 Agent A/B/C 분배대로 진행한 뒤 RESULT를 갱신해.
```

---

## 11 — Texture Paint

```text
docs/workplan/11_TEXTURE_PAINT.md를 이번 대화의 작업 명세로 사용해서 Optional 11만 수행해.
10 UV Editor의 존재를 필수로 가정하지 말고, 문서의 Agent A/B/C 분배대로 진행한 뒤 RESULT를 갱신해.
```

---

## 12 + 13 — Lookdev / PBR / MatCap

```text
docs/workplan/12_LOOKDEV_RENDER.md와 docs/workplan/13_MATCAP.md를 이번 대화의 작업 명세로 사용해.
우선 12의 Agent A/B/C 작업을 최대 3개 서브에이전트로 병렬 진행하고, 여유가 있으면 같은 wt/lookdev-render 범위에서 13 MatCap까지 additive extension으로 구현해.
Core 01~09를 Optional 기능의 필수 dependency로 바꾸지 말고, 완료한 문서의 RESULT를 각각 갱신해.
```

---

## 13 — MatCap만 별도로 추가할 때

```text
docs/workplan/13_MATCAP.md를 이번 대화의 작업 명세로 사용해서 Optional 13만 수행해.
13 문서의 Execution 조건을 먼저 확인하고, Core/PBR과 독립적인 additive shading extension으로만 구현한 뒤 RESULT를 갱신해.
```
