import type {
  ImageAssetRef,
  ShadingSelectionSnapshot,
  Unsubscribe,
} from "@octopoly/contracts";

import type {
  MatcapImageSelectionResult,
} from "../image";
import type { MatcapPresetId } from "../presets";

export type MatcapDisabledReasonCode =
  | "unsupported-backend"
  | "provider-unsupported"
  | "provider-missing"
  | "compile-failed"
  | "uniforms-failed"
  | "image-unavailable"
  | "invalid-image"
  | "decode-failed"
  | "resource-budget";

export interface MatcapDisabledReason {
  readonly code: MatcapDisabledReasonCode;
  readonly message: string;
  readonly source: "image" | "renderer";
}

export type MatcapSelection =
  | {
      readonly kind: "preset";
      readonly presetId: MatcapPresetId;
      readonly image: ImageAssetRef;
    }
  | {
      readonly kind: "custom";
      readonly image: ImageAssetRef;
    };

export interface MatcapControllerSnapshot {
  readonly enabled: boolean;
  readonly busy: boolean;
  readonly selection: MatcapSelection;
  readonly previousValidPresetId: MatcapPresetId;
  readonly shading: ShadingSelectionSnapshot | null;
  readonly disabledReason: MatcapDisabledReason | null;
  readonly fallbackReason: MatcapDisabledReason | null;
}

export type MatcapSelectionChangeResult =
  | {
      readonly status: "selected";
      readonly selection: MatcapSelection;
    }
  | {
      readonly status: "retained";
      readonly selection: MatcapSelection;
      readonly reason: MatcapDisabledReason;
    };

export interface MatcapImageSelectionSource {
  current(): ImageAssetRef | null;
  selectPreset(id: MatcapPresetId): Promise<MatcapImageSelectionResult>;
  importCustom(source: Blob): Promise<MatcapImageSelectionResult>;
  selectCustom(ref: ImageAssetRef): Promise<MatcapImageSelectionResult>;
}

export interface MatcapImageTarget {
  readonly id: string;
  image(): ImageAssetRef;
  setImage(ref: ImageAssetRef): void;
}

export type MatcapControllerListener = (snapshot: MatcapControllerSnapshot) => void;

export interface MatcapControllerSubscription {
  subscribe(listener: MatcapControllerListener): Unsubscribe;
}
