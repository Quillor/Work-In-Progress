/* ============================================================
   fluid.js — "FluidPushPass": a tiny GPU fluid sim (160² half-float
   velocity field) that the pointer pushes; the final image is displaced
   along the velocity with a spectral fringe. Also carries the pointer
   pixel-trail overlay (16 lime cells that fade behind the cursor).

   Sim steps per frame (all fullscreen quads on ping-pong RTs):
     curl → vorticity(+pointer splat) → divergence → pressure×4 → gradient → advect
   Display: base(+flare) sampled 4× along -velocity with cos-weighted RGB → chroma smear.
   ============================================================ */
import * as THREE from 'three';

const quadVert = /* glsl */`varying vec2 vUv; void main(){ vUv = position.xy*0.5+0.5; gl_Position = vec4(position.xy,1.0,1.0); }`;
const mkRT = (w, h) => new THREE.WebGLRenderTarget(w, h, { depthBuffer: false, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, type: THREE.HalfFloatType });
const mkMat = (frag, uniforms) => new THREE.ShaderMaterial({ uniforms, vertexShader: quadVert, fragmentShader: frag, depthTest: false, depthWrite: false, transparent: false, toneMapped: false });

const curlFrag = /* glsl */`uniform sampler2D uVelocity; uniform vec2 uTexelSize; varying vec2 vUv;
void main(){ float left = texture2D(uVelocity, vUv - vec2(uTexelSize.x, 0.0)).y; float right = texture2D(uVelocity, vUv + vec2(uTexelSize.x, 0.0)).y;
  float top = texture2D(uVelocity, vUv + vec2(0.0, uTexelSize.y)).x; float bottom = texture2D(uVelocity, vUv - vec2(0.0, uTexelSize.y)).x;
  gl_FragColor = vec4(0.5 * (right - left - top + bottom), 0.0, 0.0, 1.0); }`;
const vorticityFrag = /* glsl */`uniform sampler2D uVelocity, uCurl; uniform vec2 uTexelSize, uResolution, uPointer, uPointerDelta; uniform float uCurlStrength, uSplatRadius, uSplatForce; varying vec2 vUv;
void main(){
  float left = abs(texture2D(uCurl, vUv - vec2(uTexelSize.x, 0.0)).x); float right = abs(texture2D(uCurl, vUv + vec2(uTexelSize.x, 0.0)).x);
  float top = abs(texture2D(uCurl, vUv + vec2(0.0, uTexelSize.y)).x); float bottom = abs(texture2D(uCurl, vUv - vec2(0.0, uTexelSize.y)).x);
  float center = texture2D(uCurl, vUv).x;
  vec2 force = vec2(top - bottom, right - left); float fl = length(force); force = fl > 0.0001 ? force / fl : vec2(0.0);
  force *= uCurlStrength * center; force.y *= -1.0;
  vec2 velocity = texture2D(uVelocity, vUv).xy; velocity += force * 0.016; velocity = clamp(velocity, vec2(-1000.0), vec2(1000.0));
  vec2 mouseUv = uPointer / max(uResolution, vec2(0.0001)); vec2 diff = vUv - mouseUv; diff.x *= uResolution.x / max(uResolution.y, 0.0001);
  float pointerMask = exp(-dot(diff, diff) / max(uSplatRadius, 0.0001));
  velocity += (uPointerDelta / max(uResolution, vec2(0.0001))) * pointerMask * uSplatForce;
  gl_FragColor = vec4(velocity, 0.0, 1.0); }`;
const divergenceFrag = /* glsl */`uniform sampler2D uVelocity; uniform vec2 uTexelSize; varying vec2 vUv;
void main(){ float left = texture2D(uVelocity, vUv - vec2(uTexelSize.x, 0.0)).x; float right = texture2D(uVelocity, vUv + vec2(uTexelSize.x, 0.0)).x;
  float top = texture2D(uVelocity, vUv + vec2(0.0, uTexelSize.y)).y; float bottom = texture2D(uVelocity, vUv - vec2(0.0, uTexelSize.y)).y;
  gl_FragColor = vec4(0.5 * (right - left + top - bottom), 0.0, 0.0, 1.0); }`;
