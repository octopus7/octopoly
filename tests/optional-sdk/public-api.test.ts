import { describe, expect, it } from "vitest";

import {
  ContractTestExtensionHost,
  ExtensionRuntimeImpl,
  ExtensionStateRegistryImpl,
  createContractTestExtensionHost,
  createExtensionRuntime,
  createExtensionStateRegistry,
} from "../../src/optional-sdk";

describe("optional SDK public entry", () => {
  it("publishes runtime, state, and contract-only testkit providers", () => {
    expect(createExtensionRuntime).toBeTypeOf("function");
    expect(createExtensionStateRegistry).toBeTypeOf("function");
    expect(createContractTestExtensionHost).toBeTypeOf("function");
    expect(ExtensionRuntimeImpl).toBeTypeOf("function");
    expect(ExtensionStateRegistryImpl).toBeTypeOf("function");
    expect(ContractTestExtensionHost).toBeTypeOf("function");
  });
});
