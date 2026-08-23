/* ============================================================
   shaders.js — every GLSL program used on haoqi.design, ported
   (near-)verbatim from the production bundle so the techniques
   can be studied one at a time.

   1. BACKGROUND "SKY"   — a 4-pass low-res image pipeline:
                            vignette → swirl → sine-warp → bokeh → output composite
   2. GLASS              — screen-space refraction w/ chromatic dispersion
                            (samples an FBO of the scene behind the mesh)
   3. IMAGE QUAD         — fullscreen quad clipped to a DOM rect, with
                            scroll-velocity "curl", polarity fade, pixel-dot hover reveal
   4. HYPERSPACE         — starfield "warp" painted onto the cursor arrow mesh
   5. LENS FLARE         — 6-ray star streaks on >0.99-luma pixels + composite
   ============================================================ */

// ---------- shared ----------
export const fsQuadVert = /* glsl */`
precision mediump float; precision mediump int;
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;

export const clipQuadVert = /* glsl */`
precision mediump float; precision mediump int;
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position, 1.0); }`;

// ============================================================
// 1. BACKGROUND SKY PIPELINE
// ============================================================

// Pass 1 — VIGNETTE. Ignores its input: paints a fresh elliptical
// gradient (clear→vignette color) whose centre follows the pointer.
// The skew (0.54 / 0.46) makes it an ellipse; edgeIntensity biases
// the whole thing lighter/darker.
export const vignetteFrag = /* glsl */`
precision mediump float; precision mediump int;
varying vec2 vUv;
uniform float uRadius, uFalloff, uMix, uDisplace, uSkew, uAngle, uEdgeIntensity;
uniform vec3 uVignetteColor, uClearColor;
uniform vec2 uPos, uResolution;
mat2 rot(float a){ return mat2(cos(a),-sin(a),sin(a),cos(a)); }
void main(){
  vec2 uv = vUv;
  vec4 color = vec4(vec3(1.), 0.);
  float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  float displacement = (luma - 0.5) * uDisplace * 0.5;
  vec2 aspectRatio = vec2(uResolution.x/uResolution.y, 1.0);
  vec2 skew = vec2(uSkew, 1.0 - uSkew);
  float halfRadius = uRadius * 0.5;
  float innerEdge = halfRadius - uFalloff * halfRadius * 0.5;
  float outerEdge = halfRadius + uFalloff * halfRadius * 0.5;
  vec2 pos = uPos;
  vec2 scaledUV  = uv  * aspectRatio * rot(uAngle * 6.28318530718) * skew;
  vec2 scaledPos = pos * aspectRatio * rot(uAngle * 6.28318530718) * skew;
  float radius = distance(scaledUV, scaledPos);
  float falloff = smoothstep(innerEdge + displacement, outerEdge + displacement, radius);
  float brighten = max(uEdgeIntensity, 0.0);
  float darken   = max(-uEdgeIntensity, 0.0);
  falloff = mix(falloff, 0.0, brighten);
  falloff = mix(falloff, 1.0, darken);
  vec3 mixed = mix(uClearColor, uVignetteColor, falloff);
  gl_FragColor = vec4(mixed, falloff);
}`;

// Pass 2 — SWIRL. Rotates UVs inside a radius around the pointer,
// the twist angle animates with time so the gradient slowly churns.
export const swirlFrag = /* glsl */`
precision mediump float; precision mediump int;
varying vec2 vUv;
uniform vec2 uResolution, uPos;
uniform sampler2D tInput;
uniform float uRadius, uAngle, uPhase, uTime, uMix;
void main(){
  vec2 uv = vUv;
  float angle = uAngle * 10.;
  vec2 originalUV = uv;
  vec2 pos = uPos;
  uv -= pos;
  vec2 R = vec2(uv.x * uResolution.x / uResolution.y, uv.y);
  float distanceToCenter = length(R);
  if (distanceToCenter <= uRadius) {
    float rot = atan(R.y, R.x) + angle * smoothstep(uRadius, 0., distanceToCenter);
    uv = vec2(cos(rot + uTime / 20. + uPhase * 6.28318530718), sin(rot + uTime / 20. + uPhase * 6.28318530718));
    uv = distanceToCenter * uv + pos;
  }
  float t = smoothstep(0., uRadius, distanceToCenter);
  vec2 mixedUV = mix(uv, originalUV, t);
  gl_FragColor = texture2D(tInput, mix(vUv, mixedUV, uMix));
}`;

// Pass 3 — SINE WARP. Two crossed sine waves displace UVs (this is what
// makes the horizontal "cloud streaks"), masked by distance to pointer.
export const sineFrag = /* glsl */`
precision mediump float; precision mediump int;
varying vec2 vUv;
uniform sampler2D tInput;
uniform float uMixRadius, uFrequency, uAmplitude, uRotation, uTime, uTrackMouse;
uniform vec2 uPos, uResolution, uMousePos;
void main(){
  vec2 uv = vUv;
  vec2 waveCoord = vUv.xy * 2.0 - 1.0;
  float time = uTime * 0.25;
  float frequency = 20.0 * uFrequency;
  float amp = uAmplitude * 0.2;
  float waveX = sin((waveCoord.y + uPos.y) * frequency + (time)) * amp;
  float waveY = sin((waveCoord.x - uPos.x) * frequency + (time)) * amp;
  waveCoord.xy += vec2(mix(waveX, 0., uRotation), mix(0., waveY, uRotation));
  vec2 finalUV = waveCoord * 0.5 + 0.5;
  float aspectRatio = uResolution.x/uResolution.y;
  vec2 mPos = uPos + mix(vec2(0.), (uMousePos-0.5), uTrackMouse);
  float dist = (max(0.,1.-distance(uv * vec2(aspectRatio, 1.), mPos * vec2(aspectRatio, 1.)) * 4. * (1. - uMixRadius)));
  uv = mix(uv, finalUV, dist);
  gl_FragColor = texture2D(tInput, uv);
}`;

// Pass 4 — BOKEH. Golden-angle spiral disc blur where bright pixels are
// weighted ~pow(c,9)*150 — that weighting is what turns the soft gradient
// into glowing "cloud" blobs. Blue-noise jitters the sample rotation.
export const bokehFrag = /* glsl */`
precision mediump float; precision mediump int;
varying vec2 vUv;
uniform sampler2D tInput, tBlueNoise;
uniform float uAmount, uTilt, uTime, uTrackMouse;
uniform vec2 uPos, uResolution, uBlueNoiseResolution, uMousePos;
#define PI2 6.28318530718
#define ITERATIONS 32.0
#define GOLDEN_ANGLE 2.39996323
vec2 Sample(in float theta, inout float r){ r += 1.0 / r; return (r - 1.0) * vec2(cos(theta), sin(theta)); }
float getBlueNoiseOffset(vec2 st){
  vec2 texSize = uBlueNoiseResolution;
  vec2 uv = fract(st * (uResolution/texSize) * vec2(texSize.x/texSize.y, 1.0));
  vec4 blueNoise = texture2D(tBlueNoise, uv);
  return mod((blueNoise.r - 0.5) * PI2, PI2);
}
vec4 Bokeh(sampler2D tex, vec2 uv, float blurRadius){
  vec3 accumulatedColor = vec3(0.0); vec3 accumulatedWeights = vec3(0.0); float accumulatedAlpha = 0.0;
  float aspectRatio = uResolution.x / uResolution.y;
  vec2 basePixelSize = vec2(1.0 / aspectRatio, 1.0) * 0.04 * 0.075;
  float r = 1.0;
  float noiseOffset = (getBlueNoiseOffset(uv) - 0.5) * 0.01;
  float noiseAngle = noiseOffset * PI2;
  mat2 rotationMatrix = mat2(cos(noiseAngle), -sin(noiseAngle), sin(noiseAngle), cos(noiseAngle));
  for (float j = 0.0; j < GOLDEN_ANGLE * ITERATIONS; j += GOLDEN_ANGLE) {
    vec2 offset = Sample(j, r) * basePixelSize * blurRadius;
    float jitterAmount = 0.05 * (sin(j * 0.1) * 0.5 + 0.5);
    offset *= 1.0 + jitterAmount * sin(j * 0.7 + noiseOffset);
    vec2 sampleOffset = rotationMatrix * offset;
    vec4 colorSample = texture2D(tex, uv + sampleOffset);
    vec3 linearSample = colorSample.rgb;
    vec3 bokehWeight = vec3(5.0) + pow(linearSample, vec3(9.0)) * 150.0;
    accumulatedAlpha += colorSample.a;
    accumulatedColor += linearSample * bokehWeight;
    accumulatedWeights += bokehWeight;
  }
  vec3 linearOut = accumulatedColor / accumulatedWeights;
  return vec4(linearOut, accumulatedAlpha / ITERATIONS);
}
void main(){
  vec2 uv = vUv;
  if (uAmount == 0.0) { gl_FragColor = vec4(0.0); return; }
  vec2 pos = uPos + mix(vec2(0.0), (uMousePos - 0.5), uTrackMouse);
  float dis = distance(uv, pos) * 1000.0;
  float tilt = mix(1.0 - dis * 0.001, dis * 0.001, uTilt);
  float blurRadius = uAmount * tilt;
  gl_FragColor = Bokeh(tInput, uv, blurRadius);
}`;

// Pass 5 — OUTPUT COMPOSITE. Drawn as the scene's background quad
// (clip-space vertex, renderOrder -10). Multiplies the theme bg colour
// by the tinted bokeh result.
export const bgOutputVert = /* glsl */`
precision mediump float; precision mediump int;
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position, 1.0); }`;
export const bgOutputFrag = /* glsl */`
precision mediump float; precision mediump int;
varying vec2 vUv;
uniform sampler2D tInput;
uniform vec3 uBgColor, uOutputColor;
uniform float uOutputMix, uIriTime, uIriStrength, uIriScale;
vec3 overlay(vec3 base, vec3 blend){ return mix(2.0 * base * blend, 1.0 - 2.0 * (1.0 - base) * (1.0 - blend), step(0.5, base)); }
vec3 spectrum(float t){ return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67))); }
void main(){
  vec3 bgTex = vec3(1.0);
  vec3 base = mix(uBgColor, overlay(uBgColor, bgTex), 0.61);
  vec4 inTex = texture2D(tInput, vUv);
  vec3 tint = uOutputColor * 0.35;
  vec3 blend = clamp(inTex.rgb + tint, 0.0, 1.0);
  vec3 finalColor = base * mix(vec3(1.0), blend, clamp(uOutputMix, 0.0, 1.0));
  // dark iridescence: slow, wide oil-film bands drifting across the page. Weighted by the
  // bokeh luminance so it pools in the lighter areas and leaves the deep shadows near-black.
  float lum = dot(inTex.rgb, vec3(0.2125, 0.7154, 0.0721));
  float film = (vUv.x + vUv.y) * uIriScale + uIriTime * 0.05 + lum * 0.9;
  vec3 iri = spectrum(film);
  finalColor += iri * uIriStrength * (0.15 + 0.85 * lum) * (0.35 + 0.65 * lum);
  gl_FragColor = vec4(finalColor, 1.0);
  #include <colorspace_fragment>
}`;

// ============================================================
// 2. GLASS (hello / cursor / craft&taste)
// ============================================================
export const glassVert = /* glsl */`
varying vec3 worldNormal; varying vec3 eyeVector; varying float modelLocalY;
void main(){
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vec4 mvPosition = viewMatrix * worldPos;
  gl_Position = projectionMatrix * mvPosition;
  worldNormal = normalize(modelMatrix * vec4(normal, 0.0)).xyz;
  eyeVector = normalize(worldPos.xyz - cameraPosition);
  modelLocalY = position.y;
}`;

// The mesh samples uTexture (an FBO of everything on layer 0 — the sky,
// the images) at gl_FragCoord offset by a per-channel refraction vector.
// uLoop samples per channel are averaged, each nudged by `slide` + noise,
// which is what smears the colour fringes. Then tint (Beer-Lambert in
// light theme / hard-light in dark), Blinn-Phong specular from a light
// that orbits the pointer, and a directional Fresnel rim.
export const glassFrag = /* glsl */`
uniform float uIorR, uIorY, uIorG, uIorC, uIorB, uIorP;
uniform float uSaturation, uChromaticAberration, uRefractPower, uFresnelPower, uShininess, uDiffuseness;
uniform vec3 uLight;
uniform float uBrightness, uContrast, uGamma, uSpecularStrength, uFresnelStrength;
uniform vec3 uFresnelSideDir;
uniform vec4 uTintColorA, uTintColorB;
uniform vec2 uTintLocalYRange;
uniform float uTintEnabled, uTintMix, uTintThicknessMinAlpha, uTintThicknessMaxAlpha;
uniform vec2 uScreenResolutionPx;
uniform sampler2D uTexture;
uniform float uSceneRefractionEnabled, uRgbRefraction, uDark;
uniform int uLoop;
uniform float uTime, uFrost, uFrostHaze;
uniform float uEnvStrength, uEnvSharp, uGlintStrength, uGlintPower, uEdgeGlow, uSweepStrength;
varying vec3 worldNormal; varying vec3 eyeVector; varying float modelLocalY;

