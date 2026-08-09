# ADR-0004: Numeric Precision and Tolerance Policy

- Status: Accepted
- Date: 2026-08-10

## Context

The frozen contract requires finite, deterministic geometry behavior without applying one epsilon to unrelated tests.

## Decision

- CPU scalar operations use JavaScript `number` (IEEE-754 binary64). GPU attributes and uniforms use high-precision
  binary32 unless a later renderer capability explicitly requires another representation.
- JSON serialization writes finite numbers with JavaScript's shortest round-tripping decimal representation. Persisted
  positions are not globally quantized.
- Non-finite input is rejected before mutation/query state changes. Degenerate input is a normal validation rejection or
  miss, never a partially applied mutation.
- Let `sceneScale = max(1 project unit, worldBoundsDiagonal)`. The canonical frozen-contract object is
  `NUMERIC_TOLERANCE_POLICY`; workstreams do not add local epsilon constants. Its values and uses are:

| Contract field | Value / derived formula | Use |
|---|---:|---|
| `absoluteDistance` | `1e-9` project unit | absolute distance floor |
| `relativeDistance` | `1e-9` | scale-relative distance comparison |
| derived distance | `max(absoluteDistance, relativeDistance * sceneScale)` | positions, duplicate candidates, ray distance |
| `angleRadians` | `1e-6` radians | angular equality, parallel/collinear classification |
| `normalizedVector` | `1e-9` | minimum finite vector length before normalization |
| `barycentric` | `1e-7` | hit inclusion and sum-to-one |
| `areaScaleFactor` | `1e-12` | scale-relative degenerate area factor |
| derived area | `max(absoluteDistance², areaScaleFactor * sceneScale²)` project unit² | degenerate triangles/faces |

- Approximate scalar comparison is
  `abs(a-b) <= max(absoluteDistance, relativeDistance * max(abs(a), abs(b)))` unless a named geometry tolerance above
  applies.
- Ties within the named tolerance use stable ordering: distance, then element kind `vertex < edge < face`, then numeric
  stable ID, then canonical corner order. Algorithms must not depend on object/map iteration order.
- No implicit global quantization is allowed. A local acceleration structure may quantize internal keys only when it
  preserves the public deterministic ordering and does not alter serialized values.
- IDs and versions are non-negative safe integers. IDs increase monotonically and are never reused. Each successful
  atomic mutation increments version exactly once. Imminent `Number.MAX_SAFE_INTEGER` overflow fails before mutation.

## Alternatives

One universal epsilon and float32 CPU topology were rejected because scale and operation semantics differ. Global
position quantization was rejected because it would silently alter imported and saved geometry.

## Consequences

Workstreams import the published numeric policy rather than inventing constants. Scale-aware tests must include very
small, unit-scale, and large fixtures.

## Validation

Contract tests assert exported values and finite-input rules. Mesh/surface/retopo tests cover tolerance boundaries,
stable ties, degeneracy, non-finite rejection, ID non-reuse, and pre-mutation overflow failure.
