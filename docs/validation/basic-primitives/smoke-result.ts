import {
  BACKPACK_RECIPE,
  BICYCLE_SADDLE_RECIPE,
  CAMERA_RECIPE,
  CAR_RECIPE,
  CAT_RECIPE,
  CHAIR_RECIPE,
  COW_RECIPE,
  CUBE_RECIPE,
  CUP_RECIPE,
  DOG_RECIPE,
  DUCK_RECIPE,
  ELEPHANT_RECIPE,
  FISH_RECIPE,
  FLOWERPOT_RECIPE,
  FROG_RECIPE,
  GAMEPAD_RECIPE,
  HELMET_RECIPE,
  KETTLE_RECIPE,
  PIG_RECIPE,
  PLANE_RECIPE,
  RABBIT_RECIPE,
  ROCKET_RECIPE,
  SNEAKER_RECIPE,
  TREASURE_CHEST_RECIPE,
  TURTLE_RECIPE,
  type PrimitiveRecipe,
} from "../../../src/app/composition/primitive-recipes";

export const SMOKE_SCHEMA = "octopoly.basic-primitives.smoke-result/v3";
export const FINGERPRINT_ALGORITHM = "json-fnv1a-dual-v1";

export const CATALOG_SCENARIOS = Object.freeze([
  "plane", "cube", "duck", "frog", "pig", "cow", "rabbit",
  "cat", "dog", "fish", "turtle", "elephant",
  "cup", "chair", "flowerpot", "kettle", "sneaker", "backpack",
  "helmet", "gamepad", "camera", "bicycle-saddle", "car", "rocket", "treasure-chest",
] as const);

export type SmokeScenario = typeof CATALOG_SCENARIOS[number];

const RECIPES: Readonly<Record<SmokeScenario, PrimitiveRecipe>> = Object.freeze({
  plane: PLANE_RECIPE,
  cube: CUBE_RECIPE,
  duck: DUCK_RECIPE,
  frog: FROG_RECIPE,
  pig: PIG_RECIPE,
  cow: COW_RECIPE,
  rabbit: RABBIT_RECIPE,
  cat: CAT_RECIPE,
  dog: DOG_RECIPE,
  fish: FISH_RECIPE,
  turtle: TURTLE_RECIPE,
  elephant: ELEPHANT_RECIPE,
  cup: CUP_RECIPE,
  chair: CHAIR_RECIPE,
  flowerpot: FLOWERPOT_RECIPE,
  kettle: KETTLE_RECIPE,
  sneaker: SNEAKER_RECIPE,
  backpack: BACKPACK_RECIPE,
  helmet: HELMET_RECIPE,
  gamepad: GAMEPAD_RECIPE,
  camera: CAMERA_RECIPE,
  "bicycle-saddle": BICYCLE_SADDLE_RECIPE,
  car: CAR_RECIPE,
  rocket: ROCKET_RECIPE,
  "treasure-chest": TREASURE_CHEST_RECIPE,
});

export interface SmokeMeshCounts {
  readonly vertices: number;
  readonly edges: number;
  readonly corners: number;
  readonly faces: number;
  readonly version: number;
}

export interface SmokeCreationExpectation {
  readonly scenario: SmokeScenario;
  readonly addAction: string;
  readonly addLabel: string;
  readonly counts: Readonly<Omit<SmokeMeshCounts, "version">>;
}

export interface SmokeRendererEvidence {
  readonly state: string;
  readonly width: number;
  readonly height: number;
  readonly readbackBytes: number;
  readonly nonZeroPixels: number;
  readonly nonBackgroundPixels: number;
  readonly distinctSampledColors: number;
  readonly pixelFingerprint: string;
}

export interface SmokeHistoryState {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoLabel: string | null;
  readonly redoLabel: string | null;
}

export interface SmokeHistoryRecord extends SmokeHistoryState {
  readonly action: string;
}

export interface SmokeCheckpoint {
  readonly action: string;
  readonly mesh: SmokeMeshCounts;
  readonly faceIds: readonly number[];
  readonly faceVertexCounts: readonly number[];
  readonly meshFingerprint: string;
  readonly topologyFingerprint: string;
  readonly stableIdFingerprint: string;
  readonly selectedFaceIds: readonly number[];
  readonly frameFinite: boolean;
  readonly frameFingerprint: string | null;
  readonly renderer: SmokeRendererEvidence;
  readonly history: SmokeHistoryState;
}

