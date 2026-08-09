import type {
  ExtensionStateContribution,
  ImageAssetRef,
  OptionalExtension,
  RendererCapabilities,
} from "@octopoly/contracts";
import { describe, expect, it } from "vitest";

import { LOOKDEV_EXTENSION_ID, LOOKDEV_REALTIME_PROVIDER_ID } from "../../../src/extensions/lookdev";
import { MATCAP_EXTENSION_ID, MATCAP_SHADING_PROVIDER_ID } from "../../../src/extensions/matcap";
import {
  TEXTURE_PAINT_EXTENSION_ID,
  TEXTURE_PREVIEW_PROVIDER_ID,
  type TextureImagePixelDecoder,
  type TexturePaintExtension,
} from "../../../src/extensions/texture-paint";
import { UV_EDITOR_EXTENSION_ID } from "../../../src/extensions/uv";
import { createOptionalComposition, defineOptionalManifest } from "../../../src/optional";
import { LOOKDEV_OPTIONAL_MANIFEST_ENTRY } from "../../../src/optional/manifests/lookdev";
import { MATCAP_OPTIONAL_MANIFEST_ENTRY } from "../../../src/optional/manifests/matcap";
import { createTexturePaintManifestEntry } from "../../../src/optional/manifests/texture-paint";
import { UV_OPTIONAL_MANIFEST_ENTRY } from "../../../src/optional/manifests/uv";
import { createContractTestExtensionHost } from "../../../src/optional-sdk";
import {
  PAINT_IMAGE,
  PaintMeshQuery,
  PaintPicking,
  PaintTriangulation,
} from "../../extensions/texture-paint/extension/fixture";
import { PaintHistoryFake } from "../../extensions/texture-paint/session/history-fake";

const CAPABILITIES: RendererCapabilities = Object.freeze({
  backend: "webgl2",
  maxTextureSize: 8192,
  supportsFloatColorBuffer: true,
  applicationTextureBudgetBytes: 512 * 1024 * 1024,
  applicationGpuBudgetBytes: 256 * 1024 * 1024,
});

const DECODER: TextureImagePixelDecoder = Object.freeze({
  async decode(_bitmap: ImageBitmap, ref: ImageAssetRef): Promise<Uint8ClampedArray> {
    return new Uint8ClampedArray(ref.width * ref.height * 4);
  },
});

describe("Full Optional end-to-end lifecycle", () => {
  it("coordinates Texture Preview, Lookdev, and MatCap latest-choice leases and preserves state/images", async () => {
    const history = new PaintHistoryFake();
    const host = createContractTestExtensionHost({
      capabilities: CAPABILITIES,
      images: { importWidth: 256, importHeight: 256 },
      modeling: {
        mesh: new PaintMeshQuery(),
        history,
        picking: new PaintPicking(),
        triangulation: new PaintTriangulation(),
      },
    });
    host.images.seed(PAINT_IMAGE);
    const future: ExtensionStateContribution = Object.freeze({
      schemaVersion: 9,
      data: Object.freeze({ opaque: "preserve" }),
      imageAssets: Object.freeze([PAINT_IMAGE, PAINT_IMAGE]),
    });
    await host.state.load({ "future.extension": future });
    const composition = createOptionalComposition(host, defineOptionalManifest([
      MATCAP_OPTIONAL_MANIFEST_ENTRY,
      createTexturePaintManifestEntry({ pixelDecoder: DECODER }),
      UV_OPTIONAL_MANIFEST_ENTRY,
      LOOKDEV_OPTIONAL_MANIFEST_ENTRY,
    ]));

    const report = await composition.start();
    expect(report.active).toEqual([
      UV_EDITOR_EXTENSION_ID,
      TEXTURE_PAINT_EXTENSION_ID,
      LOOKDEV_EXTENSION_ID,
      MATCAP_EXTENSION_ID,
    ]);
    const paint = composition.extension<TexturePaintExtension>(TEXTURE_PAINT_EXTENSION_ID);
    expect(paint).not.toBeNull();
    await expect(paint!.selectImage(PAINT_IMAGE)).resolves.toMatchObject({ status: "ready" });

    expect(composition.selectShading(TEXTURE_PAINT_EXTENSION_ID).effectiveProviderId)
      .toBe(TEXTURE_PREVIEW_PROVIDER_ID);
    expect(composition.selectShading(LOOKDEV_EXTENSION_ID, [LOOKDEV_REALTIME_PROVIDER_ID]).effectiveProviderId)
      .toBe(LOOKDEV_REALTIME_PROVIDER_ID);
    expect(composition.selectShading(MATCAP_EXTENSION_ID, [MATCAP_SHADING_PROVIDER_ID]).effectiveProviderId)
      .toBe(MATCAP_SHADING_PROVIDER_ID);
    expect(composition.selectShading(TEXTURE_PAINT_EXTENSION_ID).effectiveProviderId)
      .toBe(TEXTURE_PREVIEW_PROVIDER_ID);

    composition.deactivate(LOOKDEV_EXTENSION_ID);
    expect(host.shading.active()).toBe(TEXTURE_PREVIEW_PROVIDER_ID);
    composition.deactivate(TEXTURE_PAINT_EXTENSION_ID);
    expect(host.shading.active()).toBe(MATCAP_SHADING_PROVIDER_ID);

    const saved = host.state.save();
    expect(saved.values["future.extension"]).toEqual(future);
    expect(saved.imageAssets.filter((ref) => ref.id === PAINT_IMAGE.id)).toEqual([PAINT_IMAGE]);
    await host.images.flush(saved.imageAssets);
    expect(host.images.lastFlush()).toEqual(saved.imageAssets);

    composition.dispose();
    expect(composition.resources().every((resource) => resource.total === 0)).toBe(true);
    expect(composition.resources().every((resource) => resource.cleanupErrors.length === 0)).toBe(true);
    history.clear();
  });

  it("isolates partial activation and disposes successful extensions in reverse order", async () => {
    const events: string[] = [];
    const entries = (["uv", "texture-paint", "lookdev", "matcap"] as const).map((feature, index) => ({
      feature,
      create: (): OptionalExtension => trackedExtension(feature, index === 1, events),
    }));
    const host = createContractTestExtensionHost({ capabilities: CAPABILITIES });
    const composition = createOptionalComposition(host, defineOptionalManifest(entries));
    const report = await composition.start();

    expect(report.activations.map((entry) => entry.status)).toEqual([
      "activated", "failed", "activated", "activated",
    ]);
    expect(composition.active()).toEqual(["fixture.uv", "fixture.lookdev", "fixture.matcap"]);
    expect(composition.resources()[1]).toMatchObject({ ownerId: "fixture.texture-paint", total: 0 });
    expect(events.filter((event) => event.startsWith("dispose:"))).toEqual([
      "dispose:texture-paint",
    ]);

    composition.dispose();
    expect(events.filter((event) => event.startsWith("dispose:"))).toEqual([
      "dispose:texture-paint",
      "dispose:matcap",
      "dispose:lookdev",
      "dispose:uv",
    ]);
    expect(composition.resources().every((resource) => resource.total === 0)).toBe(true);
  });
});

function trackedExtension(
  feature: "uv" | "texture-paint" | "lookdev" | "matcap",
  fail: boolean,
  events: string[],
): OptionalExtension {
  return {
    id: `fixture.${feature}`,
    activate(host) {
      events.push(`activate:${feature}`);
      host.tools.register({ id: `fixture.tool.${feature}` });
      return fail
        ? { status: "failed", reason: "fixture activation failure" }
        : { status: "activated" };
    },
    dispose() { events.push(`dispose:${feature}`); },
  };
}
