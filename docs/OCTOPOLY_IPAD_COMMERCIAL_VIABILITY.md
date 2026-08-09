# OctoPoly 네이티브 iPad 앱 수요 및 상용화 가능성 검토

- 기준일: 2026-08-10
- 대상: Apple Pencil 중심 retopology / low-poly 모델링 도구 `OctoPoly`
- 판단 범위: 시장 수요, 경쟁 구도, 제품 포지셔닝, 수익 모델, App Store 진입 조건, 검증 계획
- 주의: 공개 App Store 평점 수는 다운로드나 매출이 아니다. 이 문서는 공개 신호를 이용한 사전 타당성 검토이며 매출 예측서가 아니다.

## 결론

**조건부 GO**다. iPad에서 3D를 만들고 편집하려는 수요는 확인되지만, 수동 retopology만으로는 대중 시장이 아니라 전문 니치 시장이다. 따라서 OctoPoly는 "iPad용 Blender 대체품"보다 **Nomad Sculpt·ZBrush 등에서 만든 고해상도 모델을 게임·실시간 렌더링용 메시로 마무리하는 Pencil-first 도구**로 좁혀야 상용화 가능성이 높다.

현재 권고는 다음과 같다.

1. 기존 웹 구현으로 핵심 사용자 흐름과 실물 iPad 성능을 먼저 검증한다.
2. `기본도형으로 시작`, 마우스/키보드 카메라 조작, 신뢰할 수 있는 저장·복구, import/export를 먼저 닫는다.
3. 전면 Swift/Metal 재작성 대신 기존 TypeScript/WebGL2 코어를 재사용하는 iPad 앱 셸을 1차 상용 후보로 삼는다.
4. App Store 버전에는 Files 문서 통합, Pencil hover/pressure, 키보드·마우스, 오프라인 저장·복구, 공유/export 등 네이티브 효용을 넣는다.
5. TestFlight beta에서 가격·지불 의향과 반복 사용을 검증하기 전에는 전면 네이티브 렌더러 재작성이나 대규모 팀 투자를 하지 않는다.

즉, **제품 검증과 얇은 네이티브화는 진행할 가치가 있지만, 현재 근거만으로 대규모 네이티브 재개발을 정당화할 수는 없다.**

## 확인된 시장 신호

### iPad 3D 제작 수요는 존재한다