const clearFrag = /* glsl */`void main(){ gl_FragColor = vec4(0.0); }`;
const pressureFrag = /* glsl */`uniform sampler2D uPressure, uDivergence; uniform vec2 uTexelSize; varying vec2 vUv;
void main(){ float left = texture2D(uPressure, vUv - vec2(uTexelSize.x, 0.0)).x; float right = texture2D(uPressure, vUv + vec2(uTexelSize.x, 0.0)).x;
  float top = texture2D(uPressure, vUv + vec2(0.0, uTexelSize.y)).x; float bottom = texture2D(uPressure, vUv - vec2(0.0, uTexelSize.y)).x;
  float divergence = texture2D(uDivergence, vUv).x; gl_FragColor = vec4((left + right + top + bottom - divergence) * 0.25, 0.0, 0.0, 1.0); }`;
const gradientFrag = /* glsl */`uniform sampler2D uVelocity, uPressure; uniform vec2 uTexelSize; varying vec2 vUv;
void main(){ float left = texture2D(uPressure, vUv - vec2(uTexelSize.x, 0.0)).x; float right = texture2D(uPressure, vUv + vec2(uTexelSize.x, 0.0)).x;
  float top = texture2D(uPressure, vUv + vec2(0.0, uTexelSize.y)).x; float bottom = texture2D(uPressure, vUv - vec2(0.0, uTexelSize.y)).x;
  vec2 velocity = texture2D(uVelocity, vUv).xy; velocity -= vec2(right - left, top - bottom); gl_FragColor = vec4(velocity, 0.0, 1.0); }`;
const advectFrag = /* glsl */`uniform sampler2D uProjectedVelocity; uniform vec2 uTexelSize; uniform float uDissipation; varying vec2 vUv;
void main(){ vec2 velocity = texture2D(uProjectedVelocity, vUv).xy; vec2 coord = clamp(vUv - velocity * uTexelSize * 0.016, 0.0, 1.0);
  vec2 advected = texture2D(uProjectedVelocity, coord).xy; advected /= 1.0 + uDissipation * 0.016; gl_FragColor = vec4(advected, 0.0, 1.0); }`;

// display: fluid displacement + spectral highlight + pointer pixel trail, then sRGB encode
const displayFrag = /* glsl */`
uniform sampler2D tDiffuse, tFlare, uVelocity; uniform vec2 uSimSize; uniform float uDisplacementStrength, uChromaticBoost, uEffectEnabled;
vec3 spectrum(float x){ return cos((x - vec3(0.0, 0.5, 1.0)) * vec3(0.6, 1.0, 0.5) * 3.14); }
vec4 sampleBase(vec2 uv){ return vec4(texture2D(tDiffuse, uv).rgb + pow(max(texture2D(tFlare, uv).rgb, 0.0), vec3(2.2)), 1.0); }
vec4 getFluidDisplayColor(vec2 uv){
  vec2 velocity = texture2D(uVelocity, uv).xy;
  float effectEnabled = step(0.5, uEffectEnabled);
  vec2 displacement = velocity / max(uSimSize, vec2(1.0)) * uDisplacementStrength * effectEnabled;
  float velocityMagnitude = length(displacement);
  const int samples = 4; vec4 color = vec4(0.0); vec3 weightSum = vec3(0.0);
  for (int index = 0; index < samples; index++) {
    float t = float(index) / float(samples - 1);
    vec3 weight = max(vec3(0.0), cos((t - vec3(0.0, 0.5, 1.0)) * 3.14159 * 0.5));
    vec4 sampleColor = sampleBase(clamp(uv - displacement * 0.3 * (t + 0.3) * velocityMagnitude, 0.0, 1.0));
    color.rgb += sampleColor.rgb * weight; color.a += sampleColor.a * (weight.r + weight.g + weight.b) / 3.0; weightSum += weight;
  }
  color.rgb /= max(weightSum, vec3(0.0001)); color.a /= max((weightSum.r + weightSum.g + weightSum.b) / 3.0, 0.0001);
  vec3 spectralHighlight = spectrum(sin(velocityMagnitude * 2.0) * 0.4 + 0.6);
  color.rgb += spectralHighlight * smoothstep(0.2, 0.8, velocityMagnitude) * 0.5 * uChromaticBoost * effectEnabled;
  return color;
}
uniform vec2 uTrail[16]; uniform float uTrailStrength[16]; uniform float uTrailCount; uniform vec3 uPointerColor; uniform float uPointerOpacity, uPointerDotRadius, uPointerPixelSize; uniform vec2 uResolution; uniform float uDevicePixelRatio;
float cellEquals(vec2 a, vec2 b){ vec2 d = abs(a - b); return 1.0 - step(0.5, max(d.x, d.y)); }
vec4 applyPointerOverlay(vec2 uv, vec4 baseColor){
  float cssPixelSize = uPointerPixelSize * max(uDevicePixelRatio, 1.0);
  vec2 safePixelSize = max(vec2(cssPixelSize / max(uResolution.x, 1.0), cssPixelSize / max(uResolution.y, 1.0)), vec2(1e-6));
  vec2 cellId = floor(uv / safePixelSize); vec2 cellUV = fract(uv / safePixelSize);
  float highlight = 0.0;
  for (int i = 0; i < 16; i++) { float enabled = step(float(i), uTrailCount - 1.0); vec2 pointerCell = floor(uTrail[i] / safePixelSize);
    highlight = max(highlight, enabled * cellEquals(cellId, pointerCell) * clamp(uTrailStrength[i], 0.0, 1.0)); }
  float distToCenter = distance(cellUV, vec2(0.5)); float aa = fwidth(distToCenter) * 1.5;
  float circleMask = smoothstep(clamp(uPointerDotRadius, 0.0, 1.0), clamp(uPointerDotRadius, 0.0, 1.0) - aa, distToCenter);
  baseColor.rgb = mix(baseColor.rgb, uPointerColor, circleMask * highlight * clamp(uPointerOpacity, 0.0, 1.0));
  return baseColor;
}
varying vec2 vUv;
void main(){
  vec4 color = getFluidDisplayColor(vUv);
  gl_FragColor = applyPointerOverlay(vUv, color);
  #include <colorspace_fragment>
}`;

