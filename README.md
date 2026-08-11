# OctoPoly

OctoPoly를 기능별로 다시 쌓기 위한 최소 정적 웹 앱 기준선입니다.

현재 `main`에는 Cloudflare Pages에서 페이지를 표시하고 기본 빌드와 테스트를 수행하는 데 필요한 코드만
있습니다. 초기화 전 구현과 과거 계획·진행 기록은 `codex/pre-minimal-main-20260811` 브랜치에 보존되어
있으며, 필요한 코드는 기능별로 검토한 뒤 선택적으로 가져옵니다.

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
