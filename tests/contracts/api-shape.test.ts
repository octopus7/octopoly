import { describe, expect, it } from "vitest";

import type {
  ExtensionStateContribution,
  ImageAssetEvent,
  ImageAssetRef,
  ImageAssetResolver,
  ImageAssetService,
  ImageEditSession,
  ImageMutationResult,
  ImageRect,
  ImageRevisionChange,
  ImageTileUpdate,
  JsonValue,
  ProjectDocument,
  ReferenceAssetRef,
  ReferenceAssetService,
} from "../../src/contracts/assets";
import type {
  CameraSnapshot,
  MeshTriangle,
  MeshTriangleHit,
  MeshTriangulationService,
  PickHit,
  PickKind,
  PickingService,
  ViewportSnapshot,
} from "../../src/contracts/camera";
import type {
  ExtensionActivationResult,
  ExtensionHost,
  ExtensionPanel,
  ExtensionPanelContext,
  ExtensionRuntime,
  ExtensionStateBundle,
  ExtensionStateProvider,
  ExtensionStateRegistry,
  ModelingExtensionChange,
  ModelingExtensionChangeKind,
  ModelingExtensionServices,
  OptionalExtension,
  PanelRegistry,
  RenderExtensionControl,
} from "../../src/contracts/extensions";
import type {
  AssetId,
  CornerId,
  Disposable,
  EdgeId,
  FaceId,
  MaterialId,
  ReferenceSurfaceId,
  SurfaceTriangleId,
  Unsubscribe,
  VertexId,
} from "../../src/contracts/fundamental";
import type { HistoryService, HistorySnapshot, HistoryTransaction } from "../../src/contracts/history";
import type {
  NormalizedInputSurface,
  NormalizedInputSurfaceFactory,
  NormalizedInputSurfaceOptions,
  PointerInputSink,
  PointerKind,
  PointerModifiers,
  PointerPhase,
  PointerSample,
} from "../../src/contracts/input";
import type { Mat4, Ray, Vec2, Vec3, Vec4 } from "../../src/contracts/math";
import type {
  AttributeDomain,
  AttributeKey,
  AttributeSnapshot,
  AttributeValue,
  CornerRecord,
  EdgeRecord,
  FaceRecord,
  MeshCommand,
  MeshDocument,
  MeshElementSet,
  MeshFactory,
  MeshMutationResult,
  MeshMutationService,
  MeshPatch,
  MeshQuery,
  MeshSnapshot,
  ReversibleChange,
  SerializedAttribute,
  SerializedMesh,
  TriangleMeshSnapshot,
  VertexRecord,
} from "../../src/contracts/mesh";
import type { NumericTolerancePolicy } from "../../src/contracts/numeric";
import type {
  RendererCapabilities,
  RendererInitResult,
  RendererService,
  RendererState,
  RenderExtensionRegistry,
  RenderSceneSnapshot,
  ShadingCandidateFailure,
  ShadingFailureCode,
  ShadingFrameInput,
  ShadingProgramDescriptor,
  ShadingProvider,
  ShadingSelectionLease,
  ShadingSelectionSnapshot,
  UniformValue,
} from "../../src/contracts/renderer";
import type {
  RetopoEngine,
  RetopoStep,
  RetopoStrokeInput,
  RetopoStrokeSession,
} from "../../src/contracts/retopo";
import type {
  SelectionChange,
  SelectionMode,
  SelectionService,
  SelectionSnapshot,
} from "../../src/contracts/selection";
import type {
  ReferenceSurface,
  ReferenceSurfaceFactory,
  SurfaceHit,
  SurfaceQuery,
} from "../../src/contracts/surface";
import type {
  OverlayPrimitive,
  Tool,
  ToolContext,
  ToolInputResult,
  ToolPreview,
  ToolRegistry,
} from "../../src/contracts/tools";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? true
    : false;
type Expect<Value extends true> = Value;

type _PointerKinds = Expect<Equal<PointerKind, "pen" | "touch" | "mouse">>;
type _PointerPhases = Expect<Equal<PointerPhase, "down" | "move" | "up" | "cancel" | "hover">>;
type _PickKinds = Expect<Equal<PickKind, "vertex" | "edge" | "face">>;
type _SelectionModes = Expect<Equal<SelectionMode, "replace" | "add" | "subtract" | "toggle">>;
type _AttributeDomains = Expect<Equal<AttributeDomain, "vertex" | "corner" | "face">>;
type _RendererStates = Expect<
  Equal<
    RendererState,
    "uninitialized" | "ready" | "context-lost" | "unsupported" | "failed" | "disposed"
  >
>;
type _ModelingChanges = Expect<
  Equal<ModelingExtensionChangeKind, "document" | "mesh" | "selection" | "camera" | "viewport">
>;
type _PickSignature = Expect<
  Equal<
    Parameters<PickingService["pick"]>,
    [
      point: Vec2,
      camera: CameraSnapshot,
      viewport: ViewportSnapshot,
      mesh: MeshSnapshot,
      radiusCssPx: number,
    ]
  >