export class FluidPass {
  constructor(renderer, { strength = 0.3, radius = 1.5, velocityScale = 1, chromaticStrength = 0.002, pressureIterations = 4, curlStrength = 0, velocityDissipation = 3, simResolution = 160 } = {}) {
    this.gl = renderer; this.sim = simResolution; this.pressureIterations = pressureIterations;
    this.pointer = new THREE.Vector2(-1, -1); this.pointerDelta = new THREE.Vector2();
    const texel = new THREE.Vector2(1, 1), res = new THREE.Vector2(1, 1);
    this.velRead = mkRT(1, 1); this.velWrite = mkRT(1, 1); this.curlT = mkRT(1, 1); this.divT = mkRT(1, 1); this.pA = mkRT(1, 1); this.pB = mkRT(1, 1); this.projT = mkRT(1, 1);
    this.curlMat = mkMat(curlFrag, { uVelocity: { value: null }, uTexelSize: { value: texel.clone() } });
    this.vortMat = mkMat(vorticityFrag, { uVelocity: { value: null }, uCurl: { value: null }, uTexelSize: { value: texel.clone() }, uResolution: { value: res.clone() }, uPointer: { value: this.pointer }, uPointerDelta: { value: this.pointerDelta }, uCurlStrength: { value: curlStrength }, uSplatRadius: { value: Math.max(0.002 * radius, 5e-4) }, uSplatForce: { value: Math.max(3e3 * velocityScale, 0) } });
    this.divMat = mkMat(divergenceFrag, { uVelocity: { value: null }, uTexelSize: { value: texel.clone() } });
    this.clearMat = mkMat(clearFrag, {});
    this.pressMat = mkMat(pressureFrag, { uPressure: { value: null }, uDivergence: { value: null }, uTexelSize: { value: texel.clone() } });
    this.gradMat = mkMat(gradientFrag, { uVelocity: { value: null }, uPressure: { value: null }, uTexelSize: { value: texel.clone() } });
    this.advMat = mkMat(advectFrag, { uProjectedVelocity: { value: null }, uTexelSize: { value: texel.clone() }, uDissipation: { value: velocityDissipation } });
    // pointer trail state
    this.trail = Array.from({ length: 16 }, () => new THREE.Vector2(0.5, 0.5)); this.trailStrength = Array.from({ length: 16 }, () => 0); this.lastCell = new THREE.Vector2(-1, -1); this.pixelSize = 16; this.cssRes = new THREE.Vector2(1, 1); this.dpr = 1;
    this.displayMat = mkMat(displayFrag, { tDiffuse: { value: null }, tFlare: { value: null }, uVelocity: { value: null }, uSimSize: { value: new THREE.Vector2(simResolution, simResolution) }, uDisplacementStrength: { value: Math.max(strength / 0.3, 0) }, uChromaticBoost: { value: Math.max(chromaticStrength / 0.004, 0) }, uEffectEnabled: { value: 1 },
      uTrail: { value: this.trail }, uTrailStrength: { value: this.trailStrength }, uTrailCount: { value: 14 }, uPointerColor: { value: new THREE.Color('#c0fe04') }, uPointerOpacity: { value: 1 }, uPointerDotRadius: { value: 0.8 }, uPointerPixelSize: { value: 16 }, uResolution: { value: new THREE.Vector2(1, 1) }, uDevicePixelRatio: { value: 1 } });
    this.scene = new THREE.Scene(); this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.displayMat); this.quad.frustumCulled = false; this.scene.add(this.quad);
  }
  setSize(w, h, cssW, cssH, dpr) {
    const aspect = w / Math.max(1, h), sw = Math.max(1, Math.round(this.sim * Math.max(1, aspect))), sh = Math.max(1, Math.round(this.sim * Math.max(1, 1 / aspect)));
    for (const rt of [this.velRead, this.velWrite, this.curlT, this.divT, this.pA, this.pB, this.projT]) rt.setSize(sw, sh);
    const texel = new THREE.Vector2(1 / sw, 1 / sh);
    for (const m of [this.curlMat, this.vortMat, this.divMat, this.pressMat, this.gradMat, this.advMat]) m.uniforms.uTexelSize.value.copy(texel);
    this.vortMat.uniforms.uResolution.value.set(w, h);
    this.displayMat.uniforms.uSimSize.value.set(sw, sh); this.displayMat.uniforms.uResolution.value.set(w, h);
    this.cssRes.set(cssW, cssH); this.dpr = dpr; this.displayMat.uniforms.uDevicePixelRatio.value = dpr;
  }
  // pointer in device px (y up), delta in device px
  setPointer(x, y, dx, dy) { this.pointer.set(x, y); this.pointerDelta.set(dx, dy); }
  setEffectEnabled(on) { this.displayMat.uniforms.uEffectEnabled.value = on ? 1 : 0; }
  setPointerOverlayEnabled(on) { this.displayMat.uniforms.uPointerOpacity.value = on ? 1 : 0; }
  // uv in 0..1 (y up), active = pointer inside & overlay enabled
  updateTrail(uv, active, dt) {
    const nx = Math.max(this.pixelSize / Math.max(this.cssRes.x, 1), 1e-6), ny = Math.max(this.pixelSize / Math.max(this.cssRes.y, 1), 1e-6);
    for (let i = active ? 1 : 0; i < 14; i++) this.trailStrength[i] = THREE.MathUtils.damp(this.trailStrength[i], 0, 2, dt);
    if (active) {
      const cx = Math.floor(uv.x / nx), cy = Math.floor(uv.y / ny);
      if (cx !== this.lastCell.x || cy !== this.lastCell.y) { for (let i = 13; i > 0; i--) { this.trail[i].copy(this.trail[i - 1]); this.trailStrength[i] = this.trailStrength[i - 1]; } this.lastCell.set(cx, cy); }
      this.trail[0].set(uv.x, uv.y); this.trailStrength[0] = 1; return;
    }
    this.lastCell.set(-1, -1);
  }
  _run(mat, target) { this.quad.material = mat; this.gl.setRenderTarget(target); this.gl.render(this.scene, this.cam); }
  simulate() {
    const gl = this.gl;
    this.curlMat.uniforms.uVelocity.value = this.velRead.texture; this._run(this.curlMat, this.curlT);
    this.vortMat.uniforms.uVelocity.value = this.velRead.texture; this.vortMat.uniforms.uCurl.value = this.curlT.texture; this._run(this.vortMat, this.velWrite);
    [this.velRead, this.velWrite] = [this.velWrite, this.velRead];
    this.divMat.uniforms.uVelocity.value = this.velRead.texture; this._run(this.divMat, this.divT);
    this._run(this.clearMat, this.pA);
    for (let i = 0; i < this.pressureIterations; i++) { this.pressMat.uniforms.uPressure.value = this.pA.texture; this.pressMat.uniforms.uDivergence.value = this.divT.texture; this._run(this.pressMat, this.pB); [this.pA, this.pB] = [this.pB, this.pA]; }
    this.gradMat.uniforms.uVelocity.value = this.velRead.texture; this.gradMat.uniforms.uPressure.value = this.pA.texture; this._run(this.gradMat, this.projT);
    this.advMat.uniforms.uProjectedVelocity.value = this.projT.texture; this._run(this.advMat, this.velWrite);
    [this.velRead, this.velWrite] = [this.velWrite, this.velRead];
    gl.setRenderTarget(null);
  }
  // final composite → screen
  display(baseTex, flareTex) {
    this.displayMat.uniforms.tDiffuse.value = baseTex; this.displayMat.uniforms.tFlare.value = flareTex; this.displayMat.uniforms.uVelocity.value = this.velRead.texture;
    this.quad.material = this.displayMat; this.gl.setRenderTarget(null); this.gl.render(this.scene, this.cam);
  }
}
