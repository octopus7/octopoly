import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const scanOnly = process.argv.includes("--scan-only");
const failures = [];
const commands = [];
const forbiddenRoots = [
  path.join(root, "src", "extensions"),
  path.join(root, "src", "optional"),
];
const forbiddenTestRoots = [
  path.join(root, "tests", "extensions"),
  path.join(root, "tests", "optional"),
  path.join(root, "tests", "integration", "optional"),
  path.join(root, "tests", "e2e", "optional"),
  path.join(root, "tests", "device", "optional"),
];

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
    if (entry.isDirectory()) files.push(...(await walk(absolute)));
    else files.push(absolute);
  }
  return files;
}

function check(condition, message) {
  if (!condition) failures.push(message);
}

function moduleSpecifiers(source) {
  const result = [];
  const patterns = [
    /\b(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s*)?["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) result.push(match[1]);
  }
  return result;
}

function resolvesToForbidden(importer, specifier) {
  if (/^(?:@octopoly\/)?extensions(?:\/|$)/.test(specifier)) return true;
  if (specifier.includes("/extensions/")) return true;
  if (!specifier.startsWith(".")) return false;
  const resolved = path.resolve(path.dirname(importer), specifier);
  return forbiddenRoots.some((directory) => isUnder(resolved, directory));
}

const sourceFiles = (await walk(path.join(root, "src"))).filter(
  (file) => /\.tsx?$/.test(file) && !forbiddenRoots.some((directory) => isUnder(file, directory)),
);
for (const file of sourceFiles) {
  const source = await readFile(file, "utf8");
  for (const specifier of moduleSpecifiers(source)) {
    check(
      !resolvesToForbidden(file, specifier),
      `Core import crosses the Optional boundary: ${relative(file)} -> ${specifier}`,
    );
  }
  check(!/\bGPUDevice\b|\bGPUAdapter\b|getContext\(\s*["']webgpu["']/.test(source),
    `Core contains a required WebGPU implementation path: ${relative(file)}`);
}

const repositoryFiles = await walk(path.join(root, "src"));
const wgslFiles = repositoryFiles.filter((file) => file.toLowerCase().endsWith(".wgsl"));
check(wgslFiles.length === 0, `WGSL source is not part of the Core baseline: ${wgslFiles.map(relative).join(", ")}`);
check(existsSync(path.join(root, "src", "renderer", "index.ts")), "Core renderer public entry is missing.");
check(existsSync(path.join(root, "src", "main.ts")), "Core application entry is missing.");

let temporaryRoot = null;
try {
  if (!scanOnly && failures.length === 0) {
    // A repository-local unique temp directory lets TypeScript resolve the pinned
    // node_modules types while leaving every source/Optional directory untouched.
    temporaryRoot = await mkdtemp(path.join(root, ".verify-core-"));
    const coreFiles = [
      ...sourceFiles,
      ...(await walk(path.join(root, "tests"))).filter(
        (file) => /\.tsx?$/.test(file)
          && !isUnder(file, path.join(root, "tests", "optional-sdk"))
          && !forbiddenTestRoots.some((directory) => isUnder(file, directory)),
      ),
      path.join(root, "vite.config.ts"),
      path.join(root, "vitest.config.ts"),
    ].filter(existsSync);
    const tsconfig = path.join(temporaryRoot, "tsconfig.core.json");
    await writeFile(tsconfig, JSON.stringify({
      extends: path.join(root, "tsconfig.json").replaceAll("\\", "/"),
      files: coreFiles.map((file) => file.replaceAll("\\", "/")),
      exclude: forbiddenRoots.map((file) => `${file.replaceAll("\\", "/")}/**`),
    }, null, 2));

    run("core typecheck", process.execPath, [
      path.join(root, "node_modules", "typescript", "bin", "tsc"),
      "--project",
      tsconfig,
      "--noEmit",
    ]);
    run("core tests", process.execPath, [
      path.join(root, "node_modules", "vitest", "vitest.mjs"),
      "run",
      "--exclude",
      "tests/optional-sdk/**",
      "--exclude",
      "tests/extensions/**",
      "--exclude",
      "tests/optional/**",
      "--exclude",
      "tests/integration/optional/**",
      "--exclude",
      "tests/e2e/optional/**",
      "--exclude",
      "tests/device/optional/**",
    ]);

    const artifactRoot = path.join(temporaryRoot, "dist");
    run("core Vite build", process.execPath, [
      path.join(root, "node_modules", "vite", "bin", "vite.js"),
      "build",
      "--outDir",
      artifactRoot,
      "--emptyOutDir",
    ]);
    run("core artifact limits", process.execPath, [
      path.join(root, "scripts", "verify-baseline.mjs"),
      artifactRoot,
    ]);
  }
} finally {
  if (temporaryRoot !== null) {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

console.log(JSON.stringify({
  status: failures.length === 0 ? "PASS" : "FAIL",
  mode: scanOnly ? "scan-only" : "scan-and-execute",
  coreSourceFiles: sourceFiles.length,
  excludedOptionalRoots: forbiddenRoots.map(relative),
  optionalRootsPresent: forbiddenRoots.filter(existsSync).map(relative),
  wgslFiles: wgslFiles.map(relative),
  commands,
  failures,
}, null, 2));

if (failures.length > 0) process.exitCode = 1;

function run(label, command, args) {
  const started = performance.now();
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NODE_ENV: "test" },
  });
  const record = {
    label,
    command: [pathToFileURL(command).href, ...args.map(String)].join(" "),
    exitCode: result.status,
    durationMs: Math.round(performance.now() - started),
  };
  commands.push(record);
  if (result.status !== 0) {
    failures.push(`${label} failed with exit code ${result.status ?? "unknown"}\n${result.stdout}\n${result.stderr}`.trim());
  }
}
