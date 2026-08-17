# OctoPoly

OctoPoly는 저폴리곤 작업 전반을 다루는 범용 도구이며, 작업별 특화 모드를 통해 작업 효율을 극대화하는
것을 목표로 합니다. 초기 작업 모드 분류는 리토폴로지, 페이셜 작업, 페인트로 나누며, 현재는 페이셜 모드만
제공하고 리토폴로지와 페인트는 준비 중입니다. 앱은 페이셜 작업 공간으로 바로 시작하며, 기본 큐브 뷰포트는
페이셜 시작에 실패했을 때 사용할 수 있는 공통 fallback 기준선입니다.

현재 앱에서는 다음 작업을 수행할 수 있습니다.

- 좌우 대칭 저폴리 기본 얼굴 마스크와 topology상 실제 눈·입 opening
- OBJ base mesh 가져오기와 `파일 > 프리셋 > Luna` 불러오기
- complete UV가 있는 OBJ의 active model에 `파일 > PNG/JPEG 텍스처 불러오기`로 texture 적용
- immutable `Base Mask` 복제, 복제본 이름 변경 및 active mesh 전환
- 단일 vertex 선택과 X/Y/Z axis gizmo, view-plane 및 constrained-plane 이동
- camera-projected 제한 평면과 별도 screen-space 표시, 각 plane axis의 axis-only drag
- `localStorage` 자동 저장 및 다음 세션 복구
- WebGL2 indexed face·wire·depth-tested square vertex 렌더링

텍스처는 현재 단계에서 **session-only**입니다. PNG/JPEG binary와 GPU texture는 `localStorage`에 저장하지
않으므로 페이지를 다시 열거나 해당 모델의 OBJ topology를 교체하면 texture image를 다시 선택해야 합니다.
UV가 없거나 일부 face에만 UV가 있는 OBJ, 지원하지 않는 image type, decode/upload/WebGL 실패는 기존
workspace와 texture 또는 기본 surface를 유지합니다. OBJ의 position/UV seam은 aligned vertex로 remap하지만
UV 편집 UI와 material authoring은 아직 제공하지 않습니다.

현재 범위에는 내보내기, undo/redo, edge/face 선택, UV 편집, 재질 authoring, 미러 편집, 리토폴로지 및
페인트 기능이 포함되지 않습니다. 자체 작업 파일, proportional multi-vertex 편집, 익스포트,
GLB 입출력 및 camera 편집 독립성의 후속 순서와 제품 계약은 [`ROADMAP.md`](./ROADMAP.md)에 기록합니다. 초기화 전 구현과 과거
계획·진행 기록은 `codex/pre-minimal-main-20260811` 브랜치에 보존되어 있으며, 필요한 코드는
기능별로 검토한 뒤 선택적으로 가져옵니다.

## 로컬 실행

```bash
npm ci
npm run dev
```

검증 명령:

```bash
npm run typecheck
npm test
npm run build
npm run ci
```

## Cloudflare Pages

- Project: `octopoly`
- Production: <https://octopoly.pages.dev/>
- Build command: `npm run build`
- Build output directory: `dist`

현재 기준선은 정적 SPA이며 Pages Functions나 Workers를 사용하지 않습니다.

## 보존 브랜치에서 코드 조회

파일을 바로 복원하기 전에 내용을 먼저 확인합니다.

```bash
git show codex/pre-minimal-main-20260811:path/to/file
```

필요한 부분만 현재 구조와 요구사항에 맞게 다시 적용합니다.
