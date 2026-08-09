import type {
  AttributeKey,
  CornerId,
  Disposable,
  ExtensionPanel,
  ExtensionPanelContext,
  MeshSnapshot,
  ModelingExtensionServices,
  NormalizedInputSurface,
  Unsubscribe,
  Vec2,
} from "@octopoly/contracts";
import type { UvMutationOutcome } from "../operations";

import { UvEditorSelection, type UvEditorSelectionSnapshot } from "./selection";
import {
  UvViewportController,
  type UvEditorStatus,
  type UvViewportControllerOptions,
  type UvViewportLayout,
} from "./viewport-controller";

export const UV_EDITOR_PANEL_ID = "octopoly.uv-editor.panel";

export interface UvEditorPanelOptions {
  readonly modeling: ModelingExtensionServices;
  readonly uvAttribute: AttributeKey<Vec2>;
  readonly selection?: UvEditorSelection;
  readonly initialLayout?: UvViewportLayout;
  readonly pickRadiusCssPx?: number;
  readonly resolveIsland?: UvViewportControllerOptions["resolveIsland"];
}

export interface UvEditorPanelSnapshot {
  readonly mounted: boolean;
  readonly status: UvEditorStatus;
  readonly layout: UvViewportLayout;
  readonly selection: UvEditorSelectionSnapshot;
}

export type UvEditorCommand =
  | "planar"
  | "box"
  | "normalize"
  | "select-corner"
  | "select-island";

export class UvEditorPanel implements ExtensionPanel {
  readonly id = UV_EDITOR_PANEL_ID;
  readonly title = "UV Editor";
  readonly selection: UvEditorSelection;
  readonly controller: UvViewportController;
  readonly #modeling: ModelingExtensionServices;
  readonly #uvAttribute: AttributeKey<Vec2>;
  #root: HTMLElement | null = null;
  #viewportElement: HTMLElement | null = null;
  #statusElement: HTMLElement | null = null;
  #drawing: SVGSVGElement | null = null;
  readonly #controls = new Map<UvEditorCommand, HTMLButtonElement>();
  #controlDisposers: Array<() => void> = [];
  #surface: NormalizedInputSurface | null = null;
  #connection: Disposable | null = null;
  #unsubscribers: Unsubscribe[] = [];
  #disposed = false;

  constructor(options: UvEditorPanelOptions) {
    this.#modeling = options.modeling;
    this.#uvAttribute = options.uvAttribute;
    this.selection = options.selection ?? new UvEditorSelection();
    this.controller = new UvViewportController({
      modeling: options.modeling,
      selection: this.selection,
      uvAttribute: options.uvAttribute,
      ...(options.initialLayout === undefined ? {} : { initialLayout: options.initialLayout }),
      ...(options.pickRadiusCssPx === undefined ? {} : { pickRadiusCssPx: options.pickRadiusCssPx }),
      ...(options.resolveIsland === undefined ? {} : { resolveIsland: options.resolveIsland }),
    });
  }

