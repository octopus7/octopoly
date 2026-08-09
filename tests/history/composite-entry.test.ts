import { describe, expect, it, vi } from "vitest";

import type { ReversibleChange } from "@octopoly/contracts";
import { ChangeLifecycle } from "../../src/history/change-lifecycle";
import { CompositeHistoryEntry } from "../../src/history/composite-entry";

interface StatefulFake {
  readonly change: ReversibleChange;
  readonly dispose: ReturnType<typeof vi.fn>;
}

function statefulFake(
  id: string,
  state: Map<string, boolean>,
  events: string[],
  initiallyApplied: boolean,
): StatefulFake {
  state.set(id, initiallyApplied);
  const dispose = vi.fn(() => events.push(`dispose:${id}`));

  return {
    change: {
      id,
      label: `Change ${id}`,
      apply(): void {
        if (state.get(id) !== false) {
          throw new Error(`${id} cannot apply`);
        }
        state.set(id, true);
        events.push(`apply:${id}`);
      },
      revert(): void {
        if (state.get(id) !== true) {
          throw new Error(`${id} cannot revert`);
        }
        state.set(id, false);
        events.push(`revert:${id}`);
      },
      dispose,
    },
    dispose,
  };
}

describe("CompositeHistoryEntry", () => {
  it("round-trips ordered changes and preserves entry metadata", () => {
    const state = new Map<string, boolean>();
    const events: string[] = [];
    const lifecycle = new ChangeLifecycle();
    const source = [
      statefulFake("1", state, events, true).change,
      statefulFake("2", state, events, true).change,
      statefulFake("3", state, events, true).change,
    ];
    const entry = new CompositeHistoryEntry("stroke-7", "Pencil stroke", source, lifecycle);

    source.reverse();
    entry.revert();
    entry.apply();

    expect(entry.id).toBe("stroke-7");
    expect(entry.label).toBe("Pencil stroke");
    expect(entry.changes.map((change) => change.id)).toEqual(["1", "2", "3"]);
    expect(events).toEqual([
      "revert:3",
      "revert:2",
      "revert:1",
      "apply:1",
      "apply:2",
      "apply:3",
    ]);
    expect([...state.values()]).toEqual([true, true, true]);
  });

  it("keeps entry and child disposal idempotence separate", () => {
    const state = new Map<string, boolean>();
    const events: string[] = [];
    const lifecycle = new ChangeLifecycle();
    const first = statefulFake("1", state, events, true);
    const second = statefulFake("2", state, events, true);
    const entry = new CompositeHistoryEntry(
      "entry",
      "Entry",
      [first.change, second.change, first.change],
      lifecycle,
    );

    entry.dispose();
    entry.dispose();
    lifecycle.disposeAll([first.change, second.change]);

    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(second.dispose).toHaveBeenCalledTimes(1);
    expect(() => entry.apply()).toThrow('History entry "entry" has been disposed');
    expect(() => entry.revert()).toThrow('History entry "entry" has been disposed');
  });

  it.each(["apply", "revert"] as const)(
    "preflights every child before %s mutates any child",
    (operation) => {
      const state = new Map<string, boolean>();
      const events: string[] = [];
      const lifecycle = new ChangeLifecycle();
      const initiallyApplied = operation === "revert";
      const first = statefulFake("1", state, events, initiallyApplied);
      const second = statefulFake("2", state, events, initiallyApplied);
      const third = statefulFake("3", state, events, initiallyApplied);
      const entry = new CompositeHistoryEntry(
        "invalid-child",
        "Invalid child",
        [first.change, second.change, third.change],
        lifecycle,
      );
      lifecycle.dispose(second.change);
      events.length = 0;

      expect(() => entry[operation]()).toThrow(
        'Reversible change "2" has been disposed',
      );
      expect(events).toEqual([]);
      expect([...state.values()]).toEqual([
        initiallyApplied,
        initiallyApplied,
        initiallyApplied,
      ]);
    },
  );
});
