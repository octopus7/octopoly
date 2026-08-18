import { unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import {
  decodeOctopolyProject,
  encodeOctopolyProject,
  OCTOPOLY_ARCHIVE_LIMITS,
  type OctopolyProjectSnapshot,
} from "../src/facial/project-codec";
import { duplicateBaseMesh, replaceBaseMesh } from "../src/facial/workspace";

function projectSnapshot(): OctopolyProjectSnapshot {
  const base = replaceBaseMesh({
    version: 1,
    activeMeshId: "base",
    meshes: [],
  }, {
    positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
    indices: [0, 1, 2],
    uvs: [0, 0, 1, 0, 0, 1],
  });
  const workspace = duplicateBaseMesh(base, "unsafe/../copy");
  return {
    workspace,
    selectedVertex: 2,
    movementState: {
      mode: "constrained-plane",
      enabledConstrainedPlanes: ["xy", "xz"],
      activeConstrainedPlane: "xz",
      constrainedPlaneScreenSpace: true,
    },
    textures: [{
      modelId: "unsafe/../copy",
      mimeType: "image/png",
      originalFilename: "../face\u0000.png",
      bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]),
    }],
  };
}

function replaceManifest(
  archive: Uint8Array,
  mutate: (manifest: Record<string, any>) => void,
): Uint8Array {
  const files = unzipSync(archive);
  const manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"])) as Record<string, any>;
  mutate(manifest);
  files["manifest.json"] = new TextEncoder().encode(JSON.stringify(manifest));
  return zipSync(files);
}

