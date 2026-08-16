# OctoPoly

OctoPoly는 저폴리곤 작업 전반을 다루는 범용 도구이며, 작업별 특화 모드를 통해 작업 효율을 극대화하는
것을 목표로 합니다. 초기 작업 모드 분류는 리토폴로지, 페이셜 작업, 페인트로 나누며, 현재는 페이셜 모드만
제공하고 리토폴로지와 페인트는 준비 중입니다. 기본 큐브 뷰포트는 공통 기준선이며 리토폴로지 모드를
의미하지 않습니다.

현재 앱은 초기 공통 큐브 뷰포트에서 `Facial` 모드를 선택해 다음 작업을 수행할 수 있습니다.

- 좌우 대칭 저폴리 기본 얼굴 마스크와 topology상 실제 눈·입 opening
- OBJ base mesh 가져오기
- immutable `Base Mask` 복제, 복제본 이름 변경 및 active mesh 전환
- 단일 vertex 선택과 X/Y/Z axis gizmo 이동
- `localStorage` 자동 저장 및 다음 세션 복구
- WebGL2 indexed face·wire·vertex 렌더링

현재 범위에는 내보내기, undo/redo, edge/face 선택, UV, 재질, 미러 편집, 리토폴로지 및
페인트 기능이 포함되지 않습니다. 초기화 전 구현과 과거 계획·진행 기록은
`codex/pre-minimal-main-20260811` 브랜치에 보존되어 있으며, 필요한 코드는 기능별로 검토한 뒤
선택적으로 가져옵니다.

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
