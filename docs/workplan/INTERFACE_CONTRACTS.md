# Interface Contracts

## Status and Freeze Gates

이 문서는 병렬 workstream 사이의 공용 언어와 의존 방향을 정의한다.

- `00_BOOTSTRAP`에서 아래 타입을 실제 `src/contracts/**` 소스로 만들고 contract test를 통과시킨다.
- 01~09 Core 병렬 구현은 baseline commit 이후 이 계약을 **FROZEN**으로 취급한다.
- 10~13 Optional 작업은 09 완료 후 Renderer/Extension public SDK가 게시된 commit을 기준으로 시작한다.
- 문서와 실제 contract 소스가 다르면 baseline의 실제 소스가 아니라 **불일치 자체가 오류**다. 임의로 한쪽을
  선택하지 말고 변경 요청을 남긴다.

아래 코드는 저장소의 실제 module path와 export 구성을 정하는 기준이며, workstream별 복사본을 만들지 않는다.

## Global Conventions

- world space는 right-handed, `+Y` up을 사용한다.
- camera forward는 view space `-Z`다.
- 길이 단위는 project unit이며 import/export adapter가 원본 단위를 project unit으로 변환한다.
- screen `x`, `y`는 viewport 좌상단 기준 CSS pixel이다. device pixel 변환은 Renderer만 담당한다.
- `Ray.direction`은 정규화되어야 한다.
- `timestamp`는 `DOMHighResTimeStamp`와 같은 millisecond 단위의 monotonic 값이다.
- public snapshot과 record는 호출자가 수정할 수 없는 immutable value로 취급한다.
- 모든 `dispose()`는 여러 번 호출해도 안전해야 한다.

최대 mesh/texture/GPU budget은 00의 capability 결과로 상수화하고 ADR에 기록한다. 수치 허용오차와
ID/version 증가 규칙은 아래 공용 정책을 사용한다.

## Numeric Tolerance and Integer Policy

```ts
interface NumericTolerancePolicy {
  readonly absoluteDistance: number;
  readonly relativeDistance: number;
  readonly angleRadians: number;
  readonly normalizedVector: number;
  readonly barycentric: number;
  readonly areaScaleFactor: number;
}

const NUMERIC_TOLERANCE_POLICY: Readonly<NumericTolerancePolicy> = Object.freeze({
  absoluteDistance: 1e-9,
  relativeDistance: 1e-9,
  angleRadians: 1e-6,
  normalizedVector: 1e-9,
  barycentric: 1e-7,
  areaScaleFactor: 1e-12,
});

function assertNonNegativeSafeInteger(value: number, label: string): void;
function incrementNonNegativeSafeInteger(value: number, label: string): number;
```

모든 numeric mesh element/triangle ID와 snapshot/document/asset revision 및 version은 non-negative safe
integer다. 생성,
restore 또는 mutation은 입력 ID/version을 `assertNonNegativeSafeInteger`와 같은 규칙으로 먼저 검증한다.
증가가 필요한 구현은 `incrementNonNegativeSafeInteger`를 사용하거나 동일한 선검증을 수행하며
`Number.MAX_SAFE_INTEGER`에서 증가를 시도하면 상태 변경 전에 programmer error로 실패한다.

- `absoluteDistance`: `1e-9` project units
- `relativeDistance`: `1e-9`
- `angleRadians`: `1e-6` radians
- `normalizedVector`: `1e-9`
- `barycentric`: `1e-7`
- `areaScaleFactor`: `1e-12`

정책 객체는 runtime에서 동결되어야 하며 workstream-local epsilon이나 shadow tolerance policy를 만들지
않는다. 실제 비교식, scene-scale 적용, degeneracy 판정은 ADR-0004가 이 이름과 값을 사용해 고정한다.

## Fundamental Types

```ts
type VertexId = number;
type EdgeId = number;
type CornerId = number;
type FaceId = number;
type MaterialId = string;
type AssetId = string;
type ReferenceSurfaceId = string;
type SurfaceTriangleId = number;

type Unsubscribe = () => void;

interface Disposable {
  dispose(): void;
}
```

Mesh element ID는 project session 동안 stable하고 삭제 후 재사용하지 않는다. Reference triangle ID는 해당
reference surface가 rebuild되기 전까지 stable하다.

## Math

```ts
interface Vec2 {
  readonly x: number;
  readonly y: number;
}

interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

interface Vec4 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

interface Mat4 {
  readonly elements: ReadonlyArray<number>; // column-major, length 16
}

interface Ray {
  readonly origin: Vec3;
  readonly direction: Vec3;
}
```

## Normalized Pointer Input