describe(".octopoly project codec", () => {
  it("round-trips complete project state and a model-keyed texture through generated ZIP paths", () => {
    const snapshot = projectSnapshot();

    const archive = encodeOctopolyProject(snapshot);
    const zipped = unzipSync(archive);
    const manifest = JSON.parse(new TextDecoder().decode(zipped["manifest.json"]));
    expect(manifest).toMatchObject({
      format: "octopoly",
      formatVersion: 1,
      historyPolicy: "reset-on-load",
    });
    const restored = decodeOctopolyProject(archive);

    expect(restored).toEqual({
      ...snapshot,
      textures: [{
        ...snapshot.textures[0],
        originalFilename: "..face.png",
      }],
    });
    const paths = Object.keys(unzipSync(archive));
    expect(paths).toEqual(["manifest.json", "textures/0.png"]);
    expect(paths.some((path) => path.includes("unsafe") || path.includes("face"))).toBe(false);
  });

  it("rejects texture bytes whose signature does not match the manifest MIME", () => {
    const files = unzipSync(encodeOctopolyProject(projectSnapshot()));
    files["textures/0.png"] = new Uint8Array([255, 216, 255, 224]);

    expect(() => decodeOctopolyProject(zipSync(files))).toThrow(/MIME/);
  });

  it("rejects unsupported project versions before returning workspace state", () => {
    const files = unzipSync(encodeOctopolyProject(projectSnapshot()));
    const manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"]));
    manifest.formatVersion = 2;
    files["manifest.json"] = new TextEncoder().encode(JSON.stringify(manifest));

    expect(() => decodeOctopolyProject(zipSync(files))).toThrow(/지원하지 않는 형식 버전/);
  });

  it("rejects unknown fields at every exact-v1 manifest schema layer", () => {
    const mutations: ((manifest: Record<string, any>) => void)[] = [
      (manifest) => { manifest.history = []; },
      (manifest) => { manifest.workspace.localStorageImageBytes = "data:image/png;base64,..."; },
      (manifest) => { manifest.workspace.meshes[0].futureField = true; },
      (manifest) => { manifest.workspace.meshes[0].geometry.proportionalWeights = []; },
      (manifest) => { manifest.movementState.futureMode = "proportional"; },
      (manifest) => { manifest.textures[0].futureField = true; },
    ];

    for (const mutate of mutations) {
      expect(() => decodeOctopolyProject(replaceManifest(
        encodeOctopolyProject(projectSnapshot()),
        mutate,
      ))).toThrow(/올바르지/);
    }
  });

  it("rejects ZIP preambles and central entries assigned to another disk", () => {
    const source = encodeOctopolyProject(projectSnapshot());
    const withPreamble = new Uint8Array(source.length + 7);
    withPreamble.set(source, 7);
    const preambleView = new DataView(withPreamble.buffer);
    let eocd = -1;
    for (let offset = withPreamble.length - 22; offset >= 0; offset -= 1) {
      if (preambleView.getUint32(offset, true) === 0x06054b50) { eocd = offset; break; }
    }
    const centralOffset = preambleView.getUint32(eocd + 16, true) + 7;
    preambleView.setUint32(eocd + 16, centralOffset, true);
    for (let offset = centralOffset; offset < eocd;) {
      expect(preambleView.getUint32(offset, true)).toBe(0x02014b50);
      preambleView.setUint32(offset + 42, preambleView.getUint32(offset + 42, true) + 7, true);
      offset += 46
        + preambleView.getUint16(offset + 28, true)
        + preambleView.getUint16(offset + 30, true)
        + preambleView.getUint16(offset + 32, true);
    }
    expect(() => decodeOctopolyProject(withPreamble)).toThrow(/ZIP.*범위|로컬/);

    const wrongDisk = source.slice();
    const diskView = new DataView(wrongDisk.buffer, wrongDisk.byteOffset, wrongDisk.byteLength);
    for (let offset = 0; offset <= wrongDisk.length - 46; offset += 1) {
      if (diskView.getUint32(offset, true) === 0x02014b50) {
        diskView.setUint16(offset + 34, 1, true);
        break;
      }
    }
    expect(() => decodeOctopolyProject(wrongDisk)).toThrow(/다중 디스크|분할/);
  });

  it("rejects missing and unexpected ZIP entries", () => {
    const missing = unzipSync(encodeOctopolyProject(projectSnapshot()));
    delete missing["textures/0.png"];
    expect(() => decodeOctopolyProject(zipSync(missing))).toThrow(/텍스처 파일이 없습니다/);

    const unexpected = unzipSync(encodeOctopolyProject(projectSnapshot()));
    unexpected["../escape.txt"] = new Uint8Array([1]);
    expect(() => decodeOctopolyProject(zipSync(unexpected))).toThrow(/참조되지 않은 압축 항목/);
  });

  it("rejects oversized manifests and malformed ZIP bytes within bounded parsing", () => {
    const oversized = zipSync({
      "manifest.json": new Uint8Array(OCTOPOLY_ARCHIVE_LIMITS.manifestBytes + 1),
    });
    expect(() => decodeOctopolyProject(oversized)).toThrow(/manifest.*크기 제한/);
    expect(() => decodeOctopolyProject(new Uint8Array([1, 2, 3, 4]))).toThrow(/ZIP 압축/);
  });

  it("rejects a ZIP entry whose declared CRC32 does not match its decompressed bytes", () => {
    const archive = encodeOctopolyProject(projectSnapshot()).slice();
    const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
    for (let offset = 0; offset <= archive.length - 4; offset += 1) {
      if (view.getUint32(offset, true) === 0x02014b50) {
        view.setUint32(offset + 16, 0, true);
        break;
      }
    }

    expect(() => decodeOctopolyProject(archive)).toThrow(/CRC32 무결성/);
  });

  it("bounds actual inflation when local and central original sizes lie", () => {
    const archive = zipSync({
      "manifest.json": new Uint8Array(OCTOPOLY_ARCHIVE_LIMITS.manifestBytes + 1),
    }).slice();
    const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
    view.setUint32(22, 2, true);
    for (let offset = 0; offset <= archive.length - 4; offset += 1) {
      if (view.getUint32(offset, true) === 0x02014b50) {
        view.setUint32(offset + 24, 2, true);
        break;
      }
    }

    expect(() => decodeOctopolyProject(archive)).toThrow(/압축 해제 크기 제한/);
  });

  it("rejects duplicate manifest JSON member names including escaped equivalents", () => {
    const files = unzipSync(encodeOctopolyProject({ ...projectSnapshot(), textures: [] }));
    const manifest = new TextDecoder().decode(files["manifest.json"]!);
    const duplicated = manifest.replace(
      '"format":"octopoly"',
      '"format":"octopoly","\\u0066ormat":"octopoly"',
    );
    expect(duplicated).not.toBe(manifest);
    files["manifest.json"] = new TextEncoder().encode(duplicated);

    expect(() => decodeOctopolyProject(zipSync(files))).toThrow(/manifest\.json을 읽을 수 없습니다/);
  });

  it("rejects malformed UTF-8 in manifest JSON", () => {
    const files = unzipSync(encodeOctopolyProject({ ...projectSnapshot(), textures: [] }));
    const manifest = files["manifest.json"]!.slice();
    const needle = new TextEncoder().encode("Base Mask");
    const start = manifest.findIndex((_byte, offset) =>
      needle.every((value, index) => manifest[offset + index] === value));
    expect(start).toBeGreaterThanOrEqual(0);
    manifest[start] = 0x80;
    files["manifest.json"] = manifest;

    expect(() => decodeOctopolyProject(zipSync(files))).toThrow(/manifest\.json을 읽을 수 없습니다/);
  });

  it("rejects inconsistent stored-entry sizes before copying payload bytes", () => {
    const snapshot = projectSnapshot();
    const manifestOnly = encodeOctopolyProject({ ...snapshot, textures: [] });
    const manifest = unzipSync(manifestOnly)["manifest.json"]!;
    const archive = zipSync({ "manifest.json": manifest }, { level: 0 }).slice();
    const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
    const local = archive.findIndex((_byte, offset) =>
      offset + 4 <= archive.length && view.getUint32(offset, true) === 0x04034b50);
    const central = archive.findIndex((_byte, offset) =>
      offset + 4 <= archive.length && view.getUint32(offset, true) === 0x02014b50);
    expect(view.getUint16(central + 10, true)).toBe(0);
    view.setUint32(local + 22, 1, true);
    view.setUint32(central + 24, 1, true);
    const originalSlice = Uint8Array.prototype.slice;
    Uint8Array.prototype.slice = function (): Uint8Array<ArrayBuffer> {
      throw new Error("stored payload copied");
    };
    try {
      expect(() => decodeOctopolyProject(archive)).toThrow(/저장.*크기/);
    } finally {
      Uint8Array.prototype.slice = originalSlice;
    }
  });

  it("rejects contradictory nonzero local metadata under a ZIP data descriptor", () => {
    const snapshot = projectSnapshot();
    const archive = encodeOctopolyProject({ ...snapshot, textures: [] });
    const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
    const signatures = (signature: number): number[] => {
      const offsets: number[] = [];
      for (let offset = 0; offset <= archive.length - 4; offset += 1) {
        if (view.getUint32(offset, true) === signature) offsets.push(offset);
      }
      return offsets;
    };
    const local = signatures(0x04034b50)[0]!;
    const oldCentral = signatures(0x02014b50)[0]!;
    const oldEocd = signatures(0x06054b50).at(-1)!;
    const crc = view.getUint32(oldCentral + 16, true);
    const compressedSize = view.getUint32(oldCentral + 20, true);
    const originalSize = view.getUint32(oldCentral + 24, true);
    const mutated = new Uint8Array(archive.length + 12);
    mutated.set(archive.subarray(0, oldCentral));
    const descriptor = new DataView(mutated.buffer, oldCentral, 12);
    descriptor.setUint32(0, crc, true);
    descriptor.setUint32(4, compressedSize, true);
    descriptor.setUint32(8, originalSize, true);
    mutated.set(archive.subarray(oldCentral), oldCentral + 12);
    const mutatedView = new DataView(mutated.buffer);
    const central = oldCentral + 12;
    const eocd = oldEocd + 12;
    mutatedView.setUint16(local + 6, mutatedView.getUint16(local + 6, true) | 0x8, true);
    mutatedView.setUint32(local + 14, crc ^ 1, true);
    mutatedView.setUint32(local + 18, compressedSize + 1, true);
    mutatedView.setUint32(local + 22, originalSize + 1, true);
    mutatedView.setUint16(central + 8, mutatedView.getUint16(central + 8, true) | 0x8, true);
    mutatedView.setUint32(eocd + 16, central, true);

    expect(() => decodeOctopolyProject(mutated)).toThrow(/로컬\/중앙 메타데이터/);
  });

  it("rejects an unexpected __proto__ entry without object-key elision", () => {
    const files = unzipSync(encodeOctopolyProject(projectSnapshot()));
    const archive = zipSync({ ...files, "proto.txt": new Uint8Array([1]) }).slice();
    const source = new TextEncoder().encode("proto.txt");
    const replacement = new TextEncoder().encode("__proto__");
    for (let offset = 0; offset <= archive.length - source.length; offset += 1) {
      if (source.every((byte, index) => archive[offset + index] === byte)) {
        archive.set(replacement, offset);
      }
    }

    expect(() => decodeOctopolyProject(archive)).toThrow(/참조되지 않은 압축 항목/);
  });
});
