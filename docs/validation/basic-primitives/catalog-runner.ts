import {
  CATALOG_SCENARIOS,
  FINGERPRINT_ALGORITHM,
  SMOKE_SCHEMA,
} from "./smoke-result";

interface RawSmokeResult {
  readonly scenario: string;
  readonly status: string;
  readonly phase: string;
  readonly browser: string;
  readonly actions: readonly string[];
  readonly requiredActions: readonly string[];
  readonly completionFailures: readonly string[];
  readonly [key: string]: unknown;
}

interface CatalogEvidence {
  readonly schemaVersion: 3;
  readonly capturedAt: string;
  readonly runtime: string;
  readonly candidateBaseHead: string;
  readonly generator: {
    readonly runner: "docs/validation/basic-primitives/catalog-runner.ts";
    readonly harness: "docs/validation/basic-primitives/browser-smoke.ts";
    readonly evaluator: "docs/validation/basic-primitives/smoke-result.ts";
    readonly schema: string;
    readonly fingerprintAlgorithm: string;
  };
  readonly scenarioCount: number;
  readonly scenarios: readonly RawSmokeResult[];
}

declare global {
  interface Window {
    __catalogRunnerResult?: CatalogEvidence;
  }
}

const candidateBaseHead = new URLSearchParams(location.search).get("candidateBaseHead") ?? "";
const output = required<HTMLElement>("#runner-result");

void run();

async function run(): Promise<void> {
  try {
    if (!/^[0-9a-f]{40}$/u.test(candidateBaseHead)) throw new Error("candidateBaseHead must be an exact 40-character Git SHA");
    const results: RawSmokeResult[] = [];
    for (const scenario of CATALOG_SCENARIOS) results.push(await runScenario(scenario));
    const evidence: CatalogEvidence = Object.freeze({
      schemaVersion: 3,
      capturedAt: new Date().toISOString(),
      runtime: results[0]?.browser ?? navigator.userAgent,
      candidateBaseHead,
      generator: Object.freeze({
        runner: "docs/validation/basic-primitives/catalog-runner.ts",
        harness: "docs/validation/basic-primitives/browser-smoke.ts",
        evaluator: "docs/validation/basic-primitives/smoke-result.ts",
        schema: SMOKE_SCHEMA,
        fingerprintAlgorithm: FINGERPRINT_ALGORITHM,
      }),
      scenarioCount: results.length,
      scenarios: Object.freeze(results),
    });
    window.__catalogRunnerResult = evidence;
    output.dataset.status = "pass";
    output.textContent = JSON.stringify(evidence, null, 2);
  } catch (error) {
    output.dataset.status = "fail";
    output.textContent = JSON.stringify({
      status: "FAIL",
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    }, null, 2);
  }
}

async function runScenario(scenario: string): Promise<RawSmokeResult> {
  const iframe = document.createElement("iframe");
  iframe.title = `Smoke scenario ${scenario}`;
  iframe.src = `./browser-smoke.html?scenario=${encodeURIComponent(scenario)}&runner=raw-v3`;
  document.body.append(iframe);
  try {
    await waitFor(() => {
      const value = tryReadResult(iframe);
      if (value === null) return null;
      return value.status === "READY" ? value : null;
    }, `${scenario} initialization`);

    const actionButtons: ReadonlyArray<readonly [string, string]> = [
      [`add-${scenario}`, `add-${scenario}`],
      ["undo", "undo"],
      ["redo", "redo"],
      ["move-selection", "move"],
      ["extrude-selection", "extrude"],
      ["save-project", "save"],
      ["reload-project", "reload"],
      ["export-obj", "export-obj"],
      ["export-glb", "export-glb"],
    ];
    for (const [testId, action] of actionButtons) await clickAndWait(iframe, scenario, testId, action);

    const result = readResult(iframe);
    if (result.status !== "PASS") throw new Error(`${scenario} ended ${result.status}: ${result.completionFailures.join("; ")}`);
    if (result.completionFailures.length > 0) throw new Error(`${scenario} completion failures: ${result.completionFailures.join("; ")}`);
    return structuredClone(result);
  } finally {
    iframe.remove();
  }
}

async function clickAndWait(iframe: HTMLIFrameElement, scenario: string, testId: string, action: string): Promise<void> {
  const button = await waitFor(
    () => iframe.contentDocument?.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`) ?? null,
    `${scenario} ${testId} button`,
  );
  if (button.disabled) throw new Error(`${scenario} ${testId} button is disabled`);
  button.click();
  await waitFor(() => {
    const value = tryReadResult(iframe);
    if (value === null) return null;
    if (value.status === "FAIL") throw new Error(`${scenario} ${action} failed at ${value.phase}`);
    return value.actions.includes(action) ? value : null;
  }, `${scenario} ${action}`);
}

function readResult(iframe: HTMLIFrameElement): RawSmokeResult {
  const text = iframe.contentDocument?.querySelector<HTMLElement>('[data-testid="result"]')?.textContent;
  if (text === undefined || text === null || text.length === 0) throw new Error("Smoke result is unavailable");
  return JSON.parse(text) as RawSmokeResult;
}

function tryReadResult(iframe: HTMLIFrameElement): RawSmokeResult | null {
  const text = iframe.contentDocument?.querySelector<HTMLElement>('[data-testid="result"]')?.textContent;
  if (text === undefined || text === null || text.length === 0) return null;
  try {
    return JSON.parse(text) as RawSmokeResult;
  } catch {
    return null;
  }
}

async function waitFor<T>(read: () => T | null, label: string): Promise<T> {
  for (let attempt = 0; attempt < 2_000; attempt += 1) {
    const value = read();
    if (value !== null) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (element === null) throw new Error(`Missing runner element: ${selector}`);
  return element;
}

export {};
