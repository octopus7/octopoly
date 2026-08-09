import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const selectionRoot = join(process.cwd(), "src", "selection");

function sourceFiles(directory: string): ReadonlyArray<string> {
  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        return sourceFiles(path);
      }
      return extname(entry.name) === ".ts" ? [path] : [];
    });
}

describe("selection dependency boundary", () => {
  it("depends only on canonical contracts and selection-local modules", () => {
    const violations: string[] = [];

    for (const file of sourceFiles(selectionRoot)) {
      const source = readFileSync(file, "utf8");
      const label = relative(selectionRoot, file);
      const moduleSpecifiers = source.matchAll(/(?:from\s+|import\s*)["']([^"']+)["']/gu);

      for (const match of moduleSpecifiers) {
        const specifier = match[1];
        if (specifier !== undefined && specifier !== "@octopoly/contracts" && !specifier.startsWith(".")) {
          violations.push(`${label}: unexpected dependency ${specifier}`);
        }
        if (specifier?.includes("contracts/") || specifier?.includes("mesh-kernel")) {
          violations.push(`${label}: non-canonical dependency ${specifier}`);
        }
      }

      for (const forbidden of [
        "MeshKernel",
        "MeshMutationService",
        "MeshSnapshot",
        "PickingService",
        "PickHit",
        "PointerEvent",
        "PointerSample",
        "RendererService",
        "HistoryService",
      ]) {
        if (source.includes(forbidden)) {
          violations.push(`${label}: forbidden boundary ${forbidden}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
