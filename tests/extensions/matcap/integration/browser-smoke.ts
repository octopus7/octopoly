import type { ImageAssetRef, RendererCapabilities } from "@octopoly/contracts";

import { WebGL2MatcapShadingProvider } from "../../../../src/extensions/matcap/webgl2";

interface SmokeResult {
  readonly status: "PASS" | "FAIL" | "UNSUPPORTED";
  readonly providerId?: string;
  readonly language?: string;
  readonly maxTextureSize?: number;
  readonly vertexCompiled?: boolean;
  readonly fragmentCompiled?: boolean;
  readonly linked?: boolean;
  readonly reason?: string;
}

const canvas = document.querySelector<HTMLCanvasElement>("#matcap-smoke-canvas");
const output = document.querySelector<HTMLElement>("#matcap-smoke-result");

if (canvas === null || output === null) {
  throw new Error("MatCap smoke DOM is incomplete");
}

const publish = (result: SmokeResult): void => {
  output.dataset.status = result.status.toLowerCase();
  output.textContent = JSON.stringify(result, null, 2);
};

const gl = canvas.getContext("webgl2");
if (gl === null) {
  publish({ status: "UNSUPPORTED", reason: "WebGL2 context creation returned null" });
} else {
  const image: ImageAssetRef = Object.freeze({
    id: "browser-smoke-matcap",
    revision: 0,
    width: 256,
    height: 256,
    colorSpace: "srgb",
  });
  const capabilities: RendererCapabilities = Object.freeze({
    backend: "webgl2",
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
    supportsFloatColorBuffer: gl.getExtension("EXT_color_buffer_float") !== null,
    applicationTextureBudgetBytes: 512 * 1024 * 1024,
    applicationGpuBudgetBytes: 256 * 1024 * 1024,
  });
  const provider = new WebGL2MatcapShadingProvider(image);
  const descriptor = provider.program();
  let vertex: WebGLShader | null = null;
  let fragment: WebGLShader | null = null;
  let program: WebGLProgram | null = null;

  try {
    vertex = compile(gl, gl.VERTEX_SHADER, descriptor.vertexShader);
    fragment = compile(gl, gl.FRAGMENT_SHADER, descriptor.fragmentShader);
    program = gl.createProgram();
    if (program === null) throw new Error("WebGL2 program allocation failed");
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    const linked = gl.getProgramParameter(program, gl.LINK_STATUS) === true;
    if (!linked) throw new Error(gl.getProgramInfoLog(program) ?? "WebGL2 link failed");
    if (!provider.supports(capabilities)) throw new Error("Provider rejected live WebGL2 capabilities");

    publish({
      status: "PASS",
      providerId: provider.id,
      language: descriptor.language,
      maxTextureSize: capabilities.maxTextureSize,
      vertexCompiled: true,
      fragmentCompiled: true,
      linked: true,
    });
  } catch (error) {
    publish({
      status: "FAIL",
      providerId: provider.id,
      language: descriptor.language,
      maxTextureSize: capabilities.maxTextureSize,
      reason: error instanceof Error ? error.message : String(error),
    });
  } finally {
    if (program !== null) gl.deleteProgram(program);
    if (fragment !== null) gl.deleteShader(fragment);
    if (vertex !== null) gl.deleteShader(vertex);
    provider.dispose();
  }
}

function compile(gl: WebGL2RenderingContext, kind: number, source: string): WebGLShader {
  const shader = gl.createShader(kind);
  if (shader === null) throw new Error("WebGL2 shader allocation failed");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) !== true) {
    const reason = gl.getShaderInfoLog(shader) ?? "WebGL2 compile failed";
    gl.deleteShader(shader);
    throw new Error(reason);
  }
  return shader;
}
