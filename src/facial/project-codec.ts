import { Inflate, strToU8, zipSync } from "fflate";

import { isVertexMovementModeState, type VertexMovementModeState } from "./movement-mode";
import { isFacialWorkspace } from "./storage";
import type { FacialWorkspace } from "./workspace";
import { isCameraState, type CameraState } from "../viewport/camera";

export const OCTOPOLY_FORMAT = "octopoly";
export const OCTOPOLY_FORMAT_VERSION = 2;
export const OCTOPOLY_PROJECT_FILENAME = "octopoly-project.octopoly";

export const OCTOPOLY_ARCHIVE_LIMITS = Object.freeze({
  archiveBytes: 64 * 1024 * 1024,
  entryCount: 34,
  totalUncompressedBytes: 64 * 1024 * 1024,
  manifestBytes: 4 * 1024 * 1024,
  textureBytes: 16 * 1024 * 1024,
  textureCount: 32,
});

export const OCTOPOLY_DECODED_TEXTURE_LIMITS = Object.freeze({
  dimension: 4096,
  totalPixels: 32 * 1024 * 1024,
});

export type ProjectTextureMimeType = "image/png" | "image/jpeg";

export interface OctopolyProjectTexture {
  readonly modelId: string;
  readonly mimeType: ProjectTextureMimeType;
  readonly originalFilename?: string;
  readonly bytes: Uint8Array;
}

export interface OctopolyProjectSnapshot {
  readonly workspace: FacialWorkspace;
  readonly selectedVertex: number | null;
  readonly movementState: VertexMovementModeState;
  readonly cameraState: CameraState;
  readonly textures: readonly OctopolyProjectTexture[];
}

interface TextureDescriptor {
  readonly modelId: string;
  readonly path: string;
  readonly mimeType: ProjectTextureMimeType;
  readonly originalFilename?: string;
}

interface ProjectManifest {
  readonly format: typeof OCTOPOLY_FORMAT;
  readonly formatVersion: typeof OCTOPOLY_FORMAT_VERSION;
  readonly historyPolicy: "reset-on-load";
  readonly workspace: FacialWorkspace;
  readonly selectedVertex: number | null;
  readonly movementState: VertexMovementModeState;
  readonly cameraState: CameraState;
  readonly textures: readonly TextureDescriptor[];
}

const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_LOCAL_SIGNATURE = 0x04034b50;
const CRC32_TABLE = new Uint32Array(256);
for (let index = 0; index < CRC32_TABLE.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  CRC32_TABLE[index] = value >>> 0;
}