```ts
type PointerKind = "pen" | "touch" | "mouse";
type PointerPhase = "down" | "move" | "up" | "cancel" | "hover";

interface PointerModifiers {
  readonly alt: boolean;
  readonly ctrl: boolean;
  readonly meta: boolean;
  readonly shift: boolean;
}

interface PointerSample {
  readonly pointerId: number;
  readonly pointerType: PointerKind;
  readonly phase: PointerPhase;
  readonly isPrimary: boolean;
  readonly x: number;
  readonly y: number;
  readonly pressure: number; // normalized 0..1
  readonly tiltX: number; // degrees
  readonly tiltY: number; // degrees
  readonly buttons: number;
  readonly modifiers: PointerModifiers;
  readonly timestamp: number;
  readonly coalesced: boolean;
}

interface PointerInputSink {
  dispatch(sample: PointerSample): ToolInputResult;
}
```

Coalesced samples는 원본 event보다 먼저 timestamp 순으로 dispatch한다. `cancel`은 진행 중 preview와 history
transaction을 commit하지 않고 종료해야 한다. Raw `PointerEvent`는 이 계약 밖으로 전달하지 않는다.
DOM input adapter는 dispatch 결과의 capture/release 의도를 같은 `pointerId`의
`setPointerCapture/releasePointerCapture`에 반영하고, lost capture를 normalized `cancel`로 다시 dispatch한다.

## Mesh Read Boundary

```ts
interface VertexRecord {
  readonly id: VertexId;
  readonly position: Vec3;
}

interface EdgeRecord {
  readonly id: EdgeId;
  readonly vertices: readonly [VertexId, VertexId];
}

interface CornerRecord {
  readonly id: CornerId;
  readonly face: FaceId;
  readonly vertex: VertexId;
  readonly edge: EdgeId;
}

interface FaceRecord {
  readonly id: FaceId;
  readonly corners: ReadonlyArray<CornerId>;
}

interface MeshSnapshot {
  readonly version: number;
  readonly vertices: ReadonlyArray<VertexRecord>;
  readonly edges: ReadonlyArray<EdgeRecord>;
  readonly corners: ReadonlyArray<CornerRecord>;
  readonly faces: ReadonlyArray<FaceRecord>;
  readonly attributes: AttributeSnapshot;
}

interface MeshQuery {
  snapshot(): MeshSnapshot;
  vertex(id: VertexId): VertexRecord | null;
  edge(id: EdgeId): EdgeRecord | null;
  corner(id: CornerId): CornerRecord | null;
  face(id: FaceId): FaceRecord | null;
  incidentEdges(vertex: VertexId): ReadonlyArray<EdgeId>;
  incidentFaces(vertex: VertexId): ReadonlyArray<FaceId>;
  adjacentFaces(edge: EdgeId): ReadonlyArray<FaceId>;
  findEdge(a: VertexId, b: VertexId): EdgeId | null;
}

interface TriangleMeshSnapshot {
  readonly version: number;
  readonly positions: ReadonlyArray<Vec3>;
  readonly normals?: ReadonlyArray<Vec3>;
  readonly indices: ReadonlyArray<number>; // triangle list, length % 3 === 0
}
```

Renderer/IO는 immutable `MeshSnapshot`을 사용한다. Selection/Retopo의 topology 알고리즘은 `MeshQuery`를
사용한다. Reference import/Renderer/Surface Engine 사이에는 immutable `TriangleMeshSnapshot`을 사용한다.
외부 module은 Mesh 내부 배열이나 connectivity를 직접 수정하지 않는다.

## Generic Mesh Attributes

```ts
type AttributeDomain = "vertex" | "corner" | "face";
type AttributeValue = number | string | boolean | Vec2 | Vec3 | Vec4 | ReadonlyArray<number>;

interface AttributeKey<T extends AttributeValue> {
  readonly domain: AttributeDomain;
  readonly name: string;
}

interface AttributeSnapshot {
  has<T extends AttributeValue>(key: AttributeKey<T>): boolean;
  get<T extends AttributeValue>(key: AttributeKey<T>, elementId: number): T | undefined;
}
```

Attribute 쓰기는 아래 `MeshCommand`를 통해서만 수행한다. `uv0`, seam 등 구체 semantics는 Optional UV가
소유하며 Core는 이름을 특별 취급하지 않는다.

## Mesh Mutation Boundary

