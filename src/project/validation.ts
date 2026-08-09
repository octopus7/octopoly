import {
  assertNonNegativeSafeInteger,
  type AttributeDomain,
  type AttributeValue,
  type ExtensionStateContribution,
  type ImageAssetRef,
  type JsonValue,
  type Mat4,
  type ProjectDocument,
  type ReferenceAssetRef,
  type SerializedAttribute,
  type SerializedMesh,
  type Vec3,
} from "@octopoly/contracts";

export const CURRENT_PROJECT_SCHEMA_VERSION = 2;

type UnknownObject = Record<string, unknown>;

function object(value: unknown, label: string): UnknownObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value as UnknownObject;
}

function array(value: unknown, label: string): ReadonlyArray<unknown> {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return value;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new TypeError(`${label} must be a non-empty string`);
  return value;
}

function integer(value: unknown, label: string): number {
  if (typeof value !== "number") throw new TypeError(`${label} must be a number`);
  assertNonNegativeSafeInteger(value, label);
  return value;
}

function vec3(value: unknown, label: string): Vec3 {
  const source = object(value, label);
  const result = { x: source.x, y: source.y, z: source.z };
  if (![result.x, result.y, result.z].every((entry) => typeof entry === "number" && Number.isFinite(entry))) {
    throw new TypeError(`${label} must contain finite coordinates`);
  }
  return Object.freeze(result as Vec3);
}

function matrix(value: unknown, label: string): Mat4 {
  const elements = array(object(value, label).elements, `${label}.elements`);
  if (elements.length !== 16 || !elements.every((entry) => typeof entry === "number" && Number.isFinite(entry))) {
    throw new TypeError(`${label}.elements must contain 16 finite numbers`);
  }
  return Object.freeze({ elements: Object.freeze(elements as number[]) });
}

