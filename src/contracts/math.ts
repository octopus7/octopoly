export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Vec4 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

export interface Mat4 {
  readonly elements: ReadonlyArray<number>;
}

export interface Ray {
  readonly origin: Vec3;
  readonly direction: Vec3;
}