```ts
interface MeshElementSet {
  readonly vertices?: ReadonlyArray<VertexId>;
  readonly edges?: ReadonlyArray<EdgeId>;
  readonly corners?: ReadonlyArray<CornerId>;
  readonly faces?: ReadonlyArray<FaceId>;
}

type MeshCommand =
  | { readonly kind: "createVertex"; readonly position: Vec3 }
  | { readonly kind: "createFace"; readonly vertices: ReadonlyArray<VertexId> }
  | { readonly kind: "setVertexPositions"; readonly positions: ReadonlyMap<VertexId, Vec3> }
  | { readonly kind: "deleteElements"; readonly elements: MeshElementSet }
  | { readonly kind: "splitEdge"; readonly edge: EdgeId; readonly t: number }
  | { readonly kind: "collapseEdge"; readonly edge: EdgeId; readonly keep?: VertexId }
  | { readonly kind: "dissolveEdges"; readonly edges: ReadonlyArray<EdgeId> }
  | { readonly kind: "weldVertices"; readonly vertices: ReadonlyArray<VertexId>; readonly target: Vec3 }
  | { readonly kind: "bridgeEdges"; readonly first: ReadonlyArray<EdgeId>; readonly second: ReadonlyArray<EdgeId> }
  | { readonly kind: "extrudeEdges"; readonly edges: ReadonlyArray<EdgeId>; readonly offset: Vec3 }
  | { readonly kind: "extrudeFaces"; readonly faces: ReadonlyArray<FaceId>; readonly offset: Vec3 }
  | { readonly kind: "rotateDiagonal"; readonly edge: EdgeId }
  | {
      readonly kind: "setAttribute";
      readonly key: AttributeKey<AttributeValue>;
      readonly values: ReadonlyMap<number, AttributeValue | undefined>;
    }
  | { readonly kind: "batch"; readonly commands: ReadonlyArray<MeshCommand> };

interface ReversibleChange {
  readonly id: string;
  readonly label: string;
  apply(): void;
  revert(): void;
  dispose?(): void;
}

interface MeshPatch extends ReversibleChange {
  readonly beforeVersion: number;
  readonly afterVersion: number;
  readonly affected: MeshElementSet;
}

interface MeshMutationResult {
  readonly patch: MeshPatch; // execute()가 이미 forward 적용한 patch
  readonly snapshot: MeshSnapshot;
  readonly created: MeshElementSet;
  readonly updated: MeshElementSet;
  readonly deleted: MeshElementSet;
}

interface MeshMutationService {
  execute(label: string, command: MeshCommand): MeshMutationResult;
  validate(command: MeshCommand): ReadonlyArray<string>;
}

interface MeshDocument extends MeshQuery, MeshMutationService, Disposable {
  serialize(): SerializedMesh;
}

interface MeshFactory {
  createEmpty(): MeshDocument;
  restore(source: SerializedMesh): MeshDocument;
}
```

Mutation은 원자적이다. 실패하면 topology/version/history가 바뀌지 않아야 한다. `batch`는 전체 성공 또는
전체 실패다. MeshPatch의 `apply/revert`는 redo/undo 시 동일한 stable ID와 attribute 상태를 복원한다.
모든 `ReversibleChange`는 생성 또는 최초 execute 단계에서 사용자 입력과 capability를 검증한다. 유효한
lifecycle에서 호출된 `apply/revert`는 원자적이며 예외를 던지지 않는다. 이미 dispose되었거나 기대한
before/after 상태가 아닌 경우 같은 programmer error는 mutation 전에 실패해야 한다. 따라서 History는
유효한 stack state에서 change를 순차 실행해도 부분 적용 보상 절차를 필요로 하지 않는다.
`MeshFactory.restore`는 모든 invariant를 검증한 뒤에만 document를 반환하며 invalid input에서 부분 document를
남기지 않는다. `serialize -> restore -> serialize`는 stable ID, topology, version과 attributes를 보존한다.

## Selection

```ts
type SelectionMode = "replace" | "add" | "subtract" | "toggle";

interface SelectionSnapshot {
  readonly version: number;
  readonly vertices: ReadonlySet<VertexId>;
  readonly edges: ReadonlySet<EdgeId>;
  readonly faces: ReadonlySet<FaceId>;
}

interface SelectionChange {
  readonly vertices?: ReadonlySet<VertexId>;
  readonly edges?: ReadonlySet<EdgeId>;
  readonly faces?: ReadonlySet<FaceId>;
}

interface SelectionService {
  snapshot(): SelectionSnapshot;
  update(mode: SelectionMode, change: SelectionChange): void;
  clear(): void;
  prune(mesh: MeshQuery): void;
  subscribe(listener: (snapshot: SelectionSnapshot) => void): Unsubscribe;
}
```

Loop/ring/grow/shrink 등의 operator는 `MeshQuery`와 selection snapshot을 입력으로 받고
`SelectionChange`를 출력한다.

## Surface Query

