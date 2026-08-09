import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const requirePhysical = process.argv.includes("--require-physical");
const evidenceIndex = process.argv.indexOf("--evidence");
const evidencePath = evidenceIndex >= 0 && process.argv[evidenceIndex + 1]
  ? path.resolve(root, process.argv[evidenceIndex + 1])
  : null;
const fixturePath = path.join(root, "tests", "device", "fixtures", "ipados-17.4-pencil.json");
const checklistPath = path.join(root, "docs", "validation", "ipad", "physical-device-checklist.md");
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

check(existsSync(fixturePath), `Missing replay fixture: ${fixturePath}`);
check(existsSync(checklistPath), `Missing physical-device checklist: ${checklistPath}`);

if (existsSync(fixturePath)) {
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  check(fixture.schemaVersion === 1, "Device fixture schemaVersion must be 1.");
  check(fixture.target?.minimumOs === "iPadOS 17.4", "Device fixture must target the minimum iPadOS 17.4 line.");
  check(fixture.target?.browser === "Safari", "Device fixture must target Safari.");
  check(fixture.target?.input === "Apple Pencil", "Device fixture must target Apple Pencil.");
  check(Array.isArray(fixture.stroke) && fixture.stroke.some((event) => event.type === "pointermove" && event.coalesced?.length > 0),
    "Device fixture must include coalesced Pencil movement.");
  check(Array.isArray(fixture.touchDuringStroke) && fixture.touchDuringStroke.length > 0,
    "Device fixture must include touch while Pencil is active.");
  check(fixture.lostCapture && fixture.explicitCancel, "Device fixture must include lost capture and explicit cancel.");
  check(Array.isArray(fixture.viewportChanges) && fixture.viewportChanges.some((change) => change.event === "orientationchange"),
    "Device fixture must include orientation recovery.");
}

if (existsSync(checklistPath)) {
  const checklist = await readFile(checklistPath, "utf8");
  for (const marker of [
    "down / move / coalesced / up",
    "pointercancel / lost capture",
    "Pencil / touch separation",
    "resize / orientation",
    "context loss / restore",
    "30-minute thermal",
    "NOT_RUN",
  ]) {
    check(checklist.includes(marker), `Checklist marker is missing: ${marker}`);
  }
}

let physicalStatus = "NOT_RUN";
if (evidencePath !== null) {
  if (!existsSync(evidencePath)) {
    failures.push(`Physical evidence file does not exist: ${evidencePath}`);
  } else {
    const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
    physicalStatus = evidence.status ?? "INVALID";
    validateEvidence(evidence);
  }
}

const automatedStatus = failures.length === 0 ? "PASS" : "FAIL";
const releaseReadiness = automatedStatus === "PASS" && physicalStatus === "PASS" ? "READY" : "BLOCKED";
console.log(JSON.stringify({
  automatedFixture: automatedStatus,
  physicalDevice: physicalStatus,
  releaseReadiness,
  fixturePath: path.relative(root, fixturePath).replaceAll("\\", "/"),
  checklistPath: path.relative(root, checklistPath).replaceAll("\\", "/"),
  evidencePath,
  failures,
  note: physicalStatus === "NOT_RUN"
    ? "Desktop/jsdom automation does not replace physical iPadOS 17.4 Safari and Apple Pencil evidence."
    : undefined,
}, null, 2));

if (failures.length > 0 || (requirePhysical && releaseReadiness !== "READY")) process.exitCode = 1;

function validateEvidence(evidence) {
  check(evidence.schemaVersion === 1, "Physical evidence schemaVersion must be 1.");
  check(evidence.status === "PASS", "Physical evidence status must be PASS.");
  check(typeof evidence.commit === "string" && /^[0-9a-f]{40}$/i.test(evidence.commit),
    "Physical evidence must identify a full commit SHA.");
  check(Array.isArray(evidence.devices) && evidence.devices.length >= 2,
    "Physical evidence must include minimum-line and representative devices.");
  for (const device of evidence.devices ?? []) {
    check(typeof device.model === "string" && device.model.length > 0, "Each device needs a model.");
    check(typeof device.osBuild === "string" && device.osBuild.length > 0, "Each device needs an iPadOS build.");
    check(typeof device.safariBuild === "string" && device.safariBuild.length > 0, "Each device needs a Safari build.");
    check(typeof device.pencil === "string" && device.pencil.length > 0, "Each device needs an Apple Pencil model.");
  }
  const requiredChecks = [
    "pointer-sequence",
    "capture-cancel",
    "pencil-touch-separation",
    "resize-orientation",
    "context-restore",
    "project-round-trip",
  ];
  for (const id of requiredChecks) {
    check(evidence.checks?.find((entry) => entry.id === id)?.status === "PASS",
      `Physical evidence check must pass: ${id}`);
  }
  check((evidence.measurementRuns ?? 0) >= 5, "Physical performance evidence needs at least five runs.");
  const maximumMetrics = {
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
  for (const [name, hardLimit] of Object.entries(maximumMetrics)) {
    const value = evidence.metrics?.[name];
    check(Number.isFinite(value) && value <= hardLimit,
      `Physical metric ${name} must be finite and at or below ${hardLimit}.`);
  }
  check(Number.isFinite(evidence.metrics?.minimumObservedFps) && evidence.metrics.minimumObservedFps >= 30,
    "Physical metric minimumObservedFps must be finite and at or above 30.");
  check(Number.isFinite(evidence.thermal?.durationMinutes) && evidence.thermal.durationMinutes >= 30,
    "Release thermal evidence must run for at least 30 minutes.");
  check(Number.isFinite(evidence.thermal?.maximumDegradationPercent) && evidence.thermal.maximumDegradationPercent <= 20,
    "Thermal frame/latency degradation must remain at or below 20%.");
  check(Number.isFinite(evidence.thermal?.minimumFps) && evidence.thermal.minimumFps >= 30,
    "Thermal run must remain at or above 30 fps.");
  check(evidence.thermal?.memoryPressure === false, "Thermal run must not trigger memory pressure.");
  check(evidence.thermal?.unexpectedContextLoss === false, "Thermal run must not trigger unexpected context loss.");
}