  mount(container: HTMLElement, context: ExtensionPanelContext): void {
    this.#assertUsable();
    if (this.#root !== null) throw new Error("UV editor panel is already mounted");

    const root = document.createElement("section");
    root.dataset.uvEditor = "root";
    root.setAttribute("aria-label", this.title);
    root.style.display = "grid";
    root.style.gridTemplateRows = "auto auto minmax(0, 1fr)";
    root.style.minHeight = "12rem";

    const status = document.createElement("p");
    status.dataset.uvEditor = "status";
    status.setAttribute("role", "status");
    status.style.margin = "0";
    status.style.padding = "0.5rem";

    const controls = document.createElement("div");
    controls.dataset.uvEditor = "controls";
    controls.setAttribute("role", "toolbar");
    controls.setAttribute("aria-label", "UV editor controls");
    controls.style.display = "flex";
    controls.style.flexWrap = "wrap";
    controls.style.gap = "0.25rem";
    controls.style.padding = "0 0.5rem 0.5rem";
    for (const [command, label] of [
      ["planar", "Planar"],
      ["box", "Box"],
      ["normalize", "Normalize"],
      ["select-corner", "Corner"],
      ["select-island", "Island"],
    ] as const) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.uvCommand = command;
      button.textContent = label;
      const listener = (): void => {
        this.runCommand(command);
      };
      button.addEventListener("click", listener);
      this.#controlDisposers.push(() => button.removeEventListener("click", listener));
      this.#controls.set(command, button);
      controls.append(button);
    }

    const viewport = document.createElement("div");
    viewport.dataset.uvEditor = "viewport";
    viewport.setAttribute("role", "application");
    viewport.setAttribute("aria-label", "2D UV viewport");
    viewport.style.position = "relative";
    viewport.style.overflow = "hidden";
    viewport.style.minHeight = "10rem";
    viewport.style.background = "#11151b";

    const drawing = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    drawing.dataset.uvEditor = "drawing";
    drawing.setAttribute("aria-hidden", "true");
    drawing.style.width = "100%";
    drawing.style.height = "100%";
    drawing.style.display = "block";
    viewport.append(drawing);
    root.append(status, controls, viewport);
    container.append(root);

    this.#root = root;
    this.#viewportElement = viewport;
    this.#statusElement = status;
    this.#drawing = drawing;

    const surface = context.inputSurfaces.create(viewport, { touchAction: "none" });
    this.#surface = surface;
    this.controller.setViewport(surface.viewport());
    this.#connection = surface.connect(this.controller);
    this.#unsubscribers.push(
      surface.subscribeViewport((next) => {
        this.controller.setViewport(next);
      }),
      this.controller.subscribe(() => {
        this.#render();
      }),
      this.selection.subscribe(() => {
        this.#render();
      }),
      this.#modeling.subscribe((change) => {
        if (change.kind === "document") {
          this.#resetInputConnection();
          this.controller.handleDocumentReplacement();
        } else if (change.kind === "mesh") {
          this.controller.pruneSelection();
        }
        this.#render();
      }),
    );
    this.#render();
  }

  snapshot(): UvEditorPanelSnapshot {
    this.#assertUsable();
    return Object.freeze({
      mounted: this.#root !== null,
      status: this.controller.status(),
      layout: this.controller.layout(),
      selection: this.selection.snapshot(),
    });
  }

  runCommand(command: UvEditorCommand): UvMutationOutcome | null {
    this.#assertUsable();
    let outcome: UvMutationOutcome | null = null;
    if (command === "select-corner") {
      this.controller.setSelectionTarget("corner");
    } else if (command === "select-island") {
      if (!this.controller.islandSelectionAvailable()) return null;
      this.controller.setSelectionTarget("island");
    } else if (command === "planar") {
      outcome = this.controller.projectPlanar();
    } else if (command === "box") {
      outcome = this.controller.projectBox();
    } else {
      outcome = this.controller.normalizeSelection();
    }
    this.#render();
    return outcome;
  }

  dispose(): void {
    if (this.#disposed) return;

    const errors: unknown[] = [];
    const run = (operation: () => void): void => {
      try {
        operation();
      } catch (error) {
        errors.push(error);
      }
    };

    run(() => this.#connection?.dispose());
    this.#connection = null;
    for (const unsubscribe of this.#unsubscribers.splice(0).reverse()) run(unsubscribe);
    run(() => this.#surface?.dispose());
    this.#surface = null;
    for (const disposeControl of this.#controlDisposers.splice(0).reverse()) run(disposeControl);
    this.#controls.clear();
    run(() => this.controller.dispose());
    this.#root?.remove();
    this.#root = null;
    this.#viewportElement = null;
    this.#statusElement = null;
    this.#drawing = null;
    this.#disposed = true;

    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, "UV editor panel disposal failed");
  }

  #resetInputConnection(): void {
    const surface = this.#surface;
    if (surface === null) return;
    this.#connection?.dispose();
    this.#connection = surface.connect(this.controller);
  }

  #render(): void {
    const root = this.#root;
    const statusElement = this.#statusElement;
    const drawing = this.#drawing;
    if (root === null || statusElement === null || drawing === null) return;

    const status = this.controller.status();
    root.dataset.status = status.availability;
    root.setAttribute("aria-disabled", String(status.readOnly));
    statusElement.textContent = status.message;
    const projectionDisabled = status.availability === "empty" || status.availability === "invalid";
    const planar = this.#controls.get("planar");
    const box = this.#controls.get("box");
    const normalize = this.#controls.get("normalize");
    const corner = this.#controls.get("select-corner");
    const island = this.#controls.get("select-island");
    if (planar !== undefined) planar.disabled = projectionDisabled;
    if (box !== undefined) box.disabled = projectionDisabled;
    if (normalize !== undefined) normalize.disabled = status.readOnly;
    if (corner !== undefined) corner.setAttribute("aria-pressed", String(this.controller.selectionTarget() === "corner"));
    if (island !== undefined) {
      island.disabled = !this.controller.islandSelectionAvailable();
      island.setAttribute("aria-pressed", String(this.controller.selectionTarget() === "island"));
    }

    const viewport = this.controller.viewport();
    drawing.setAttribute("viewBox", `0 0 ${Math.max(1, viewport.cssWidth)} ${Math.max(1, viewport.cssHeight)}`);
    drawing.replaceChildren();
    const mesh = this.#modeling.mesh.snapshot();
    const selectedCorners = this.selection.snapshot().corners;
    this.#drawFaces(drawing, mesh);
    this.#drawCorners(drawing, mesh, selectedCorners);
  }

  #drawFaces(drawing: SVGSVGElement, mesh: MeshSnapshot): void {
    for (const face of mesh.faces) {
      const points: string[] = [];
      for (const corner of face.corners) {
        const uv = mesh.attributes.get(this.#uvAttribute, corner);
        if (!isFiniteUv(uv)) {
          points.splice(0);
          break;
        }
        const screen = this.controller.screenFromUv(uv);
        points.push(`${screen.x},${screen.y}`);
      }
      if (points.length < 3) continue;
      const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      polygon.setAttribute("points", points.join(" "));
      polygon.setAttribute("fill", "rgba(90, 153, 255, 0.12)");
      polygon.setAttribute("stroke", "#5a99ff");
      polygon.setAttribute("stroke-width", "1");
      drawing.append(polygon);
    }
  }

  #drawCorners(
    drawing: SVGSVGElement,
    mesh: MeshSnapshot,
    selectedCorners: ReadonlySet<CornerId>,
  ): void {
    for (const corner of mesh.corners) {
      const uv = mesh.attributes.get(this.#uvAttribute, corner.id);
      if (!isFiniteUv(uv)) continue;
      const screen = this.controller.screenFromUv(uv);
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.dataset.cornerId = String(corner.id);
      circle.setAttribute("cx", String(screen.x));
      circle.setAttribute("cy", String(screen.y));
      circle.setAttribute("r", selectedCorners.has(corner.id) ? "4" : "2.5");
      circle.setAttribute("fill", selectedCorners.has(corner.id) ? "#ffd166" : "#d7e3f4");
      drawing.append(circle);
    }
  }

  #assertUsable(): void {
    if (this.#disposed) throw new Error("UV editor panel is disposed");
  }
}

function isFiniteUv(value: unknown): value is Vec2 {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Partial<Vec2>;
  return Number.isFinite(candidate.x) && Number.isFinite(candidate.y);
}
