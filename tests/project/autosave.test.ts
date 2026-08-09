import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectAutosave } from "../../src/project/autosave";
import { projectFixture } from "./fixtures";

describe("ProjectAutosave", () => {
  afterEach(() => vi.useRealTimers());

  it("debounces writes and lets the last document win", async () => {
    vi.useFakeTimers();
    const written: number[] = [];
    const autosave = new ProjectAutosave(async (document) => {
      written.push(document.mesh.version);
    }, 50);
    autosave.schedule(projectFixture);
    autosave.schedule({ ...projectFixture, mesh: { ...projectFixture.mesh, version: 4 } });
    await vi.advanceTimersByTimeAsync(50);
    expect(written).toEqual([4]);
    await autosave.flush();
    autosave.dispose();
  });

  it("surfaces write failure and suppresses callbacks after cancel/dispose", async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const autosave = new ProjectAutosave(async () => {
      throw new Error("disk full");
    }, 20, onError);
    autosave.schedule(projectFixture);
    await vi.advanceTimersByTimeAsync(20);
    expect(onError).toHaveBeenCalledOnce();
    await expect(autosave.flush()).rejects.toThrow("disk full");

    const save = vi.fn(async () => undefined);
    const cancelled = new ProjectAutosave(save, 20, onError);
    cancelled.schedule(projectFixture);
    cancelled.cancel();
    await vi.advanceTimersByTimeAsync(20);
    expect(save).not.toHaveBeenCalled();
    cancelled.schedule(projectFixture);
    cancelled.dispose();
    cancelled.dispose();
    await vi.advanceTimersByTimeAsync(20);
    expect(save).not.toHaveBeenCalled();
  });
});