```ts
interface SurfaceHit {
  readonly surfaceId: ReferenceSurfaceId;
  readonly triangleId: SurfaceTriangleId;
  readonly position: Vec3;
  readonly normal: Vec3;
  readonly barycentric: Vec3;
  readonly distance: number;
}

interface SurfaceQuery {
  raycast(ray: Ray, maxDistance?: number): SurfaceHit | null;
  nearest(point: Vec3, maxDistance?: number): SurfaceHit | null;
}

interface ReferenceSurface extends Disposable {
  readonly id: ReferenceSurfaceId;
  readonly geometry: TriangleMeshSnapshot; // world-space baked geometry
  readonly query: SurfaceQuery;
}

interface ReferenceSurfaceFactory {
  create(id: ReferenceSurfaceId, geometry: TriangleMeshSnapshot, worldTransform: Mat4): ReferenceSurface;
}
```

Factory의 `geometry` 입력은 project/local space이고 반환된 `ReferenceSurface.geometry`는 `worldTransform`을
적용한 immutable world-space copy다. Renderer와 `SurfaceQuery`는 반드시 이 동일한 baked geometry를
사용한다. `position`과 `normal`은 world space다. `barycentric.x + y + z`는 허용오차 안에서 1이다.
miss는 예외가 아니라 `null`이다.

## Camera, Viewport, and Picking

```ts
interface ViewportSnapshot {
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly devicePixelRatio: number;
}

interface CameraSnapshot {
  readonly view: Mat4;
  readonly projection: Mat4;
  readonly viewProjection: Mat4;
  readonly position: Vec3;
}

type PickKind = "vertex" | "edge" | "face";

interface PickHit {
  readonly kind: PickKind;
  readonly distance: number;
  readonly position: Vec3;
  readonly vertex?: VertexId;
  readonly edge?: EdgeId;
  readonly face?: FaceId;
}

interface PickingService {
  rayFromScreen(point: Vec2, camera: CameraSnapshot, viewport: ViewportSnapshot): Ray;
  pick(
    point: Vec2,
    camera: CameraSnapshot,
    viewport: ViewportSnapshot,
    mesh: MeshSnapshot,
    radiusCssPx: number,
  ): PickHit | null;
}

interface MeshTriangle {
  readonly face: FaceId;
  readonly corners: readonly [CornerId, CornerId, CornerId];
  readonly vertices: readonly [VertexId, VertexId, VertexId];
  readonly positions: readonly [Vec3, Vec3, Vec3];
}

interface MeshTriangleHit extends MeshTriangle {
  readonly meshVersion: number;
  readonly position: Vec3;
  readonly normal: Vec3;
  readonly barycentric: Vec3;
  readonly distance: number;
}

interface MeshTriangulationService {
  triangles(mesh: MeshSnapshot): ReadonlyArray<MeshTriangle>;
  raycast(ray: Ray, mesh: MeshSnapshot, maxDistance?: number): MeshTriangleHit | null;
}
```

Retopo topology picking과 reference surface query는 별도 경계다. Reference hit는 `rayFromScreen`으로 만든
ray를 `SurfaceQuery`에 전달해 얻는다. `pick`은 camera depth와 viewport를 사용해 CSS-pixel 반경을
world/screen distance로 일관되게 평가한다.
`MeshTriangulationService`는 Renderer와 retopo-mesh raycast가 공유하는 유일한 triangulation 경계다.
같은 mesh version에서는 face/corner 순서와 triangle 결과가 stable하며, raycast barycentric은 반환된 세
corner 순서에 대응한다. miss는 `null`이고 degenerate face는 ADR의 결정적 정책에 따라 제외한다.

## History

```ts
interface HistorySnapshot {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoLabel?: string;
  readonly redoLabel?: string;
}

interface HistoryTransaction {
  readonly label: string;
  recordApplied(change: ReversibleChange): void;
  commit(): void;
  rollback(): void;
}

interface HistoryService {
  begin(label: string): HistoryTransaction;
  undo(): void;
  redo(): void;
  clear(): void;
  snapshot(): HistorySnapshot;
  subscribe(listener: (snapshot: HistorySnapshot) => void): Unsubscribe;
}
```

`recordApplied`는 이미 forward 적용된 change를 등록한다. rollback은 등록된 change를 역순으로 revert한다.
commit된 transaction만 undo stack의 한 entry가 된다.

## Tool Runtime

