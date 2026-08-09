import type { PointerSample } from "@octopoly/contracts";

export function isModelingPointer(sample: PointerSample): boolean {
  return sample.pointerType === "pen" || sample.pointerType === "mouse";
}

export function isNavigationPointer(sample: PointerSample): boolean {
  return sample.pointerType === "touch";
}
