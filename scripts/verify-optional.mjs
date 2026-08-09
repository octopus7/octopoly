import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const scanOnly = process.argv.includes("--scan-only");
const requireDesktop = process.argv.includes("--require-desktop");
const requirePhysical = process.argv.includes("--require-physical");
const desktopEvidencePath = argumentPath("--desktop-evidence")
  ?? path.join(root, "docs", "validation", "optional", "current-desktop-webgl2-status.json");
const physicalEvidencePath = argumentPath("--physical-evidence")
  ?? argumentPath("--evidence")
  ?? path.join(root, "docs", "validation", "optional", "current-physical-status.json");
const optionalRoots = [
  path.join(root, "src", "extensions"),
  path.join(root, "src", "optional"),
];
const failures = [];
const commands = [];
let temporaryRoot = null;

function argumentPath(flag) {
  const index = process.argv.indexOf(flag);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  return value === undefined || value.startsWith("--") ? null : path.resolve(root, value);
}

function relative(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

function isUnder(file, directory) {
  const candidate = path.relative(directory, file);
  return candidate === "" || (!candidate.startsWith("..") && !path.isAbsolute(candidate));
}

async function walk(directory) {
  if (!existsSync(directory)) return [];
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    else files.push(absolute);
  }
  return files;
}

function check(condition, message) {
  if (!condition) failures.push(message);
}

