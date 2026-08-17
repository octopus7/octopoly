# OctoPoly 후속 구현 로드맵

이 문서는 아직 구현하지 않은 후속 기능의 순서와 제품 계약을 기록한다. 각 단계는 앞 단계와 현재 배포가 안정화된 뒤 별도 작업으로 착수하며, 이 문서에 적혔다는 이유만으로 미리 구현하지 않는다.

## +1차: 작업 모델 텍스처 로드 및 렌더링

- 현재 작업 중인 모델에 texture image를 별도로 load하고 UV를 사용해 WebGL viewport에서 렌더링한다.
- OBJ는 geometry-only 호환 import로 유지하며, texture가 필요한 OBJ는 이 단계에서 별도 texture 선택이 필요함을 명시한다.
- face, wireframe, vertex handle 및 선택 표시와 함께 사용할 때의 표시 우선순위를 정한다.
- 텍스처가 없거나 로드에 실패하면 현재 기본 surface 렌더링을 안전하게 유지한다.
- 첫 구현은 PNG/JPEG를 필수 범위로 하고 WebP 및 KTX2는 compatibility/optimization 단계에서 검토한다.
- GLB에 embedded된 material/texture import는 `+5차`에서 정식 지원한다.

## +2차: 자체 작업 파일 로컬 저장 및 로드

- OctoPoly 전용 **`.octopoly`** 작업 파일 형식을 ZIP 기반 single-file container로 정의한다.
- container는 app metadata와 format version, mesh/edit state 및 texture binary를 함께 보존한다. 내부 representation은 GLB 지원을 선행 조건으로 만들지 않는다.
- 브라우저에서 작업 파일을 로컬 파일로 저장하고 다시 로드할 수 있게 한다.
- 작업 메시와 편집 상태, mesh copy/name, selection, movement/tool 설정 및 이후 확장 가능한 format version을 보존한다.
- texture를 container 안에 embed해 사용자가 project를 다시 열 때 별도 texture 파일을 가져오지 않게 한다.
- 손상되었거나 호환되지 않는 파일은 현재 workspace를 덮어쓰지 않고 fail closed로 보고한다.
- migration 정책과 undo history 포함 범위는 구현 착수 시 확정한다.

## +3차: 범위 기반 smooth multi-vertex 편집

Blender의 Proportional Editing과 유사하게 선택 정점을 중심으로 여러 정점을 부드러운 falloff로 함께 편집한다.

### 편집 동작

- 사용자가 조절 가능한 영향 범위 안의 여러 vertex를 동시에 이동한다.
- 영향 범위 경계는 급격히 끊기지 않고 smooth falloff를 적용한다.
- 영향 radius와 falloff profile을 조절할 수 있게 한다.
- 기존 gizmo, view-plane 및 constrained-plane 이동 transaction과 함께 동작하도록 설계한다.

### 연결성 option

- `Connected only`에 해당하는 option을 제공한다.
- 활성화하면 공간상 가깝더라도 topology상 선택 정점에서 이어지지 않은 vertex는 영향 대상에서 제외한다.
- 비활성화하면 거리와 falloff 기준으로 영향 대상을 계산한다.

### viewport visualization

- 영향 범위와 falloff 경계를 viewport에 독립적인 overlay로 표시한다.
- 카메라와 메시 depth에 묻히지 않으면서도 실제 선택·이동 handle을 방해하지 않게 한다.
- 범위 변경 중에도 어떤 vertex가 어느 정도 영향을 받는지 이해할 수 있는 시각 피드백을 제공한다.

### UI 계약

- viewport에 독립적인 proportional-edit icon을 배치한다.
- icon 자체는 기능 사용 여부를 즉시 전환하는 toggle이다.
- icon 옆 dropdown을 열면 radius, falloff 및 `Connected only` 등 상세 설정을 표시한다.
- toggle 상태와 dropdown의 상세 설정은 접근성 상태와 함께 일관되게 유지한다.

## +4차: 익스포트

편집 결과를 내보낼 때 scope를 명시적으로 선택할 수 있게 한다.

