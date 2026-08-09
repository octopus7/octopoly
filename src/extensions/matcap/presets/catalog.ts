export type MatcapPresetId =
  | "clay"
  | "neutral-gray"
  | "metallic"
  | "soft"
  | "high-contrast";

export interface MatcapPreset {
  readonly id: MatcapPresetId;
  readonly label: string;
  readonly description: string;
  readonly width: number;
  readonly height: number;
  readonly colorSpace: "srgb";
  readonly mimeType: "image/svg+xml";
  readonly estimatedRgbaBytes: number;
}
export type MatcapPresetCatalog = Readonly<Record<MatcapPresetId, MatcapPreset>>;

export const MATCAP_PRESET_IDS: ReadonlyArray<MatcapPresetId> = Object.freeze([
  "clay",
  "neutral-gray",
  "metallic",
  "soft",
  "high-contrast",
]);

export const MATCAP_DEFAULT_PRESET_ID: MatcapPresetId = "clay";

const PRESET_DIMENSION = 256;
const PRESET_RGBA_BYTES = PRESET_DIMENSION * PRESET_DIMENSION * 4;

function preset(
  id: MatcapPresetId,
  label: string,
  description: string,
): MatcapPreset {
  return Object.freeze({
    id,
    label,
    description,
    width: PRESET_DIMENSION,
    height: PRESET_DIMENSION,
    colorSpace: "srgb",
    mimeType: "image/svg+xml",
    estimatedRgbaBytes: PRESET_RGBA_BYTES,
  });
}

export const MatcapPresetCatalog: MatcapPresetCatalog = Object.freeze({
  clay: preset("clay", "Clay", "Warm matte clay for reading broad surface form."),
  "neutral-gray": preset(
    "neutral-gray",
    "Neutral Gray",
    "Balanced neutral lighting for topology inspection.",
  ),
  metallic: preset("metallic", "Metallic", "Crisp cool highlights for detecting curvature changes."),
  soft: preset("soft", "Soft", "Low-contrast lighting for checking uninterrupted silhouettes."),
  "high-contrast": preset(
    "high-contrast",
    "High Contrast",
    "Strong rim and key contrast for exposing dents and pinching.",
  ),
});

export function isMatcapPresetId(value: string): value is MatcapPresetId {
  return Object.prototype.hasOwnProperty.call(MatcapPresetCatalog, value);
}