export type SmokeCheckpointName = "creation" | "undo" | "redo" | "afterMove" | "afterExtrude" | "reload";

export interface ObjExportMetadata {
  readonly byteLength: number;
  readonly vertexCount: number;
  readonly faceCount: number;
  readonly triangleCount: number;
  readonly payloadFingerprint: string;
}

export interface GlbExportMetadata {
  readonly byteLength: number;
  readonly magic: "glTF";
  readonly version: 2;
  readonly declaredLength: number;
  readonly jsonChunkBytes: number;
  readonly primitiveCount: number;
  readonly positionCount: number;
  readonly indexCount: number;
  readonly triangleCount: number;
  readonly payloadFingerprint: string;
}

export interface SmokeVerification {
  readonly scenario: string;
  readonly requiredActions: readonly string[];
  readonly actions: readonly string[];
  readonly checkpoints: Partial<Readonly<Record<SmokeCheckpointName, SmokeCheckpoint>>>;
  readonly historyLabels: readonly SmokeHistoryRecord[];
  readonly fingerprintAlgorithm: string;
  readonly stableIdsAfterReload: boolean | null;
  readonly savedDocumentBytes: number;
  readonly exportSizes: Readonly<{ obj: number; glb: number }>;
  readonly exports: Readonly<{ obj: ObjExportMetadata | null; glb: GlbExportMetadata | null }>;
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
}

export interface SmokeCompletionEvaluation {
  readonly complete: boolean;
  readonly failures: readonly string[];
}

export function scenarioExpectation(scenario: SmokeScenario): SmokeCreationExpectation {
  const recipe = RECIPES[scenario];
  const edges = new Set<string>();
  let corners = 0;
  for (const face of recipe.faces) {
    corners += face.length;
    for (let index = 0; index < face.length; index += 1) {
      const left = face[index]!;
      const right = face[(index + 1) % face.length]!;
      edges.add(left < right ? `${left}:${right}` : `${right}:${left}`);
    }
  }
  return Object.freeze({
    scenario,
    addAction: `add-${scenario}`,
    addLabel: recipe.label,
    counts: Object.freeze({
      vertices: recipe.vertices.length,
      edges: edges.size,
      corners,
      faces: recipe.faces.length,
    }),
  });
}

export function requiredSmokeActions(scenario: SmokeScenario): readonly string[] {
  return Object.freeze([
    `add-${scenario}`,
    "undo",
    "redo",
    "move",
    "extrude",
    "save",
    "reload",
    "export-obj",
    "export-glb",
  ]);
}

