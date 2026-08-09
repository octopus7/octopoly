import type {
  RenderExtensionControl,
  RenderExtensionRegistry,
  ShadingCandidateFailure,
  ShadingFailureCode,
  ShadingSelectionLease,
  ShadingSelectionSnapshot,
  Unsubscribe,
} from "@octopoly/contracts";

import { LOOKDEV_REALTIME_PROVIDER_ID } from "../webgl2/realtime";
import {
  LOOKDEV_QUALITY_PROVIDER_ID,
  lookdevQualitySupportFailure,
} from "../webgl2/quality";

export type LookdevPreset = "realtime" | "quality";

export type LookdevFallbackKind =
  | "unsupported-backend"
  | "unsupported-capability"
  | "invalid-material"
  | "resource-budget"
  | "provider-failure";

export interface LookdevFallbackReason {
  readonly kind: LookdevFallbackKind;
  readonly providerId: string;
  readonly failureCode: ShadingFailureCode;
  readonly reason: string;
}

export interface LookdevControllerSnapshot {
  readonly preset: LookdevPreset;
  readonly candidates: ReadonlyArray<string>;
  readonly effectiveProviderId: string | null;
  readonly failures: ReadonlyArray<ShadingCandidateFailure>;
  readonly fallback: LookdevFallbackReason | null;
}

export class LookdevController {
  readonly #renderer: RenderExtensionControl;
  readonly #lease: ShadingSelectionLease;
  readonly #listeners = new Set<(snapshot: LookdevControllerSnapshot) => void>();
  #preset: LookdevPreset;
  #snapshot: LookdevControllerSnapshot;
  #unsubscribeLease: Unsubscribe;
  #disposed = false;

  constructor(
    shading: RenderExtensionRegistry,
    renderer: RenderExtensionControl,
    initialPreset: LookdevPreset = "realtime",
  ) {
    this.#renderer = renderer;
    this.#preset = initialPreset;
    this.#lease = shading.activateScoped(candidatesFor(initialPreset));
    this.#snapshot = composeSnapshot(
      initialPreset,
      this.#lease.snapshot(),
      renderer,
    );
    this.#unsubscribeLease = this.#lease.subscribe((snapshot) => {
      if (this.#disposed) return;
      this.#publish(composeSnapshot(this.#preset, snapshot, this.#renderer));
    });
  }

  preset(): LookdevPreset {
    this.#assertUsable();
    return this.#preset;
  }

  setPreset(preset: LookdevPreset): void {
    this.#assertUsable();
    if (preset !== "realtime" && preset !== "quality") {
      throw new Error(`Unknown lookdev preset "${String(preset)}"`);
    }
    if (preset === this.#preset) return;

    this.#preset = preset;
    this.#lease.setCandidates(candidatesFor(preset));
    this.#publish(composeSnapshot(preset, this.#lease.snapshot(), this.#renderer));
    this.#renderer.requestRender();
  }

  snapshot(): LookdevControllerSnapshot {
    this.#assertUsable();
    return this.#snapshot;
  }

  subscribe(listener: (snapshot: LookdevControllerSnapshot) => void): Unsubscribe {
    this.#assertUsable();
    this.#listeners.add(listener);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      this.#listeners.delete(listener);
    };
  }

  requestRender(): void {
    this.#assertUsable();
    this.#renderer.requestRender();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#unsubscribeLease();
    this.#listeners.clear();
    this.#lease.dispose();
  }

  #publish(snapshot: LookdevControllerSnapshot): void {
    if (sameSnapshot(this.#snapshot, snapshot)) return;
    this.#snapshot = snapshot;
    for (const listener of [...this.#listeners]) {
      try {
        listener(snapshot);
      } catch {
        // A panel observer cannot prevent the remaining state observers from updating.
      }
    }
  }

  #assertUsable(): void {
    if (this.#disposed) throw new Error("Lookdev controller is disposed");
  }
}

export function candidatesFor(preset: LookdevPreset): ReadonlyArray<string> {
  return preset === "quality"
    ? Object.freeze([LOOKDEV_QUALITY_PROVIDER_ID, LOOKDEV_REALTIME_PROVIDER_ID])
    : Object.freeze([LOOKDEV_REALTIME_PROVIDER_ID]);
}

function composeSnapshot(
  preset: LookdevPreset,
  selection: ShadingSelectionSnapshot,
  renderer: RenderExtensionControl,
): LookdevControllerSnapshot {
  const failures = Object.freeze(selection.failures.map((failure) => Object.freeze({ ...failure })));
  return Object.freeze({
    preset,
    candidates: Object.freeze([...selection.candidates]),
    effectiveProviderId: selection.effectiveProviderId,
    failures,
    fallback: fallbackReason(preset, selection, renderer),
  });
}

function fallbackReason(
  preset: LookdevPreset,
  selection: ShadingSelectionSnapshot,
  renderer: RenderExtensionControl,
): LookdevFallbackReason | null {
  const failure = relevantFailure(preset, selection);
  if (failure === undefined) return null;

  let kind: LookdevFallbackKind = "provider-failure";
  let reason = failure.reason;
  if (/material/iu.test(failure.reason) && failure.code === "uniforms-failed") {
    kind = "invalid-material";
  } else if (failure.code === "unsupported") {
    const capabilities = renderer.capabilities();
    if (capabilities === null) {
      kind = "unsupported-capability";
    } else if (failure.providerId === LOOKDEV_QUALITY_PROVIDER_ID) {
      const qualityFailure = lookdevQualitySupportFailure(capabilities);
      if (qualityFailure !== null) {
        kind = qualityFailure.code;
        reason = qualityFailure.reason;
      } else {
        kind = "unsupported-capability";
      }
    } else if (capabilities.backend !== "webgl2") {
      kind = "unsupported-backend";
    } else {
      kind = "unsupported-capability";
    }
  }

  return Object.freeze({
    kind,
    providerId: failure.providerId,
    failureCode: failure.code,
    reason,
  });
}

function relevantFailure(
  preset: LookdevPreset,
  selection: ShadingSelectionSnapshot,
): ShadingCandidateFailure | undefined {
  if (selection.failures.length === 0) return undefined;
  if (preset === "quality" && selection.effectiveProviderId === LOOKDEV_REALTIME_PROVIDER_ID) {
    return selection.failures.find((failure) => failure.providerId === LOOKDEV_QUALITY_PROVIDER_ID);
  }
  if (selection.effectiveProviderId === null) {
    return selection.failures.at(-1);
  }
  return selection.failures[0];
}

function sameSnapshot(first: LookdevControllerSnapshot, second: LookdevControllerSnapshot): boolean {
  if (
    first.preset !== second.preset ||
    first.effectiveProviderId !== second.effectiveProviderId ||
    first.candidates.length !== second.candidates.length ||
    first.failures.length !== second.failures.length
  ) {
    return false;
  }
  for (let index = 0; index < first.candidates.length; index += 1) {
    if (first.candidates[index] !== second.candidates[index]) return false;
  }
  for (let index = 0; index < first.failures.length; index += 1) {
    const left = first.failures[index];
    const right = second.failures[index];
    if (
      left?.providerId !== right?.providerId ||
      left?.code !== right?.code ||
      left?.reason !== right?.reason
    ) {
      return false;
    }
  }
  return (
    first.fallback?.kind === second.fallback?.kind &&
    first.fallback?.providerId === second.fallback?.providerId &&
    first.fallback?.failureCode === second.fallback?.failureCode &&
    first.fallback?.reason === second.fallback?.reason
  );
}
