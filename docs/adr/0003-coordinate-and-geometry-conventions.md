# ADR-0003: Coordinate and Geometry Conventions

- Status: Accepted
- Date: 2026-08-10

## Context

Parallel geometry, camera, picking, surface, and renderer work requires one transform and winding convention.

## Decision

- World space is right-handed with `+Y` up. Camera forward in view space is `-Z`.
- Length is expressed in project units. Import/export adapters convert source units at their boundaries.
- Matrices are stored column-major and multiply column vectors on the left. The transform chain is
  `clip = projection * view * world * localPosition`.
- Counter-clockwise winding is front-facing when viewed from the front. Geometric normals follow the right-hand rule;
  transformed normals use the inverse transpose and are normalized.
- Spaces are named local/object, world, view, clip, NDC, and screen. WebGL NDC is `x,y,z` in `[-1, 1]`; screen origin is
  the viewport top-left with `+x` right and `+y` down.
- Public pointer and picking coordinates use CSS pixels. Renderer alone converts to device pixels using the viewport
  device-pixel ratio.
- Public rays are world-space and have finite origins and unit-length directions. A zero or non-finite direction is
  rejected before query execution.
- UV origin and direction are not Core geometry conventions. UV semantics remain owned by Optional workstream 10.

## Alternatives

Left-handed coordinates, `+Z` up, row vectors, and clockwise front faces were rejected because mixing conventions across
parallel packages creates silent orientation defects.

## Consequences

Every adapter must make space conversion explicit. Renderer and query code can share snapshots without transposition or
winding guesses.

## Validation

Contract and module fixtures verify identity and composed transforms, camera `-Z` forward rays, CCW normals, top-left
screen mapping, CSS/device-pixel separation, and normalized ray rejection.
