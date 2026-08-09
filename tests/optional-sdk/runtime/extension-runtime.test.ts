import type {
  ExtensionActivationResult,
  ExtensionHost,
  OptionalExtension,
} from "@octopoly/contracts";
import { describe, expect, it, vi } from "vitest";

import { ExtensionRuntimeImpl } from "../../../src/optional-sdk/runtime";
import { createContractTestExtensionHost } from "../../../src/optional-sdk/testkit";

function extension(
  id: string,
  activate: (host: ExtensionHost) => ExtensionActivationResult | Promise<ExtensionActivationResult>,
  calls: string[] = [],
): OptionalExtension {
  return {
    id,
    activate: vi.fn(activate),
    dispose: vi.fn(() => { calls.push(`dispose:${id}`); }),
  };
}

describe("ExtensionRuntimeImpl", () => {
  it("deactivates individual extensions and disposes remaining extensions in reverse order before the host", async () => {
    const calls: string[] = [];
    const host = createContractTestExtensionHost();
    const hostDispose = vi.spyOn(host, "dispose").mockImplementation(() => { calls.push("dispose:host"); });
    const runtime = new ExtensionRuntimeImpl(host);
    const first = extension("first", () => ({ status: "activated" }), calls);
    const second = extension("second", () => ({ status: "activated" }), calls);
    const third = extension("third", () => ({ status: "activated" }), calls);

    await runtime.activate(first);
    await runtime.activate(second);
    await runtime.activate(third);
    expect(runtime.active()).toEqual(["first", "second", "third"]);

    runtime.deactivate("second");
    expect(runtime.active()).toEqual(["first", "third"]);
    runtime.dispose();
    runtime.dispose();

    expect(calls).toEqual([
      "dispose:second",
      "dispose:third",
      "dispose:first",
      "dispose:host",
    ]);
    expect(hostDispose).toHaveBeenCalledTimes(1);
  });

  it("rejects duplicate ids without disturbing the active extension", async () => {
    const host = createContractTestExtensionHost();
    const runtime = new ExtensionRuntimeImpl(host);
    const active = extension("same", () => ({ status: "activated" }));
    const duplicate = extension("same", () => ({ status: "activated" }));

    expect(await runtime.activate(active)).toEqual({ status: "activated" });
    expect(await runtime.activate(duplicate)).toEqual({
      status: "failed",
      reason: 'Extension "same" is already active or activating',
    });
    expect(duplicate.activate).not.toHaveBeenCalled();
    expect(duplicate.dispose).toHaveBeenCalledTimes(1);
    expect(active.dispose).not.toHaveBeenCalled();
    expect(runtime.active()).toEqual(["same"]);

    runtime.dispose();
  });

  it("does not dispose the already-active instance when that same object is activated twice", async () => {
    const host = createContractTestExtensionHost();
    const runtime = new ExtensionRuntimeImpl(host);
    const same = extension("same-instance", () => ({ status: "activated" }));

    await runtime.activate(same);
    expect(await runtime.activate(same)).toMatchObject({ status: "failed" });
    expect(same.dispose).not.toHaveBeenCalled();
    expect(runtime.active()).toEqual(["same-instance"]);

    runtime.dispose();
    expect(same.dispose).toHaveBeenCalledTimes(1);
  });

  it.each([
    { label: "unsupported", result: { status: "unsupported", reason: "no capability" } as const },
    { label: "failed", result: { status: "failed", reason: "compile failed" } as const },
  ])("cleans up a partially activated $label extension", async ({ result }) => {
    const host = createContractTestExtensionHost();
    const runtime = new ExtensionRuntimeImpl(host);
    const partial = extension("partial", (receivedHost) => {
      receivedHost.panels.register({
        id: "temporary-panel",
        title: "Temporary",
        mount: () => {},
        dispose: vi.fn(),
      });
      return result;
    });

    expect(await runtime.activate(partial)).toEqual(result);
    expect(partial.dispose).toHaveBeenCalledTimes(1);
    expect(runtime.active()).toEqual([]);
    runtime.dispose();
  });

  it("converts activation exceptions to explicit failure and disposes the extension", async () => {
    const host = createContractTestExtensionHost();
    const runtime = new ExtensionRuntimeImpl(host);
    const broken = extension("broken", () => { throw new Error("activation exploded"); });

    await expect(runtime.activate(broken)).resolves.toEqual({
      status: "failed",
      reason: "activation exploded",
    });
    expect(broken.dispose).toHaveBeenCalledTimes(1);
    runtime.dispose();
  });

  it("cancels pending activation on dispose without publishing late success", async () => {
    let resolveActivation!: (result: ExtensionActivationResult) => void;
    const activation = new Promise<ExtensionActivationResult>((resolve) => {
      resolveActivation = resolve;
    });
    const host = createContractTestExtensionHost();
    const runtime = new ExtensionRuntimeImpl(host);
    const pending = extension("pending", () => activation);

    const result = runtime.activate(pending);
    runtime.dispose();
    resolveActivation({ status: "activated" });

    await expect(result).resolves.toEqual({
      status: "failed",
      reason: 'Extension "pending" activation was cancelled',
    });
    expect(pending.dispose).toHaveBeenCalledTimes(1);
    expect(runtime.active()).toEqual([]);
  });
});
