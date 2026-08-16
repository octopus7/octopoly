import { describe, expect, it, vi } from "vitest";

import { attachVertexPicker } from "../src/facial/picker";

function pointerEvent(
  type: string,
  options: { id: number; x: number; y: number; pointerType?: string; button?: number },
): PointerEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: options.button ?? 0,
    clientX: options.x,
    clientY: options.y,
  });
  Object.defineProperties(event, {
    pointerId: { value: options.id },
    pointerType: { value: options.pointerType ?? "mouse" },
  });
  return event as PointerEvent;
}

describe("facial vertex picker input", () => {
  it("emits client coordinates for a primary mouse tap", () => {
    const canvas = document.createElement("canvas");
    const onPick = vi.fn();
    attachVertexPicker(canvas, onPick);

    canvas.dispatchEvent(pointerEvent("pointerdown", { id: 1, x: 40, y: 60 }));
    canvas.dispatchEvent(pointerEvent("pointerup", { id: 1, x: 41, y: 61 }));

    expect(onPick).toHaveBeenCalledWith({ x: 41, y: 61 });
  });

  it("does not pick after a camera drag returns to its start", () => {
    const canvas = document.createElement("canvas");
    const onPick = vi.fn();
    attachVertexPicker(canvas, onPick);

    canvas.dispatchEvent(pointerEvent("pointerdown", { id: 1, x: 40, y: 60 }));
    canvas.dispatchEvent(pointerEvent("pointermove", { id: 1, x: 80, y: 60 }));
    canvas.dispatchEvent(pointerEvent("pointerup", { id: 1, x: 40, y: 60 }));

    expect(onPick).not.toHaveBeenCalled();
  });

  it("does not pick during a multi-touch camera gesture", () => {
    const canvas = document.createElement("canvas");
    const onPick = vi.fn();
    attachVertexPicker(canvas, onPick);

    canvas.dispatchEvent(pointerEvent("pointerdown", { id: 1, x: 40, y: 60, pointerType: "touch" }));
    canvas.dispatchEvent(pointerEvent("pointerdown", { id: 2, x: 80, y: 60, pointerType: "touch" }));
    canvas.dispatchEvent(pointerEvent("pointerup", { id: 2, x: 80, y: 60, pointerType: "touch" }));
    canvas.dispatchEvent(pointerEvent("pointerup", { id: 1, x: 40, y: 60, pointerType: "touch" }));

    expect(onPick).not.toHaveBeenCalled();
  });
});