export function evaluateSmokeCompletion(value: SmokeVerification): SmokeCompletionEvaluation {
  const failures: string[] = [];
  const scenario = asScenario(value.scenario);
  if (scenario === null) {
    failures.push("scenario is not an authoritative catalog entry");
    return freezeEvaluation(failures);
  }
  const expected = scenarioExpectation(scenario);
  const expectedActions = requiredSmokeActions(scenario);
  if (!sameSequence(value.requiredActions, expectedActions)) failures.push("evidence requiredActions differs from authoritative sequence");
  if (!sameSequence(value.actions, expectedActions)) failures.push("action sequence differs from authoritative sequence");
  if (value.fingerprintAlgorithm !== FINGERPRINT_ALGORITHM) failures.push("fingerprint algorithm provenance is invalid");

  const creation = value.checkpoints.creation;
  const undo = value.checkpoints.undo;
  const redo = value.checkpoints.redo;
  const afterMove = value.checkpoints.afterMove;
  const afterExtrude = value.checkpoints.afterExtrude;
  const reload = value.checkpoints.reload;
  const checkpoints: ReadonlyArray<readonly [SmokeCheckpointName, SmokeCheckpoint | undefined, string]> = [
    ["creation", creation, expected.addAction],
    ["undo", undo, "undo"],
    ["redo", redo, "redo"],
    ["afterMove", afterMove, "move"],
    ["afterExtrude", afterExtrude, "extrude"],
    ["reload", reload, "reload"],
  ];
  for (const [name, checkpoint, action] of checkpoints) {
    if (checkpoint === undefined) {
      failures.push(`missing ${name} checkpoint`);
      continue;
    }
    if (checkpoint.action !== action) failures.push(`${name} checkpoint action is not ${action}`);
    if (!hasValidFingerprints(checkpoint)) failures.push(`${name} checkpoint fingerprints are malformed`);
    if (checkpoint.faceIds.length !== checkpoint.mesh.faces || !isUniqueFiniteIntegerSet(checkpoint.faceIds)) {
      failures.push(`${name} checkpoint face IDs do not match face count`);
    }
    if (!validFaceVertexCounts(checkpoint)) failures.push(`${name} checkpoint face cycles do not match corner/face counts`);
  }

  if (creation !== undefined) {
    if (!matchesExpectedCounts(creation.mesh, expected.counts)) failures.push("creation topology counts do not match authoritative recipe");
    if (!sameIdSet(creation.selectedFaceIds, creation.faceIds)) failures.push("creation selected face IDs differ from created face IDs");
    if (!creation.frameFinite || creation.frameFingerprint === null) failures.push("creation frame is not finite");
    if (!isRenderedCheckpoint(creation.renderer)) failures.push("creation renderer evidence is not non-empty and finite");
    expectHistory(failures, "creation checkpoint", creation.history, history(true, false, expected.addLabel, null));
  }

  if (undo !== undefined) {
    if (!isEmpty(undo.mesh) || undo.faceIds.length !== 0) failures.push("undo did not restore an empty mesh");
    if (undo.selectedFaceIds.length !== 0) failures.push("undo left selected faces");
    if (!isFiniteRenderer(undo.renderer)) failures.push("undo renderer evidence is not finite");
    expectHistory(failures, "undo checkpoint", undo.history, history(false, true, null, expected.addLabel));
  }

  if (creation !== undefined && redo !== undefined) {
    if (!sameTopologyCounts(redo.mesh, creation.mesh)) failures.push("redo topology counts differ from creation");
    if (!sameIdSet(redo.faceIds, creation.faceIds)) failures.push("redo face IDs differ from creation");
    if (redo.meshFingerprint !== creation.meshFingerprint) failures.push("redo exact mesh fingerprint differs from creation");
    if (redo.topologyFingerprint !== creation.topologyFingerprint) failures.push("redo topology fingerprint differs from creation");
    if (redo.stableIdFingerprint !== creation.stableIdFingerprint) failures.push("redo stable-ID fingerprint differs from creation");
    if (!redo.frameFinite || redo.frameFingerprint === null) failures.push("redo frame is not finite");
    if (!isRenderedCheckpoint(redo.renderer)) failures.push("redo renderer evidence is not non-empty and finite");
    expectHistory(failures, "redo checkpoint", redo.history, history(true, false, expected.addLabel, null));
  }

  if (creation !== undefined && afterMove !== undefined) {
    if (!sameTopologyCounts(afterMove.mesh, creation.mesh)) failures.push("Move changed topology counts");
    if (!sameIdSet(afterMove.faceIds, creation.faceIds)) failures.push("Move changed face IDs");
    if (afterMove.topologyFingerprint !== creation.topologyFingerprint) failures.push("Move changed topology fingerprint");
    if (afterMove.meshFingerprint === creation.meshFingerprint) failures.push("Move did not change exact mesh fingerprint");
    if (afterMove.stableIdFingerprint !== creation.stableIdFingerprint) failures.push("Move changed stable IDs");
    if (!sameIdSet(afterMove.selectedFaceIds, creation.faceIds)) failures.push("Move did not preserve created-face selection");
    if (!isRenderedCheckpoint(afterMove.renderer)) failures.push("Move renderer evidence is not non-empty and finite");
    expectHistory(failures, "Move checkpoint", afterMove.history, history(true, false, "Move vertices", null));
  }

  if (afterMove !== undefined && afterExtrude !== undefined) {
    if (!(afterExtrude.mesh.vertices > afterMove.mesh.vertices)) failures.push("Extrude did not add vertices");
    if (!(afterExtrude.mesh.edges > afterMove.mesh.edges)) failures.push("Extrude did not add edges");
    if (!(afterExtrude.mesh.corners > afterMove.mesh.corners)) failures.push("Extrude did not add corners");
    if (!(afterExtrude.mesh.faces > afterMove.mesh.faces)) failures.push("Extrude did not add faces");
    if (afterExtrude.topologyFingerprint === afterMove.topologyFingerprint) failures.push("Extrude did not change topology fingerprint");
    if (afterExtrude.meshFingerprint === afterMove.meshFingerprint) failures.push("Extrude did not change exact mesh fingerprint");
    if (afterExtrude.selectedFaceIds.length === 0) failures.push("Extrude left no selected faces");
    if (!isRenderedCheckpoint(afterExtrude.renderer)) failures.push("Extrude renderer evidence is not non-empty and finite");
    expectHistory(failures, "Extrude checkpoint", afterExtrude.history, history(true, false, "Extrude faces", null));
  }

  if (afterExtrude !== undefined && reload !== undefined) {
    if (!sameTopologyCounts(reload.mesh, afterExtrude.mesh)) failures.push("reload topology counts differ from saved edited mesh");
    if (!sameIdSet(reload.faceIds, afterExtrude.faceIds)) failures.push("reload face IDs differ from saved edited mesh");
    if (reload.meshFingerprint !== afterExtrude.meshFingerprint) failures.push("reload exact mesh fingerprint differs from saved edited mesh");
    if (reload.topologyFingerprint !== afterExtrude.topologyFingerprint) failures.push("reload topology fingerprint differs from saved edited mesh");
    if (reload.stableIdFingerprint !== afterExtrude.stableIdFingerprint) failures.push("reload stable-ID fingerprint differs from saved edited mesh");
    if (!isRenderedCheckpoint(reload.renderer)) failures.push("reload renderer evidence is not non-empty and finite");
    expectHistory(failures, "reload checkpoint", reload.history, history(false, false, null, null));
  }

  validateHistorySequence(failures, value.historyLabels, expected);
  validateExports(failures, value, afterExtrude);
  if (value.stableIdsAfterReload !== true) failures.push("reload did not preserve stable IDs");
  if (!(value.savedDocumentBytes > 0) || !Number.isInteger(value.savedDocumentBytes)) failures.push("saved project evidence is empty or invalid");
  if (value.warnings.length > 0) failures.push("browser warnings were recorded");
  if (value.errors.length > 0) failures.push("browser errors were recorded");
  return freezeEvaluation(failures);
}

