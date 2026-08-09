import type {
  ExtensionHost,
  ExtensionPanelContext,
  ExtensionStateContribution,
  ExtensionStateProvider,
  ExtensionStateRegistry,
  RendererCapabilities,
} from "@octopoly/contracts";

import { createExtensionStateRegistry } from "../state";
import { ContractTestImageAssetService, type ContractTestImageAssetOptions } from "./images";
import { ContractTestInputSurfaceFactory } from "./input";
import {
  ContractTestModelingExtensionServices,
  type ContractTestModelingOptions,
} from "./modeling";
import {
  ContractTestPanelRegistry,
  ContractTestRenderControl,
  ContractTestRenderExtensionRegistry,
  ContractTestToolRegistry,
} from "./registries";

export interface ContractTestExtensionHostOptions {
  readonly capabilities?: RendererCapabilities | null;
  readonly modeling?: ContractTestModelingOptions;
  readonly images?: ContractTestImageAssetOptions;
  readonly state?: ExtensionStateRegistry;
}

export class ContractTestExtensionHost implements ExtensionHost {
  readonly tools = new ContractTestToolRegistry();
  readonly shading: ContractTestRenderExtensionRegistry;
  readonly images: ContractTestImageAssetService;
  readonly panels = new ContractTestPanelRegistry();
  readonly renderer: ContractTestRenderControl;
  readonly modeling: ContractTestModelingExtensionServices;
  readonly state: ExtensionStateRegistry;
  readonly inputSurfaces = new ContractTestInputSurfaceFactory();
  #disposed = false;

  constructor(options: ContractTestExtensionHostOptions = {}) {
    const capabilities = options.capabilities ?? null;
    this.shading = new ContractTestRenderExtensionRegistry(capabilities);
    this.images = new ContractTestImageAssetService(options.images);
    this.renderer = new ContractTestRenderControl(capabilities);
    this.modeling = new ContractTestModelingExtensionServices(options.modeling);
    this.state = options.state ?? createExtensionStateRegistry();
  }

  panelContext(): ExtensionPanelContext {
    this.#assertUsable();
    return Object.freeze({ inputSurfaces: this.inputSurfaces });
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;

    const disposables = [
      this.state,
      this.panels,
      this.images,
      this.shading,
      this.tools,
      this.inputSurfaces,
    ];
    let firstError: unknown;
    for (const disposable of disposables) {
      try {
        disposable.dispose();
      } catch (error) {
        firstError ??= error;
      }
    }
    if (firstError !== undefined) throw firstError;
  }

  #assertUsable(): void {
    if (this.#disposed) throw new Error("Contract test extension host is disposed");
  }
}

export function createContractTestExtensionHost(
  options?: ContractTestExtensionHostOptions,
): ContractTestExtensionHost {
  return new ContractTestExtensionHost(options);
}

export class ContractTestStateProvider implements ExtensionStateProvider {
  readonly id: string;
  readonly loaded: Array<ExtensionStateContribution | undefined> = [];
  #saved: ExtensionStateContribution | undefined;
  #disposed = false;

  constructor(id: string, saved?: ExtensionStateContribution) {
    this.id = id;
    this.#saved = saved;
  }

  load(value: ExtensionStateContribution | undefined): void {
    this.#assertUsable();
    this.loaded.push(value);
    this.#saved = value;
  }

  save(): ExtensionStateContribution | undefined {
    this.#assertUsable();
    return this.#saved;
  }

  setSaved(value: ExtensionStateContribution | undefined): void {
    this.#assertUsable();
    this.#saved = value;
  }

  dispose(): void {
    this.#disposed = true;
  }

  disposed(): boolean {
    return this.#disposed;
  }

  #assertUsable(): void {
    if (this.#disposed) throw new Error(`Contract test state provider "${this.id}" is disposed`);
  }
}
