import type { GuidedDiagnosticSeverity } from "../analysis/topology-diagnostics.ts";

export type GuidedInputDevice = "pen" | "touch" | "mouse" | "keyboard";
export type GuidedMotionPreference = "full" | "reduced";

export interface GuidedInputAvailability {
  readonly available: ReadonlyArray<GuidedInputDevice>;
  readonly lastUsed: GuidedInputDevice | null;
}

export interface GuidedStatusPresentation {
  readonly icon: string;
  readonly label: string;
  readonly pattern: "dots" | "diagonal" | "crosshatch";
  readonly live: "polite" | "assertive";
}

const presentations: Readonly<Record<GuidedDiagnosticSeverity, GuidedStatusPresentation>> = Object.freeze({
  info: Object.freeze({ icon: "ℹ", label: "Information", pattern: "dots", live: "polite" }),
  warning: Object.freeze({ icon: "!", label: "Warning", pattern: "diagonal", live: "polite" }),
  "completion-blocker": Object.freeze({ icon: "×", label: "Blocked", pattern: "crosshatch", live: "assertive" }),
});

export function statusPresentation(severity: GuidedDiagnosticSeverity): GuidedStatusPresentation {
  return presentations[severity];
}

export type AccessiblePreviewDescriptor =
  | { readonly mode: "animated"; readonly segmentCount: number }
  | { readonly mode: "static"; readonly segments: ReadonlyArray<{ readonly index: number; readonly label: string }> };

export function createAccessiblePreviewDescriptor(
  preference: GuidedMotionPreference,
  segmentCount: number,
): AccessiblePreviewDescriptor {
  if (!Number.isSafeInteger(segmentCount) || segmentCount < 0) throw new RangeError("segmentCount must be a non-negative safe integer");
  if (preference === "full") return Object.freeze({ mode: "animated", segmentCount });
  const segments = Array.from({ length: segmentCount }, (_, index) => Object.freeze({
    index: index + 1,
    label: `Flow segment ${index + 1} of ${segmentCount}`,
  }));
  return Object.freeze({ mode: "static", segments: Object.freeze(segments) });
}

export function recordInputDevice(
  current: GuidedInputAvailability,
  device: GuidedInputDevice,
): GuidedInputAvailability {
  if (!current.available.includes(device)) throw new Error(`Unavailable guided input device: ${device}`);
  return Object.freeze({ available: Object.freeze([...current.available]), lastUsed: device });
}
