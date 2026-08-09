import {
  BrushEngine,
  type BrushSettings,
} from "../brush";

export class TexturePaintBrushController {
  #engine: BrushEngine;

  constructor(settings: Partial<BrushSettings> = {}) {
    this.#engine = new BrushEngine(settings);
  }

  engine(): BrushEngine {
    return this.#engine;
  }

  settings(): Readonly<BrushSettings> {
    return this.#engine.settings;
  }

  setSettings(settings: Partial<BrushSettings>): Readonly<BrushSettings> {
    this.#engine = new BrushEngine(settings);
    return this.#engine.settings;
  }
}
