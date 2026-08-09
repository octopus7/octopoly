import type { ImageAssetEvent, ImageAssetRef } from "@octopoly/contracts";
import { describe, expect, it } from "vitest";

import { ContractTestImageAssetService } from "../../../src/optional-sdk/testkit";

function image(): ImageAssetRef {
  return {
    id: "paint",
    revision: 0,
    width: 4,
    height: 4,
    colorSpace: "linear",
  };
}

describe("ContractTestImageAssetService", () => {
  it("supports synchronous edit revisions and history-style revert/apply", async () => {
    const service = new ContractTestImageAssetService();
    const events: ImageAssetEvent[] = [];
    const base = service.seed(image());
    service.subscribe((event) => { events.push(event); });
    const edit = await service.prepareEdit(base);

    const transient = edit.write({
      x: 1,
      y: 2,
      width: 1,
      height: 1,
      rgba8Premultiplied: new Uint8ClampedArray([1, 2, 3, 4]),
    });
    const result = edit.commit("Paint");

    expect(transient.revision).toBe(1);
    expect(service.current("paint")).toEqual(transient);
    result.change.revert();
    expect(service.current("paint")).toEqual(base);
    result.change.apply();
    expect(service.current("paint")).toEqual(transient);
    expect(events.map((event) => event.kind)).toEqual(["updated", "updated", "updated"]);

    await service.flush([base, transient, transient]);
    expect(service.lastFlush()).toEqual([base, transient, transient]);
    result.change.dispose?.();
    service.dispose();
  });

  it("cancels an uncommitted edit back to the base revision", async () => {
    const service = new ContractTestImageAssetService();
    const base = service.seed(image());
    const edit = await service.prepareEdit(base);
    edit.write({
      x: 0,
      y: 0,
      width: 2,
      height: 1,
      rgba8Premultiplied: new Uint8ClampedArray(8),
    });

    edit.cancel();

    expect(service.current("paint")).toEqual(base);
    expect(() => edit.current()).toThrow(/closed/);
    service.dispose();
  });

  it("rejects stale edits and malformed tile byte lengths before changing revision", async () => {
    const service = new ContractTestImageAssetService();
    const base = service.seed(image());
    const edit = await service.prepareEdit(base);

    expect(() => edit.write({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      rgba8Premultiplied: new Uint8ClampedArray(3),
    })).toThrow(/byte length/);
    expect(service.current("paint")).toEqual(base);

    edit.dispose();
    service.dispose();
  });
});