```ts
type OverlayPrimitive =
  | { readonly kind: "points"; readonly positions: ReadonlyArray<Vec3>; readonly color: Vec4; readonly sizeCssPx: number }
  | { readonly kind: "polyline"; readonly positions: ReadonlyArray<Vec3>; readonly color: Vec4; readonly widthCssPx: number }
  | { readonly kind: "triangles"; readonly positions: ReadonlyArray<Vec3>; readonly color: Vec4 };

interface ToolPreview {
  readonly id: string;
  readonly revision: number;
  readonly primitives: ReadonlyArray<OverlayPrimitive>;
}

interface ToolContext {
  readonly mesh: MeshQuery;
  readonly mutations: MeshMutationService;
  readonly selection: SelectionService;
  readonly history: HistoryService;
  readonly surface: SurfaceQuery;
  getCamera(): CameraSnapshot;
  getViewport(): ViewportSnapshot;
  setPreview(preview: ToolPreview | null): void;
  requestRender(): void;
}

interface ToolInputResult {
  readonly handled: boolean;
  readonly capturePointer?: boolean;
  readonly releasePointer?: boolean;
}

interface Tool {
  readonly id: string;
  activate?(context: ToolContext): void;
  deactivate?(context: ToolContext): void;
  pointer?(sample: PointerSample, context: ToolContext): ToolInputResult;
  cancel?(context: ToolContext): void;
}

interface ToolRegistry extends Disposable {
  register(tool: Tool): void;
  unregister(id: string): void;
  activate(id: string): void;
  activateScoped(id: string): Disposable;
  active(): Tool | null;
}
```

Tool runtime이 capture/cancel과 transaction 종료를 단일 책임으로 조정한다. 구체 tool은 raw DOM event나
renderer concrete implementation을 알지 않는다.
`activateScoped`는 active gesture를 공통 cancel 경로로 먼저 종료하고 현재 tool을 보존하는 LIFO lease다.
lease dispose는 자신이 최상위 선택일 때 직전 tool을 복원하며 중간 lease의 비순차 dispose는 현재 tool을
바꾸지 않는다.

## Retopo Engine Boundary

```ts
interface RetopoStrokeInput {
  readonly sample: PointerSample;
  readonly ray: Ray;
  readonly surfaceHit: SurfaceHit | null;
}

type RetopoStep =
  | { readonly kind: "none"; readonly preview?: ToolPreview }
  | { readonly kind: "preview"; readonly preview: ToolPreview }
  | {
      readonly kind: "commit";
      readonly label: string;
      readonly command: MeshCommand;
      readonly preview?: ToolPreview;
    }
  | { readonly kind: "complete" }
  | { readonly kind: "rejected"; readonly reason: string; readonly preview?: ToolPreview };

interface RetopoStrokeSession extends Disposable {
  update(input: RetopoStrokeInput, mesh: MeshQuery): RetopoStep;
  continue(result: MeshMutationResult, mesh: MeshQuery): RetopoStep;
  cancel(): void;
}

interface RetopoEngine {
  begin(): RetopoStrokeSession;
}
```

09 composition은 `down`에서 session을 만들고 각 normalized sample의 screen ray/reference hit를 계산해
`update`에 전달한다. `commit` step을 받으면 열린 history transaction 안에서 command를 실행하고 patch를
`recordApplied`한 뒤 결과를 `continue`에 돌려준다. 다음 `commit` 또는 `complete/rejected`가 나올 때까지
반복하되 00 ADR의 최대 step budget을 넘으면 cancel/rollback한다. 이 staged feedback이 새 stable ID를
후속 face command에 전달하는 유일한 경계다.

Session은 mutation/history/renderer를 직접 호출하지 않는다. `cancel/dispose`는 idempotent하며 이후
`update/continue`는 programmer error로 side effect 전에 실패한다. surface miss나 degenerate stroke는
`none/rejected` 정상 결과이며 임시 topology를 남기지 않는다.

## Renderer Core

Core의 required baseline backend는 WebGL2다. 00 capability spike에서 별도 backend를 채택하더라도 Core
기능은 WebGL2 fallback으로 유지한다.

```ts
interface RendererCapabilities {
  readonly backend: "webgl2" | "webgpu";
  readonly maxTextureSize: number;
  readonly supportsFloatColorBuffer: boolean;
  readonly applicationTextureBudgetBytes: number;
  readonly applicationGpuBudgetBytes: number;
}

type RendererState =
  | "uninitialized"
  | "ready"
  | "context-lost"
  | "unsupported"
  | "failed"
  | "disposed";

type RendererInitResult =
  | { readonly status: "ready"; readonly capabilities: RendererCapabilities }
  | { readonly status: "unsupported"; readonly reason: string }
  | { readonly status: "failed"; readonly reason: string };

interface RenderSceneSnapshot {
  readonly camera: CameraSnapshot;
  readonly viewport: ViewportSnapshot;
  readonly reference?: TriangleMeshSnapshot;
  readonly retopo: MeshSnapshot;
  readonly selection: SelectionSnapshot;
  readonly preview?: ToolPreview;
}

interface RendererService extends Disposable {
  initialize(canvas: HTMLCanvasElement, images?: ImageAssetResolver): Promise<RendererInitResult>;
  state(): RendererState;
  capabilities(): RendererCapabilities | null;
  resize(viewport: ViewportSnapshot): void;
  render(scene: RenderSceneSnapshot): void;
  handleContextLoss(): void;
  restore(): Promise<RendererInitResult>;
}
```

