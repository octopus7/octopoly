export type BasicPrimitiveBrowserScenario = "plane" | "cube";

export interface BasicPrimitiveBrowserSnapshot {
  readonly mesh: {
    readonly vertices: number;
    readonly edges: number;
    readonly corners: number;
    readonly faces: number;
    readonly version: number;
  };
  readonly selectedFaceIds: ReadonlyArray<number>;
  readonly cameraFingerprint: string;
  readonly renderedNonEmptyPixels: number;
  readonly undoLabel: string | null;
  readonly redoLabel: string | null;
}

export interface BasicPrimitivesBrowserArtifacts {
  readonly savedDocumentBytes: number;
  readonly reloadPreservedStableIds: boolean;
  readonly objBytes: number;
  readonly glbBytes: number;
}

export interface BasicPrimitivesBrowserEvidence {
  readonly scenario: BasicPrimitiveBrowserScenario;
  readonly browser: string;
  readonly executedAt: string;
  readonly webgl2: true;
  readonly before: BasicPrimitiveBrowserSnapshot;
  readonly afterCreate: BasicPrimitiveBrowserSnapshot;
  readonly afterUndo: BasicPrimitiveBrowserSnapshot;
  readonly afterRedo: BasicPrimitiveBrowserSnapshot;
  readonly artifacts: BasicPrimitivesBrowserArtifacts;
  readonly consoleWarnings: ReadonlyArray<string>;
  readonly consoleErrors: ReadonlyArray<string>;
}

/**
 * Browser runners can implement this boundary without coupling the package-local
 * adapter to Playwright, WebDriver, or application bootstrap ownership.
 */
export interface BasicPrimitivesBrowserHarness {
  click(label: string): Promise<void>;
  snapshot(): Promise<BasicPrimitiveBrowserSnapshot>;
  moveSelection?(): Promise<void>;
  extrudeSelection?(): Promise<void>;
  saveReloadAndExport(): Promise<BasicPrimitivesBrowserArtifacts>;
  consoleIssues(): Promise<{
    readonly warnings: ReadonlyArray<string>;
    readonly errors: ReadonlyArray<string>;
  }>;
}

/**
 * Validates evidence captured by a real browser runner. It deliberately does
 * not launch a browser or manufacture an execution result.
 */
export function assertBasicPrimitivesBrowserEvidence(
  evidence: BasicPrimitivesBrowserEvidence,
): void {
  const expected = evidence.scenario === "plane"
    ? { vertices: 4, edges: 4, corners: 4, faces: 1 }
    : { vertices: 8, edges: 12, corners: 24, faces: 6 };
  if (!evidence.executedAt.trim()) throw new Error("browser execution timestamp is required");
  if (!evidence.browser.trim()) throw new Error("browser identity is required");
  if (evidence.before.mesh.vertices !== 0 || evidence.before.mesh.faces !== 0) {
    throw new Error("scenario must begin with an empty mesh");
  }
  for (const key of ["vertices", "edges", "corners", "faces"] as const) {
    if (evidence.afterCreate.mesh[key] !== expected[key]) {
      throw new Error(`${evidence.scenario} created an unexpected ${key} count`);
    }
    if (evidence.afterRedo.mesh[key] !== expected[key]) {
      throw new Error(`redo did not restore ${key}`);
    }
  }
  if (evidence.afterCreate.selectedFaceIds.length !== expected.faces) {
    throw new Error(`${evidence.scenario} selection evidence is incomplete`);
  }
  if (evidence.afterCreate.cameraFingerprint === evidence.before.cameraFingerprint) {
    throw new Error("camera framing did not change");
  }
  if (evidence.afterCreate.renderedNonEmptyPixels <= 0) {
    throw new Error("rendered frame is empty");
  }
  for (const key of ["vertices", "edges", "corners", "faces"] as const) {
    if (evidence.afterUndo.mesh[key] !== 0) throw new Error(`undo left live ${key}`);
  }
  if (!evidence.artifacts.reloadPreservedStableIds) throw new Error("reload changed stable IDs");
  if (evidence.artifacts.savedDocumentBytes <= 0) throw new Error("save produced no document");
  if (evidence.artifacts.objBytes <= 0) throw new Error("OBJ export is empty");
  if (evidence.artifacts.glbBytes <= 0) throw new Error("GLB export is empty");
  if (evidence.consoleWarnings.length > 0 || evidence.consoleErrors.length > 0) {
    throw new Error("browser console contains warnings or errors");
  }
}
