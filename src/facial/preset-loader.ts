import type { FacialPresetId } from "./panel";
import { parseObjObjectMesh, type ObjMesh } from "./obj";

interface PresetResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  text(): Promise<string>;
}

export type PresetFetch = (url: string) => Promise<PresetResponse>;

const PRESET_PATHS: Readonly<Record<FacialPresetId, string>> = {
  luna: "/assets/presets/luna.obj",
};

const PRESET_NAMES: Readonly<Record<FacialPresetId, string>> = {
  luna: "Luna",
};

const PRESET_OBJECTS: Readonly<Record<FacialPresetId, string>> = {
  luna: "SKM_Luna.Face.eye",
};

function serializeObjMesh(mesh: ObjMesh): string {
  const lines: string[] = [];
  for (let offset = 0; offset < mesh.positions.length; offset += 3) {
    lines.push(`v ${mesh.positions[offset]!} ${mesh.positions[offset + 1]!} ${mesh.positions[offset + 2]!}`);
  }
  for (let offset = 0; offset < mesh.indices.length; offset += 3) {
    lines.push(`f ${mesh.indices[offset]! + 1} ${mesh.indices[offset + 1]! + 1} ${mesh.indices[offset + 2]! + 1}`);
  }
  return `${lines.join("\n")}\n`;
}

export function createPresetTextLoader(fetchPreset: PresetFetch): (preset: FacialPresetId) => Promise<string> {
  return async (preset) => {
    const response = await fetchPreset(PRESET_PATHS[preset]);
    if (!response.ok) {
      const status = [response.status, response.statusText.trim()].filter(Boolean).join(" ");
      throw new Error(`${PRESET_NAMES[preset]} 프리셋 OBJ를 불러오지 못했습니다. (HTTP ${status})`);
    }
    const source = await response.text();
    return serializeObjMesh(parseObjObjectMesh(source, PRESET_OBJECTS[preset]));
  };
}