`initialize/restore`의 unsupported와 operational failure는 예외가 아닌 명시적 결과다. `render/resize`는
`ready`에서만 유효하다. `handleContextLoss`는 모든 GPU resource를 무효화하고 `context-lost`로 전환하며,
`restore`는 CPU snapshot/descriptor에서 resource를 재생성한다. invalid lifecycle 호출은 side effect 전에
programmer error로 실패한다. GPU resources와 context loss 복구는 Renderer가 소유한다.
Mesh/Selection/Tool module은 GPU handle을 보관하지 않는다.

## Renderer Extension Boundary

```ts
type UniformValue = number | Vec2 | Vec3 | Vec4 | Mat4 | ReadonlyArray<number> | ImageAssetRef;

interface ShadingProgramDescriptor {
  readonly language: "glsl-es-300" | "wgsl";
  readonly vertexShader: string;
  readonly fragmentShader: string;
  readonly defines?: Readonly<Record<string, string | number | boolean>>;
  readonly attributes?: ReadonlyArray<{
    readonly shaderName: string;
    readonly source: "position" | "normal" | "meshAttribute";
    readonly key?: AttributeKey<AttributeValue>;
  }>;
}

interface ShadingFrameInput {
  readonly scene: RenderSceneSnapshot;
  readonly material?: MaterialId;
}

interface ShadingProvider extends Disposable {
  readonly id: string;
  readonly label: string;
  supports(capabilities: RendererCapabilities): boolean;
  program(): ShadingProgramDescriptor;
  uniforms(input: ShadingFrameInput): Readonly<Record<string, UniformValue>>;
}

type ShadingFailureCode =
  | "missing"
  | "unsupported"
  | "compile-failed"
  | "uniforms-failed"
  | "image-unavailable";

interface ShadingCandidateFailure {
  readonly providerId: string;
  readonly code: ShadingFailureCode;
  readonly reason: string;
}

interface ShadingSelectionSnapshot {
  readonly candidates: ReadonlyArray<string>;
  readonly effectiveProviderId: string | null;
  readonly failures: ReadonlyArray<ShadingCandidateFailure>;
}

interface ShadingSelectionLease extends Disposable {
  setCandidates(providerIds: ReadonlyArray<string>): void;
  snapshot(): ShadingSelectionSnapshot;
  subscribe(listener: (snapshot: ShadingSelectionSnapshot) => void): Unsubscribe;
}

interface RenderExtensionRegistry extends Disposable {
  register(provider: ShadingProvider): void;
  unregister(id: string): void;
  get(id: string): ShadingProvider | null;
  list(): ReadonlyArray<ShadingProvider>;
  activateScoped(providerIds: ReadonlyArray<string>): ShadingSelectionLease;
  active(): string | null;
}
```

Renderer가 shader compile/link 실패와 fallback을 처리한다. Optional provider 실패는 Core solid/wireframe
경로를 중단시키지 않는다. `source: "meshAttribute"`는 `key`가 필수이며 누락/incompatible attribute는
provider unsupported 결과로 처리한다. Renderer는 generic corner attribute를 render vertex로 확장하지만
UV/material 같은 이름의 의미를 Core에서 특별 취급하지 않는다.
최상위 lease의 후보를 순서대로 검증하며 첫 usable provider가 `active()`가 된다. 후보가 비었거나 모두
실패하면 Core solid/wireframe을 사용한다. `activateScoped`는 현재 선택을 보존하는 LIFO lease다. lease
dispose 시 자신이 최상위면 직전 lease를 복원하고, 중간 lease가 먼저 dispose되면 현재 선택을 바꾸지 않는다.
Renderer의 missing/supports/compile/uniform/image 결과는 lease snapshot에 게시된다. provider 등록만으로
active mode가 바뀌지 않으며 unregister는 모든 snapshot에서 해당 후보를 failure로 전환한다.

## Assets and Project Boundary

