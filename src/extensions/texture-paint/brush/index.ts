export {
  BrushEngine,
  DEFAULT_BRUSH_SETTINGS,
  MAX_BRUSH_STAMPS,
  blendPremultipliedRgba,
  brushCoverage,
  clampPressure,
  erasePremultipliedRgba,
  interpolate,
  mapBrushPressure,
  resolveBrushSettings,
} from "./brush-engine";

export type {
  BrushBlendMode,
  BrushSample,
  BrushSettings,
  BrushStamp,
  PremultipliedRgba8,
  PressureMapping,
} from "./brush-engine";