export function parseObjExport(payload: string): ObjExportMetadata {
  const vertices: Array<readonly [number, number, number]> = [];
  const faces: number[][] = [];
  for (const [lineIndex, original] of payload.split(/\r?\n/u).entries()) {
    const line = original.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const fields = line.split(/\s+/u);
    if (fields[0] === "v") {
      if (fields.length !== 4) throw new TypeError(`OBJ line ${lineIndex + 1}: vertex must contain exactly three coordinates`);
      const position = fields.slice(1).map(Number);
      if (!position.every(Number.isFinite)) throw new TypeError(`OBJ line ${lineIndex + 1}: vertex is not finite`);
      vertices.push([position[0]!, position[1]!, position[2]!]);
    } else if (fields[0] === "f") {
      if (fields.length < 4) throw new TypeError(`OBJ line ${lineIndex + 1}: face has fewer than three vertices`);
      const indices = fields.slice(1).map((field) => Number(field.split("/")[0]));
      if (!indices.every((index) => Number.isInteger(index) && index > 0)) {
        throw new TypeError(`OBJ line ${lineIndex + 1}: face index is invalid`);
      }
      if (new Set(indices).size !== indices.length) throw new TypeError(`OBJ line ${lineIndex + 1}: face repeats an index`);
      faces.push(indices);
    }
  }
  if (vertices.length === 0 || faces.length === 0) throw new TypeError("OBJ payload has no vertex or face records");
  for (const face of faces) {
    if (face.some((index) => index > vertices.length)) throw new TypeError("OBJ face index exceeds vertex count");
  }
  return Object.freeze({
    byteLength: new TextEncoder().encode(payload).byteLength,
    vertexCount: vertices.length,
    faceCount: faces.length,
    triangleCount: faces.reduce((sum, face) => sum + face.length - 2, 0),
    payloadFingerprint: hashFingerprint(payload),
  });
}

