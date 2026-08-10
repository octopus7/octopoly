import type { PointerSample, Tool, ToolContext, ViewportSnapshot } from "@octopoly/contracts";

import {
  connectDesktopWheelCamera,
  WorkspaceInputController,
} from "../../../src/app/composition/workspace-input";
import { OrbitCameraController } from "../../../src/camera";
import { createNormalizedInputSurfaceFactory } from "../../../src/input/surface";
import { ToolRuntime } from "../../../src/tools/runtime";

interface HarnessState {
  readonly ready: true;
  readonly position: Readonly<{ x: number; y: number; z: number }>;
  readonly target: Readonly<{ x: number; y: number; z: number }>;
  readonly distance: number;
  readonly received: ReadonlyArray<Readonly<{
    pointerType: PointerSample["pointerType"];
    phase: PointerSample["phase"];
    buttons: number;
  }>>;
  readonly renders: number;
  readonly gotCapture: number;
  readonly lostCapture: number;
  readonly navigationOwner: boolean;
  readonly wheelAllowed: boolean;
  readonly scrollY: number;
  readonly contextMenus: number;
}

declare global {
  interface Window {
    __octopolyDesktopMouseHarness?: {
      readonly state: () => HarnessState;
      readonly dispose: () => void;
    };
  }
}

const canvas = document.querySelector<HTMLCanvasElement>("#viewport");
const status = document.querySelector<HTMLElement>("#status");
if (canvas === null || status === null) {
  throw new Error("desktop mouse browser harness DOM is incomplete");
}

const viewport = (): ViewportSnapshot => {
  const bounds = canvas.getBoundingClientRect();
  return Object.freeze({
    cssWidth: bounds.width,
    cssHeight: bounds.height,
    devicePixelRatio: window.devicePixelRatio,
  });
};

const context: ToolContext = {
  mesh: {} as ToolContext["mesh"],
  mutations: {} as ToolContext["mutations"],
  selection: {} as ToolContext["selection"],
  history: {} as ToolContext["history"],
  surface: {} as ToolContext["surface"],
  getCamera: () => ({}) as ReturnType<ToolContext["getCamera"]>,
  getViewport: viewport,
  setPreview: () => undefined,
  requestRender: () => undefined,
};

const received: PointerSample[] = [];
const tool: Tool = {
  id: "browser-modeling-fixture",
  pointer(sample) {
    received.push(sample);
    if (sample.phase === "down") return { handled: true, capturePointer: true };
    if (sample.phase === "up" || sample.phase === "cancel") {
      return { handled: true, releasePointer: true };
    }
    return { handled: true };
  },
};
const runtime = new ToolRuntime(context);
runtime.tools.register(tool);
runtime.tools.activate(tool.id);
const camera = new OrbitCameraController({ x: 0, y: 0, z: 10 }, { x: 0, y: 0, z: 0 });
let renders = 0;
let gotCapture = 0;
let lostCapture = 0;
let contextMenus = 0;
const input = new WorkspaceInputController(runtime, camera, viewport, () => {
  renders += 1;
});
const surface = createNormalizedInputSurfaceFactory().create(canvas, { touchAction: "none" });
const connection = surface.connect(input);
const wheel = connectDesktopWheelCamera(canvas, input, camera, () => {
  renders += 1;
});
canvas.addEventListener("gotpointercapture", () => {
  gotCapture += 1;
});
canvas.addEventListener("lostpointercapture", () => {
  lostCapture += 1;
});
canvas.addEventListener("contextmenu", () => {
  contextMenus += 1;
});

function state(): HarnessState {
  const position = camera.position();
  const target = camera.target();
  const distance = Math.hypot(
    position.x - target.x,
    position.y - target.y,
    position.z - target.z,
  );
  return Object.freeze({
    ready: true,
    position,
    target,
    distance,
    received: Object.freeze(received.map((sample) => Object.freeze({
      pointerType: sample.pointerType,
      phase: sample.phase,
      buttons: sample.buttons,
    }))),
    renders,
    gotCapture,
    lostCapture,
    navigationOwner: input.hasNavigationOwner(),
    wheelAllowed: input.canHandleWheel(),
    scrollY: window.scrollY,
    contextMenus,
  });
}

let disposed = false;
function dispose(): void {
  if (disposed) return;
  disposed = true;
  wheel.dispose();
  connection.dispose();
  surface.dispose();
  input.dispose();
  runtime.dispose();
}

window.__octopolyDesktopMouseHarness = Object.freeze({ state, dispose });
status.textContent = JSON.stringify(state(), null, 2);
window.dispatchEvent(new CustomEvent("octopoly-desktop-mouse-ready"));
