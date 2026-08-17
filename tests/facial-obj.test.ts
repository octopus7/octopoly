import { describe, expect, it } from "vitest";

import { parseObjMesh, parseObjObjectMesh } from "../src/facial/obj";

describe("parseObjMesh", () => {
  it("parses a triangle into shared indexed positions", () => {
    expect(
      parseObjMesh(`
        v 0 0 0
        v 1 0 0
        v 0 1 0
        f 1 2 3
      `),
    ).toEqual({
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      indices: [0, 1, 2],
    });
  });

  it("ignores comments, blank lines, and unsupported records", () => {
    expect(
      parseObjMesh(`
        # triangle
        o Face

        v 0 0 0 # origin
        v 1 0 0
        vt 0 0
        v 0 1 0
        f 1 2 3 # triangle face
      `),
    ).toEqual({
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      indices: [0, 1, 2],
    });
  });

  it("accepts every OBJ face token form", () => {
    const mesh = parseObjMesh(`
      v 0 0 0
      v 1 0 0
      v 0 1 0
      vt 0 0
      vn 0 0 1
      f 1 2/2 3//3
      f 1/1/1 2/2/2 3/3/3
    `);

    expect(mesh.indices).toEqual([0, 1, 2, 0, 1, 2]);
  });

  it("resolves valid negative indexes relative to declared vertices", () => {
    expect(
      parseObjMesh(`
        v 0 0 0
        v 1 0 0
        v 1 1 0
        v 0 1 0
        f -4 -3 -2 -1
      `).indices,
    ).toEqual([0, 1, 2, 0, 2, 3]);
  });

  it("rejects non-finite vertex coordinates", () => {
    expect(() =>
      parseObjMesh(`
        v 0 Infinity 0
        v 1 0 0
        v 0 1 0
        f 1 2 3
      `),
    ).toThrow("OBJ vertex on line 2 must contain three finite coordinates");
  });

  it("rejects hexadecimal vertex coordinates", () => {
    expect(() =>
      parseObjMesh(`
        v 0x1 0 0
        v 1 0 0
        v 0 1 0
        f 1 2 3
      `),
    ).toThrow("OBJ vertex on line 2 must contain three finite coordinates");
  });

  it("rejects coordinates that overflow Float32", () => {
    expect(() =>
      parseObjMesh(`
        v 3.4028236e38 0 0
        v 1 0 0
        v 0 1 0
        f 1 2 3
      `),
    ).toThrow("OBJ vertex on line 2 must contain three finite coordinates");
  });

  it("rejects vertices with missing coordinates", () => {
    expect(() =>
      parseObjMesh(`
        v 0 0
        v 1 0 0
        v 0 1 0
        f 1 2 3
      `),
    ).toThrow("OBJ vertex on line 2 must contain three finite coordinates");
  });

  it("rejects vertices with extra coordinates", () => {
    expect(() =>
      parseObjMesh(`
        v 0 0 0 1
        v 1 0 0
        v 0 1 0
        f 1 2 3
      `),
    ).toThrow("OBJ vertex on line 2 must contain three finite coordinates");
  });

  it("rejects faces with fewer than three vertices", () => {
    expect(() =>
      parseObjMesh(`
        v 0 0 0
        v 1 0 0
        f 1 2
      `),
    ).toThrow("OBJ face on line 4 must contain at least three vertices");
  });

  it("rejects zero face vertex indexes", () => {
    expect(() =>
      parseObjMesh(`
        v 0 0 0
        v 1 0 0
        v 0 1 0
        f 0 2 3
      `),
    ).toThrow('OBJ face vertex index "0" on line 5 must be a non-zero integer');
  });

  it("rejects non-integer face vertex indexes", () => {
    expect(() =>
      parseObjMesh(`
        v 0 0 0
        v 1 0 0
        v 0 1 0
        f 1 2.5 3
      `),
    ).toThrow(
      'OBJ face vertex index "2.5" on line 5 must be a non-zero integer',
    );
  });

  it("rejects scientific notation in face vertex indexes", () => {
    expect(() =>
      parseObjMesh(`
        v 0 0 0
        v 1 0 0
        v 0 1 0
        f 1e0 2 3
      `),
    ).toThrow(
      'OBJ face vertex index "1e0" on line 5 must be a non-zero integer',
    );
  });

  it.each(["1///bogus", "2/garbage", "3/", "1/0", "1//0", "1/1/0"])(
    "rejects malformed face vertex reference %s",
    (token) => {
      expect(() =>
        parseObjMesh(`
          v 0 0 0
          v 1 0 0
          v 0 1 0
          f 1 2 ${token}
        `),
      ).toThrow(
        `OBJ face vertex reference "${token}" on line 5 must match v, v/vt, v//vn, or v/vt/vn with non-zero integer components`,
      );
    },
  );

  it.each(["4", "-4"])(
    "rejects out-of-range face vertex index %s",
    (index) => {
      expect(() =>
        parseObjMesh(`
          v 0 0 0
          v 1 0 0
          v 0 1 0
          f 1 2 ${index}
        `),
      ).toThrow(
        `OBJ face vertex index "${index}" on line 5 is out of range for 3 vertices`,
      );
    },
  );

  it("rejects files without vertices", () => {
    expect(() => parseObjMesh("# no geometry")).toThrow(
      "OBJ mesh must contain at least one vertex",
    );
  });

  it("rejects files without faces", () => {
    expect(() => parseObjMesh("v 0 0 0\nv 1 0 0\nv 0 1 0")).toThrow(
      "OBJ mesh must contain at least one face",
    );
  });
});

describe("parseObjObjectMesh", () => {
  it("compacts and remaps only vertices referenced by the selected object", () => {
    expect(parseObjObjectMesh(`
      o Body
      v 0 0 0
      v 1 0 0
      v 0 1 0
      f 1 2 3
      o SKM_Luna.Face.eye
      v 10 0 0
      v 11 0 0
      v 10 1 0
      f 4/1/1 5/2/2 6/3/3
    `, "SKM_Luna.Face.eye")).toEqual({
      positions: [10, 0, 0, 11, 0, 0, 10, 1, 0],
      indices: [0, 1, 2],
    });
  });

  it("fails closed when the requested object is absent", () => {
    expect(() => parseObjObjectMesh(`
      o Body
      v 0 0 0
      v 1 0 0
      v 0 1 0
      f 1 2 3
    `, "SKM_Luna.Face.eye")).toThrow('OBJ object "SKM_Luna.Face.eye" was not found');
  });
});