export function parseGlbExport(payload: Uint8Array | ArrayBuffer): GlbExportMetadata {
  const bytes = payload instanceof Uint8Array
    ? new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength)
    : new Uint8Array(payload);
  if (bytes.byteLength < 20) throw new TypeError("GLB payload is shorter than its header and first chunk");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
  if (magic !== "glTF") throw new TypeError("GLB magic is invalid");
  const version = view.getUint32(4, true);
  if (version !== 2) throw new TypeError("GLB version is not 2");
  const declaredLength = view.getUint32(8, true);
  if (declaredLength !== bytes.byteLength) throw new TypeError("GLB declared length differs from payload length");

  let offset = 12;
  let jsonBytes: Uint8Array | null = null;
  let binaryBytes: Uint8Array | null = null;
  while (offset < bytes.byteLength) {
    if (offset + 8 > bytes.byteLength) throw new TypeError("GLB chunk header is truncated");
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    offset += 8;
    if (chunkLength % 4 !== 0 || offset + chunkLength > bytes.byteLength) throw new TypeError("GLB chunk length is invalid");
    const chunk = bytes.subarray(offset, offset + chunkLength);
    if (chunkType === 0x4e4f534a) {
      if (jsonBytes !== null) throw new TypeError("GLB contains duplicate JSON chunks");
      jsonBytes = chunk;
    } else if (chunkType === 0x004e4942) {
      if (binaryBytes !== null) throw new TypeError("GLB contains duplicate BIN chunks");
      binaryBytes = chunk;
    }
    offset += chunkLength;
  }
  if (offset !== bytes.byteLength || jsonBytes === null || binaryBytes === null) throw new TypeError("GLB is missing JSON or BIN structure");
  const jsonText = new TextDecoder().decode(jsonBytes).replace(/[\u0000\u0020]+$/u, "");
  let json: unknown;
  try {
    json = JSON.parse(jsonText);
  } catch {
    throw new TypeError("GLB JSON chunk is invalid");
  }
  const root = objectRecord(json, "GLB JSON root");
  const accessors = objectArray(root.accessors, "GLB accessors");
  const meshes = objectArray(root.meshes, "GLB meshes");
  const buffers = objectArray(root.buffers, "GLB buffers");
  const primitives = meshes.flatMap((mesh, index) => objectArray(mesh.primitives, `GLB mesh ${index} primitives`));
  if (primitives.length !== 1) throw new TypeError("GLB must contain exactly one mesh primitive");
  const primitive = primitives[0]!;
  if (primitive.mode !== undefined && primitive.mode !== 4) throw new TypeError("GLB primitive is not triangles");
  const attributes = objectRecord(primitive.attributes, "GLB primitive attributes");
  const positionAccessorIndex = nonnegativeInteger(attributes.POSITION, "GLB POSITION accessor");
  const indexAccessorIndex = nonnegativeInteger(primitive.indices, "GLB index accessor");
  const positionAccessor = accessors[positionAccessorIndex];
  const indexAccessor = accessors[indexAccessorIndex];
  if (positionAccessor === undefined || indexAccessor === undefined) throw new TypeError("GLB primitive references a missing accessor");
  const positionCount = positiveInteger(positionAccessor.count, "GLB POSITION count");
  const indexCount = positiveInteger(indexAccessor.count, "GLB index count");
  if (indexCount % 3 !== 0) throw new TypeError("GLB index count is not divisible by three");
  const declaredBufferBytes = positiveInteger(buffers[0]?.byteLength, "GLB buffer byteLength");
  if (declaredBufferBytes > binaryBytes.byteLength) throw new TypeError("GLB buffer exceeds BIN chunk");
  return Object.freeze({
    byteLength: bytes.byteLength,
    magic: "glTF",
    version: 2,
    declaredLength,
    jsonChunkBytes: jsonBytes.byteLength,
    primitiveCount: primitives.length,
    positionCount,
    indexCount,
    triangleCount: indexCount / 3,
    payloadFingerprint: hashBytes(bytes),
  });
}

export function hashFingerprint(value: string): string {
  return hashCodes(value.length, (index) => value.charCodeAt(index));
}

function hashBytes(value: Uint8Array): string {
  return hashCodes(value.length, (index) => value[index]!);
}