function attributeValue(value: unknown, label: string): AttributeValue {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite`);
    return value;
  }
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    if (!value.every((entry) => typeof entry === "number" && Number.isFinite(entry))) throw new TypeError(`${label} array must be finite`);
    return Object.freeze([...value]) as ReadonlyArray<number>;
  }
  const source = object(value, label);
  const x = source.x;
  const y = source.y;
  const z = source.z;
  const w = source.w;
  if (typeof x !== "number" || !Number.isFinite(x) || typeof y !== "number" || !Number.isFinite(y)) {
    throw new TypeError(`${label} is not a supported attribute value`);
  }
  if (z === undefined && w === undefined) return Object.freeze({ x, y });
  if (typeof z !== "number" || !Number.isFinite(z)) throw new TypeError(`${label} is not a supported attribute value`);
  if (w === undefined) return Object.freeze({ x, y, z });
  if (typeof w !== "number" || !Number.isFinite(w)) throw new TypeError(`${label} is not a supported attribute value`);
  return Object.freeze({ x, y, z, w });
}

function serializedMesh(value: unknown): SerializedMesh {
  const source = object(value, "project mesh");
  const version = integer(source.version, "mesh version");
  const vertexIds = new Set<number>();
  const vertices = array(source.vertices, "mesh vertices").map((entry, index) => {
    const record = object(entry, `vertex ${index}`);
    const id = integer(record.id, `vertex ${index} id`);
    if (vertexIds.has(id)) throw new TypeError(`duplicate vertex id ${id}`);
    vertexIds.add(id);
    return Object.freeze({ id, position: vec3(record.position, `vertex ${id} position`) });
  });
  const edgeIds = new Set<number>();
  const edges = array(source.edges, "mesh edges").map((entry, index) => {
    const record = object(entry, `edge ${index}`);
    const id = integer(record.id, `edge ${index} id`);
    if (edgeIds.has(id)) throw new TypeError(`duplicate edge id ${id}`);
    edgeIds.add(id);
    const pair = array(record.vertices, `edge ${id} vertices`);
    if (pair.length !== 2) throw new TypeError(`edge ${id} must have two vertices`);
    const verticesPair = [integer(pair[0], `edge ${id} vertex`), integer(pair[1], `edge ${id} vertex`)] as const;
    if (!vertexIds.has(verticesPair[0]) || !vertexIds.has(verticesPair[1])) throw new TypeError(`edge ${id} references a missing vertex`);
    return Object.freeze({ id, vertices: Object.freeze(verticesPair) });
  });
  const faceIds = new Set<number>();
  const rawFaces = array(source.faces, "mesh faces");
  for (const [index, entry] of rawFaces.entries()) {
    const id = integer(object(entry, `face ${index}`).id, `face ${index} id`);
    if (faceIds.has(id)) throw new TypeError(`duplicate face id ${id}`);
    faceIds.add(id);
  }
  const cornerIds = new Set<number>();
  const cornerFace = new Map<number, number>();
  const corners = array(source.corners, "mesh corners").map((entry, index) => {
    const record = object(entry, `corner ${index}`);
    const id = integer(record.id, `corner ${index} id`);
    if (cornerIds.has(id)) throw new TypeError(`duplicate corner id ${id}`);
    cornerIds.add(id);
    const face = integer(record.face, `corner ${id} face`);
    const vertex = integer(record.vertex, `corner ${id} vertex`);
    const edge = integer(record.edge, `corner ${id} edge`);
    if (!faceIds.has(face) || !vertexIds.has(vertex) || !edgeIds.has(edge)) throw new TypeError(`corner ${id} has a missing reference`);
    cornerFace.set(id, face);
    return Object.freeze({ id, face, vertex, edge });
  });
  const faces = rawFaces.map((entry, index) => {
    const record = object(entry, `face ${index}`);
    const id = integer(record.id, `face ${index} id`);
    const faceCorners = array(record.corners, `face ${id} corners`).map((corner) => integer(corner, `face ${id} corner`));
    if (faceCorners.length < 3 || faceCorners.some((corner) => cornerFace.get(corner) !== id)) {
      throw new TypeError(`face ${id} has invalid corners`);
    }
    return Object.freeze({ id, corners: Object.freeze(faceCorners) });
  });
  const validDomains = new Set<AttributeDomain>(["vertex", "corner", "face"]);
  const attributes: SerializedAttribute[] = array(source.attributes, "mesh attributes").map((entry, index) => {
    const record = object(entry, `attribute ${index}`);
    if (typeof record.domain !== "string" || !validDomains.has(record.domain as AttributeDomain)) throw new TypeError(`attribute ${index} has invalid domain`);
    const domain = record.domain as AttributeDomain;
    const name = string(record.name, `attribute ${index} name`);
    const validIds = domain === "vertex" ? vertexIds : domain === "corner" ? cornerIds : faceIds;
    const entries = array(record.entries, `attribute ${name} entries`).map((entryValue, entryIndex) => {
      const tuple = array(entryValue, `attribute ${name} entry ${entryIndex}`);
      if (tuple.length !== 2) throw new TypeError(`attribute ${name} entry ${entryIndex} must be a pair`);
      const id = integer(tuple[0], `attribute ${name} element id`);
      if (!validIds.has(id)) throw new TypeError(`attribute ${name} references a missing element`);
      return Object.freeze([id, attributeValue(tuple[1], `attribute ${name} value`)] as const);
    });
    return Object.freeze({ domain, name, entries: Object.freeze(entries) });
  });
  return Object.freeze({
    version,
    vertices: Object.freeze(vertices),
    edges: Object.freeze(edges),
    corners: Object.freeze(corners),
    faces: Object.freeze(faces),
    attributes: Object.freeze(attributes),
  });
}

function imageRef(value: unknown, label: string, legacy: boolean): ImageAssetRef {
  const source = object(value, label);
  const colorSpace = source.colorSpace;
  if (colorSpace !== "srgb" && colorSpace !== "linear") throw new TypeError(`${label}.colorSpace is invalid`);
  const width = integer(source.width, `${label}.width`);
  const height = integer(source.height, `${label}.height`);
  if (width === 0 || height === 0) throw new TypeError(`${label} dimensions must be positive`);
  return Object.freeze({
    id: string(source.id, `${label}.id`),
    revision: legacy && source.revision === undefined ? 0 : integer(source.revision, `${label}.revision`),
    width,
    height,
    colorSpace,
  });
}

function jsonValue(value: unknown, label: string): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite`);
    return value;
  }
  if (Array.isArray(value)) return Object.freeze(value.map((entry, index) => jsonValue(entry, `${label}[${index}]`)));
  const source = object(value, label);
  return Object.freeze(Object.fromEntries(Object.entries(source).map(([key, entry]) => [key, jsonValue(entry, `${label}.${key}`)])));
}

