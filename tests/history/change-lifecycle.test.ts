import { describe, expect, it, vi } from "vitest";

import type { ReversibleChange } from "@octopoly/contracts";
import { ChangeLifecycle } from "../../src/history/change-lifecycle";

function fakeChange(id: string, dispose = vi.fn()): ReversibleChange {
  return {
    id,
    label: id,
    apply: vi.fn(),
    revert: vi.fn(),
    dispose,
  };
}

describe("ChangeLifecycle", () => {
  it("disposes each change identity exactly once across cleanup paths", () => {
    const lifecycle = new ChangeLifecycle();
    const firstDispose = vi.fn();
    const secondDispose = vi.fn();
    const first = fakeChange("same-id", firstDispose);
    const second = fakeChange("same-id", secondDispose);

    lifecycle.dispose(first);
    lifecycle.disposeAll([first, second, first, second]);
    lifecycle.dispose(second);

    expect(firstDispose).toHaveBeenCalledTimes(1);
    expect(secondDispose).toHaveBeenCalledTimes(1);
  });

  it("marks changes without a disposer as unusable", () => {
    const lifecycle = new ChangeLifecycle();
    const change: ReversibleChange = {
      id: "no-disposer",
      label: "No disposer",
      apply: vi.fn(),
      revert: vi.fn(),
    };

    expect(() => lifecycle.assertUsable([change])).not.toThrow();

    lifecycle.dispose(change);

    expect(() => lifecycle.assertUsable([change])).toThrow(
      'Reversible change "no-disposer" has been disposed',
    );
  });
});
