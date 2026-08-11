import { describe, expect, it } from "vitest";

import { mountShell } from "../src/shell";

describe("OctoPoly shell", () => {
  it("renders the product name in the app root", () => {
    const root = document.createElement("div");

    const elements = mountShell(root);

    expect(root.querySelector("h1")?.textContent).toBe("OctoPoly");
    expect(root.querySelector("main")?.getAttribute("aria-labelledby")).toBe("octopoly-title");
    expect(elements.canvas.getAttribute("aria-label")).toContain("기본 큐브");
  });
});