- **전체 익스포트:** immutable Base Mask와 모든 작업 모델을 포함한다.
- **현재 모델만 익스포트:** 현재 active/working model 하나만 포함한다.
- 두 scope는 서로 혼동되지 않는 별도 command로 제공하고, 실행 전 포함 대상을 확인할 수 있게 한다.
- 출력 형식, 여러 모델의 single-file/multi-file 구성, texture embedding 및 filename 정책은 구현 착수 시 확정한다.
- project 작업 상태를 보존하는 `.octopoly` 저장과 외부 도구에서 사용할 모델 익스포트를 구분한다.

## +5차: GLB 임포트·익스포트

glTF Binary(`.glb`)를 정식 교환 형식으로 지원한다.

- **GLB 임포트:** mesh/index, UV, normal, material 및 embedded texture를 읽어 OctoPoly 작업 모델로 가져온다.
- **GLB 익스포트:** geometry, UV, normal, material 및 texture를 하나의 `.glb` 파일에 embed해 내보낸다.
- `+4차`에서 정의한 **전체(Base + 모든 모델)** 또는 **현재 active 모델만** scope를 GLB 익스포트에도 적용한다.
- 여러 node/mesh/primitive와 material이 있는 파일의 workspace mapping은 구현 착수 시 명시적으로 정의한다.
- malformed/unsupported GLB는 현재 workspace를 변경하지 않고 fail closed로 보고한다.
- 임포트→익스포트 round trip에서 geometry, UV, material 및 texture 보존을 검증한다.

## +6차: camera zoom 범위 및 편집 독립성 수정

Luna의 눈을 정밀 편집할 수 있도록 camera가 충분히 근접할 수 있게 하고, geometry 편집이 camera state를 암묵적으로 변경하지 않게 한다.

### 근접 zoom

- Luna의 양쪽 눈 또는 현재 작업 모델이 viewport를 가능한 한 크게 채울 수 있을 정도까지 zoom-in을 허용한다.
- 고정된 과도한 minimum distance 때문에 모델이 작게 남지 않도록 geometry scale, field of view 및 near plane을 기준으로 안전한 최소 거리를 계산한다.
- 최대 근접 상태에서도 near-plane clipping, `NaN` camera state 및 zoom inversion이 발생하지 않게 한다.
- mouse wheel, touch pinch 및 향후 camera zoom control이 같은 clamp를 사용한다.

### camera state 불변 계약

- app/scene의 최초 framing이 끝난 뒤 camera는 명시적인 camera command가 있을 때만 변경한다.
- camera command에는 orbit, pan, zoom, 선택 정점 Focus 및 명시적인 frame/fit 동작만 포함한다.
- vertex 이동, proportional edit, rename, duplicate, selection 변경, persistence publication 및 일반 scene revision은 camera command가 아니다.
- 특히 vertex를 화면 오른쪽 등 먼 위치로 계속 이동해도 camera target, yaw, pitch, distance/zoom이 자동으로 따라가거나 확장되지 않아야 한다.
- geometry bounds/framing metadata와 near/far 안전 범위는 갱신할 수 있지만, 그 갱신이 현재 camera pose 또는 zoom을 변경해서는 안 된다.
- resize/fullscreen은 projection과 viewport만 갱신하며 사용자의 camera pose와 zoom을 보존한다.

### 회귀 검증

- vertex를 여러 번 우측으로 이동한 전후 camera target/yaw/pitch/distance가 정확히 같은지 검증한다.
- orbit/pan/zoom 후 vertex 편집을 반복해도 camera drift가 없는지 검증한다.
- Luna eye geometry가 clipping 없이 viewport를 거의 채우는 근접 zoom 범위를 desktop과 primary iPad 조건에서 검증한다.

## 구현 순서

1. 작업 모델 텍스처 로드 및 렌더링
2. OctoPoly 자체 작업 파일의 로컬 저장 및 로드
3. 범위 기반 smooth multi-vertex 편집과 영향 범위 visualization
4. 전체 또는 현재 작업 모델을 선택하는 익스포트
5. GLB 임포트 및 GLB 익스포트
6. camera 근접 zoom 및 geometry 편집과 camera state의 완전한 분리

각 단계는 별도 RED→GREEN 테스트, production build browser QA, 독립 review 및 배포 검증을 거친다.