- 미국 App Store에서 Nomad Sculpt는 `$19.99`, 평점 `13K`, 평점 `4.8`, Graphics & Design 차트 `#3`으로 표시된다. 앱은 sculpting, painting, primitive, 자동 UV, baking, PBR/MatCap, import/export와 별도 Quad Remesher 구매를 제공한다. 이는 iPad에서 유료 3D 제작 도구를 구매하는 고객층이 실제로 있음을 보여주는 강한 방향성 신호다. 다만 평점 수만으로 판매량이나 매출을 환산하면 안 된다. [Nomad Sculpt App Store](https://apps.apple.com/us/app/nomad-sculpt/id1519508653?platform=ipad)
- ZBrush for iPad는 무료 플랜과 월 `$9.99`/연 `$89.99` 구독을 운영한다. 유료 기능에는 수동 Retopo Brush와 자동 ZRemesher, 200개 이상의 브러시, 최대 90M polygon 조건, Apple Pencil 지원이 포함된다. 미국 App Store에는 평점 `214`, 평점 `4.0`으로 표시된다. 대형 전문 소프트웨어 업체도 iPad를 진지한 3D 제작·수동 retopology 플랫폼으로 취급하고 있다는 신호이자 OctoPoly의 가장 큰 통합형 경쟁자다. [ZBrush for iPad App Store](https://apps.apple.com/us/app/zbrush-made-for-3d-creators/id6612028716), [Maxon ZBrush 플랜 비교](https://www.maxon.net/en/zbrush-plan-options)
- Shapr3D는 iPad·Mac·Windows를 지원하며 Pro를 연 `$299`에 제공한다. CAD와 retopology는 다른 시장이지만, 전문 iPad 3D 도구가 높은 가격을 받을 수 있다는 상한 사례다. [Shapr3D 가격](https://www.shapr3d.com/pricing)
- Valence 3D는 `$39.99` 일회성 가격으로 25개 primitive와 polygon/subdivision modeling을 제공하며 미국 App Store 평점은 `114`, 평점은 `4.2`다. 직접 retopology 경쟁자는 아니지만 기본 도형과 즉시 시작 가능한 새 프로젝트가 iPad poly modeling 제품의 기본 기대치임을 보여준다. [Valence 3D App Store](https://apps.apple.com/us/app/valence-3d/id6450967410?platform=ipad)

### 직접 retopology 시장은 작고 가격에 민감하다

- CozyBlanket은 iPad에서 manual retopology, UV unwrap/packing, baking, Apple Pencil·multitouch 작업을 제공하는 가장 가까운 직접 경쟁자다. 미국 App Store 기준 무료+IAP, 평점 `78`, 평점 `3.4`다. 이는 직접적인 문제 수요가 존재함을 확인하지만, 넓은 대중 시장이라고 보기는 어렵다. [CozyBlanket App Store](https://apps.apple.com/us/app/cozyblanket/id1608079174)
- CozyBlanket의 공개 리뷰에는 직관적인 UV 기능에 대한 긍정과 함께 카메라 안정성, 저장 paywall, 장면 구성, 제스처 신뢰성, `$90` 가격에 대한 불만이 반복된다. 리뷰는 대표 표본이 아니지만 **카메라·저장·복구 같은 기본 신뢰성이 고급 기능 수보다 구매 결정에 더 중요할 수 있음**을 보여준다. 같은 페이지의 개별 리뷰를 정성 신호로만 사용했다. [CozyBlanket 평가 및 리뷰](https://apps.apple.com/us/app/cozyblanket/id1608079174)
- Nomad Sculpt가 자동 Quad Remesher를 제공하고 ZBrush가 자동 ZRemesher와 수동 Retopo Brush를 한 앱에 통합했으므로 OctoPoly는 "retopology 가능"만으로 차별화할 수 없다. 자동 결과보다 topology flow를 직접 통제해야 하는 캐릭터·애니메이션·게임 자산, 초보가 이해할 수 있는 guided flow, UV/paint/bake까지 이어지는 작업, 더 단순하고 신뢰할 수 있는 Pencil UX가 핵심 차별점이어야 한다.

### 플랫폼 모수는 충분하지만 타깃 고객 비율은 알 수 없다

- Omdia는 2026년 1분기 세계 태블릿 출하량을 3,700만 대로 집계했다. 시장 전체는 전년 대비 0.1% 증가에 그쳤지만 Apple은 1,480만 대로 약 40%를 차지했고 전년 대비 7.9% 성장했다. Omdia는 대중형 수요보다 premium segment 수요가 상대적으로 견고하다고 평가했다. 플랫폼 모수는 충분하지만 전체 태블릿 시장이 고성장한다고 가정하면 안 된다. [Omdia 2026 Q1 태블릿 시장](https://omdia.tech.informa.com/pr/2026/may/global-tablet-market-sees-marginal-growth-at-0point1-percent-in-q1-2026-as-demand-outlook-weakens)
- IDC도 2025년 4분기 Apple 태블릿 출하량을 1,710만 대, 점유율을 41.9%로 추정했다. 이는 iPad 플랫폼 자체가 충분히 크다는 교차 신호지만, 그중 Apple Pencil을 소유하고 retopology가 필요한 사용자의 비율은 공개 자료로 알 수 없다. [IDC 2025 태블릿 시장](https://www.idc.com/resource-center/blog/global-tablet-shipments-rise-1-9-in-4q25-as-seasonal-demand-offsets-cooling-replacement-cycle/)
- Apple의 최신 2026 회계연도 3분기 전체 매출은 `$109.4B`로 전년 대비 16% 증가했고, 주요 제품군과 지역의 활성 설치 기반이 다시 사상 최고라고 발표됐다. 분기 iPad 매출은 재무제표 기준 약 `$6.191B`로 전년 동기 약 `$6.581B`보다 감소했지만 9개월 누계는 약 `$21.700B`로 전년 동기 약 `$21.071B`보다 증가했다. 이는 플랫폼 건전성 신호이지 OctoPoly의 TAM 근거는 아니다. [Apple FY2026 Q3 결과](https://www.apple.com/newsroom/2026/07/apple-reports-third-quarter-results/), [재무제표 PDF](https://www.apple.com/newsroom/pdfs/fy2026q3/FY26_Q3_Consolidated_Financial_Statements.pdf)
- iPadOS는 Pencil Pro의 squeeze, barrel roll, haptic feedback, hover와 MetalFX를 공식 지원한다. Pencil 중심 3D 도구가 네이티브 앱에서 차별화할 수 있는 입력·GPU 기능이 있다. [Apple iPadOS 개발자 페이지](https://developer.apple.com/ipados/), [Apple Pencil hover 문서](https://developer.apple.com/documentation/uikit/adopting-hover-support-for-apple-pencil)

## 목표 고객과 사용 사례

| 우선순위 | 고객 | 해결할 작업 | 지불 가능성 가설 |
|---:|---|---|---|
| 1 | Nomad Sculpt·ZBrush iPad 사용자 | sculpt 결과를 수동 retopo하고 UV·export까지 iPad에서 마무리 | 중간~높음. 기존 유료 3D 앱 구매 경험이 있음 |
| 2 | 인디 게임 아티스트·프리랜서 | 이동 중 game-ready low-poly asset 제작, 데스크톱 DCC로 전달 | 중간. pipeline 호환성과 파일 신뢰성이 가격보다 중요할 수 있음 |
| 3 | 3D 학습자·학생 | topology flow를 직접 배우고 작은 자산 완성 | 낮음~중간. 무료 진입과 일회성 구매 선호 가능성이 큼 |
| 4 | 스캔·포토그래메트리 사용자 | 고밀도 스캔을 단순화하고 UV/export | 미확인. 큰 데이터 성능과 자동화 요구가 높음 |
| 제외 초기 범위 | 대형 스튜디오 전체 파이프라인 | 협업, 버전 관리, 다중 포맷, 자동화, 지원 SLA | 초기 제품으로 충족하기 어려움 |

가장 설득력 있는 첫 포지셔닝 문구는 다음과 같다.

> Sculpt on iPad, finish game-ready topology on iPad.

한국어로는 **"iPad에서 조각하고, iPad에서 게임용 topology까지 완성"**에 가깝다.

### 초보 유입과 전문성은 분리하지 말고 단계화한다

넓은 사용자 풀을 만들려면 edge loop, pole, manifold 같은 용어를 먼저 공부하도록 요구하면 안 된다. 그러나 전문 개념을 제거하면 결과 품질과 숙련자 유지율이 떨어진다. 권고 UX는 하나의 코어 위에 두 진입 수준을 두는 방식이다.

- **Guided Retopo:** `팔꿈치가 잘 접히게 둘러 그리기`, `눈·입 주위를 원형으로 감싸기`처럼 작업 목적을 먼저 설명한다.
- Pencil strip/patch 입력을 quad 흐름으로 보조하고, 시작 전 짧은 preview를 보여준다.
- pole, non-manifold, 지나치게 긴 edge, 과밀·희박 구간을 색상뿐 아니라 짧은 이유와 수정 동작으로 안내한다.
- 한 번의 Undo로 안전하게 되돌리고, 실패가 작업 손실로 이어지지 않게 한다.
- **Pro mode:** 같은 mesh/history/tool 코어를 사용하되 전문 용어, 세부 selection, shortcut, 직접 edge/vertex 편집을 즉시 노출한다.
- 초보가 실제 자산을 완성하면서 필요할 때 전문 용어를 배우도록 progressive disclosure를 적용한다.

초보용 별도 앱을 만드는 것이 아니라, `첫 결과 완성 → 개념 이해 → 정밀 제어`로 이어지는 학습 곡선을 제품 안에 넣는 전략이다. 무료 체험의 핵심 가치도 기능 목록이 아니라 작은 캐릭터나 prop 하나를 끝까지 완성하는 guided lesson이어야 한다.

## 경쟁 구도와 OctoPoly의 자리

| 제품 | 강점 | OctoPoly에 주는 의미 |
|---|---|---|
| Nomad Sculpt | 저렴한 일회성 가격, 좋은 모바일 UX, 넓은 sculpt/paint/render 기능, 큰 공개 반응 | 넓은 3D 제작 수요는 있으나 가격 기대치를 낮춘다. primitive와 빠른 시작 UX는 기본 기대치다. |
| ZBrush for iPad | 전문 브랜드, 고밀도 sculpt, Retopo Brush와 자동 remesh, desktop 연계 | 단순 기능 수 경쟁은 불리하다. 더 빠르고 이해하기 쉬운 수동 quad flow와 파일 호환성에 집중해야 한다. |
| CozyBlanket | manual retopo + UV + baking에 집중한 직접 경쟁자 | 문제는 검증됐지만 카메라·저장·제스처·가격 불만을 피해야 한다. 안정성과 데스크톱 입력 지원이 차별점이 될 수 있다. |
| Valence 3D | 일회성 가격, 25개 primitive, polygon/subdivision modeling | `새 프로젝트 → 기본 도형 → 즉시 편집`은 인접 제품의 기본 기대치다. OctoPoly의 빈 화면 시작 문제를 방치하면 안 된다. |
| Shapr3D | 높은 완성도, 전문 가격, 멀티플랫폼 CAD | 전문 iPad 도구의 지불 상한을 보여주지만 OctoPoly 초기 고객과 가격을 직접 비교하면 안 된다. |
| Blender/Maya/3ds Max 데스크톱 | 완전한 파이프라인, 플러그인, 자동화, 익숙한 입력 | 기능 전체를 대체하지 말고 이동성·Pencil UX·집중된 retopo 경험으로 보완해야 한다. |

## 제품 요구사항: 상용화 전에 닫아야 할 흐름

현재 OctoPoly 설계의 핵심 흐름은 `reference import → touch camera → Pencil edit → save/reload → export`다. 상용 제품은 여기에 reference가 없는 시작 흐름과 데스크톱 보조 입력이 필요하다.

### P0 — 구매 전 평가를 좌우하는 기본 신뢰성

- 첫 화면에서 `Reference 가져오기` 또는 `기본도형으로 시작` 선택
- Plane과 Cube 생성, 자동 선택, Frame Selection
- touch/Pencil뿐 아니라 mouse orbit/pan/wheel zoom, keyboard shortcut 지원
- autosave, crash/background 복구, dirty 상태, 명시적 Save As/Open
- OBJ와 glTF/GLB import/export의 예측 가능한 단위·축·material 처리
- undo/redo, 취소, context loss 후 복구
- 실제 iPad에서 큰 reference와 장시간 작업 시 메모리·발열·배터리 검증

기본도형과 마우스 카메라 지원은 부가 기능이 아니다. 빈 프로젝트와 PC 브라우저에서 사용자가 첫 작업을 시작하지 못하는 문제를 막는 **활성화 장벽 제거 기능**이다.

### P1 — 돈을 받을 수 있는 retopology 핵심

- Pencil surface stroke, quad/strip/patch 생성
- 목적 중심 Guided Retopo lesson과 단계별 topology hint
- flow preview, density guide, pole/non-manifold 설명 및 one-tap 수정 제안
- vertex/edge/face tweak, slide, relax, weld, dissolve, extrude
- symmetry와 snapping 품질
- topology validation과 non-manifold 복구 안내
- UV unwrap/packing, 최소 paint 또는 bake handoff
- selection set, isolate/hide, reference object별 visibility

### P2 — 네이티브 앱의 의미를 만드는 기능

- Files 앱 문서 열기/저장, iCloud Drive, 보안 범위 bookmark 또는 document-based lifecycle
- Apple Pencil pressure/tilt/hover와 가능 기기의 squeeze/barrel-roll 매핑
- Magic Keyboard 단축키와 mouse/trackpad 완전 지원
- Share sheet와 다른 3D 앱으로 내보내기
- background 전환과 메모리 pressure에서 안전한 autosave/restore
- 오프라인 우선 동작과 명확한 privacy posture

Apple은 App Store 앱이 단순히 웹사이트를 다시 포장한 수준을 넘어서는 기능·콘텐츠·UI를 가져야 한다고 명시한다. 따라서 WKWebView 셸만 씌운 제출은 심사와 제품 가치 모두에서 위험하다. [App Review Guideline 4.2](https://developer.apple.com/app-store/review/guidelines/#minimum-functionality)

## 네이티브화 전략

### 권고: 코어 재사용 + 네이티브 셸

1. 현재 TypeScript/WebGL2 mesh·history·tool·renderer 코어를 유지한다.
2. iPad 앱 셸에서 파일 lifecycle, Pencil 고급 입력, keyboard/mouse, share/export, purchase, telemetry 동의를 네이티브로 제공한다.
3. WebGL2 성능과 WKWebView 제한을 실물 기기에서 계측한다.
4. 병목이 확인된 부분만 WASM 또는 Metal 네이티브 모듈로 이동한다.

이 경로는 웹과 iPad 제품의 기능 격차를 줄이고 시장 검증 전 재작성 비용을 제한한다. 단, 실제 프로파일 없이 "네이티브이므로 빠르다"고 가정하면 안 된다.

### 지금 권하지 않음: 전면 Swift/Metal 재작성

전면 재작성은 다음 조건이 모두 확인된 뒤 다시 검토한다.

- 유료 의향과 반복 사용이 실제 beta에서 확인됨
- WebGL2/WKWebView가 명확한 성능·메모리 blocker임
- 네이티브 Metal 전환이 해결할 병목이 측정됨
- 파일 포맷, geometry kernel, 테스트 corpus를 재사용할 계획이 있음

## 수익 모델 제안

### 1차 가설: 무료 체험 + 일회성 Pro unlock

Nomad Sculpt의 `$19.99` 본체와 `$15.99` Quad Remesher IAP, Valence 3D의 `$39.99` 일회성 가격, CozyBlanket의 높은 가격 관련 불만을 고려하면 초기에는 구독보다 다음 구조가 적합해 보인다. 이 가격들은 미국 App Store의 기준일 표시값이며 국가별 가격과 세금은 다를 수 있다. [Nomad Sculpt App Store](https://apps.apple.com/us/app/nomad-sculpt/id1519508653?platform=ipad), [Valence 3D App Store](https://apps.apple.com/us/app/valence-3d/id6450967410?platform=ipad)

- 무료: 튜토리얼/샘플, 작은 메시, 저장 가능, 제한된 export 또는 워터마크 없는 평가용 1개 프로젝트
- Pro 일회성: 가설 가격 `$24.99~39.99`
- 후속 유료 pack: 고급 UV/baking, 대형 asset, studio bridge 등 명확한 추가 가치가 있을 때만

저장 자체를 paywall로 막는 방식은 피한다. 사용자는 안정성을 평가하려면 저장·재로드를 직접 확인할 수 있어야 한다.

### 구독은 지속 가치가 생긴 뒤

자동 갱신 구독은 cloud sync, 팀 공유, 지속적인 asset library, 계산 서비스, 정기적인 전문 기능 업데이트처럼 계속 제공되는 가치가 있을 때만 적합하다. Apple도 구독에는 지속적인 고객 가치가 있어야 한다고 명시한다. [App Review Guideline 3.1.2](https://developer.apple.com/app-store/review/guidelines/#subscriptions)

### App Store 비용 구조

- Apple Developer Program은 연 `$99`다. 기본 App Store 수수료는 디지털 상품·서비스 매출의 30%이며, Small Business Program 등 자격을 충족하면 15%가 적용된다. [Apple Developer Program 비용](https://developer.apple.com/programs/whats-included/)
- Small Business Program은 전년도 총 proceeds가 `$1M` 이하인 신규·기존 개발자가 신청할 수 있고, 유료 앱과 IAP 수수료를 15%로 낮춘다. 연결된 개발자 계정도 합산된다. [App Store Small Business Program](https://developer.apple.com/app-store/small-business-program/)
- 자동 갱신 구독은 일반적으로 첫 1년 개발자 순매출 비율이 70%, 1년 이후 85%이며 Small Business Program 참여자는 유료 서비스 첫날부터 85%를 받는다. 구독은 지속 가치와 정기 업데이트 비용이 실제로 생긴 뒤 검토한다. [Apple 자동 갱신 구독](https://developer.apple.com/app-store/subscriptions/)
- 대한민국에서 제3자 앱 내 결제를 사용하려면 대한민국 전용 별도 binary, entitlement, 승인된 결제 흐름과 월별 판매 보고가 필요하고 같은 앱에서 Apple IAP와 병행할 수 없다. Apple은 해당 거래에 사용자 결제액의 26% 수수료를 명시한다. Small Business IAP 15%보다 단순히 유리하다고 볼 수 없으므로 초기에는 글로벌 IAP 경로를 우선 검토한다. [대한민국 StoreKit 외부 결제 정책](https://developer.apple.com/kr/support/storekit-external-entitlement-kr/)
- 앱과 제3자 SDK의 데이터 수집 관행은 App Store Connect privacy label에 공개해야 한다. 가능한 한 계정·광고·추적 없는 오프라인 우선 구조는 구현과 신뢰 측면에서 유리하다. [App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/)

아래는 판매 예측이 아니라 가격 민감도 판단을 위한 단순 산식이다. `$29.99` 일회성 구매와 15% 수수료만 가정했으며 세금, 환불, 현지 가격, 마케팅, 지원 비용은 제외한다.

| 누적 유료 구매 | 사용자당 수수료 후 금액 | 수수료 후 누적 금액 |
|---:|---:|---:|
| 1,000 | 약 `$25.49` | 약 `$25.5K` |
| 5,000 | 약 `$25.49` | 약 `$127.5K` |
| 10,000 | 약 `$25.49` | 약 `$254.9K` |

이 표는 니치 앱이 소규모 독립 제품으로는 성립할 수 있지만, 전담 팀과 전면 네이티브 재작성 비용을 자동으로 회수해 주지는 않음을 보여준다.

## 8주 수요 검증 계획

Apple TestFlight는 앱당 최대 10,000명의 외부 테스터와 공개 초대 링크를 지원한다. 초기에는 대규모 모집보다 retopology 경험이 있는 정확한 사용자를 모으는 것이 중요하다. [Apple TestFlight](https://developer.apple.com/testflight/)

### 1~2주: 문제와 가격 검증

- Nomad/ZBrush/Blender 사용자 15~20명 인터뷰
- 기존 retopology 빈도, 현재 도구, iPad로 옮기지 않는 이유, 실패 비용 확인
- `$19.99 / $29.99 / $39.99` 일회성 가격과 구독 거부 이유를 별도로 질문
- landing page에서 `Join iPad beta`와 선호 workflow 수집

### 3~5주: 핵심 흐름 beta

- 실물 iPad 3종 이상에서 reference import부터 export까지 수행
- 기본도형 시작, mouse/keyboard, save/recovery 포함
- 30명 이상의 적합한 테스터에게 동일한 작은 asset 과제 제공
- screen recording보다 성공/실패 사건, crash, export artifact, 소요 시간 중심으로 측정

### 6~8주: 지불 의향과 반복 사용

- 실제 IAP 전 단계의 명확한 가격 화면으로 구매 의향 측정
- 최소 2주간 자발적 재사용과 두 번째 asset 완성 확인
- export한 결과를 Blender/Maya/게임 엔진에서 실제로 사용했는지 확인

### 진행 기준 가설

아래 수치는 확정 KPI가 아니라 투자 결정을 위한 사전 기준이다.

- 적합한 beta 사용자 30명 이상
- 60% 이상이 안내 없이 import 또는 primitive로 첫 작업 시작
- 40% 이상이 첫 asset을 저장·재로드·export까지 완료
- 25% 이상이 2주 안에 두 번째 세션 또는 두 번째 asset 수행
- 완료 사용자 중 20% 이상이 `$29.99` 실제 구매 의향을 보임
- 데이터 손실 0건, 재현 가능한 치명적 카메라/입력 blocker 0건
- 대표 iPad에서 정의한 hard limit 내 성능과 열 안정성 통과

기준을 크게 밑돌면 마케팅 문제가 아니라 문제 빈도, onboarding, 가격, 자동 retopo 대체재 중 무엇이 원인인지 인터뷰로 분리한다.

## 주요 위험과 완화책

| 위험 | 영향 | 완화 |
|---|---|---|
| 수동 retopology 시장이 너무 작음 | 판매 상한이 낮음 | Nomad/ZBrush 사용자를 직접 모집하고 UV/export까지 포함한 workflow 가치로 검증 |
| 자동 remesh 품질 향상 | 수동 작업 필요 감소 | animation/game topology flow, 수정 가능성, 예측 가능성에 집중 |
| 카메라·제스처·저장 불안정 | 신뢰와 리뷰가 급격히 악화 | P0로 승격하고 mouse/keyboard, autosave, crash recovery를 출시 전 hard gate로 설정 |
| 고가 가격 거부 | 전환 저하 | 일회성 중가 가격, 저장 가능한 무료 체험, 가격 실험 |
| WebGL2/WKWebView 성능 한계 | 큰 asset에서 실패 | 실물 프로파일, adaptive quality, worker/WASM, 측정된 병목만 native화 |
| 단순 웹 포장으로 App Review 거절 | 출시 지연 | Files/Pencil/keyboard/share/offline lifecycle 등 네이티브 효용을 명확히 구현 |
| 포맷·축·단위 불일치 | 전문 workflow에서 사용 불가 | round-trip golden corpus와 Blender/Maya/engine 실제 검증 |
| 지원 비용 과소평가 | 니치 매출을 소모 | 지원 기기·포맷 범위를 좁히고 진단 export와 재현 fixture 제공 |

## 최종 의사결정

### 지금 진행할 것

- 웹/Pages 버전에서 첫 작업 시작과 완료 흐름을 닫는다.
- 기본도형, mouse/keyboard 카메라, 저장·복구를 최우선 후속 workstream으로 만든다.
- 실물 iPad/Pencil 검증과 15~20명 문제 인터뷰를 병행한다.
- 기존 코어를 재사용한 네이티브 셸 prototype과 TestFlight beta를 만든다.
- 일회성 Pro 가격을 우선 검증한다.

### 지금 보류할 것

- 전면 Swift/Metal 재작성
- 클라우드 계정·협업·구독을 전제로 한 대규모 backend
- Blender/ZBrush 전체 대체를 목표로 한 기능 확장
- 공개 근거 없이 큰 TAM이나 매출을 가정한 인력 투자

### 한 문장 판단

**OctoPoly는 대중형 3D 앱보다 `iPad sculpt-to-game-ready` 니치 도구로 상용화 가능성이 있으며, 성공 여부는 고급 기능 수가 아니라 첫 작업 시작·카메라·저장·export의 신뢰성과 `$20~40` 일회성 가치 검증에 달려 있다.**

## 출처와 해석 원칙

- 경쟁 앱의 가격·평점·기능은 각 공식 App Store 또는 제품 페이지를 기준일에 확인했다.
- App Store 평점 수는 설치 수, 활성 사용자 수 또는 매출로 환산하지 않았다.
- Apple·IDC 플랫폼 수치는 iPad 시장의 크기와 건전성을 설명할 뿐, retopology 고객 수를 뜻하지 않는다.
- 가격·KPI·단계별 기준은 공개 사실이 아니라 OctoPoly가 검증해야 할 사업 가설이다.