float random(vec2 p){ return fract(sin(dot(p.xy ,vec2(12.9898,78.233))) * 43758.5453); }
vec3 sat(vec3 rgb, float adjustment){ const vec3 W = vec3(0.2125, 0.7154, 0.0721); vec3 intensity = vec3(dot(rgb, W)); return mix(intensity, rgb, adjustment); }
float fresnel(vec3 eyeDir, vec3 normal, float power){ float f = abs(dot(eyeDir, normal)); return pow(1.0 - f, power); }
float specular(vec3 light, vec3 normal, vec3 eyeDir, float shininess, float diffuseness){
  vec3 lightVector = normalize(-light);
  vec3 halfVector = normalize(eyeDir + lightVector);
  float NdotL = dot(normal, lightVector);
  float NdotH = abs(dot(normal, halfVector));
  float kDiffuse = max(0.0, NdotL);
  float kSpecular = pow(NdotH, shininess);
  return kSpecular + kDiffuse * diffuseness;
}
void main(){
  vec2 uv = gl_FragCoord.xy / uScreenResolutionPx.xy;
  vec3 normal = normalize(worldNormal);
  vec3 eyeDir = normalize(eyeVector);
  vec3 color;
  if (uSceneRefractionEnabled > 0.5) {
    color = vec3(0.0);
    float noise = random(uv) * 0.025;
    if (uRgbRefraction > 0.5) {
      vec3 refractVecR = refract(eyeDir, normal, (1.0 / uIorR));
      vec3 refractVecG = refract(eyeDir, normal, (1.0 / uIorG));
      vec3 refractVecB = refract(eyeDir, normal, (1.0 / uIorB));
      for (int i = 0; i < 16; i++) { if (i >= uLoop) break;
        float slide = float(i) / float(uLoop) * 0.1 + noise;
        float offset = (uRefractPower + slide) * uChromaticAberration;
        // uFrost scatters each tap so the refraction reads as ground/frosted glass
        vec2 fr = (vec2(random(uv * 1.7 + float(i)), random(uv * 2.3 - float(i))) - 0.5) * uFrost;
        color.r += texture2D(uTexture, uv + refractVecR.xy * offset + fr).r;
        color.g += texture2D(uTexture, uv + refractVecG.xy * offset + fr).g;
        color.b += texture2D(uTexture, uv + refractVecB.xy * offset + fr).b;
      }
    } else {
      vec3 refractVecR = refract(eyeDir, normal, (1.0 / uIorR));
      vec3 refractVecY = refract(eyeDir, normal, (1.0 / uIorY));
      vec3 refractVecG = refract(eyeDir, normal, (1.0 / uIorG));
      vec3 refractVecC = refract(eyeDir, normal, (1.0 / uIorC));
      vec3 refractVecB = refract(eyeDir, normal, (1.0 / uIorB));
      vec3 refractVecP = refract(eyeDir, normal, (1.0 / uIorP));
      for (int i = 0; i < 16; i++) { if (i >= uLoop) break;
        float slide = float(i) / float(uLoop) * 0.1 + noise;
        float offsetR = (uRefractPower + slide * 1.0) * uChromaticAberration;
        float offsetY = (uRefractPower + slide * 1.0) * uChromaticAberration;
        float offsetG = (uRefractPower + slide * 2.0) * uChromaticAberration;
        float offsetC = (uRefractPower + slide * 2.5) * uChromaticAberration;
        float offsetB = (uRefractPower + slide * 3.0) * uChromaticAberration;
        float offsetP = (uRefractPower + slide * 1.0) * uChromaticAberration;
        float r = texture2D(uTexture, uv + refractVecR.xy * offsetR).x * 0.5;
        vec3 ySample = texture2D(uTexture, uv + refractVecY.xy * offsetY).xyz;
        float y = (ySample.x * 2.0 + ySample.y * 2.0 - ySample.z) / 6.0;
        float g = texture2D(uTexture, uv + refractVecG.xy * offsetG).y * 0.5;
        vec3 cSample = texture2D(uTexture, uv + refractVecC.xy * offsetC).xyz;
        float c = (cSample.y * 2.0 + cSample.z * 2.0 - cSample.x) / 6.0;
        float b = texture2D(uTexture, uv + refractVecB.xy * offsetB).z * 0.5;
        vec3 pSample = texture2D(uTexture, uv + refractVecP.xy * offsetP).xyz;
        float p = (pSample.z * 2.0 + pSample.x * 2.0 - pSample.y) / 6.0;
        color.r += r + (2.0 * p + 2.0 * y - c) / 3.0;
        color.g += g + (2.0 * y + 2.0 * c - p) / 3.0;
        color.b += b + (2.0 * c + 2.0 * p - y) / 3.0;
      }
    }
    color /= float(uLoop);
  } else {
    color = texture2D(uTexture, uv).rgb;
  }
  color = sat(color, uSaturation);
  color *= uBrightness;
  color = (color - 0.5) * uContrast + 0.5;
  color = pow(max(color, 0.0), vec3(1.0 / max(uGamma, 0.0001)));

  // tint: vertical gradient A(top)→B(bottom) in model space, thicker at grazing angles
  float mode = clamp(uDark, 0.0, 1.0);
  float tintGradientFactor = clamp((modelLocalY - uTintLocalYRange.x) / max(uTintLocalYRange.y - uTintLocalYRange.x, 1e-5), 0.0, 1.0);
  vec4 tintColorGradient = mix(uTintColorB, uTintColorA, tintGradientFactor);
  float ndotv = abs(dot(normal, eyeDir));
  float thicknessMask = clamp(1.0 - ndotv, 0.0, 1.0);
  float tintAlpha = clamp(tintColorGradient.a, 0.0, 1.0) * mix(clamp(uTintThicknessMaxAlpha,0.,1.), clamp(uTintThicknessMinAlpha,0.,1.), thicknessMask);
  // Beer-Lambert (light theme)
  float tintK_beer = clamp(uTintEnabled, 0.0, 1.0) * tintAlpha;
  vec3 transmittance = pow(clamp(tintColorGradient.rgb, 0.001, 1.0), vec3(clamp(uTintMix, 0.01, 3.0)));
  vec3 beerColor = mix(color, color * transmittance, tintK_beer);
  // Hard light (dark theme)
  float tintK_hard = clamp(uTintEnabled, 0.0, 1.0) * clamp(uTintMix, 0.0, 1.0) * tintAlpha;
  vec3 baseClamped = clamp(color, 0.0, 1.0);
  vec3 blendClamped = clamp(tintColorGradient.rgb, 0.0, 1.0);
  vec3 h = step(vec3(0.5), blendClamped);
  vec3 hard = mix(2.0 * baseClamped * blendClamped, 1.0 - 2.0 * (1.0 - blendClamped) * (1.0 - baseClamped), h);
  vec3 hardColor = mix(color, hard, tintK_hard);
  color = mix(beerColor, hardColor, mode);

  // shimmer — every glass surface breathes a little specular/rim pulse over time
  float shimmer = 0.82 + 0.28 * sin(uTime * 2.6 + modelLocalY * 0.4 + worldNormal.x * 1.5);
  color += specular(uLight, normal, eyeDir, uShininess, uDiffuseness) * uSpecularStrength * shimmer;
  float f = fresnel(eyeDir, normal, uFresnelPower);
  float sideMask = smoothstep(-0.5, 0.5, dot(normal, normalize(uFresnelSideDir)));
  color.rgb += f * sideMask * vec3(uFresnelStrength) * shimmer;
  // frosted haze — lifts the whole surface toward a pale milky white, strongest at grazing
  // angles, which is what makes ground glass look light and matte rather than dark and mirrored
  color = mix(color, vec3(1.0), uFrostHaze * (0.35 + 0.65 * f));

  // ---- extra glass passes (hero text) ----
  vec3 reflectDir = reflect(-eyeDir, normal);
  // 1. environment mirror: re-sample the scene FBO along the reflection vector, so the
  //    letterforms actually mirror what's around them instead of only refracting through
  if (uEnvStrength > 0.0) {
    vec2 envUv = clamp(uv + reflectDir.xy * 0.16, 0.0, 1.0);
    vec3 env = texture2D(uTexture, envUv).rgb;
    env = pow(max(env, 0.0), vec3(1.0 / max(uEnvSharp, 0.001)));   // crush toward the bright spots
    color += env * uEnvStrength * (0.25 + 0.75 * f);
  }
  // 2. sharp mirror glint where the reflection vector lines up with the key light
  float glint = pow(max(dot(reflectDir, normalize(uLight)), 0.0), max(uGlintPower, 1.0));
  color += glint * vec3(1.0, 0.99, 1.0) * uGlintStrength;
  // 3. bevel glow — a bright lip right at the silhouette, like a polished cut edge
  color += pow(1.0 - abs(dot(eyeDir, normal)), 8.0) * uEdgeGlow * vec3(0.85, 0.92, 1.0);
  // 4. a slow specular sweep travelling across the letters
  float sweep = fract(modelLocalY * 0.035 - uTime * 0.18);
  color += (smoothstep(0.47, 0.5, sweep) - smoothstep(0.5, 0.53, sweep)) * uSweepStrength;
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ---------- 2b. FACETED CRYSTAL GLASS — same refraction rig as §2, plus a
// UV-space bevel/facet grid (so each flat box face reads as a thick inset
// pane, the way a cut-glass cube shows its wall thickness at the edges),
// soft bloom highlight blobs instead of a hard glint, and a genuinely
// transparent output (near-zero paint-on tint; you see straight through,
// bent by refraction, the way real glass does). ----------
export const crystalVert = /* glsl */`
varying vec3 worldNormal; varying vec3 eyeVector; varying float modelLocalY; varying vec2 vUv;
void main(){
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vec4 mvPosition = viewMatrix * worldPos;
  gl_Position = projectionMatrix * mvPosition;
  worldNormal = normalize(modelMatrix * vec4(normal, 0.0)).xyz;
  eyeVector = normalize(worldPos.xyz - cameraPosition);
  modelLocalY = position.y;
  vUv = uv;
}`;
export const crystalFrag = /* glsl */`
uniform float uIorR, uIorY, uIorG, uIorC, uIorB, uIorP;
uniform float uSaturation, uChromaticAberration, uRefractPower, uFresnelPower, uShininess, uDiffuseness;
uniform vec3 uLight;
uniform float uBrightness, uContrast, uGamma, uSpecularStrength, uFresnelStrength;
uniform vec3 uFresnelSideDir;
uniform vec4 uTintColorA, uTintColorB;
uniform vec2 uTintLocalYRange;
uniform float uTintEnabled, uTintMix, uTintThicknessMinAlpha, uTintThicknessMaxAlpha;
uniform vec2 uScreenResolutionPx;
uniform sampler2D uTexture;
uniform float uSceneRefractionEnabled, uRgbRefraction, uDark;
uniform int uLoop;
uniform float uOpacity, uTime, uEdgeStrength, uBloomStrength;
varying vec3 worldNormal; varying vec3 eyeVector; varying float modelLocalY; varying vec2 vUv;

float random(vec2 p){ return fract(sin(dot(p.xy ,vec2(12.9898,78.233))) * 43758.5453); }
vec3 sat(vec3 rgb, float adjustment){ const vec3 W = vec3(0.2125, 0.7154, 0.0721); vec3 intensity = vec3(dot(rgb, W)); return mix(intensity, rgb, adjustment); }
float fresnel(vec3 eyeDir, vec3 normal, float power){ float f = abs(dot(eyeDir, normal)); return pow(1.0 - f, power); }
float specular(vec3 light, vec3 normal, vec3 eyeDir, float shininess, float diffuseness){
  vec3 lightVector = normalize(-light);
  vec3 halfVector = normalize(eyeDir + lightVector);
  float NdotL = dot(normal, lightVector);
  float NdotH = abs(dot(normal, halfVector));
  float kDiffuse = max(0.0, NdotL);
  float kSpecular = pow(NdotH, shininess);
  return kSpecular + kDiffuse * diffuseness;
}
void main(){
  vec2 uv = gl_FragCoord.xy / uScreenResolutionPx.xy;
  vec3 normal = normalize(worldNormal);
  vec3 eyeDir = normalize(eyeVector);
  vec3 color = vec3(0.0);
  float noise = random(uv) * 0.02;
  vec3 refractVecR = refract(eyeDir, normal, (1.0 / uIorR));
  vec3 refractVecG = refract(eyeDir, normal, (1.0 / uIorG));
  vec3 refractVecB = refract(eyeDir, normal, (1.0 / uIorB));
  for (int i = 0; i < 16; i++) { if (i >= uLoop) break;
    float slide = float(i) / float(uLoop) * 0.1 + noise;
    float offset = (uRefractPower + slide) * uChromaticAberration;
    color.r += texture2D(uTexture, uv + refractVecR.xy * offset).r;
    color.g += texture2D(uTexture, uv + refractVecG.xy * offset).g;
    color.b += texture2D(uTexture, uv + refractVecB.xy * offset).b;
  }
  color /= float(uLoop);
  color = sat(color, uSaturation);
  color *= uBrightness;
  color = (color - 0.5) * uContrast + 0.5;
  color = pow(max(color, 0.0), vec3(1.0 / max(uGamma, 0.0001)));

  // a whisper of colour, just enough to read as glass rather than empty air
  float mode = clamp(uDark, 0.0, 1.0);
  float tintGradientFactor = clamp((modelLocalY - uTintLocalYRange.x) / max(uTintLocalYRange.y - uTintLocalYRange.x, 1e-5), 0.0, 1.0);
  vec4 tintColorGradient = mix(uTintColorB, uTintColorA, tintGradientFactor);
  float ndotv = abs(dot(normal, eyeDir));
  float thicknessMask = clamp(1.0 - ndotv, 0.0, 1.0);
  float tintAlpha = clamp(tintColorGradient.a, 0.0, 1.0) * mix(clamp(uTintThicknessMaxAlpha,0.,1.), clamp(uTintThicknessMinAlpha,0.,1.), thicknessMask);
  float tintK = clamp(uTintEnabled, 0.0, 1.0) * tintAlpha;
  vec3 transmittance = pow(clamp(tintColorGradient.rgb, 0.001, 1.0), vec3(clamp(uTintMix, 0.01, 3.0)));
  color = mix(color, color * transmittance, tintK);

  float shimmer = 0.8 + 0.35 * sin(uTime * 2.2 + modelLocalY * 0.5 + worldNormal.x * 1.6);
  color += specular(uLight, normal, eyeDir, uShininess, uDiffuseness) * uSpecularStrength * shimmer;
  float f = fresnel(eyeDir, normal, uFresnelPower);
  float sideMask = smoothstep(-0.5, 0.5, dot(normal, normalize(uFresnelSideDir)));
  color.rgb += f * sideMask * vec3(uFresnelStrength) * shimmer;

  // faceted bevel: an inset border + corner-to-corner diagonals on every face,
  // like the mitred inner walls of a cut-glass cube — this is what reads as "thickness"
  float edgeDist = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
  float border = smoothstep(0.14, 0.09, edgeDist) - smoothstep(0.06, 0.02, edgeDist);
  float diag = min(abs(vUv.x - vUv.y), abs(vUv.x + vUv.y - 1.0));
  float diagLine = smoothstep(0.03, 0.0, diag) * smoothstep(0.5, 0.42, edgeDist);
  float facet = clamp(border + diagLine * 0.8, 0.0, 1.0);
  color += facet * vec3(1.0) * uEdgeStrength * shimmer;

  // soft bloom — two large, gentle glow blobs drifting slowly across the face,
  // instead of a hard pinpoint glint, so the highlight looks like light pooling in glass
  vec2 hp1 = vec2(0.5 + 0.3 * sin(uTime * 0.35), 0.72 + 0.15 * cos(uTime * 0.3));
  vec2 hp2 = vec2(0.28 + 0.2 * cos(uTime * 0.22 + 1.7), 0.8);
  float d1 = distance(vUv, hp1), d2 = distance(vUv, hp2);
  float bloom = exp(-d1 * d1 * 9.0) * 1.1 + exp(-d2 * d2 * 16.0) * 0.7;
  color += bloom * vec3(1.0) * uBloomStrength;

  float alpha = clamp(uOpacity, 0.0, 1.0);
  gl_FragColor = vec4(color, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ---------- 2c. IRIDESCENT SPINNER GLASS — the 12-bar loading wheel. Same
// refraction rig, but the per-bar attribute `aBar` drives a chasing brightness
// ramp (the classic spinner fade) and a thin-film interference tint, so each
// bar sits at a different point in the rainbow as the wheel turns. ----------
export const iridescentVert = /* glsl */`
attribute float aBar;
varying vec3 worldNormal; varying vec3 eyeVector; varying float modelLocalY; varying float vBar;
void main(){
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vec4 mvPosition = viewMatrix * worldPos;
  gl_Position = projectionMatrix * mvPosition;
  worldNormal = normalize(modelMatrix * vec4(normal, 0.0)).xyz;
  eyeVector = normalize(worldPos.xyz - cameraPosition);
  modelLocalY = position.y;
  vBar = aBar;
}`;
export const iridescentFrag = /* glsl */`
uniform float uIorR, uIorY, uIorG, uIorC, uIorB, uIorP;
uniform float uSaturation, uChromaticAberration, uRefractPower, uFresnelPower, uShininess, uDiffuseness;
uniform vec3 uLight;
uniform float uBrightness, uContrast, uGamma, uSpecularStrength, uFresnelStrength;
uniform vec3 uFresnelSideDir;
uniform vec4 uTintColorA, uTintColorB;
uniform vec2 uTintLocalYRange;
uniform float uTintEnabled, uTintMix, uTintThicknessMinAlpha, uTintThicknessMaxAlpha;
uniform vec2 uScreenResolutionPx;
uniform sampler2D uTexture;
uniform float uSceneRefractionEnabled, uRgbRefraction, uDark;
uniform int uLoop;
uniform float uOpacity, uTime, uEdgeStrength, uBloomStrength;
uniform float uChaseSpeed, uFilmSpeed, uFilmScale, uSheenWhite, uIriSat;
uniform float uTrailFloor, uTrailGain, uTrailPow;
varying vec3 worldNormal; varying vec3 eyeVector; varying float modelLocalY; varying float vBar;

float random(vec2 p){ return fract(sin(dot(p.xy ,vec2(12.9898,78.233))) * 43758.5453); }
vec3 sat(vec3 rgb, float adjustment){ const vec3 W = vec3(0.2125, 0.7154, 0.0721); vec3 intensity = vec3(dot(rgb, W)); return mix(intensity, rgb, adjustment); }
float fresnel(vec3 eyeDir, vec3 normal, float power){ float f = abs(dot(eyeDir, normal)); return pow(1.0 - f, power); }
float specular(vec3 light, vec3 normal, vec3 eyeDir, float shininess, float diffuseness){
  vec3 lightVector = normalize(-light);
  vec3 halfVector = normalize(eyeDir + lightVector);
  float NdotL = dot(normal, lightVector);
  float NdotH = abs(dot(normal, halfVector));
  return pow(NdotH, shininess) + max(0.0, NdotL) * diffuseness;
}
// thin-film style spectrum: smooth cosine palette, cycles through the full rainbow as t goes 0..1
vec3 spectrum(float t){
  return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67)));
}
void main(){
  vec2 uv = gl_FragCoord.xy / uScreenResolutionPx.xy;
  vec3 normal = normalize(worldNormal);
  vec3 eyeDir = normalize(eyeVector);
  vec3 color = vec3(0.0);
  float noise = random(uv) * 0.02;
  vec3 refractVecR = refract(eyeDir, normal, (1.0 / uIorR));
  vec3 refractVecG = refract(eyeDir, normal, (1.0 / uIorG));
  vec3 refractVecB = refract(eyeDir, normal, (1.0 / uIorB));
  for (int i = 0; i < 16; i++) { if (i >= uLoop) break;
    float slide = float(i) / float(uLoop) * 0.1 + noise;
    float offset = (uRefractPower + slide) * uChromaticAberration;
    color.r += texture2D(uTexture, uv + refractVecR.xy * offset).r;
    color.g += texture2D(uTexture, uv + refractVecG.xy * offset).g;
    color.b += texture2D(uTexture, uv + refractVecB.xy * offset).b;
  }
  color /= float(uLoop);
  color = sat(color, uSaturation);
  color *= uBrightness;
  color = (color - 0.5) * uContrast + 0.5;
  color = pow(max(color, 0.0), vec3(1.0 / max(uGamma, 0.0001)));

  float f = fresnel(eyeDir, normal, uFresnelPower);

  // iridescence: view angle + bar index + time shift the film thickness, so every bar
  // sits at a different point in the spectrum and the colours crawl as the wheel turns
  float ndotv = abs(dot(normal, eyeDir));
  float film = ndotv * uFilmScale + vBar * 1.1 + uTime * uFilmSpeed + modelLocalY * 0.05;
  vec3 iri = spectrum(film);

  // the spinner's chasing fade — each bar peaks in turn, one lap per ~1.1s
  float phase = fract(vBar + uTime * uChaseSpeed);
  float trail = pow(phase, max(uTrailPow, 0.01));

  // The spectrum IS the body colour here — the scene behind is near-black, so leaning on
  // the refracted sample (or piling on white specular) just produces grey. Tint the whole
  // bar with its own spectral colour and keep every later highlight tinted by it too.
  // pearlescent, not neon: the spectrum is pulled toward white and blended with the
  // refracted scene, so it reads as a thin oil-film sheen on glass rather than flat rainbow
  vec3 sheen = mix(vec3(0.82), iri, uSheenWhite);
  // loaded-vs-unloaded contrast: unlit pills bottom out at uTrailFloor, the lit one
  // reaches uTrailFloor + uTrailGain. Widen the gap to make the chase read harder.
  float lit = uTrailFloor + uTrailGain * trail;
  color = mix(color, sheen, 0.72) * lit;

  // specular and rim are tinted THROUGH the sheen so highlights stay subtly coloured,
  // and both ride the same trail ramp so dim pills stay genuinely dim
  float spec = specular(uLight, normal, eyeDir, uShininess, uDiffuseness);
  color += spec * mix(sheen, vec3(1.0), 0.5) * uSpecularStrength * lit * 0.55;
  float sideMask = smoothstep(-0.5, 0.5, dot(normal, normalize(uFresnelSideDir)));
  color += sheen * f * sideMask * uFresnelStrength * lit * 0.7;
  color = sat(color, uIriSat);

  // alpha follows the trail too — unloaded pills read as fainter glass, not just darker
  float alpha = clamp(uOpacity, 0.0, 1.0) * clamp(0.45 + 0.75 * trail, 0.0, 1.0);
  gl_FragColor = vec4(color, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ============================================================
// 3. IMAGE QUAD (selected work + portrait)
// ============================================================
export const imageVert = /* glsl */`
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position, 1.0); }`;

// A single fullscreen quad per image. uRect (x,y,w,h in 0-1 screen space)
// comes from the DOM placeholder's getBoundingClientRect() each frame.
//  • applyCurl     — horizontal squeeze driven by scroll velocity (pages "bow")
//  • uPolarity     — inverted → positive over 0.8s the first time it's on screen
//  • hoverDot      — square-pixel grid grows from centre to reveal mapHover
export const imageFrag = /* glsl */`
uniform float uCurlStrength;
vec2 applyCurl(vec2 screenUv){
  float centered = 2.0 * screenUv.y - 1.0;
  float profile = 1.0 - sqrt(max(0.0, 1.0 - centered * centered));
  float uvScale = 1.0 - profile * uCurlStrength;
  float distortedX = (screenUv.x - 0.5) * uvScale + 0.5;
  return vec2(distortedX, screenUv.y);
}
uniform sampler2D map, mapHover;
uniform vec4 uRect;
uniform float uPolarityPositive, uLayerOpacity, uRevealProgress, uRevealSoftness, uRevealDirection, uHoverRevealProgress, uDotPixelSize;
uniform vec2 uViewportPx;
varying vec2 vUv;
vec3 applyPolarity(vec3 rgb){ float t = clamp(uPolarityPositive, 0.0, 1.0); return mix(1.0 - rgb, rgb, t); }
float hoverDotCoverage(vec2 screenUv){
  float hoverProgress = clamp(uHoverRevealProgress, 0.0, 1.0);
  if (hoverProgress <= 0.0) return 0.0;
  vec2 viewportPx = max(uViewportPx, vec2(1.0));
  float dotPx = max(2.0, uDotPixelSize);
  vec2 safeCellSize = max(vec2(dotPx) / viewportPx, vec2(1.0 / 4096.0));
  float rectWidthPx = max(uRect.z * uViewportPx.x, 1.0);
  float rectHeightPx = max(uRect.w * uViewportPx.y, 1.0);
  float rectAspect = max(rectWidthPx / rectHeightPx, 1e-5);
  vec2 localUv = (screenUv - uRect.xy) / uRect.zw;
  vec2 centered = localUv * 2.0 - 1.0; centered.x *= rectAspect;
  float distToCenter = length(centered);
  float maxRadius = sqrt(1.0 + rectAspect * rectAspect);
  float revealBand = max(length(safeCellSize) * 18.0, 0.08);
  float revealRadius = hoverProgress * (maxRadius + revealBand);
  float grow = smoothstep(0.0, 1.0, clamp((revealRadius - distToCenter) / revealBand, 0.0, 1.0));
  vec2 cellUv = fract(screenUv / safeCellSize);
  vec2 cellFromCenter = abs(cellUv - vec2(0.5));
  float squareExtent = mix(0.0, 0.5, grow);
  float squareDist = max(cellFromCenter.x, cellFromCenter.y);
  float squareAa = max(fwidth(squareDist), 0.0001) * 1.5;
  if (squareExtent <= squareAa) return 0.0;
  if (grow >= 0.999) return 1.0;
  return 1.0 - smoothstep(squareExtent - squareAa, squareExtent + squareAa, squareDist);
}
vec4 sampleSourceRgba(vec2 localUv, float hoverCoverage){
  vec2 lu = clamp(localUv, 0.0, 1.0);
  vec4 baseColor = texture2D(map, lu);
  if (hoverCoverage < 0.001) return baseColor;
  vec4 hoverColor = texture2D(mapHover, lu);
  return mix(baseColor, hoverColor, clamp(hoverCoverage, 0.0, 1.0));
}
float edgeAaMask(vec2 uv, vec2 aaRef){
  vec2 edgeDist = min(uv, 1.0 - uv);
  return smoothstep(0.0, aaRef.x, edgeDist.x) * smoothstep(0.0, aaRef.y, edgeDist.y);
}
void main(){
  vec2 distortedScreenUv = applyCurl(vUv);
  vec2 revealLocalUv = (vUv - uRect.xy) / uRect.zw;
  vec2 localUv = (distortedScreenUv - uRect.xy) / uRect.zw;
  vec2 aa = max(fwidth(localUv), vec2(1e-5));
  float revealProgress = clamp(uRevealProgress, 0.0, 1.0);
  float revealMask = 1.0;
  if (revealProgress <= 0.001) revealMask = 0.0;
  else if (revealProgress < 0.999) {
    float revealCoord = uRevealDirection < 0.0 ? 1.0 - revealLocalUv.x : revealLocalUv.x;
    float revealFeather = max(uRevealSoftness, 0.0);
    revealMask = revealFeather <= 0.0 ? step(revealCoord, revealProgress)
      : 1.0 - smoothstep(revealProgress - revealFeather, revealProgress + revealFeather, revealCoord);
  }
  float hoverCov = hoverDotCoverage(vUv);
  vec4 sourceColor = sampleSourceRgba(localUv, hoverCov);
  float inside = edgeAaMask(localUv, aa);
  float outA = sourceColor.a * inside * revealMask * clamp(uLayerOpacity, 0.0, 1.0);
  if (outA < 0.001) discard;
  gl_FragColor = vec4(applyPolarity(sourceColor.rgb), outA);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ============================================================
// 4. HYPERSPACE (painted onto the cursor arrow as it scales to fill the screen)
// ============================================================
export const hyperVert = /* glsl */`
varying vec3 vWorldNormal; varying vec3 vEyeVector;
void main(){
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
  vWorldNormal = normalize(modelMatrix * vec4(normal, 0.0)).xyz;
  vEyeVector = normalize(worldPos.xyz - cameraPosition);
}`;
export const hyperFrag = /* glsl */`
uniform vec3 iResolution; uniform float iTime, uScrollDuration;
uniform vec3 uAccentColor, uStripeColorA, uStripeColorB;
uniform float uStripeReveal, uOpacity;
uniform vec3 uLight; uniform float uShininess, uDiffuseness, uSpecularStrength, uFresnelPower, uFresnelStrength; uniform vec3 uFresnelSideDir;
varying vec3 vWorldNormal; varying vec3 vEyeVector;
float hash21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
vec3 rgb2hsv(vec3 c){ vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0); vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g)); vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r)); float d = q.x - min(q.w, q.y); float e = 1.0e-10; return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x); }
vec3 hsv2rgb(vec3 c){ vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0); vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www); return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y); }
vec3 sampleHyperspace(vec2 fragCoord){
  vec2 R = iResolution.xy;
  float baseScale = max(1.0, min(R.x, R.y));
  vec2 u = (fragCoord * 2.0 - R) / baseScale;
  float dur = max(uScrollDuration, 1e-4);
  float time = clamp(iTime, 0.0, dur);
  float t = clamp(time / dur, 0.0, 1.0);
  const float cellDensity = 100.0;
  vec2 polar = vec2(atan(u.y, u.x) / 3.0, length(u));
  float angleCoord = (6.0 - polar.x) * cellDensity;
  float angleId = floor(angleCoord) + 0.5;
  float angleCell = abs(fract(angleCoord) - 0.5);
  float radialCoord = (6.0 - polar.y) * cellDensity;
  vec2 q = vec2(angleId, radialCoord);
  float travel = smoothstep(0.0, 1.0, t);
  float keepProbability = mix(0.18, 1.0, travel);
  float scrollSpeed = mix(0.7, 3.6, travel);
  float trailLength = mix(2.7, 0.975, travel);
  float raySeq = fract((angleId + 0.5) * 0.61803398875);
  float keepMask = 1.0 - smoothstep(keepProbability - 0.025, keepProbability + 0.025, raySeq);
  float phaseBase = (q.y * 0.02 + q.x * 0.4) * fract(q.x * 0.61);
  vec4 spark = max(1.0 - fract(vec4(7.0, 6.0, 4.0, 0.0) * 0.02 + phaseBase + time * scrollSpeed) * trailLength, 0.0);
  float channelMix = max(max(spark.r, spark.g), spark.b);
  float edge = max(fwidth(channelMix) * 1.5, 2.0 / max(iResolution.y, 1.0));
  float star = smoothstep(0.12 - edge, 0.12 + edge, channelMix);
  float thinEdge = max(fwidth(angleCell) * 1.5, 0.002);
  float thinMask = 1.0 - smoothstep(0.13 - thinEdge, 0.13 + thinEdge, angleCell);
  star *= thinMask * keepMask;
  float radialBoost = pow(smoothstep(0.1, 1.0, polar.y), 1.25);
  float intensity = mix(0.0, 6.5, t * 1.2);
  vec3 stripeRgb = mix(uStripeColorA, uStripeColorB, hash21(vec2(angleId, 19.713)));
  vec3 hsvA = rgb2hsv(max(uStripeColorA, vec3(1e-5))); vec3 hsvB = rgb2hsv(max(uStripeColorB, vec3(1e-5)));
  float dh = abs(hsvA.x - hsvB.x); dh = min(dh, 1.0 - dh);
  float hueBand = clamp(dh * 1.25 + 0.04, 0.07, 0.24);
  vec3 hsv = rgb2hsv(max(stripeRgb, vec3(1e-5)));
  float idHash = hash21(vec2(angleId, 6.18)); float idHash2 = hash21(vec2(angleId, 91.7));
  float scrollPhase = time * scrollSpeed;
  float hueAnim = sin(scrollPhase * 0.52 + angleId * 0.29 + idHash * 6.2831853) * (hueBand * 0.85);
  float hueStripe = (idHash - 0.5) * hueBand * 2.0;
  hsv.x = fract(hsv.x + hueStripe + hueAnim);
  hsv.y = clamp(hsv.y * mix(0.96, 1.06, idHash2), 0.0, 1.0);
  hsv.z = clamp(hsv.z * mix(0.97, 1.05, idHash), 0.0, 1.0);
  vec3 sparkColor = hsv2rgb(hsv) * mix(0.78, 1.0, smoothstep(0.14, 0.5, channelMix));
  return intensity * radialBoost * sparkColor * star;
}
float fresnel(vec3 eyeDir, vec3 normal, float power){ return pow(1.0 - abs(dot(eyeDir, normal)), power); }
float specular(vec3 light, vec3 normal, vec3 eyeDir, float shininess, float diffuseness){
  vec3 lightVector = normalize(-light); vec3 halfVector = normalize(eyeDir + lightVector);
  return pow(abs(dot(normal, halfVector)), shininess) + max(0.0, dot(normal, lightVector)) * diffuseness;
}
void main(){
  vec3 stripes = sampleHyperspace(gl_FragCoord.xy);
  float reveal = clamp(uStripeReveal, 0.0, 1.0);
  float stripeLuma = dot(stripes, vec3(0.299, 0.587, 0.114));
  float darken = smoothstep(0.0, 0.88, reveal);
  vec3 darkBase = mix(uAccentColor, vec3(0.0), darken);
  float gapMask = (1.0 - smoothstep(0.035, 0.12, stripeLuma)) * reveal;
  float crackGuard = 1.0 - smoothstep(0.68, 0.94, reveal);
  vec3 rgb = darkBase + stripes * reveal + uAccentColor * gapMask * 0.07 * crackGuard;
  vec3 normal = normalize(vWorldNormal); if (!gl_FrontFacing) normal = -normal;
  vec3 eyeDir = normalize(vEyeVector);
  float glossMask = mix(1.0, smoothstep(0.1, 0.48, stripeLuma), reveal);
  rgb += specular(uLight, normal, eyeDir, uShininess, uDiffuseness) * uSpecularStrength * glossMask;
  float f = fresnel(eyeDir, normal, uFresnelPower);
  float sideMask = smoothstep(-0.5, 0.5, dot(normal, normalize(uFresnelSideDir)));
  rgb += f * sideMask * vec3(uFresnelStrength) * glossMask;
  float alpha = clamp(uOpacity, 0.0, 1.0); if (alpha <= 0.0001) discard;
  gl_FragColor = vec4(rgb, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ============================================================
// 4b. PIXEL-DOT OVERLAY — a fullscreen 4px dot grid (renderOrder 10) whose dot
// radius = 0.9 × opacity. Opacity is driven by scroll: it fades IN as the hero
// leaves (hero bottom from 100%→25% of vh) and OUT as the footer approaches,
// so the sky "dissolves" into the flat page colour and back. Images (order 20)
// and the hyperspace arrow (order 12) draw on top of it.
// ============================================================
export const dotOverlayVert = /* glsl */`
varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
export const dotOverlayFrag = /* glsl */`
precision highp float; varying vec2 vUv;
uniform vec3 uColor; uniform float uOpacity, uPixelSize, uRadiusScale; uniform vec2 uResolution;
void main(){
  float a = clamp(uOpacity, 0.0, 1.0);
  vec2 normalizedPixelSize = vec2(uPixelSize / max(uResolution.x, 1.0), uPixelSize / max(uResolution.y, 1.0));
  vec2 safePixelSize = max(normalizedPixelSize, vec2(1e-6));
  vec2 cellUV = fract(vUv / safePixelSize);
  float radius = uRadiusScale * a;
  float distanceFromCenter = distance(cellUV, vec2(0.5));
  float aa = fwidth(distanceFromCenter) * 1.5;
  float circleMask = smoothstep(radius, radius - aa, distanceFromCenter);
  gl_FragColor = vec4(uColor, circleMask);
  #include <colorspace_fragment>
}`;

// ============================================================
// 5. LENS FLARE (post) — the ✦ sparkles on the glass highlights
// ============================================================
export const postVert = /* glsl */`
varying vec2 vUv; void main(){ vUv = position.xy*0.5+0.5; gl_Position = vec4(position.xy,1.0,1.0); }`;
export const flareFrag = /* glsl */`
uniform sampler2D tDiffuse; uniform vec2 uResolution;
uniform float uEnabled, uIntensity, uThreshold, uStreakScale, uHotspotPower, uGate, uStarRays;
uniform vec3 uTailColor;
varying vec2 vUv;
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float brightMask(float lum){
  float x = max(lum - uThreshold, 0.0);
  float m = clamp(x / max(1.0 - uThreshold, 1e-5), 0.0, 1.0);
  m = m * m * (3.0 - 2.0 * m);
  float hp = max(uHotspotPower, 1.0); if (hp > 1.01) m = pow(m, hp);
  float gate = clamp(uGate, 0.0, 1.0);
  float gm = clamp((m - gate) / max(1.0 - gate, 1e-5), 0.0, 1.0);
  return m * gm;
}
// (our sceneRT stores linear values; production thresholded the sRGB frame, so encode first)
vec3 srgb(vec3 c){ return pow(max(c, 0.0), vec3(1.0/2.2)); }
vec3 sampleBright(vec2 uv){ vec3 c = srgb(texture2D(tDiffuse, uv).rgb); return c * brightMask(luma(c)); }
vec3 streak(vec2 dirPx){
  vec3 acc = vec3(0.0);
  vec2 pixel = floor(vUv * uResolution);
  float h = fract(52.9829189 * fract(dot(pixel, vec2(0.06711056, 0.00583715))));
  float phase = step(0.5, h) * 0.5;
  for (int i = 1; i <= 8; i++) {
    float fi = float(i);
    float dist = fi * 1.5 + phase;
    float w = 1.0 / (1.0 + dist * 0.22); w *= w;
    float t = clamp(dist / 8.0, 0.0, 1.0);
    float tt = pow(t, 0.5);
    vec3 ramp = mix(vec3(1.0), uTailColor, tt);
    vec2 o = dirPx * dist;
    acc += sampleBright(vUv + o) * (w * ramp);
    acc += sampleBright(vUv - o) * (w * ramp);
  }
  return acc;
}
void main(){
  vec3 flare = vec3(0.0);
  if (uEnabled >= 0.5 && uIntensity > 0.0001) {
    vec3 base = srgb(texture2D(tDiffuse, vUv).rgb);
    vec2 px = (1.0 / max(uResolution, vec2(1.0))) * uStreakScale;
    flare += base * brightMask(luma(base)) * 1.2;
    if (uStarRays >= 7.5) {
      flare += streak(vec2(px.x, 0.0)); flare += streak(vec2(0.0, px.y));
      const float c45 = 0.70710678;
      flare += streak(vec2(px.x * c45, px.y * c45)); flare += streak(vec2(px.x * c45, -px.y * c45));
    } else if (uStarRays >= 5.5) {
      flare += streak(vec2(0.0, px.y));
      const float c30 = 0.8660254; const float s30 = 0.5;
      flare += streak(vec2(px.x * c30, px.y * s30)); flare += streak(vec2(px.x * c30, -px.y * s30));
    } else {
      flare += streak(vec2(px.x, 0.0)); flare += streak(vec2(0.0, px.y));
    }
  }
  flare *= (uIntensity * 0.75);
  gl_FragColor = vec4(flare, 1.0);
}`;
// Final pass to the screen: base (linear) + flare (already sRGB-ish, so decode
// it back to linear before adding), then encode once for the display.
export const compositeFrag = /* glsl */`
uniform sampler2D tBase, tFlare; varying vec2 vUv;
void main(){
  vec3 base = texture2D(tBase, vUv).rgb;
  vec3 flare = pow(max(texture2D(tFlare, vUv).rgb, 0.0), vec3(2.2));
  gl_FragColor = vec4(base + flare, 1.0);
  #include <colorspace_fragment>
}`;