>;
type _RaycastParameters = Parameters<MeshTriangulationService["raycast"]>;
type _RaycastRay = Expect<Equal<_RaycastParameters[0], Ray>>;
type _RaycastMesh = Expect<Equal<_RaycastParameters[1], MeshSnapshot>>;
type _RaycastMaxDistance = Expect<Equal<_RaycastParameters[2], number | undefined>>;
type _RaycastResult = Expect<
  Equal<ReturnType<MeshTriangulationService["raycast"]>, MeshTriangleHit | null>
>;
type _RendererInitializeResult = Expect<
  Equal<ReturnType<RendererService["initialize"]>, Promise<RendererInitResult>>
>;
type _RetopoUpdateResult = Expect<Equal<ReturnType<RetopoStrokeSession["update"]>, RetopoStep>>;
type _ImageServiceResolver = Expect<ImageAssetService extends ImageAssetResolver ? true : false>;
type _MeshDocumentBoundaries = Expect<
  MeshDocument extends MeshQuery & MeshMutationService & Disposable ? true : false
>;
type _RegistryDisposable = Expect<RenderExtensionRegistry extends Disposable ? true : false>;
type _ToolRegistryDisposable = Expect<ToolRegistry extends Disposable ? true : false>;

type CanonicalContractTypes = readonly [
  VertexId,
  EdgeId,
  CornerId,
  FaceId,
  MaterialId,
  AssetId,
  ReferenceSurfaceId,
  SurfaceTriangleId,
  Unsubscribe,
  Disposable,
  NumericTolerancePolicy,
  Vec2,
  Vec3,
  Vec4,
  Mat4,
  Ray,
  PointerModifiers,
  PointerSample,
  PointerInputSink,
  NormalizedInputSurfaceOptions,
  NormalizedInputSurface,
  NormalizedInputSurfaceFactory,
  VertexRecord,
  EdgeRecord,
  CornerRecord,
  FaceRecord,
  MeshSnapshot,
  MeshQuery,
  TriangleMeshSnapshot,
  AttributeValue,
  AttributeKey<AttributeValue>,
  AttributeSnapshot,
  MeshElementSet,
  MeshCommand,
  ReversibleChange,
  MeshPatch,
  MeshMutationResult,
  MeshMutationService,
  MeshDocument,
  MeshFactory,
  SerializedAttribute,
  SerializedMesh,
  SelectionSnapshot,
  SelectionChange,
  SelectionService,
  SurfaceHit,
  SurfaceQuery,
  ReferenceSurface,
  ReferenceSurfaceFactory,
  ViewportSnapshot,
  CameraSnapshot,
  PickHit,
  PickingService,
  MeshTriangle,
  MeshTriangleHit,
  MeshTriangulationService,
  HistorySnapshot,
  HistoryTransaction,
  HistoryService,
  OverlayPrimitive,
  ToolPreview,
  ToolContext,
  ToolInputResult,
  Tool,
  ToolRegistry,
  RetopoStrokeInput,
  RetopoStrokeSession,
  RetopoEngine,
  RendererCapabilities,
  RendererInitResult,
  RenderSceneSnapshot,
  RendererService,
  UniformValue,
  ShadingProgramDescriptor,
  ShadingFrameInput,
  ShadingProvider,
  ShadingFailureCode,
  ShadingCandidateFailure,
  ShadingSelectionSnapshot,
  ShadingSelectionLease,
  RenderExtensionRegistry,
  ImageAssetRef,
  ImageAssetResolver,
  ImageRect,
  ImageTileUpdate,
  ImageAssetEvent,
  ImageRevisionChange,
  ImageMutationResult,
  ImageEditSession,
  ImageAssetService,
  ReferenceAssetRef,
  ReferenceAssetService,
  JsonValue,
  ExtensionStateContribution,
  ProjectDocument,
  ExtensionPanelContext,
  ExtensionPanel,
  PanelRegistry,
  RenderExtensionControl,
  ModelingExtensionServices,
  ModelingExtensionChange,
  ExtensionStateProvider,
  ExtensionStateBundle,
  ExtensionStateRegistry,
  ExtensionHost,
  ExtensionActivationResult,
  OptionalExtension,
  ExtensionRuntime,
];

function assertReadonlyShapes(
  mesh: MeshSnapshot,
  sample: PointerSample,
  image: ImageAssetRef,
  project: ProjectDocument,
): void {
  // @ts-expect-error public snapshots are readonly
  mesh.version = 1;
  // @ts-expect-error normalized samples are readonly
  sample.phase = "cancel";
  // @ts-expect-error asset revisions are readonly
  image.revision = 1;
  // @ts-expect-error project schema is readonly
  project.schemaVersion = 1;
}

describe("canonical contract API shapes", () => {
  it("compiles every documented public type from its canonical module", () => {
    const marker: CanonicalContractTypes | null = null;
    expect(marker).toBeNull();
    expect(assertReadonlyShapes).toBeTypeOf("function");
  });
});
