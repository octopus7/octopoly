import type { ShadingProgramDescriptor } from "@octopoly/contracts";

import { isLookdevQualityProgramWithinBudget } from "./budget";

export const LOOKDEV_QUALITY_VERTEX_SHADER = `#version 300 es
precision highp float;

in vec3 position;
in vec3 normal;

uniform mat4 uViewProjection;

out highp vec3 vWorldPosition;
out highp vec3 vWorldNormal;

void main() {
  vWorldPosition = position;
  vWorldNormal = normal;
  gl_Position = uViewProjection * vec4(position, 1.0);
}`;

export const LOOKDEV_QUALITY_FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp int;

in highp vec3 vWorldPosition;
in highp vec3 vWorldNormal;

uniform vec4 uBaseColor;
uniform float uMetallic;
uniform float uRoughness;
uniform float uNormalScale;
uniform vec3 uEmissive;
uniform float uOpacity;
uniform vec3 uCameraPosition;
uniform vec3 uEnvironmentUpper;
uniform vec3 uEnvironmentLower;
uniform float uEnvironmentIntensity;
uniform vec3 uKeyLightDirection;
uniform vec3 uKeyLightColor;
uniform float uKeyLightIntensity;
uniform vec3 uFillLightDirection;
uniform vec3 uFillLightColor;
uniform float uFillLightIntensity;
uniform vec3 uRimLightDirection;
uniform vec3 uRimLightColor;
uniform float uRimLightIntensity;
uniform float uExposure;

uniform sampler2D uBaseColorMap;
uniform sampler2D uMetallicMap;
uniform sampler2D uRoughnessMap;
uniform sampler2D uNormalMap;
uniform sampler2D uEmissiveMap;
uniform sampler2D uOpacityMap;
uniform float uHasBaseColorMap;
uniform float uHasMetallicMap;
uniform float uHasRoughnessMap;
uniform float uHasNormalMap;
uniform float uHasEmissiveMap;
uniform float uHasOpacityMap;

out vec4 outColor;

const float PI = 3.14159265359;

vec3 fresnelSchlick(float cosTheta, vec3 f0) {
  return f0 + (1.0 - f0) * pow(1.0 - cosTheta, 5.0);
}

float distributionGgx(float nDotH, float roughness) {
  float a = roughness * roughness;
  float a2 = a * a;
  float denominator = nDotH * nDotH * (a2 - 1.0) + 1.0;
  return a2 / max(PI * denominator * denominator, 0.0001);
}

float geometrySchlickGgx(float nDotV, float roughness) {
  float r = roughness + 1.0;
  float k = (r * r) * 0.125;
  return nDotV / max(nDotV * (1.0 - k) + k, 0.0001);
}

vec3 evaluateLight(
  vec3 n,
  vec3 v,
  vec3 direction,
  vec3 radiance,
  vec3 baseColor,
  float metallic,
  float roughness,
  vec3 f0
) {
  vec3 l = normalize(-direction);
  vec3 h = normalize(v + l);
  float nDotV = max(dot(n, v), 0.0001);
  float nDotL = max(dot(n, l), 0.0);
  float nDotH = max(dot(n, h), 0.0);
  float vDotH = max(dot(v, h), 0.0);
  vec3 f = fresnelSchlick(vDotH, f0);
  float d = distributionGgx(nDotH, roughness);
  float g = geometrySchlickGgx(nDotV, roughness) * geometrySchlickGgx(nDotL, roughness);
  vec3 specular = (d * g * f) / max(4.0 * nDotV * max(nDotL, 0.0001), 0.0001);
  vec3 diffuse = (1.0 - f) * (1.0 - metallic) * baseColor / PI;
  return (diffuse + specular) * radiance * nDotL;
}

vec3 acesToneMap(vec3 color) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((color * (a * color + b)) / (color * (c * color + d) + e), 0.0, 1.0);
}

