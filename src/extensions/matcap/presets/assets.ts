import type { MatcapPresetId } from "./catalog";

interface GradientStop {
  readonly offset: number;
  readonly color: string;
  readonly opacity?: number;
}
interface PresetArtwork {
  readonly base: string;
  readonly stops: ReadonlyArray<GradientStop>;
  readonly highlight: string;
  readonly highlightOpacity: number;
  readonly highlightX: number;
  readonly highlightY: number;
  readonly highlightRadius: number;
  readonly rim?: string;
}

const ARTWORK: Readonly<Record<MatcapPresetId, PresetArtwork>> = Object.freeze({
  clay: Object.freeze({
    base: "#8c5140",
    stops: Object.freeze([
      Object.freeze({ offset: 0, color: "#f2b08a" }),
      Object.freeze({ offset: 0.46, color: "#b86c52" }),
      Object.freeze({ offset: 1, color: "#3f2327" }),
    ]),
    highlight: "#fff1dc",
    highlightOpacity: 0.58,
    highlightX: 0.34,
    highlightY: 0.28,
    highlightRadius: 0.38,
  }),
  "neutral-gray": Object.freeze({
    base: "#72767a",
    stops: Object.freeze([
      Object.freeze({ offset: 0, color: "#e0e2e3" }),
      Object.freeze({ offset: 0.5, color: "#898d91" }),
      Object.freeze({ offset: 1, color: "#24272a" }),
    ]),
    highlight: "#ffffff",
    highlightOpacity: 0.42,
    highlightX: 0.35,
    highlightY: 0.3,
    highlightRadius: 0.42,
  }),
  metallic: Object.freeze({
    base: "#53616d",
    stops: Object.freeze([
      Object.freeze({ offset: 0, color: "#f8fbff" }),
      Object.freeze({ offset: 0.24, color: "#8597a5" }),
      Object.freeze({ offset: 0.47, color: "#d8e3e9" }),
      Object.freeze({ offset: 0.7, color: "#44515b" }),
      Object.freeze({ offset: 1, color: "#111820" }),
    ]),
    highlight: "#ffffff",
    highlightOpacity: 0.9,
    highlightX: 0.31,
    highlightY: 0.22,
    highlightRadius: 0.22,
    rim: "#b5d4e7",
  }),
  soft: Object.freeze({
    base: "#777577",
    stops: Object.freeze([
      Object.freeze({ offset: 0, color: "#d5d0ca" }),
      Object.freeze({ offset: 0.62, color: "#918c89" }),
      Object.freeze({ offset: 1, color: "#5d5a5d" }),
    ]),
    highlight: "#fffaf4",
    highlightOpacity: 0.25,
    highlightX: 0.42,
    highlightY: 0.36,
    highlightRadius: 0.56,
  }),
  "high-contrast": Object.freeze({
    base: "#232a31",
    stops: Object.freeze([
      Object.freeze({ offset: 0, color: "#ffffff" }),
      Object.freeze({ offset: 0.28, color: "#8c9baa" }),
      Object.freeze({ offset: 0.54, color: "#29323a" }),
      Object.freeze({ offset: 1, color: "#050708" }),
    ]),
    highlight: "#ffffff",
    highlightOpacity: 0.96,
    highlightX: 0.27,
    highlightY: 0.22,
    highlightRadius: 0.27,
    rim: "#d9f2ff",
  }),
});

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

function radialGradient(id: string, stops: ReadonlyArray<GradientStop>): string {
  const body = stops.map((stop) => {
    const opacity = stop.opacity === undefined ? "" : ` stop-opacity="${stop.opacity}"`;
    return `<stop offset="${percent(stop.offset)}" stop-color="${escapeAttribute(stop.color)}"${opacity}/>`;
  }).join("");
  return `<radialGradient id="${id}" cx="36%" cy="31%" r="70%">${body}</radialGradient>`;
}

/** Creates a fresh immutable-source Blob so consumers never share a mutable decode resource. */
export function createMatcapPresetBlob(id: MatcapPresetId): Blob {
  const artwork = ARTWORK[id];
  const rim = artwork.rim === undefined
    ? ""
    : `<circle cx="128" cy="128" r="123" fill="none" stroke="${escapeAttribute(artwork.rim)}" stroke-opacity="0.62" stroke-width="7"/>`;
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">',
    "<defs>",
    radialGradient("body", artwork.stops),
    `<radialGradient id="highlight" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${escapeAttribute(artwork.highlight)}" stop-opacity="${artwork.highlightOpacity}"/><stop offset="100%" stop-color="${escapeAttribute(artwork.highlight)}" stop-opacity="0"/></radialGradient>`,
    "</defs>",
    `<rect width="256" height="256" fill="${escapeAttribute(artwork.base)}"/>`,
    '<circle cx="128" cy="128" r="128" fill="url(#body)"/>',
    `<circle cx="${artwork.highlightX * 256}" cy="${artwork.highlightY * 256}" r="${artwork.highlightRadius * 256}" fill="url(#highlight)"/>`,
    rim,
    "</svg>",
  ].join("");
  return new Blob([svg], { type: "image/svg+xml" });
}
