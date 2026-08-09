import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const baseUrl = new URL(process.argv[2] ?? "https://octopoly.pages.dev/");
const artifactRoot = path.resolve(process.cwd(), process.argv[3] ?? "dist");
const deepLink = process.argv[4] ?? "/__octopoly_bootstrap_probe__";
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function fetchChecked(url) {
  const response = await fetch(url, {
    headers: { "Cache-Control": "no-cache" },
    redirect: "follow",
  });
  check(response.ok, `${url} returned HTTP ${response.status}.`);
  return response;
}

function verifySecurityHeaders(response, label) {
  const required = [
    "content-security-policy",
    "permissions-policy",
    "referrer-policy",
    "x-content-type-options",
    "x-frame-options",
  ];
  for (const header of required) {
    check(response.headers.has(header), `${label} is missing ${header}.`);
  }
}

const indexPath = path.join(artifactRoot, "index.html");
check(existsSync(indexPath), `Build first; missing ${indexPath}.`);

if (failures.length === 0) {
  const localIndex = await readFile(indexPath);
  const localIndexText = localIndex.toString("utf8");
  const rootResponse = await fetchChecked(new URL("/", baseUrl));
  const rootBody = Buffer.from(await rootResponse.arrayBuffer());
  const deepResponse = await fetchChecked(new URL(deepLink, baseUrl));
  const deepBody = Buffer.from(await deepResponse.arrayBuffer());

  check(rootBody.equals(localIndex), "Production root does not match local dist/index.html.");
  check(deepBody.equals(localIndex), "Production deep link does not return the same SPA shell artifact.");
  check(rootBody.toString("utf8").includes("OctoPoly"), "Production shell does not contain OctoPoly.");
  verifySecurityHeaders(rootResponse, "Production root");
  verifySecurityHeaders(deepResponse, "Production deep link");

  const rootCache = rootResponse.headers.get("cache-control") ?? "";
  check(
    rootCache.includes("no-cache") || rootCache.includes("max-age=0"),
    `Production shell is not configured for revalidation: ${rootCache || "missing"}.`,
  );

  const assetReferences = [...localIndexText.matchAll(/(?:src|href)="([^"?#]+\.(?:js|css))"/g)].map(
    (match) => match[1],
  );
  const assets = [];
  for (const reference of assetReferences) {
    const localPath = path.join(artifactRoot, reference.replace(/^\//, ""));
    check(existsSync(localPath), `Local asset missing: ${reference}`);
    if (!existsSync(localPath)) continue;

    const localAsset = await readFile(localPath);
    const response = await fetchChecked(new URL(reference, baseUrl));
    const remoteAsset = Buffer.from(await response.arrayBuffer());
    const cache = response.headers.get("cache-control") ?? "";
    check(remoteAsset.equals(localAsset), `Production asset differs from local artifact: ${reference}`);
    check(cache.includes("immutable"), `Production asset is not immutable: ${reference} (${cache || "missing"}).`);
    check(/max-age=31536000/.test(cache), `Production asset max-age is not one year: ${reference}.`);
    assets.push({ path: reference, sha256: sha256(localAsset), cacheControl: cache });
  }

  console.log(
    JSON.stringify(
      {
        project: "octopoly",
        productionUrl: baseUrl.toString(),
        deepLink,
        checkedAt: new Date().toISOString(),
        indexSha256: sha256(localIndex),
        assets,
        failures,
      },
      null,
      2,
    ),
  );
}

if (failures.length > 0) {
  if (!existsSync(indexPath)) console.error(failures.join("\n"));
  process.exitCode = 1;
}