function extensionContribution(value: unknown, label: string, legacy: boolean): ExtensionStateContribution {
  const source = object(value, label);
  const imageAssets = source.imageAssets === undefined
    ? undefined
    : Object.freeze(array(source.imageAssets, `${label}.imageAssets`).map((entry, index) => imageRef(entry, `${label}.imageAssets[${index}]`, legacy)));
  const base = { schemaVersion: integer(source.schemaVersion, `${label}.schemaVersion`), data: jsonValue(source.data, `${label}.data`) };
  return imageAssets === undefined ? Object.freeze(base) : Object.freeze({ ...base, imageAssets });
}

function referenceRef(value: unknown, label: string): ReferenceAssetRef {
  const source = object(value, label);
  return Object.freeze({ id: string(source.id, `${label}.id`), worldTransform: matrix(source.worldTransform, `${label}.worldTransform`) });
}

/** Validate and migrate a persisted value without mutating the input. */
export function migrateProjectDocument(value: unknown): ProjectDocument {
  const source = object(value, "project document");
  const schemaVersion = integer(source.schemaVersion, "project schemaVersion");
  if (schemaVersion > CURRENT_PROJECT_SCHEMA_VERSION) throw new TypeError(`Unsupported project schema version ${schemaVersion}`);
  const legacy = schemaVersion < CURRENT_PROJECT_SCHEMA_VERSION;
  const referenceAssets = Object.freeze(array(source.referenceAssets, "project referenceAssets").map((entry, index) => referenceRef(entry, `referenceAssets[${index}]`)));
  const imageAssets = Object.freeze(array(source.imageAssets, "project imageAssets").map((entry, index) => imageRef(entry, `imageAssets[${index}]`, legacy)));
  if (new Set(referenceAssets.map((ref) => ref.id)).size !== referenceAssets.length) throw new TypeError("reference asset ids must be unique");
  if (new Set(imageAssets.map((ref) => ref.id)).size !== imageAssets.length) throw new TypeError("image asset ids must be unique");
  let extensionData: Readonly<Record<string, ExtensionStateContribution>> | undefined;
  if (source.extensionData !== undefined) {
    const raw = object(source.extensionData, "project extensionData");
    extensionData = Object.freeze(Object.fromEntries(Object.entries(raw).map(([key, entry]) => [key, extensionContribution(entry, `extensionData.${key}`, legacy)])));
  }
  const base = {
    schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
    mesh: serializedMesh(source.mesh),
    referenceAssets,
    imageAssets,
  };
  return extensionData === undefined ? Object.freeze(base) : Object.freeze({ ...base, extensionData });
}

export function validateProjectDocument(value: unknown): ProjectDocument {
  const document = migrateProjectDocument(value);
  const originalVersion = object(value, "project document").schemaVersion;
  if (originalVersion !== CURRENT_PROJECT_SCHEMA_VERSION) {
    throw new TypeError(`Expected project schema version ${CURRENT_PROJECT_SCHEMA_VERSION}`);
  }
  return document;
}