```ts
interface ImageAssetRef {
  readonly id: AssetId;
  readonly revision: number;
  readonly width: number;
  readonly height: number;
  readonly colorSpace: "srgb" | "linear";
}

interface ImageAssetResolver {
  resolve(ref: ImageAssetRef): Promise<ImageBitmap>;
  subscribe(listener: (event: ImageAssetEvent) => void): Unsubscribe;
}

interface ImageRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface ImageTileUpdate extends ImageRect {
  readonly rgba8Premultiplied: Uint8ClampedArray;
}

type ImageAssetEvent =
  | { readonly kind: "updated"; readonly ref: ImageAssetRef; readonly dirty: ReadonlyArray<ImageRect> }
  | { readonly kind: "removed"; readonly id: AssetId };

interface ImageRevisionChange extends ReversibleChange {
  readonly assetId: AssetId;
  readonly before: ImageAssetRef;
  readonly after: ImageAssetRef;
}

interface ImageMutationResult {
  readonly change: ImageRevisionChange; // commit()이 이미 forward 적용한 change
  readonly ref: ImageAssetRef;
}

interface ImageEditSession extends Disposable {
  readonly base: ImageAssetRef;
  current(): ImageAssetRef;
  write(update: ImageTileUpdate): ImageAssetRef;
  commit(label: string): ImageMutationResult;
  cancel(): void;
}

interface ImageAssetService extends ImageAssetResolver, Disposable {
  import(source: Blob): Promise<ImageAssetRef>;
  current(id: AssetId): ImageAssetRef | null;
  prepareEdit(ref: ImageAssetRef): Promise<ImageEditSession>;
  remove(id: AssetId): Promise<void>;
  flush(refs?: ReadonlyArray<ImageAssetRef>): Promise<void>;
}

interface ReferenceAssetRef {
  readonly id: AssetId;
  readonly worldTransform: Mat4;
}

interface ReferenceAssetService extends Disposable {
  create(geometry: TriangleMeshSnapshot, worldTransform: Mat4): Promise<ReferenceAssetRef>;
  resolve(ref: ReferenceAssetRef): Promise<TriangleMeshSnapshot>;
  remove(id: AssetId): Promise<void>;
}

interface SerializedAttribute {
  readonly domain: AttributeDomain;
  readonly name: string;
  readonly entries: ReadonlyArray<readonly [number, AttributeValue]>;
}

interface SerializedMesh {
  readonly version: number;
  readonly vertices: ReadonlyArray<VertexRecord>;
  readonly edges: ReadonlyArray<EdgeRecord>;
  readonly corners: ReadonlyArray<CornerRecord>;
  readonly faces: ReadonlyArray<FaceRecord>;
  readonly attributes: ReadonlyArray<SerializedAttribute>;
}

type JsonValue = null | boolean | number | string | ReadonlyArray<JsonValue> | { readonly [key: string]: JsonValue };

interface ExtensionStateContribution {
  readonly schemaVersion: number;
  readonly data: JsonValue;
  readonly imageAssets?: ReadonlyArray<ImageAssetRef>;
}

interface ProjectDocument {
  readonly schemaVersion: number;
  readonly mesh: SerializedMesh;
  readonly referenceAssets: ReadonlyArray<ReferenceAssetRef>;
  readonly imageAssets: ReadonlyArray<ImageAssetRef>;
  readonly extensionData?: Readonly<Record<string, ExtensionStateContribution>>;
}
```

`ReferenceAssetService.resolve`은 저장된 project/local-space geometry를 반환한다. load 시
`ReferenceSurfaceFactory.create(ref.id, geometry, ref.worldTransform)`를 호출해 query와 render가 공유하는
world-space surface를 재구성한다. Project migration은 이전 schema를 현재 `ProjectDocument`로 변환하며
Optional extension data를 알 수 없다고 삭제하지 않는다.

`prepareEdit`는 decode와 memory reservation을 끝낸 뒤 session을 반환하므로 gesture 중 `write/commit/cancel`은
동기식이다. `write`는 bounds와 byte length를 먼저 검증하고 transient revision을 forward 적용한 뒤 resolver
subscriber에 dirty rect와 함께 알린다. `commit`은 current revision을 seal하고 이미 적용된
`ImageRevisionChange`를 반환한다.
그 change의 `apply/revert`는 retained revision 사이를 동기적으로 전환하고 다시 알린다. `cancel`은 base
revision을 복원한다. Renderer cache key는 `(id, revision)`이며 notification과 context restore에서 resolver를
통해 다시 획득한다. `flush`는 project save 전에 durable writes를 완료하며 실패한 save는 기존 문서를
덮어쓰지 않는다. History가 보유한 before/after revision은 change dispose 전까지 service가 유지한다.

## Optional Extension Composition