function moduleSpecifiers(source) {
  const result = [];
  for (const pattern of [
    /\b(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s*)?["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  ]) {
    for (const match of source.matchAll(pattern)) result.push(match[1]);
  }
  return result;
}

function resolvesToOptional(importer, specifier) {
  if (/^(?:@octopoly\/)?(?:extensions|optional)(?:\/|$)/.test(specifier)) return true;
  if (specifier.includes("/extensions/") || specifier.includes("/optional/")) return true;
  if (!specifier.startsWith(".")) return false;
  const resolved = path.resolve(path.dirname(importer), specifier);
  return optionalRoots.some((directory) => isUnder(resolved, directory));
}

const sourceFiles = (await walk(path.join(root, "src"))).filter((file) => /\.tsx?$/.test(file));
const coreSourceFiles = sourceFiles.filter(
  (file) => !optionalRoots.some((directory) => isUnder(file, directory)),
);
for (const file of coreSourceFiles) {
  const source = await readFile(file, "utf8");
  for (const specifier of moduleSpecifiers(source)) {
    check(
      !resolvesToOptional(file, specifier),
      `Core import crosses the Optional boundary: ${relative(file)} -> ${specifier}`,
    );
  }
}

const coreEntry = path.join(root, "src", "main.ts");
check(existsSync(coreEntry), "Core application entry src/main.ts is missing.");
check(existsSync(path.join(root, "tests", "e2e", "core-workspace-vertical.test.ts")),
  "09 vertical-slice regression fixture is missing.");
check(existsSync(path.join(root, "tests", "integration", "optional")),
  "Optional integration validation tests are missing.");
check(existsSync(path.join(root, "tests", "e2e", "optional")),
  "Optional end-to-end validation tests are missing.");
check(existsSync(path.join(root, "tests", "device", "optional")),
  "Optional device validation fixtures are missing.");

try {
  if (!scanOnly && failures.length === 0) {
    temporaryRoot = await mkdtemp(path.join(root, ".verify-optional-"));
    const isolatedCore = path.join(temporaryRoot, "core-only");
    await cp(path.join(root, "src"), path.join(isolatedCore, "src"), {
      recursive: true,
      filter: (source) => !optionalRoots.some((directory) => isUnder(source, directory)),
    });
    const excludedCoreTestRoots = [
      path.join(root, "tests", "extensions"),
      path.join(root, "tests", "optional"),
      path.join(root, "tests", "integration", "optional"),
      path.join(root, "tests", "e2e", "optional"),
      path.join(root, "tests", "device", "optional"),
    ];
    await cp(path.join(root, "tests"), path.join(isolatedCore, "tests"), {
      recursive: true,
      filter: (source) => !excludedCoreTestRoots.some((directory) => isUnder(source, directory)),
    });
    for (const file of ["index.html", "tsconfig.json", "vite.config.ts", "vitest.config.ts"]) {
      await cp(path.join(root, file), path.join(isolatedCore, file));
    }
    if (existsSync(path.join(root, "public"))) {
      await cp(path.join(root, "public"), path.join(isolatedCore, "public"), { recursive: true });
    }

    check(!existsSync(path.join(isolatedCore, "src", "extensions")),
      "Core-only copy unexpectedly contains src/extensions.");
    check(!existsSync(path.join(isolatedCore, "src", "optional")),
      "Core-only copy unexpectedly contains src/optional.");

    const isolatedConfig = JSON.parse(await readFile(path.join(isolatedCore, "tsconfig.json"), "utf8"));
    isolatedConfig.include = ["src/**/*.ts", "tests/**/*.ts", "vite.config.ts", "vitest.config.ts"];
    isolatedConfig.exclude = ["src/extensions/**", "src/optional/**"];
    await writeFile(
      path.join(isolatedCore, "tsconfig.json"),
      `${JSON.stringify(isolatedConfig, null, 2)}\n`,
    );

    run("Core-only physical-removal typecheck", process.execPath, [
      path.join(root, "node_modules", "typescript", "bin", "tsc"),
      "--project",
      path.join(isolatedCore, "tsconfig.json"),
      "--noEmit",
    ], isolatedCore);
    run("Core-only physical-removal tests and 09 vertical slice", process.execPath, [
      path.join(root, "node_modules", "vitest", "vitest.mjs"),
      "run",
      "--config",
      path.join(isolatedCore, "vitest.config.ts"),
      "--root",
      isolatedCore,
    ], isolatedCore);
    const isolatedDist = path.join(isolatedCore, "dist");
    run("Core-only physical-removal production build", process.execPath, [
      path.join(root, "node_modules", "vite", "bin", "vite.js"),
      "build",
      "--config",
      path.join(isolatedCore, "vite.config.ts"),
      "--outDir",
      isolatedDist,
      "--emptyOutDir",
    ], isolatedCore);
    run("Core-only artifact hard limits", process.execPath, [
      path.join(root, "scripts", "verify-baseline.mjs"),
      isolatedDist,
    ]);

    run("Full source and validation typecheck", process.execPath, [
      path.join(root, "node_modules", "typescript", "bin", "tsc"),
      "--project",
      path.join(root, "tsconfig.json"),
      "--noEmit",
    ]);
    await buildCombinationMatrix(temporaryRoot);
    run("16-combination and semantic Optional validation", process.execPath, [
      path.join(root, "node_modules", "vitest", "vitest.mjs"),
      "run",
      "tests/optional",
      "tests/integration/optional",
      "tests/e2e/optional",
      "tests/device/optional",
      "tests/e2e/core-workspace-vertical.test.ts",
      "tests/integration/core-workspace.integration.test.ts",
      "tests/renderer/core/extension-registry.test.ts",
      "tests/renderer/core/image-texture-cache.test.ts",
    ]);
    const fullDist = path.join(temporaryRoot, "full-dist");
    run("Full source production build", process.execPath, [
      path.join(root, "node_modules", "vite", "bin", "vite.js"),
      "build",
      "--outDir",
      fullDist,
      "--emptyOutDir",
    ]);
  }
} finally {
  if (temporaryRoot !== null) {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

const desktop = await readEvidence(desktopEvidencePath, "desktop WebGL2");
if (desktop.evidence !== null) validateDesktopEvidence(desktop.evidence);
const physical = await readEvidence(physicalEvidencePath, "physical iPad/Pencil");
if (physical.evidence !== null) validatePhysicalEvidence(physical.evidence);

const automatedStatus = failures.some((message) => !message.startsWith("EVIDENCE:")) ? "FAIL" : "PASS";
const desktopStatus = desktop.evidence?.status ?? "NOT_RUN";
const physicalStatus = physical.evidence?.status ?? "NOT_RUN";
const releaseReadiness = automatedStatus === "PASS" && desktopStatus === "PASS" && physicalStatus === "PASS"
  ? "READY"
  : "BLOCKED";

if (requireDesktop && desktopStatus !== "PASS") {
  failures.push(`EVIDENCE: desktop WebGL2 evidence is ${desktopStatus}; PASS is required.`);
}
if (requirePhysical && physicalStatus !== "PASS") {
  failures.push(`EVIDENCE: physical iPad/Pencil evidence is ${physicalStatus}; PASS is required.`);
}

console.log(JSON.stringify({
  automated: {
    status: automatedStatus,
    mode: scanOnly ? "scan-only" : "scan-and-execute",
    coreSourceFiles: coreSourceFiles.length,
    optionalRootsExcludedFromCore: optionalRoots.map(relative),
    commands,
  },
  desktopWebGL2: {
    status: desktopStatus,
    evidencePath: relative(desktopEvidencePath),
    note: "Desktop WebGL2 evidence validates a real browser GPU path but is not iPad Safari or Apple Pencil evidence.",
  },
  physicalIPadPencil: {
    status: physicalStatus,
    evidencePath: relative(physicalEvidencePath),
    note: "Only completed physical iPad Safari and Apple Pencil runs satisfy this gate.",
  },
  releaseReadiness,
  failures,
}, null, 2));

if (failures.length > 0 || (requireDesktop && desktopStatus !== "PASS") || (requirePhysical && physicalStatus !== "PASS")) {
  process.exitCode = 1;
}

async function readEvidence(file, label) {
  if (!existsSync(file)) {
    if ((label === "desktop WebGL2" && requireDesktop) || (label === "physical iPad/Pencil" && requirePhysical)) {
      failures.push(`EVIDENCE: missing ${label} evidence file: ${file}`);
    }
    return { evidence: null };
  }
  try {
    return { evidence: JSON.parse(await readFile(file, "utf8")) };
  } catch (error) {
    failures.push(`EVIDENCE: invalid ${label} evidence JSON: ${reasonFrom(error)}`);
    return { evidence: null };
  }
}

function validateDesktopEvidence(evidence) {
  if (evidence.status !== "PASS") return;
  evidenceCheck(evidence.schemaVersion === 1, "Desktop evidence schemaVersion must be 1.");
  evidenceCheck(fullSha(evidence.commit), "Desktop evidence must identify a full commit SHA.");
  for (const id of [
    "webgl2-context",
    "provider-compile-link",
    "image-upload-revision",
    "candidate-fallback-restore",
    "context-loss-restore",
  ]) {
    evidenceCheck(evidence.checks?.find((entry) => entry.id === id)?.status === "PASS",
      `Desktop WebGL2 check must pass: ${id}`);
  }
  evidenceCheck(typeof evidence.browser === "string" && evidence.browser.length > 0,
    "Desktop evidence must name the browser build.");
}

function validatePhysicalEvidence(evidence) {
  if (evidence.status !== "PASS") return;
  evidenceCheck(evidence.schemaVersion === 1, "Physical evidence schemaVersion must be 1.");
  evidenceCheck(fullSha(evidence.commit), "Physical evidence must identify a full commit SHA.");
  evidenceCheck(Array.isArray(evidence.devices) && evidence.devices.length >= 2,
    "Physical evidence needs minimum-line and representative iPads.");
  for (const device of evidence.devices ?? []) {
    for (const key of ["model", "osBuild", "safariBuild", "pencil"]) {
      evidenceCheck(typeof device[key] === "string" && device[key].length > 0,
        `Every physical device needs ${key}.`);
    }
  }
  for (const id of [
    "core-full-cold-start",
    "resize-orientation",
    "pencil-coalesced-pressure-tilt",
    "capture-cancel",
    "pencil-touch-separation",
    "uv-navigation-edit",
    "paint-latency-history",
    "provider-switch-fallback-restore",
    "context-background-memory-recovery",
    "project-round-trip",
  ]) {
    evidenceCheck(evidence.checks?.find((entry) => entry.id === id)?.status === "PASS",
      `Physical Optional check must pass: ${id}`);
  }
  evidenceCheck((evidence.measurementRuns ?? 0) >= 5,
    "Physical performance evidence needs at least five runs.");
  const maxima = {
    coldShellP95Seconds: 2.5,
    firstUsableFrameP95Seconds: 3,
    cpuFrameTimeP95Ms: 20,
    gpuFrameTimeP95Ms: 20,
    mainThreadLongTaskMaxMs: 100,
    pointerLatencyP95Ms: 33,
    coalescedBatchP95Ms: 8,
    strokeRollbackMaxMs: 100,
    jsHeapPeakMiB: 512,
    gpuResourcesPeakMiB: 512,
    retainedAssetsPeakMiB: 768,
  };
  for (const [name, limit] of Object.entries(maxima)) {
    const value = evidence.metrics?.[name];
    evidenceCheck(Number.isFinite(value) && value <= limit,
      `Physical metric ${name} must be finite and <= ${limit}.`);
  }
  evidenceCheck(Number.isFinite(evidence.metrics?.minimumObservedFps) && evidence.metrics.minimumObservedFps >= 30,
    "Physical minimumObservedFps must be >= 30.");
  evidenceCheck(Number.isFinite(evidence.thermal?.durationMinutes) && evidence.thermal.durationMinutes >= 30,
    "Physical thermal run must last at least 30 minutes.");
  evidenceCheck(Number.isFinite(evidence.thermal?.maximumDegradationPercent)
    && evidence.thermal.maximumDegradationPercent <= 20,
  "Physical thermal degradation must remain <= 20%.");
  evidenceCheck(Number.isFinite(evidence.thermal?.minimumFps) && evidence.thermal.minimumFps >= 30,
    "Physical thermal minimum FPS must remain >= 30.");
  evidenceCheck(evidence.thermal?.memoryPressure === false,
    "Physical thermal run must not report memory pressure.");
  evidenceCheck(evidence.thermal?.unexpectedContextLoss === false,
    "Physical thermal run must not report unexpected context loss.");
}

function evidenceCheck(condition, message) {
  if (!condition) failures.push(`EVIDENCE: ${message}`);
}

function fullSha(value) {
  return typeof value === "string" && /^[0-9a-f]{40}$/i.test(value);
}

function run(label, command, args, cwd = root) {
  const started = performance.now();
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NODE_ENV: "test" },
  });
  commands.push({
    label,
    command: [pathToFileURL(command).href, ...args.map(String)].join(" "),
    exitCode: result.status,
    durationMs: Math.round(performance.now() - started),
  });
  if (result.status !== 0) {
    failures.push(`${label} failed with exit code ${result.status ?? "unknown"}\n${result.stdout}\n${result.stderr}`.trim());
  }
}

function reasonFrom(error) {
  return error instanceof Error ? error.message : String(error);
}

async function buildCombinationMatrix(temporaryDirectory) {
  const matrixRoot = path.join(temporaryDirectory, "combination-matrix");
  const entryRoot = path.join(matrixRoot, "entries");
  const definitions = [
    {
      feature: "uv",
      exportName: "UV_OPTIONAL_MANIFEST_ENTRY",
      module: path.join(root, "src", "optional", "manifests", "uv.ts"),
      concreteToken: "octopoly.uv-editor.panel",
    },
    {
      feature: "texture-paint",
      exportName: "TEXTURE_PAINT_OPTIONAL_MANIFEST_ENTRY",
      module: path.join(root, "src", "optional", "manifests", "texture-paint.ts"),
      concreteToken: "texture-paint.tool",
    },
    {
      feature: "lookdev",
      exportName: "LOOKDEV_OPTIONAL_MANIFEST_ENTRY",
      module: path.join(root, "src", "optional", "manifests", "lookdev.ts"),
      concreteToken: "octopoly.lookdev.quality",
    },
    {
      feature: "matcap",
      exportName: "MATCAP_OPTIONAL_MANIFEST_ENTRY",
      module: path.join(root, "src", "optional", "manifests", "matcap.ts"),
      concreteToken: "octopoly.matcap.shading",
    },
  ];
  const entries = [];
  await mkdir(entryRoot, { recursive: true });
  for (let value = 0; value < 16; value += 1) {
    const bits = value.toString(2).padStart(4, "0");
    const entry = path.join(entryRoot, `${bits}.ts`);
    const selected = definitions.filter((_definition, index) => bits[index] === "1");
    const loaderSpecifier = moduleSpecifier(entryRoot, path.join(root, "src", "optional", "index.ts"));
    const contractSpecifier = moduleSpecifier(entryRoot, path.join(root, "src", "contracts", "index.ts"));
    const lines = [
      `import type { ExtensionHost } from ${JSON.stringify(contractSpecifier)};`,
      `import { createOptionalComposition, defineOptionalManifest } from ${JSON.stringify(loaderSpecifier)};`,
      ...selected.map((definition) => (
        `import { ${definition.exportName} } from ${JSON.stringify(moduleSpecifier(entryRoot, definition.module))};`
      )),
      `export const manifest = defineOptionalManifest([${selected.map((definition) => definition.exportName).join(", ")}]);`,
      "export const selectedFeatures = manifest.entries.map((entry) => entry.feature);",
      "export function create(host: ExtensionHost) { return createOptionalComposition(host, manifest); }",
    ];
    await writeFile(entry, `${lines.join("\n")}\n`);
    entries.push({ bits, entry, selected });
  }

  const matrixTsconfig = path.join(matrixRoot, "tsconfig.json");
  await writeFile(matrixTsconfig, `${JSON.stringify({
    extends: path.join(root, "tsconfig.json").replaceAll("\\", "/"),
    files: entries.map(({ entry }) => entry.replaceAll("\\", "/")),
    include: [],
  }, null, 2)}\n`);
  run("16-combination generated entrypoint typecheck", process.execPath, [
    path.join(root, "node_modules", "typescript", "bin", "tsc"),
    "--project",
    matrixTsconfig,
    "--noEmit",
  ]);

  const { build } = await import("vite");
  for (const { bits, entry, selected } of entries) {
    const started = performance.now();
    const output = path.join(matrixRoot, "dist", bits);
    try {
      await build({
        configFile: false,
        logLevel: "silent",
        publicDir: false,
        resolve: { alias: { "@octopoly/contracts": path.join(root, "src", "contracts", "index.ts") } },
        build: {
          target: ["es2022", "safari17"],
          outDir: output,
          emptyOutDir: true,
          rollupOptions: {
            input: entry,
            output: {
              entryFileNames: "optional.js",
              chunkFileNames: "chunks/[name]-[hash].js",
            },
          },
        },
      });
      const javascript = (await Promise.all(
        (await walk(output)).filter((file) => file.endsWith(".js")).map((file) => readFile(file, "utf8")),
      )).join("\n");
      for (const definition of definitions) {
        const shouldExist = selected.includes(definition);
        check(
          javascript.includes(definition.concreteToken) === shouldExist,
          `${bits} bundle ${shouldExist ? "omits selected" : "includes unselected"} ${definition.feature} concrete module`,
        );
      }
      commands.push({
        label: `Optional production bundle ${bits}`,
        command: `vite.build(${relative(entry)})`,
        exitCode: 0,
        durationMs: Math.round(performance.now() - started),
      });
    } catch (error) {
      commands.push({
        label: `Optional production bundle ${bits}`,
        command: `vite.build(${relative(entry)})`,
        exitCode: 1,
        durationMs: Math.round(performance.now() - started),
      });
      failures.push(`Optional production bundle ${bits} failed: ${reasonFrom(error)}`);
    }
  }
}

function moduleSpecifier(fromDirectory, file) {
  const candidate = path.relative(fromDirectory, file).replaceAll("\\", "/");
  return candidate.startsWith(".") ? candidate : `./${candidate}`;
}
