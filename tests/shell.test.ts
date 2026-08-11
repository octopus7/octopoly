import { describe, expect, it } from "vitest";

import { mountShell } from "../src/shell";

describe("OctoPoly shell", () => {
  it("renders the product name in the app root", () => {
    const root = document.createElement("div");

    mountShell(root);

    expect(root.querySelector("h1")?.textContent).toBe("OctoPoly");
    expect(root.querySelector("main")?.getAttribute("aria-labelledby")).toBe("octopoly-title");
  });
});