function hashCodes(length: number, codeAt: (index: number) => number): string {
  let first = 2166136261;
  let second = 3339675911;
  for (let index = 0; index < length; index += 1) {
    const code = codeAt(index);
    first ^= code;
    first = Math.imul(first, 16777619);
    second ^= code;
    second = Math.imul(second, 2246822519);
  }
  return `${length.toString(16)}:${(first >>> 0).toString(16).padStart(8, "0")}:${(second >>> 0).toString(16).padStart(8, "0")}`;
}

function validateExports(failures: string[], value: SmokeVerification, edited: SmokeCheckpoint | undefined): void {
  const obj = value.exports.obj;
  const glb = value.exports.glb;
  if (obj === null) failures.push("OBJ structural metadata is missing");
  if (glb === null) failures.push("GLB structural metadata is missing");
  if (obj === null || glb === null || edited === undefined) return;
  if (!validFingerprint(obj.payloadFingerprint) || !validFingerprint(glb.payloadFingerprint)) failures.push("export payload fingerprints are malformed");
  if (obj.byteLength !== value.exportSizes.obj || obj.byteLength <= 0) failures.push("OBJ byte length differs from parsed payload");
  if (glb.byteLength !== value.exportSizes.glb || glb.byteLength <= 0) failures.push("GLB byte length differs from parsed payload");
  if (obj.vertexCount !== edited.mesh.vertices) failures.push("OBJ vertex count differs from edited mesh");
  const editedTriangleCount = triangulatedFaceCount(edited);
  if (obj.faceCount !== editedTriangleCount) failures.push("OBJ face records differ from edited mesh triangulation");
  if (obj.triangleCount !== editedTriangleCount) failures.push("OBJ triangle count differs from edited mesh triangulation");
  if (glb.magic !== "glTF" || glb.version !== 2 || glb.declaredLength !== glb.byteLength || glb.jsonChunkBytes <= 0 || glb.primitiveCount !== 1) {
    failures.push("GLB structural metadata is invalid");
  }
  if (glb.positionCount !== edited.mesh.vertices) failures.push("GLB POSITION count differs from edited mesh");
  if (glb.indexCount !== glb.triangleCount * 3) failures.push("GLB index count differs from triangle count");
  if (glb.triangleCount !== obj.triangleCount) failures.push("GLB triangle count differs from parsed OBJ triangulation");
}

function validateHistorySequence(
  failures: string[],
  actual: readonly SmokeHistoryRecord[],
  expected: SmokeCreationExpectation,
): void {
  const expectedRecords: readonly SmokeHistoryRecord[] = [
    record(expected.addAction, true, false, expected.addLabel, null),
    record("undo", false, true, null, expected.addLabel),
    record("redo", true, false, expected.addLabel, null),
    record("move", true, false, "Move vertices", null),
    record("extrude", true, false, "Extrude faces", null),
    record("save", true, false, "Extrude faces", null),
    record("reload", false, false, null, null),
    record("export-obj", false, false, null, null),
    record("export-glb", false, false, null, null),
  ];
  if (actual.length !== expectedRecords.length) {
    failures.push("history record count differs from authoritative action sequence");
    return;
  }
  for (let index = 0; index < expectedRecords.length; index += 1) {
    const left = actual[index]!;
    const right = expectedRecords[index]!;
    if (left.action !== right.action || !sameHistory(left, right)) failures.push(`history record ${index} is invalid for ${right.action}`);
  }
}

function expectHistory(failures: string[], label: string, actual: SmokeHistoryState, expected: SmokeHistoryState): void {
  if (!sameHistory(actual, expected)) failures.push(`${label} is invalid`);
}

function history(canUndo: boolean, canRedo: boolean, undoLabel: string | null, redoLabel: string | null): SmokeHistoryState {
  return Object.freeze({ canUndo, canRedo, undoLabel, redoLabel });
}

function record(action: string, canUndo: boolean, canRedo: boolean, undoLabel: string | null, redoLabel: string | null): SmokeHistoryRecord {
  return Object.freeze({ action, canUndo, canRedo, undoLabel, redoLabel });
}

