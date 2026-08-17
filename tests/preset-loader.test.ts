import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { parseObjMesh } from "../src/facial/obj";
import { createPresetTextLoader } from "../src/facial/preset-loader";

describe("Facial preset text loader", () => {
  it("keeps the supplied Luna asset byte-identical", () => {
    const asset = readFileSync(resolve(process.cwd(), "public/assets/presets/luna.obj"));

    expect(asset.byteLength).toBe(1_038_090);
    expect(createHash("sha256").update(asset).digest("hex")).toBe(
      "4cb6861d8363bbd5a37afcd317dd7c4a5ab32db5f6d7cc6f8c017a7f09df7c53",
    );
  });

  it("fetches Luna from its same-origin production path and returns its eye object as OBJ text", async () => {
    const source = `
      o Body
      v 0 0 0
      v 1 0 0
      v 0 1 0
      f 1 2 3
      o SKM_Luna.Face.eye
      v 10 0 0
      v 11 0 0
      v 10 1 0
      f 4 5 6
    `;
    const response = {
      ok: true,
      status: 200,
      statusText: "OK",
      text: vi.fn(async () => source),
    };
    const fetchPreset = vi.fn(async () => response);
    const loadPresetText = createPresetTextLoader(fetchPreset);

    const presetSource = await loadPresetText("luna");

    expect(parseObjMesh(presetSource)).toEqual({
      positions: [10, 0, 0, 11, 0, 0, 10, 1, 0],
      indices: [0, 1, 2],
    });
    expect(fetchPreset).toHaveBeenCalledOnce();
    expect(fetchPreset).toHaveBeenCalledWith("/assets/presets/luna.obj");
    expect(response.text).toHaveBeenCalledOnce();
  });

  it("extracts the real Luna eye object for close Facial framing", async () => {
    const source = readFileSync(resolve(process.cwd(), "public/assets/presets/luna.obj"), "utf8");
    const loadPresetText = createPresetTextLoader(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => source,
    }));

    const geometry = parseObjMesh(await loadPresetText("luna"));

    expect(geometry.positions).toHaveLength(130 * 3);
    expect(geometry.indices).toHaveLength(224 * 3);
  });

  it("throws a clear Korean error without reading the body when HTTP fails", async () => {
    const response = {
      ok: false,
      status: 404,
      statusText: "Not Found",
      text: vi.fn(async () => "missing"),
    };
    const fetchPreset = vi.fn(async () => response);
    const loadPresetText = createPresetTextLoader(fetchPreset);

    await expect(loadPresetText("luna")).rejects.toThrow(
      "Luna 프리셋 OBJ를 불러오지 못했습니다. (HTTP 404 Not Found)",
    );
    expect(response.text).not.toHaveBeenCalled();
  });
});
