import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import path from "node:path";
import process from "node:process";

const repositoryRoot = process.cwd();
const artifactRoot = path.resolve(repositoryRoot, process.argv[2] ?? "dist");
const failures = [];
const warnings = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(absolute)));
    else files.push(absolute);
  }
  return files;
}

check(existsSync(artifactRoot), `Missing build artifact directory: ${artifactRoot}`);

if (failures.length === 0) {
  const files = await walk(artifactRoot);
  const relativeFiles = files.map((file) => path.relative(artifactRoot, file).replaceAll("\\", "/"));
  const indexPath = path.join(artifactRoot, "index.html");
  const headersPath = path.join(artifactRoot, "_headers");

  check(relativeFiles.includes("index.html"), "dist/index.html is required.");
  check(relativeFiles.includes("_headers"), "Vite must copy public/_headers to dist/_headers.");

  const forbiddenArtifact = relativeFiles.find(
    (file) =>
      file === "404.html" ||
      file === "_redirects" ||
      file === "_routes.json" ||
      file === "_worker.js" ||
      file.startsWith("functions/"),
  );
  check(forbiddenArtifact === undefined, `Forbidden dynamic/routing artifact found: ${forbiddenArtifact}`);

  const forbiddenRepositoryPaths = [
    "functions",
    "_worker.js",
    "_routes.json",
    "404.html",
    "_redirects",
    "wrangler.json",
    "wrangler.jsonc",
    "wrangler.toml",
    "public/_worker.js",
    "public/_routes.json",
    "public/404.html",
    "public/_redirects",
  ];
  for (const relativePath of forbiddenRepositoryPaths) {
    check(!existsSync(path.join(repositoryRoot, relativePath)), `Forbidden repository path found: ${relativePath}`);
  }

  if (existsSync(indexPath)) {
    const html = await readFile(indexPath, "utf8");
    check(/<title>OctoPoly<\/title>/.test(html), "Built document title must be exactly OctoPoly.");
    check(html.includes("OctoPoly"), "Built shell must retain a visible OctoPoly fallback.");
    check(html.includes('name="octopoly-build" content="bootstrap-v1"'), "Build marker is missing.");

    const assetReferences = [...html.matchAll(/(?:src|href)="([^"?#]+\.(?:js|css))"/g)].map(
      (match) => match[1],
    );
    check(assetReferences.length > 0, "Built index does not reference JS/CSS assets.");
    for (const reference of assetReferences) {
      check(reference.startsWith("/assets/"), `Asset path must be root-absolute for deep links: ${reference}`);
      const localPath = path.join(artifactRoot, reference.replace(/^\//, ""));
      check(existsSync(localPath), `Referenced asset is missing: ${reference}`);
      check(/[-.][A-Za-z0-9_-]{8,}\.(?:js|css)$/.test(reference), `Asset is not content hashed: ${reference}`);
    }
  }

  if (existsSync(headersPath)) {
    const headers = await readFile(headersPath, "utf8");
    check(headers.includes("Cache-Control: no-cache"), "Shell revalidation cache policy is missing.");
    check(
      headers.includes("Cache-Control: public, max-age=31536000, immutable"),
      "Hashed asset immutable cache policy is missing.",
    );
    for (const header of [
      "Content-Security-Policy:",
      "Permissions-Policy:",
      "Referrer-Policy:",
      "X-Content-Type-Options: nosniff",
      "X-Frame-Options: DENY",
    ]) {
      check(headers.includes(header), `Required security header declaration is missing: ${header}`);
    }
  }

  const bundleFiles = files.filter((file) => /\.(?:js|css)$/.test(file));
  const jsFiles = bundleFiles.filter((file) => file.endsWith(".js"));
  let compressedBytes = 0;
  let parsedJsBytes = 0;
  for (const file of bundleFiles) {
    const source = await readFile(file);
    compressedBytes += gzipSync(source, { level: 9 }).byteLength;
    if (file.endsWith(".js")) parsedJsBytes += source.byteLength;
  }

  check(bundleFiles.length > 0, "No JS/CSS bundle artifacts were found.");
  check(compressedBytes <= 250 * 1024, `Compressed JS+CSS hard limit exceeded: ${compressedBytes} bytes.`);
  check(parsedJsBytes <= 1000 * 1024, `Parsed JS proxy hard limit exceeded: ${parsedJsBytes} bytes.`);
  if (compressedBytes > 120 * 1024) warnings.push(`Compressed JS+CSS target exceeded: ${compressedBytes} bytes.`);
  if (parsedJsBytes > 500 * 1024) warnings.push(`Parsed JS target exceeded: ${parsedJsBytes} bytes.`);

  const indexHash = existsSync(indexPath)
    ? createHash("sha256").update(await readFile(indexPath)).digest("hex")
    : null;
  const artifactBytes = (
    await Promise.all(files.map(async (file) => (await stat(file)).size))
  ).reduce((sum, size) => sum + size, 0);

  console.log(
    JSON.stringify(
      {
        artifactRoot,
        files: relativeFiles.length,
        artifactBytes,
        compressedJsCssBytes: compressedBytes,
        parsedJsBytes,
        indexSha256: indexHash,
        warnings,
        failures,
      },
      null,
      2,
    ),
  );
}

if (failures.length > 0) {
  if (!existsSync(artifactRoot)) console.error(failures.join("\n"));
  process.exitCode = 1;
}