function sameHistory(left: SmokeHistoryState, right: SmokeHistoryState): boolean {
  return left.canUndo === right.canUndo
    && left.canRedo === right.canRedo
    && left.undoLabel === right.undoLabel
    && left.redoLabel === right.redoLabel;
}

function asScenario(value: string): SmokeScenario | null {
  return (CATALOG_SCENARIOS as readonly string[]).includes(value) ? value as SmokeScenario : null;
}

function matchesExpectedCounts(actual: SmokeMeshCounts, expected: Omit<SmokeMeshCounts, "version">): boolean {
  return actual.vertices === expected.vertices
    && actual.edges === expected.edges
    && actual.corners === expected.corners
    && actual.faces === expected.faces;
}

function sameSequence(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((item, index) => item === expected[index]);
}

function isEmpty(mesh: SmokeMeshCounts): boolean {
  return mesh.vertices === 0 && mesh.edges === 0 && mesh.corners === 0 && mesh.faces === 0;
}

function sameTopologyCounts(left: SmokeMeshCounts, right: SmokeMeshCounts): boolean {
  return left.vertices === right.vertices
    && left.edges === right.edges
    && left.corners === right.corners
    && left.faces === right.faces;
}

function sameIdSet(left: readonly number[], right: readonly number[]): boolean {
  if (!isUniqueFiniteIntegerSet(left) || !isUniqueFiniteIntegerSet(right) || left.length !== right.length) return false;
  const sortedLeft = [...left].sort((a, b) => a - b);
  const sortedRight = [...right].sort((a, b) => a - b);
  return sortedLeft.every((item, index) => item === sortedRight[index]);
}

function isUniqueFiniteIntegerSet(values: readonly number[]): boolean {
  return values.every((value) => Number.isSafeInteger(value) && value >= 0) && new Set(values).size === values.length;
}

function validFaceVertexCounts(checkpoint: SmokeCheckpoint): boolean {
  return checkpoint.faceVertexCounts.length === checkpoint.mesh.faces
    && checkpoint.faceVertexCounts.every((count) => Number.isSafeInteger(count) && count >= 3)
    && checkpoint.faceVertexCounts.reduce((sum, count) => sum + count, 0) === checkpoint.mesh.corners;
}

function triangulatedFaceCount(checkpoint: SmokeCheckpoint): number {
  return checkpoint.faceVertexCounts.reduce((sum, count) => sum + count - 2, 0);
}

function hasValidFingerprints(checkpoint: SmokeCheckpoint): boolean {
  return validFingerprint(checkpoint.meshFingerprint)
    && validFingerprint(checkpoint.topologyFingerprint)
    && validFingerprint(checkpoint.stableIdFingerprint);
}

function validFingerprint(value: string): boolean {
  const match = /^([0-9a-f]+):([0-9a-f]{8}):([0-9a-f]{8})$/u.exec(value);
  return match !== null && Number.parseInt(match[1]!, 16) > 0;
}

function isFiniteRenderer(renderer: SmokeRendererEvidence): boolean {
  return renderer.state === "ready"
    && [renderer.width, renderer.height, renderer.readbackBytes, renderer.nonZeroPixels, renderer.nonBackgroundPixels, renderer.distinctSampledColors]
      .every(Number.isFinite)
    && renderer.width > 0
    && renderer.height > 0
    && renderer.readbackBytes > 0
    && renderer.nonZeroPixels > 0
    && /^[0-9a-f]{8}$/u.test(renderer.pixelFingerprint);
}

function isRenderedCheckpoint(renderer: SmokeRendererEvidence): boolean {
  return isFiniteRenderer(renderer)
    && renderer.nonBackgroundPixels > 0
    && renderer.distinctSampledColors > 1;
}

function freezeEvaluation(failures: string[]): SmokeCompletionEvaluation {
  return Object.freeze({ complete: failures.length === 0, failures: Object.freeze(failures) });
}

function objectRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError(`${label} is not an object`);
  return value as Record<string, unknown>;
}

function objectArray(value: unknown, label: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) throw new TypeError(`${label} is not an array`);
  return value.map((item, index) => objectRecord(item, `${label}[${index}]`));
}

function nonnegativeInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) throw new TypeError(`${label} is not a nonnegative integer`);
  return value as number;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0) throw new TypeError(`${label} is not a positive integer`);
  return value as number;
}