mat3 surfaceBasis(vec3 n) {
  vec3 axis = abs(n.y) < 0.999 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 tangent = normalize(cross(axis, n));
  return mat3(tangent, cross(n, tangent), n);
}

void main() {
  vec2 uv = fract(vWorldPosition.xz);
  vec3 baseColor = uBaseColor.rgb;
  float metallic = uMetallic;
  float roughness = uRoughness;
  vec3 emissive = uEmissive;
  float opacity = uOpacity;
  if (uHasBaseColorMap > 0.5) baseColor = texture(uBaseColorMap, uv).rgb;
  if (uHasMetallicMap > 0.5) metallic = texture(uMetallicMap, uv).r;
  if (uHasRoughnessMap > 0.5) roughness = texture(uRoughnessMap, uv).r;
  if (uHasEmissiveMap > 0.5) emissive = texture(uEmissiveMap, uv).rgb;
  if (uHasOpacityMap > 0.5) opacity = texture(uOpacityMap, uv).r;
  metallic = clamp(metallic, 0.0, 1.0);
  roughness = clamp(roughness, 0.04, 1.0);
  opacity = clamp(opacity, 0.0, 1.0);

  vec3 geometricNormal = normalize(vWorldNormal);
  vec3 n = geometricNormal;
  if (uHasNormalMap > 0.5) {
    vec3 sampledNormal = texture(uNormalMap, uv).xyz * 2.0 - 1.0;
    sampledNormal.xy *= uNormalScale;
    n = normalize(surfaceBasis(geometricNormal) * sampledNormal);
  }

  vec3 v = normalize(uCameraPosition - vWorldPosition);
  vec3 f0 = mix(vec3(0.04), baseColor, metallic);
  vec3 direct = evaluateLight(
    n, v, uKeyLightDirection, uKeyLightColor * uKeyLightIntensity,
    baseColor, metallic, roughness, f0
  );
  direct += evaluateLight(
    n, v, uFillLightDirection, uFillLightColor * uFillLightIntensity,
    baseColor, metallic, roughness, f0
  );
  direct += evaluateLight(
    n, v, uRimLightDirection, uRimLightColor * uRimLightIntensity,
    baseColor, metallic, roughness, f0
  );

  float nDotV = max(dot(n, v), 0.0);
  float skyMix = n.y * 0.5 + 0.5;
  vec3 environment = mix(uEnvironmentLower, uEnvironmentUpper, skyMix);
  vec3 environmentDiffuse = baseColor * (1.0 - metallic) * environment;
  vec3 environmentSpecular = fresnelSchlick(nDotV, f0) * environment * (1.0 - 0.45 * roughness);
  float horizonOcclusion = smoothstep(-0.2, 0.35, n.y);
  vec3 hdr = direct +
    (environmentDiffuse + environmentSpecular) * uEnvironmentIntensity * mix(0.65, 1.0, horizonOcclusion) +
    emissive;
  vec3 display = pow(acesToneMap(max(hdr * uExposure, vec3(0.0))), vec3(1.0 / 2.2));
  outColor = vec4(display, opacity * uBaseColor.a);
}`;

export const LOOKDEV_QUALITY_PROGRAM: ShadingProgramDescriptor = Object.freeze({
  language: "glsl-es-300",
  vertexShader: LOOKDEV_QUALITY_VERTEX_SHADER,
  fragmentShader: LOOKDEV_QUALITY_FRAGMENT_SHADER,
  defines: Object.freeze({ LOOKDEV_QUALITY_SINGLE_PASS: true }),
  attributes: Object.freeze([
    Object.freeze({ shaderName: "position", source: "position" as const }),
    Object.freeze({ shaderName: "normal", source: "normal" as const }),
  ]),
});

if (!isLookdevQualityProgramWithinBudget(LOOKDEV_QUALITY_PROGRAM)) {
  throw new Error("Quality lookdev GLSL exceeds the frozen mobile shader budget");
}
