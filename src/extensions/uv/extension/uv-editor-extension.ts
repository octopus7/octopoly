import type {
  ExtensionActivationResult,
  ExtensionHost,
  OptionalExtension,
  Tool,
} from "@octopoly/contracts";

import { UV0_ATTRIBUTE } from "../data";
import { UvEditorPanel } from "../editor";
import { UvIslandService } from "../islands";
import { UvEditorStateProvider } from "./state-provider";

export const UV_EDITOR_EXTENSION_ID = "octopoly.uv-editor";
export const UV_EDITOR_TOOL_ID = "octopoly.uv-editor.tool";

export type UvEditorExtensionStatus =
  | "inactive"
  | "activated"
  | "unsupported"
  | "failed"
  | "disposed";

export interface UvEditorExtensionOptions {
  readonly uiAvailable?: boolean;
  readonly disabledReason?: string;
}

class UvEditorTool implements Tool {
  readonly id = UV_EDITOR_TOOL_ID;
}

export class UvEditorExtension implements OptionalExtension {
  readonly id = UV_EDITOR_EXTENSION_ID;
  readonly #options: UvEditorExtensionOptions;
  readonly #cleanupErrors: string[] = [];
  #host: ExtensionHost | null = null;
  #panel: UvEditorPanel | null = null;
  #stateProvider: UvEditorStateProvider | null = null;
  #tool: Tool | null = null;
  #scope: { dispose(): void } | null = null;
  #status: UvEditorExtensionStatus = "inactive";
  #reason: string | undefined;

  constructor(options: UvEditorExtensionOptions = {}) {
    this.#options = Object.freeze({ ...options });
  }

  activate(host: ExtensionHost): ExtensionActivationResult {
    if (this.#status === "disposed") {
      return { status: "failed", reason: "A disposed UV editor extension cannot be activated" };
    }
    if (this.#status !== "inactive") {
      return { status: "failed", reason: "UV editor extension is already activated or activation was attempted" };
    }
    if (this.#options.uiAvailable === false || typeof document === "undefined") {
      this.#status = "unsupported";
      this.#reason = this.#options.disabledReason ?? "UV editor panel mount is unavailable";
      return { status: "unsupported", reason: this.#reason };
    }

    const islandService = new UvIslandService(UV0_ATTRIBUTE);
    let islandMeshVersion = -1;
    let islandByCorner = new Map<number, number>();
    const panel = new UvEditorPanel({
      modeling: host.modeling,
      uvAttribute: UV0_ATTRIBUTE,
      resolveIsland: (corner, mesh) => {
        if (mesh.version !== islandMeshVersion) {
          islandByCorner = new Map();
          islandService.findIslands(host.modeling.mesh).forEach((island, index) => {
            for (const islandCorner of island.corners) islandByCorner.set(islandCorner, index);
          });
          islandMeshVersion = mesh.version;
        }
        return islandByCorner.get(corner) ?? null;
      },
    });
    const provider = new UvEditorStateProvider(panel.selection, panel.controller);
    const tool = new UvEditorTool();
    let toolRegistered = false;
    let stateRegistered = false;
    let panelRegistered = false;
    let scope: { dispose(): void } | null = null;

    try {
      host.tools.register(tool);
      toolRegistered = true;
      host.panels.register(panel);
      panelRegistered = true;
      scope = host.tools.activateScoped(tool.id);
      host.state.register(provider);
      stateRegistered = true;

      this.#host = host;
      this.#panel = panel;
      this.#stateProvider = provider;
      this.#tool = tool;
      this.#scope = scope;
      this.#status = "activated";
      this.#reason = undefined;
      return { status: "activated" };
    } catch (error) {
      this.#cleanupPartial(
        host,
        panel,
        provider,
        tool,
        scope,
        { toolRegistered, stateRegistered, panelRegistered },
      );
      return this.#fail(errorMessage(error));
    }
  }

  status(): UvEditorExtensionStatus {
    return this.#status;
  }

  reason(): string | undefined {
    return this.#reason;
  }

  panel(): UvEditorPanel | null {
    return this.#panel;
  }

  stateProvider(): UvEditorStateProvider | null {
    return this.#stateProvider;
  }

  cleanupErrors(): ReadonlyArray<string> {
    return Object.freeze([...this.#cleanupErrors]);
  }

  dispose(): void {
    if (this.#status === "disposed") return;

    const host = this.#host;
    const panel = this.#panel;
    const provider = this.#stateProvider;
    const tool = this.#tool;
    const scope = this.#scope;
    this.#host = null;
    this.#panel = null;
    this.#stateProvider = null;
    this.#tool = null;
    this.#scope = null;

    if (scope !== null) this.#tryCleanup(() => scope.dispose());
    if (host !== null && provider !== null) {
      this.#tryCleanup(() => host.state.unregister(provider.id));
    } else if (provider !== null) {
      this.#tryCleanup(() => provider.dispose());
    }
    if (host !== null && panel !== null) {
      this.#tryCleanup(() => host.panels.unregister(panel.id));
    } else if (panel !== null) {
      this.#tryCleanup(() => panel.dispose());
    }
    if (host !== null && tool !== null) {
      this.#tryCleanup(() => host.tools.unregister(tool.id));
    }
    this.#status = "disposed";
  }

  #cleanupPartial(
    host: ExtensionHost,
    panel: UvEditorPanel,
    provider: UvEditorStateProvider,
    tool: Tool,
    scope: { dispose(): void } | null,
    registered: {
      readonly toolRegistered: boolean;
      readonly stateRegistered: boolean;
      readonly panelRegistered: boolean;
    },
  ): void {
    if (registered.stateRegistered) {
      this.#tryCleanup(() => host.state.unregister(provider.id));
    } else {
      this.#tryCleanup(() => provider.dispose());
    }
    if (scope !== null) this.#tryCleanup(() => scope.dispose());
    if (registered.panelRegistered) {
      this.#tryCleanup(() => host.panels.unregister(panel.id));
    } else {
      this.#tryCleanup(() => panel.dispose());
    }
    if (registered.toolRegistered) this.#tryCleanup(() => host.tools.unregister(tool.id));
  }

  #tryCleanup(operation: () => void): void {
    try {
      operation();
    } catch (error) {
      this.#cleanupErrors.push(errorMessage(error));
    }
  }

  #fail(reason: string): ExtensionActivationResult {
    this.#status = "failed";
    this.#reason = reason;
    return { status: "failed", reason };
  }
}

export function createUvEditorExtension(options?: UvEditorExtensionOptions): UvEditorExtension {
  return new UvEditorExtension(options);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
