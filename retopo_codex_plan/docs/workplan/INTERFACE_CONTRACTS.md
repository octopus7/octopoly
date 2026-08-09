# Interface Contracts

## Status

**FROZEN during parallel implementation**

이 문서는 병렬 workstream 사이의 최소 공용 언어와 의존 방향을 정의한다.

## Fundamental IDs

```ts
type VertexId = number;
type EdgeId = number;
type FaceId = number;
type MaterialId = string;
type AssetId = string;
```

## Math

```ts
interface Vec2 {
  x: number;
  y: number;
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface Ray {
  origin: Vec3;
  direction: Vec3;
}
```

## Normalized Pointer Input

```ts
interface PointerSample {
  pointerId: number;
  pointerType: "pen" | "touch" | "mouse";
  x: number;
  y: number;
  pressure: number;
  tiltX: number;
  tiltY: number;
  timestamp: number;
}
```

## Surface Query

```ts
interface SurfaceHit {
  position: Vec3;
  normal: Vec3;
  distance: number;
  faceIndex?: number;
}

interface SurfaceQuery {
  raycast(ray: Ray): SurfaceHit | null;
  nearest?(point: Vec3): SurfaceHit | null;
}
```

## Mesh Read Boundary

```ts
interface MeshSnapshot {
  readonly version: number;
}
```

Concrete storage는 Mesh Kernel이 소유한다.

## Mesh Mutation Boundary

```ts
interface MeshPatch {
  readonly id: string;
}

interface MeshMutationResult {
  patch: MeshPatch;
}
```

외부 module은 Mesh 내부 배열을 직접 수정하지 않는다.

## Selection

```ts
interface SelectionSnapshot {
  vertices: ReadonlySet<VertexId>;
  edges: ReadonlySet<EdgeId>;
  faces: ReadonlySet<FaceId>;
}
```

## Tool Runtime

```ts
interface ToolContext {
  getMesh(): MeshSnapshot;
  getSelection(): SelectionSnapshot;
  requestRender(): void;
}

interface Tool {
  readonly id: string;
  activate?(context: ToolContext): void;
  deactivate?(context: ToolContext): void;
}
```

## History

```ts
interface HistoryTransaction {
  commit(): void;
  rollback(): void;
}

interface HistoryService {
  begin(label: string): HistoryTransaction;
  undo(): void;
  redo(): void;
}
```

## Renderer Extension Boundary

```ts
interface ShadingProvider {
  readonly id: string;
}

interface RenderExtensionRegistry {
  register(provider: ShadingProvider): void;
  unregister(id: string): void;
}
```

Core Renderer는 PBR/MatCap/quality render의 존재를 필수로 알지 않는다.

## Generic Mesh Attributes

UV 등의 optional attribute를 위해 generic storage만 Core boundary에 둔다.

```ts
interface AttributeStore {
  has(name: string): boolean;
  get<T>(name: string): T | undefined;
  set<T>(name: string, value: T): void;
}

interface MeshAttributes {
  vertex: AttributeStore;
  corner: AttributeStore;
  face: AttributeStore;
}
```

`uv0` 등의 구체 semantics는 Optional UV 기능이 소유한다.

## Optional Asset Boundary

```ts
interface ImageAssetRef {
  id: AssetId;
}
```

## Change Request Format

공용 contract 변경이 필요하면 실제 수정 대신 작업 MD에 기록한다.

```md
### Requested contract changes
- 요청:
- 이유:
- 현재 가능한 우회:
- 영향을 받는 작업:
```

실제 변경 여부는 Integration에서 결정한다.