```ts
interface NormalizedInputSurfaceOptions {
  readonly touchAction?: "none" | "pan-x" | "pan-y" | "manipulation";
}

interface NormalizedInputSurface extends Disposable {
  viewport(): ViewportSnapshot;
  subscribeViewport(listener: (viewport: ViewportSnapshot) => void): Unsubscribe;
  connect(sink: PointerInputSink): Disposable;
}

interface NormalizedInputSurfaceFactory {
  create(element: HTMLElement, options?: NormalizedInputSurfaceOptions): NormalizedInputSurface;
}

interface ExtensionPanelContext {
  readonly inputSurfaces: NormalizedInputSurfaceFactory;
}

interface ExtensionPanel extends Disposable {
  readonly id: string;
  readonly title: string;
  mount(container: HTMLElement, context: ExtensionPanelContext): void;
}

interface PanelRegistry extends Disposable {
  register(panel: ExtensionPanel): void;
  unregister(id: string): void;
  get(id: string): ExtensionPanel | null;
}

interface RenderExtensionControl {
  capabilities(): RendererCapabilities | null;
  requestRender(): void;
}

interface ModelingExtensionServices {
  readonly mesh: MeshQuery;
  readonly mutations: MeshMutationService;
  readonly selection: SelectionService;
  readonly history: HistoryService;
  readonly picking: PickingService;
  readonly triangulation: MeshTriangulationService;
  getCamera(): CameraSnapshot;
  getViewport(): ViewportSnapshot;
  subscribe(listener: (change: ModelingExtensionChange) => void): Unsubscribe;
}

type ModelingExtensionChangeKind = "document" | "mesh" | "selection" | "camera" | "viewport";

interface ModelingExtensionChange {
  readonly kind: ModelingExtensionChangeKind;
  readonly meshVersion?: number;
}

interface ExtensionStateProvider extends Disposable {
  readonly id: string;
  load(value: ExtensionStateContribution | undefined): void | Promise<void>;
  save(): ExtensionStateContribution | undefined;
}

interface ExtensionStateBundle {
  readonly values: Readonly<Record<string, ExtensionStateContribution>>;
  readonly imageAssets: ReadonlyArray<ImageAssetRef>;
}

interface ExtensionStateRegistry extends Disposable {
  register(provider: ExtensionStateProvider): void;
  unregister(id: string): void;
  load(values: Readonly<Record<string, ExtensionStateContribution>>): Promise<void>;
  save(): ExtensionStateBundle;
}

interface ExtensionHost extends Disposable {
  readonly tools: ToolRegistry;
  readonly shading: RenderExtensionRegistry;
  readonly images: ImageAssetService;
  readonly panels: PanelRegistry;
  readonly renderer: RenderExtensionControl;
  readonly modeling: ModelingExtensionServices;
  readonly state: ExtensionStateRegistry;
}

type ExtensionActivationResult =
  | { readonly status: "activated" }
  | { readonly status: "unsupported"; readonly reason: string }
  | { readonly status: "failed"; readonly reason: string };

interface OptionalExtension extends Disposable {
  readonly id: string;
  activate(host: ExtensionHost): ExtensionActivationResult | Promise<ExtensionActivationResult>;
}

interface ExtensionRuntime extends Disposable {
  activate(extension: OptionalExtension): Promise<ExtensionActivationResult>;
  deactivate(id: string): void;
  active(): ReadonlyArray<string>;
}
```

Core package는 `src/extensions/**`를 import하지 않는다. 별도 optional entrypoint/composition root만 선택한
extension을 import하고 `ExtensionHost`에 등록한다. Optional entrypoint가 없는 build가 기본 Core build다.
Registry의 `unregister/dispose`는 소유한 tool/provider/panel을 정확히 한 번 dispose하며 registry dispose는
idempotent하다. Panel input의 `PointerSample.x/y`는 연결 element 기준 CSS pixel이며 DOM capture/cancel과
viewport update는 Core input adapter와 같은 규칙을 쓴다. disconnect/dispose는 captured pointer를 release하고
마지막 normalized cancel을 전달한다. Modeling facade는 project document 교체 뒤에도 stable하고 `document`
알림은 진행 중 Optional tool/edit session을 cancel시킨다. `ExtensionStateRegistry`는 provider가 없는 unknown
key와 그 image refs도 load/save round trip에서 보존한다. 저장은 state collect -> image ref dedupe ->
`ImageAssetService.flush(refs)` -> atomic project commit 순서다. `ExtensionRuntime`은 duplicate activation을 거부하고 partial
activation을 역순 정리하며, dispose 시 활성 extension을 역순 dispose한 뒤 host를 dispose한다.
`ExtensionHost.dispose`는 host가 소유한 registry와 asset service를 정리한다.

## Error and Cancellation Policy

- programmer error/invariant 위반은 명시적 exception으로 실패한다.
- user action의 miss, unsupported capability, cancel은 정상 결과로 표현한다.
- mutation/transaction/import/extension activation은 부분 적용 상태를 남기지 않는다.
- async resource는 취소 또는 dispose 후 callback으로 상태를 변경하지 않는다.

## Change Request Format

공용 contract 변경이 필요하면 실제 수정 대신 해당 작업 MD에 기록한다.

```md
### Requested contract changes
- 요청 signature/data shape:
- 이유:
- 현재 가능한 우회:
- 영향을 받는 작업:
- 호환성/마이그레이션 영향:
```

Core 계약 변경은 09 Integration에서 결정한다. 10~13에서 요청한 Optional SDK의 additive 변경은 Core 계약과
Core-only build를 깨지 않는 범위에서 14 Optional Integration이 결정한다.