function fail(message: string): never {
  throw new Error(`.octopoly 작업 파일이 올바르지 않습니다: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.hasOwn(value, key))
    && Object.keys(value).every((key) => allowed.has(key));
}

function crc32(bytes: Uint8Array): number {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value = CRC32_TABLE[(value ^ byte) & 0xff]! ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

interface StrictZipEntry {
  readonly name: string;
  readonly crc32: number;
  readonly compression: 0 | 8;
  readonly compressedSize: number;
  readonly originalSize: number;
  readonly flags: number;
  readonly localOffset: number;
  dataOffset?: number;
}

function inflateBounded(data: Uint8Array, limit: number): Uint8Array {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const stream = new Inflate((chunk) => {
    total += chunk.length;
    if (!Number.isSafeInteger(total) || total > limit) fail("압축 해제 크기 제한을 벗어났습니다.");
    chunks.push(chunk.slice());
  });
  if (data.length === 0) {
    stream.push(data, true);
  } else {
    for (let offset = 0; offset < data.length; offset += 1024) {
      const end = Math.min(offset + 1024, data.length);
      stream.push(data.subarray(offset, end), end === data.length);
    }
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function extractStrictZipEntries(archive: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const minimumEocd = 22;
  const earliestEocd = Math.max(0, archive.length - minimumEocd - 0xffff);
  let eocdOffset = -1;
  for (let offset = archive.length - minimumEocd; offset >= earliestEocd; offset -= 1) {
    if (view.getUint32(offset, true) === ZIP_EOCD_SIGNATURE
      && offset + minimumEocd + view.getUint16(offset + 20, true) === archive.length) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) fail("ZIP 압축 중앙 디렉터리가 없습니다.");
  const disk = view.getUint16(eocdOffset + 4, true);
  const centralDisk = view.getUint16(eocdOffset + 6, true);
  const entriesOnDisk = view.getUint16(eocdOffset + 8, true);
  const entryCount = view.getUint16(eocdOffset + 10, true);
  const centralSize = view.getUint32(eocdOffset + 12, true);
  const centralOffset = view.getUint32(eocdOffset + 16, true);
  if (disk !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount
    || entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    fail("ZIP64, 분할 또는 다중 디스크 ZIP은 지원하지 않습니다.");
  }
  if (entryCount === 0 || entryCount > OCTOPOLY_ARCHIVE_LIMITS.entryCount
    || centralOffset + centralSize !== eocdOffset) {
    fail("ZIP 중앙 디렉터리 범위가 올바르지 않습니다.");
  }
  const entries: StrictZipEntry[] = [];
  const names = new Set<string>();
  let offset = centralOffset;
  for (let ordinal = 0; ordinal < entryCount; ordinal += 1) {
    if (offset + 46 > eocdOffset || view.getUint32(offset, true) !== ZIP_CENTRAL_SIGNATURE) {
      fail("ZIP 중앙 디렉터리 항목이 올바르지 않습니다.");
    }
    const flags = view.getUint16(offset + 8, true);
    const compression = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const originalSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const diskStart = view.getUint16(offset + 34, true);
    const localOffset = view.getUint32(offset + 42, true);
    const nextOffset = offset + 46 + nameLength + extraLength + commentLength;
    if (diskStart !== 0) fail("ZIP64, 분할 또는 다중 디스크 ZIP은 지원하지 않습니다.");
    if ((flags & ~(0x8 | 0x800)) !== 0 || (compression !== 0 && compression !== 8)
      || compressedSize === 0xffffffff || originalSize === 0xffffffff
      || nextOffset > eocdOffset || localOffset + 30 > centralOffset) {
      fail("암호화되었거나 지원하지 않는 ZIP 항목입니다.");
    }
    const nameBytes = archive.subarray(offset + 46, offset + 46 + nameLength);
    if (nameBytes.length === 0 || nameBytes.some((byte) => byte > 0x7f)) {
      fail("ZIP 항목 경로 인코딩이 올바르지 않습니다.");
    }
    let name = "";
    for (const byte of nameBytes) name += String.fromCharCode(byte);
    if (names.has(name)) fail("중복된 압축 항목 경로가 있습니다.");
    names.add(name);
    entries.push({
      name,
      crc32: view.getUint32(offset + 16, true),
      compression,
      compressedSize,
      originalSize,
      flags,
      localOffset,
    });
    offset = nextOffset;
  }
  if (offset !== eocdOffset) fail("ZIP 중앙 디렉터리 크기가 일치하지 않습니다.");

  const localOrder = [...entries].sort((left, right) => left.localOffset - right.localOffset);
  if (localOrder[0]?.localOffset !== 0) fail("ZIP 로컬 항목 범위가 올바르지 않습니다.");
  for (let ordinal = 0; ordinal < localOrder.length; ordinal += 1) {
    const entry = localOrder[ordinal]!;
    const boundary = localOrder[ordinal + 1]?.localOffset ?? centralOffset;
    const localOffset = entry.localOffset;
    if (localOffset + 30 > boundary || view.getUint32(localOffset, true) !== ZIP_LOCAL_SIGNATURE) {
      fail("ZIP 로컬 항목이 올바르지 않습니다.");
    }
    const localFlags = view.getUint16(localOffset + 6, true);
    const localCompression = view.getUint16(localOffset + 8, true);
    const nameLength = view.getUint16(localOffset + 26, true);
    const extraLength = view.getUint16(localOffset + 28, true);
    const dataOffset = localOffset + 30 + nameLength + extraLength;
    const dataEnd = dataOffset + entry.compressedSize;
    if (localFlags !== entry.flags || localCompression !== entry.compression || dataEnd > boundary) {
      fail("ZIP 로컬/중앙 메타데이터가 일치하지 않습니다.");
    }
    const localName = archive.subarray(localOffset + 30, localOffset + 30 + nameLength);
    if (localName.length !== entry.name.length
      || localName.some((byte, index) => byte !== entry.name.charCodeAt(index))) {
      fail("ZIP 로컬/중앙 경로가 일치하지 않습니다.");
    }
    if ((entry.flags & 0x8) === 0) {
      if (view.getUint32(localOffset + 14, true) !== entry.crc32) {
        fail("ZIP 항목의 CRC32 무결성 검증에 실패했습니다.");
      }
      if (dataEnd !== boundary
        || view.getUint32(localOffset + 18, true) !== entry.compressedSize
        || view.getUint32(localOffset + 22, true) !== entry.originalSize) {
        fail("ZIP 로컬/중앙 크기가 일치하지 않습니다.");
      }
    } else {
      const localCrc = view.getUint32(localOffset + 14, true);
      const localCompressedSize = view.getUint32(localOffset + 18, true);
      const localOriginalSize = view.getUint32(localOffset + 22, true);
      const localMetadataIsZero = localCrc === 0
        && localCompressedSize === 0
        && localOriginalSize === 0;
      const localMetadataMatches = localCrc === entry.crc32
        && localCompressedSize === entry.compressedSize
        && localOriginalSize === entry.originalSize;
      if (!localMetadataIsZero && !localMetadataMatches) {
        fail("ZIP 로컬/중앙 메타데이터가 일치하지 않습니다.");
      }
      let descriptorOffset = dataEnd;
      if (descriptorOffset + 4 <= boundary && view.getUint32(descriptorOffset, true) === 0x08074b50) {
        descriptorOffset += 4;
      }
      if (descriptorOffset + 12 !== boundary
        || view.getUint32(descriptorOffset, true) !== entry.crc32
        || view.getUint32(descriptorOffset + 4, true) !== entry.compressedSize
        || view.getUint32(descriptorOffset + 8, true) !== entry.originalSize) {
        fail("ZIP data descriptor가 중앙 메타데이터와 일치하지 않습니다.");
      }
    }
    entry.dataOffset = dataOffset;
  }

  const files = new Map<string, Uint8Array>();
  let totalUncompressedBytes = 0;
  for (const entry of entries) {
    const perEntryLimit = entry.name === "manifest.json"
      ? OCTOPOLY_ARCHIVE_LIMITS.manifestBytes
      : OCTOPOLY_ARCHIVE_LIMITS.textureBytes;
    const remaining = OCTOPOLY_ARCHIVE_LIMITS.totalUncompressedBytes - totalUncompressedBytes;
    const limit = Math.min(perEntryLimit, remaining);
    if (entry.originalSize > limit) {
      fail(entry.name === "manifest.json"
        ? "manifest.json 크기 제한을 벗어났습니다."
        : "압축 해제 크기 제한을 벗어났습니다.");
    }
    if (entry.compression === 0 && entry.compressedSize !== entry.originalSize) {
      fail("ZIP 저장 항목의 압축/원본 크기가 일치하지 않습니다.");
    }
    const compressed = archive.subarray(entry.dataOffset!, entry.dataOffset! + entry.compressedSize);
    const bytes = entry.compression === 0
      ? compressed.slice()
      : inflateBounded(compressed, limit);
    if (bytes.length !== entry.originalSize) fail("ZIP 항목의 실제 압축 해제 크기가 일치하지 않습니다.");
    if (crc32(bytes) !== entry.crc32) fail("ZIP 항목의 CRC32 무결성 검증에 실패했습니다.");
    totalUncompressedBytes += bytes.length;
    files.set(entry.name, bytes);
  }
  return files;
}

export function assertSupportedOctopolyVersion(value: unknown): asserts value is typeof OCTOPOLY_FORMAT_VERSION {
  if (value !== OCTOPOLY_FORMAT_VERSION) {
    fail(`지원하지 않는 형식 버전입니다 (${String(value)}).`);
  }
}

function sanitizeOriginalFilename(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const sanitized = value
    .replace(/[\\/\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 255);
  return sanitized || undefined;
}

function validateSelection(workspace: FacialWorkspace, selectedVertex: unknown): asserts selectedVertex is number | null {
  if (selectedVertex === null) return;
  const activeMesh = workspace.meshes.find((mesh) => mesh.id === workspace.activeMeshId)!;
  const vertexCount = activeMesh.geometry.positions.length / 3;
  if (!Number.isInteger(selectedVertex) || (selectedVertex as number) < 0 || (selectedVertex as number) >= vertexCount) {
    fail("선택 정점이 현재 모델 범위를 벗어났습니다.");
  }
}

function validateTextureDescriptor(
  value: unknown,
  workspace: FacialWorkspace,
  ordinal: number,
): TextureDescriptor {
  if (!isRecord(value)
    || !hasExactKeys(value, ["modelId", "path", "mimeType"], ["originalFilename"])
    || typeof value.modelId !== "string"
    || typeof value.path !== "string"
    || (value.mimeType !== "image/png" && value.mimeType !== "image/jpeg")
    || (value.originalFilename !== undefined && typeof value.originalFilename !== "string")) {
    fail("텍스처 메타데이터가 올바르지 않습니다.");
  }
  const expectedExtension = value.mimeType === "image/png" ? "png" : "jpg";
  if (value.path !== `textures/${ordinal}.${expectedExtension}`) {
    fail("텍스처 경로가 안전한 생성 경로가 아닙니다.");
  }
  const mesh = workspace.meshes.find((candidate) => candidate.id === value.modelId);
  if (!mesh) fail("텍스처가 존재하지 않는 모델을 참조합니다.");
  if (!mesh.geometry.uvs || mesh.geometry.uvs.length !== mesh.geometry.positions.length / 3 * 2) {
    fail("텍스처 모델에 완전한 UV 좌표가 없습니다.");
  }
  const originalFilename = sanitizeOriginalFilename(value.originalFilename);
  return {
    modelId: value.modelId,
    path: value.path,
    mimeType: value.mimeType,
    ...(originalFilename ? { originalFilename } : {}),
  };
}

function assertNoDuplicateJsonObjectKeys(text: string): void {
  let index = 0;
  let depth = 0;
  const skipWhitespace = (): void => {
    while (index < text.length && /[\u0009\u000a\u000d\u0020]/.test(text[index]!)) index += 1;
  };
  const parseString = (): string => {
    if (text[index] !== '"') throw new Error("JSON string expected");
    const start = index;
    index += 1;
    while (index < text.length) {
      const code = text.charCodeAt(index);
      if (code === 0x22) {
        index += 1;
        return JSON.parse(text.slice(start, index)) as string;
      }
      if (code === 0x5c) {
        index += 1;
        const escape = text[index];
        if (escape === "u") {
          if (!/^[0-9a-fA-F]{4}$/.test(text.slice(index + 1, index + 5))) {
            throw new Error("Invalid JSON unicode escape");
          }
          index += 5;
          continue;
        }
        if (!escape || !'"\\/bfnrt'.includes(escape)) throw new Error("Invalid JSON escape");
        index += 1;
        continue;
      }
      if (code < 0x20) throw new Error("Invalid JSON control character");
      index += 1;
    }
    throw new Error("Unterminated JSON string");
  };
  const enter = (): void => {
    depth += 1;
    if (depth > 256) throw new Error("JSON nesting limit exceeded");
  };
  const leave = (): void => { depth -= 1; };
  const parseValue = (): void => {
    skipWhitespace();
    if (text[index] === "{") {
      parseObject();
      return;
    }
    if (text[index] === "[") {
      parseArray();
      return;
    }
    if (text[index] === '"') {
      parseString();
      return;
    }
    const start = index;
    while (index < text.length && !/[\u0009\u000a\u000d\u0020,\]}]/.test(text[index]!)) index += 1;
    if (start === index) throw new Error("JSON value expected");
    JSON.parse(text.slice(start, index));
  };
  const parseObject = (): void => {
    enter();
    try {
      index += 1;
      skipWhitespace();
      if (text[index] === "}") {
        index += 1;
        return;
      }
      const keys = new Set<string>();
      while (true) {
        skipWhitespace();
        const key = parseString();
        if (keys.has(key)) throw new Error("Duplicate JSON object key");
        keys.add(key);
        skipWhitespace();
        if (text[index] !== ":") throw new Error("JSON colon expected");
        index += 1;
        parseValue();
        skipWhitespace();
        if (text[index] === "}") {
          index += 1;
          return;
        }
        if (text[index] !== ",") throw new Error("JSON comma expected");
        index += 1;
      }
    } finally {
      leave();
    }
  };
  const parseArray = (): void => {
    enter();
    try {
      index += 1;
      skipWhitespace();
      if (text[index] === "]") {
        index += 1;
        return;
      }
      while (true) {
        parseValue();
        skipWhitespace();
        if (text[index] === "]") {
          index += 1;
          return;
        }
        if (text[index] !== ",") throw new Error("JSON comma expected");
        index += 1;
      }
    } finally {
      leave();
    }
  };

  parseValue();
  skipWhitespace();
  if (index !== text.length) throw new Error("Trailing JSON input");
}

function parseManifest(bytes: Uint8Array): ProjectManifest {
  if (bytes.length === 0 || bytes.length > OCTOPOLY_ARCHIVE_LIMITS.manifestBytes) {
    fail("manifest.json 크기 제한을 벗어났습니다.");
  }
  let value: unknown;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    assertNoDuplicateJsonObjectKeys(text);
    value = JSON.parse(text);
  } catch {
    fail("manifest.json을 읽을 수 없습니다.");
  }
  if (!isRecord(value)
    || !hasExactKeys(value, [
      "format", "formatVersion", "historyPolicy", "workspace",
      "selectedVertex", "movementState", "cameraState", "textures",
    ])) fail("manifest.json 스키마가 올바르지 않습니다.");
  if (value.format !== OCTOPOLY_FORMAT) fail("형식 식별자가 일치하지 않습니다.");
  assertSupportedOctopolyVersion(value.formatVersion);
  if (value.historyPolicy !== "reset-on-load") fail("지원하지 않는 편집 기록 정책입니다.");
  const workspace = value.workspace;
  if (!isFacialWorkspace(workspace)) fail("작업 공간 데이터가 올바르지 않습니다.");
  validateSelection(workspace, value.selectedVertex);
  if (!isVertexMovementModeState(value.movementState)) fail("이동 도구 상태가 올바르지 않습니다.");
  if (!isCameraState(value.cameraState)) fail("카메라 상태가 올바르지 않습니다.");
  if (!Array.isArray(value.textures) || value.textures.length > OCTOPOLY_ARCHIVE_LIMITS.textureCount) {
    fail("텍스처 목록 크기 제한을 벗어났습니다.");
  }
  const textures = value.textures.map((texture, ordinal) =>
    validateTextureDescriptor(texture, workspace, ordinal));
  const modelIds = new Set<string>();
  const paths = new Set<string>();
  for (const texture of textures) {
    if (modelIds.has(texture.modelId)) fail("중복된 텍스처 모델 키가 있습니다.");
    if (paths.has(texture.path)) fail("중복된 텍스처 경로가 있습니다.");
    modelIds.add(texture.modelId);
    paths.add(texture.path);
  }
  return {
    format: OCTOPOLY_FORMAT,
    formatVersion: OCTOPOLY_FORMAT_VERSION,
    historyPolicy: "reset-on-load",
    workspace,
    selectedVertex: value.selectedVertex,
    movementState: value.movementState,
    cameraState: value.cameraState,
    textures,
  };
}

export function validateOctopolyTextureBytes(bytes: Uint8Array, mimeType: ProjectTextureMimeType): void {
  if (bytes.length === 0 || bytes.length > OCTOPOLY_ARCHIVE_LIMITS.textureBytes) {
    fail("텍스처 파일 크기 제한을 벗어났습니다.");
  }
  const matchesMime = mimeType === "image/png"
    ? bytes.length >= 8
      && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)
    : bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!matchesMime) fail("텍스처 바이트가 선언된 MIME 형식과 일치하지 않습니다.");
}

export function encodeOctopolyProject(snapshot: OctopolyProjectSnapshot): Uint8Array {
  if (!isFacialWorkspace(snapshot.workspace)) fail("작업 공간 데이터가 올바르지 않습니다.");
  validateSelection(snapshot.workspace, snapshot.selectedVertex);
  if (!isVertexMovementModeState(snapshot.movementState)) fail("이동 도구 상태가 올바르지 않습니다.");
  if (!isCameraState(snapshot.cameraState)) fail("카메라 상태가 올바르지 않습니다.");
  if (snapshot.textures.length > OCTOPOLY_ARCHIVE_LIMITS.textureCount) fail("텍스처가 너무 많습니다.");

  const modelIds = new Set<string>();
  const files: Record<string, Uint8Array> = {};
  let totalTextureBytes = 0;
  const descriptors = snapshot.textures.map((texture, ordinal): TextureDescriptor => {
    if (modelIds.has(texture.modelId)) fail("중복된 텍스처 모델 키가 있습니다.");
    modelIds.add(texture.modelId);
    const mesh = snapshot.workspace.meshes.find((candidate) => candidate.id === texture.modelId);
    if (!mesh) fail("텍스처가 존재하지 않는 모델을 참조합니다.");
    if (!mesh.geometry.uvs || mesh.geometry.uvs.length !== mesh.geometry.positions.length / 3 * 2) {
      fail("텍스처 모델에 완전한 UV 좌표가 없습니다.");
    }
    if (texture.mimeType !== "image/png" && texture.mimeType !== "image/jpeg") {
      fail("PNG 또는 JPEG 텍스처만 저장할 수 있습니다.");
    }
    validateOctopolyTextureBytes(texture.bytes, texture.mimeType);
    totalTextureBytes += texture.bytes.length;
    if (totalTextureBytes > OCTOPOLY_ARCHIVE_LIMITS.totalUncompressedBytes) {
      fail("프로젝트의 전체 원본 크기가 너무 큽니다.");
    }
    const extension = texture.mimeType === "image/png" ? "png" : "jpg";
    const path = `textures/${ordinal}.${extension}`;
    files[path] = texture.bytes.slice();
    const originalFilename = sanitizeOriginalFilename(texture.originalFilename);
    return {
      modelId: texture.modelId,
      path,
      mimeType: texture.mimeType,
      ...(originalFilename ? { originalFilename } : {}),
    };
  });
  const manifest: ProjectManifest = {
    format: OCTOPOLY_FORMAT,
    formatVersion: OCTOPOLY_FORMAT_VERSION,
    historyPolicy: "reset-on-load",
    workspace: snapshot.workspace,
    selectedVertex: snapshot.selectedVertex,
    movementState: snapshot.movementState,
    cameraState: snapshot.cameraState,
    textures: descriptors,
  };
  const manifestBytes = strToU8(JSON.stringify(manifest));
  if (manifestBytes.length > OCTOPOLY_ARCHIVE_LIMITS.manifestBytes) fail("manifest.json이 너무 큽니다.");
  if (manifestBytes.length + totalTextureBytes > OCTOPOLY_ARCHIVE_LIMITS.totalUncompressedBytes) {
    fail("프로젝트의 전체 원본 크기가 너무 큽니다.");
  }
  const archive = zipSync({ "manifest.json": manifestBytes, ...files }, { level: 6 });
  if (archive.length > OCTOPOLY_ARCHIVE_LIMITS.archiveBytes) fail("압축 파일이 너무 큽니다.");
  return archive;
}

export function decodeOctopolyProject(input: ArrayBuffer | Uint8Array): OctopolyProjectSnapshot {
  const archive = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (archive.length === 0 || archive.length > OCTOPOLY_ARCHIVE_LIMITS.archiveBytes) {
    fail("압축 파일 크기 제한을 벗어났습니다.");
  }
  let files: Map<string, Uint8Array>;
  try {
    files = extractStrictZipEntries(archive);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(".octopoly")) throw error;
    fail("ZIP 압축을 읽을 수 없습니다.");
  }
  const manifestBytes = files.get("manifest.json");
  if (!manifestBytes) fail("manifest.json이 없습니다.");
  const manifest = parseManifest(manifestBytes);
  const expectedPaths = new Set(["manifest.json", ...manifest.textures.map((texture) => texture.path)]);
  for (const path of files.keys()) {
    if (!expectedPaths.has(path)) fail("참조되지 않은 압축 항목이 있습니다.");
  }
  if (files.size !== expectedPaths.size) fail("참조된 텍스처 파일이 없습니다.");
  const textures = manifest.textures.map((descriptor): OctopolyProjectTexture => {
    const bytes = files.get(descriptor.path);
    if (!bytes) fail("참조된 텍스처 파일이 없습니다.");
    validateOctopolyTextureBytes(bytes, descriptor.mimeType);
    return {
      modelId: descriptor.modelId,
      mimeType: descriptor.mimeType,
      ...(descriptor.originalFilename ? { originalFilename: descriptor.originalFilename } : {}),
      bytes: bytes.slice(),
    };
  });
  return {
    workspace: manifest.workspace,
    selectedVertex: manifest.selectedVertex,
    movementState: manifest.movementState,
    cameraState: manifest.cameraState,
    textures,
  };
}
