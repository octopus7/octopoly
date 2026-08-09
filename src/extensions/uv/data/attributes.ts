import type { AttributeKey, Vec2 } from "@octopoly/contracts";

export const UV0_ATTRIBUTE: Readonly<AttributeKey<Vec2>> = Object.freeze({
  domain: "corner",
  name: "uv0",
});

export const UV0_SEAM_ATTRIBUTE: Readonly<AttributeKey<boolean>> = Object.freeze({
  domain: "corner",
  name: "uv0.seam",
});
