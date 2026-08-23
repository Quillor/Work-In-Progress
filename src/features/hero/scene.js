/* ============================================================
   scene.js — the WebGL layer (three.js r184), a vanilla port of the
   React-Three-Fiber scene on haoqi.design.

   Render loop, per frame:
     1. skyPipeline.update()   → 4 low-res passes ping-pong into skyRT.
                                 The output quad (renderOrder -10) paints it
                                 as the scene background.
     2. glass FBO              → render LAYER 0 only (sky + images) at ½ res.
                                 The glass shader refracts THIS texture.
     3. sceneRT                → render everything (layer 0 + 10 glass).
     4. flare + composite      → 6-ray star streaks on the brightest pixels,
                                 added over sceneRT, to screen.

   World ↔ page mapping: the canvas is fixed; DOM sections tell us where
   things are via getBoundingClientRect(). Objects convert a doc-Y into a
   world-Y with `worldYFromDocY()` (see below) exactly like the original's
   `scrollSyncedWorldYFromAnchorDocY`.
   ============================================================ */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as S from './shaders.js';
import { FluidPass } from './fluid.js';

const GLASS_LAYER = 10;
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp, damp = THREE.MathUtils.damp, deg = THREE.MathUtils.degToRad;
const smoothstep = (x, a, b) => THREE.MathUtils.smoothstep(x, a, b);

// ---------- theme-dependent constants (from the production bundle) ----------
// Palette: timrosenberg.replit.app — bg #07040e · accent #d24ff0 · accent-2 #7a3aee · accent-3 #06b6d4 · accent-light #f2b28d
const SKY = {
  light: { bg: '#ffac26', vignette: '#d29cff', output: '#ffbaba', outputMix: 0.65, edgeIntensity: 0.32 },
  dark:  { bg: '#005799', vignette: '#800057', output: '#2b6ad4', outputMix: 0.99, edgeIntensity: 0.32 },
};
// dark iridescent sheen laid over the sky's output composite
const SKY_IRI = { strength: 0.29, scale: 0.85 };
// hero text — light frosted glass
const TEXT = { specular: 0.88, fresnel: 0.67, shininess: 160, diffuseness: 0.79, fresnelPower: 1.6,
  brightness: 1.35, saturation: 1.3, contrast: 0.85, tintMix: 3, thickMin: 0.5, thickMax: 0.85,
  tintA: '#b46a28', tintB: '#59310f', frost: 0.078, frostHaze: 0,
  // extra glass passes layered on top of the base material (see glassFrag §2)
  envStrength: 0.58, envSharp: 3.2, glintStrength: 3.67, glintPower: 160, edgeGlow: 0.41, sweepStrength: 2.72 };
// iridescent loading wheel — material + motion
const WHEEL = { chroma: 2, refract: 1.5, iorR: 1.6, iorG: 1.08, iorB: 1, fresnel: 5, specular: 2.2, opacity: 0.89 };
const SPIN = { chaseSpeed: 0.43, filmSpeed: 0.81, filmScale: 2.05, sheenWhite: 0.62, saturation: 0.4, drift: 0.31,
  // loaded-vs-unloaded pill contrast: dim pills sit at `trailFloor`, the lit one peaks at
  // floor+gain, and `trailPow` sharpens the falloff so fewer pills read as "on" at once
  trailFloor: 0.06, trailGain: 2.06, trailPow: 3.65 };
// hero layout — where the text and the spinner sit in the banner
const LAYOUT = { textX: -4.5, textY: -4.8, spinX: 2.9, spinY: 3.4 };
const GLASS = {
  refractPower: 0.72, chromaticAberration: 0.14, specularStrength: 1.2, loop: 3,
  fresnelSideDir: [-1, 1, -1], lightZ: 0.5,
  light: { diffuseness: 0.1,  shininess: 120, fresnelPower: 1, saturation: 1.2, brightness: 0.78, contrast: 0.9,  gamma: 1, fresnelStrength: 0.24, tintMix: 1, tintA: '#d24ff0', tintB: '#f2b28d', thickMin: 1, thickMax: 0.92 },
  dark:  { diffuseness: 0.05, shininess: 100, fresnelPower: 3, saturation: 1.2, brightness: 0.6,  contrast: 0.98, gamma: 1, fresnelStrength: 0.72, tintMix: 1, tintA: '#d24ff0', tintB: '#06b6d4', thickMin: 1, thickMax: 0.4 },
};
// hover "boost" multipliers (hero hovered → damped 0→1): pushes the glass + sky well past the stock look
const BOOST = { refract: 5, chroma: 8, loop: 8, fresnel: 5, brightness: 1.8, saturation: 2.3, specular: 3, swirlAngle: 5, swirlMix: 1, swirlRadius: 2.6, sineAmp: 2.4, sineFreq: 1.8, vignetteRadius: 2.2, wobble: 0 };
const FLARE = { starRays: 6, intensity: 0.7, threshold: 0.99, streakScale: 8, hotspotPower: 32, gate: 0.88, downsample: 0.5, tail: { light: '#7a3aee', dark: '#06b6d4' } };
const HYPER = { accent: '#7a3aee', stripeA: '#d24ff0', stripeB: '#06b6d4' };
const OVERLAY = { colors: { dark: '#07040e', light: '#f2b28d' }, pixelSize: 4, radiusScale: 0.9 };

const v3 = (hex) => { const c = new THREE.Color(hex); return new THREE.Vector3(c.r, c.g, c.b); };

// ============================================================
export class Scene {
  constructor({ canvas, scroller, getTheme, layers, sections, onReady }) {
    this.canvas = canvas; this.scroller = scroller; this.getTheme = getTheme;
    this.layers = layers; this.sections = sections; this.onReady = onReady;
    this.theme = getTheme();
    this.pointer = { uv: new THREE.Vector2(0.5, 0.5), inside: false, px: new THREE.Vector2() };
    this.time = 0; this.frame = 0; this.readyCount = 0;
    this.hoverTarget = 0; this.hoverBoost = 0; // hero hovered → shaders go extreme
    this.reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this._init();
  }

  _init() {
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.toneMapping = THREE.NoToneMapping;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.autoClear = true;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000); // three's default fov (drei <PerspectiveCamera> uses it too)
    this.camera.position.set(0, 0, 22);
    this.camera.layers.enable(GLASS_LAYER);
    this.camBase = new THREE.Vector3(0, 0, 22);

    this._buildSky();
    this._buildOverlay();
    this._buildGlassFBO();
    this._buildPost();
    this._buildImages();
    this._buildModels();
    this._pointerLight = pointerLight();
    this.pointerMovedAt = -1e9;

    addEventListener('pointermove', (e) => {
      this.pointer.px.set(e.clientX, e.clientY);
      this.pointer.uv.set(e.clientX / innerWidth, 1 - e.clientY / innerHeight);
      this.pointer.inside = true; this.pointerMovedAt = performance.now();
    }, { passive: true });
    document.addEventListener('pointerleave', () => { this.pointer.inside = false; });
    addEventListener('resize', () => this.resize());
    this.resize();
    r.setAnimationLoop((t) => this._tick(t));
  }

  setTheme(theme) { this.theme = theme; this._applyTheme(); }

  // ---------- helpers ----------
  vh() { return Math.max(1, innerHeight); }
  scrollTop() { return this.scroller.scrollTop(); }
  // world-space size of the view frustum at depth z (like R3F viewport.getCurrentViewport)
  viewportAt(z) {
    const dist = Math.abs(this.camera.position.z - z);
    const h = 2 * Math.tan(deg(this.camera.fov) / 2) * dist;
    return { width: h * this.camera.aspect, height: h };
  }
  // doc-Y (px from top of document) → world Y at depth z, optionally moving
  // slower than the page (scrollSyncFactor < 1 = parallax).
  worldYFromDocY(docY, z, syncFactor = 1) {
    const vh = this.vh(), H = this.viewportAt(z).height;
    return (0.5 - docY / vh) * H + (this.scrollTop() / vh) * H * syncFactor;
  }
  sectionRect(name) { // rect in doc coordinates
    const el = this.sections[name]; if (!el) return null;
    const b = el.getBoundingClientRect();
    return { top: b.top + this.scrollTop(), height: b.height, viewTop: b.top, viewBottom: b.bottom };
  }
  sectionInView(name) {
    const s = this.sectionRect(name); if (!s) return false;
    return s.viewBottom > 0 && s.viewTop < this.vh();
  }
  // entry: 0→1 as section top rises from viewport bottom to top; after: 0→1 for the next viewport
  sectionProgress(name) {
    const s = this.sectionRect(name); if (!s) return { entry: 1, after: 0 };
    const vh = this.vh(), i = (this.scrollTop() + vh - s.top) / vh;
    return { entry: clamp(i, 0, 1), after: clamp(i - 1, 0, 1) };
  }

  // ============================================================
  // 1. SKY — vignette → swirl → sine → bokeh, ping-pong at 0.3× res
  // ============================================================
  _buildSky() {
    const cfg = this.skyCfg = {
      resolutionScale: 0.3,
      vignette: { radius: 0.354, falloff: 1, mix: 1, displace: 0, skew: 0.54, angle: 0 },
      swirl: { radius: 0.25, angle: 0.1, phase: 0, mix: 0.5 },
      sine: { mixRadius: 1, frequency: 0.35, amplitude: 1.18, rotation: 0 },
      bokeh: { radius: 0.754, tilt: 0.5, trackMouse: 0 },
      smoothing: 0.1, leaveSmoothing: 0.05,
    };
    const res = this.skyRes = new THREE.Vector2(1, 1);
    const sharedPos = this.skyPos = new THREE.Vector2(0.5, -0.1); // follows pointer (smoothed)
    const uTime = this.skyTime = { value: 0 };
    const mk = (frag, extra) => new THREE.ShaderMaterial({
      vertexShader: S.fsQuadVert, fragmentShader: frag,
      uniforms: { tInput: { value: null }, uResolution: { value: res }, uTime, uPos: { value: sharedPos }, uMousePos: { value: new THREE.Vector2(0.5, 0.5) }, uTrackMouse: { value: 1 }, ...extra },
      transparent: false, blending: THREE.NoBlending, depthTest: false, depthWrite: false, toneMapped: false,
    });
    const t = this.theme, C = SKY[t];
    this.skyColors = { bg: v3(C.bg), vignette: v3(C.vignette), output: v3(C.output) };
    this.skyTarget = { bg: v3(C.bg), vignette: v3(C.vignette), output: v3(C.output) };
    // 128² white-noise texture stands in for blue noise
    const n = 128, data = new Uint8Array(n * n * 4);
    for (let i = 0; i < data.length; i += 4) { const v = Math.random() * 255 | 0; data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255; }
    const noise = new THREE.DataTexture(data, n, n, THREE.RGBAFormat); noise.needsUpdate = true; noise.wrapS = noise.wrapT = THREE.RepeatWrapping;

    this.skyPasses = [
      { name: 'vignette', material: mk(S.vignetteFrag, { uRadius: { value: cfg.vignette.radius }, uFalloff: { value: cfg.vignette.falloff }, uMix: { value: 1 }, uDisplace: { value: 0 }, uSkew: { value: cfg.vignette.skew }, uAngle: { value: 0 }, uEdgeIntensity: { value: C.edgeIntensity }, uVignetteColor: { value: this.skyColors.vignette.clone() }, uClearColor: { value: this.skyColors.bg.clone() } }) },
      { name: 'swirl', material: mk(S.swirlFrag, { uRadius: { value: cfg.swirl.radius }, uAngle: { value: cfg.swirl.angle }, uPhase: { value: 0 }, uMix: { value: cfg.swirl.mix } }) },
      { name: 'sine', material: mk(S.sineFrag, { uMixRadius: { value: cfg.sine.mixRadius }, uFrequency: { value: cfg.sine.frequency }, uAmplitude: { value: cfg.sine.amplitude }, uRotation: { value: 0 } }) },
      { name: 'bokeh', material: mk(S.bokehFrag, { tBlueNoise: { value: noise }, uBlueNoiseResolution: { value: new THREE.Vector2(n, n) }, uAmount: { value: 3.125 * cfg.bokeh.radius }, uTilt: { value: cfg.bokeh.tilt }, uPos: { value: new THREE.Vector2(0.5, 0.5) }, uTrackMouse: { value: 0 } }) },
    ];
    this.skyOutput = new THREE.ShaderMaterial({
      vertexShader: S.bgOutputVert, fragmentShader: S.bgOutputFrag,
      uniforms: { tInput: { value: null }, uBgColor: { value: this.skyColors.bg.clone() }, uOutputColor: { value: this.skyColors.output.clone() }, uOutputMix: { value: C.outputMix },
        uIriTime: { value: 0 }, uIriStrength: { value: SKY_IRI.strength }, uIriScale: { value: SKY_IRI.scale } },
      depthTest: false, depthWrite: false, toneMapped: false, transparent: false, blending: THREE.NoBlending,
    });
    this.skyRT = { read: new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false }), write: new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false }) };
    this.skyScene = new THREE.Scene();
    this.skyCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.skyQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.skyPasses[0].material);
    this.skyScene.add(this.skyQuad);
    // background quad in the main scene
    const bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.skyOutput);
    bgMesh.frustumCulled = false; bgMesh.renderOrder = -10;
    this.scene.add(bgMesh);
    this._skyMouse = new THREE.Vector2(0.5, 0.5); this._skyMouseTarget = new THREE.Vector2(0.5, 0.5);
  }
  _updateSky() {
    const cfg = this.skyCfg, gl = this.renderer;
    this.skyTime.value = this.time;
    this.skyOutput.uniforms.uIriTime.value = this.time;
    // pointer → smoothed shared position (rest = centre when pointer leaves)
    this._skyMouseTarget.set(this.pointer.inside ? clamp(this.pointer.uv.x, 0, 1) : 0.5, this.pointer.inside ? clamp(this.pointer.uv.y, 0, 1) : 0.5);
    this._skyMouse.lerp(this._skyMouseTarget, this.pointer.inside ? cfg.smoothing : cfg.leaveSmoothing);
    this.skyPos.copy(this._skyMouse);
    for (const p of this.skyPasses) p.material.uniforms.uMousePos?.value.copy(this._skyMouse);
    // theme colour crossfade
    const c = this.skyColors, tg = this.skyTarget;
    c.bg.lerp(tg.bg, cfg.smoothing); c.vignette.lerp(tg.vignette, cfg.smoothing); c.output.lerp(tg.output, cfg.smoothing);
    const vig = this.skyPasses[0].material.uniforms;
    vig.uVignetteColor.value.copy(c.vignette); vig.uClearColor.value.copy(c.bg);
    this.skyOutput.uniforms.uBgColor.value.copy(c.bg); this.skyOutput.uniforms.uOutputColor.value.copy(c.output);
    // hover boost — harder swirl / sine warp
    const b = this.hoverBoost, sw = this.skyPasses[1].material.uniforms, sn = this.skyPasses[2].material.uniforms;
    sw.uAngle.value = cfg.swirl.angle * lerp(1, BOOST.swirlAngle, b); sw.uMix.value = lerp(cfg.swirl.mix, BOOST.swirlMix, b);
    sn.uAmplitude.value = cfg.sine.amplitude * lerp(1, BOOST.sineAmp, b); sn.uFrequency.value = cfg.sine.frequency * lerp(1, BOOST.sineFreq, b);
    sw.uRadius.value = cfg.swirl.radius * lerp(1, BOOST.swirlRadius, b);
    this.skyPasses[0].material.uniforms.uRadius.value = cfg.vignette.radius * lerp(1, BOOST.vignetteRadius, b);
    // run the passes (every 2nd frame is plenty at 0.3× res)
    if (this.frame % 2 === 0) {
      const rt = this.skyRT;
      for (const p of this.skyPasses) {
        p.material.uniforms.tInput.value = rt.read.texture;
        this.skyQuad.material = p.material;
        gl.setRenderTarget(rt.write); gl.render(this.skyScene, this.skyCam);
        [rt.read, rt.write] = [rt.write, rt.read];
      }
      gl.setRenderTarget(null);
      this.skyOutput.uniforms.tInput.value = rt.read.texture;
    }
  }

  // ============================================================
  // 1b. PIXEL-DOT OVERLAY — dissolves the sky between hero and footer
  // ============================================================
  _buildOverlay() {
    this.overlayMat = new THREE.ShaderMaterial({ vertexShader: S.dotOverlayVert, fragmentShader: S.dotOverlayFrag, transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
      uniforms: { uColor: { value: new THREE.Color(OVERLAY.colors[this.theme]) }, uOpacity: { value: 0 }, uPixelSize: { value: OVERLAY.pixelSize }, uRadiusScale: { value: OVERLAY.radiusScale }, uResolution: { value: new THREE.Vector2(1, 1) } } });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.overlayMat); m.renderOrder = 10; m.frustumCulled = false; this.scene.add(m);
    this.overlayOpacity = 0;
  }
  // opacity = clamp((vh - bannerBottom) / (0.75vh)) × clamp(footerTop / vh)
  _updateOverlay() {
    const vh = this.vh(), b = this.sectionRect('banner'), f = this.sectionRect('footer');
    const bannerBottom = b ? b.viewBottom : vh, footerTop = f ? f.viewTop : vh;
    const o = clamp((vh - bannerBottom) / Math.max(1, vh - 0.25 * vh), 0, 1) * clamp(footerTop / vh, 0, 1);
    this.overlayOpacity = o; this.overlayMat.uniforms.uOpacity.value = o;
    this.overlayMat.uniforms.uResolution.value.set(innerWidth, innerHeight);
  }
  get overlayOpaque() { return this.overlayOpacity >= 0.98; }

  // ============================================================
  // 2. GLASS FBO — what the glass refracts (layer 0 only, half res)
  // ============================================================
  _buildGlassFBO() {
    this.glassRT = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true, stencilBuffer: false, samples: 0 });
    this.screenPx = new THREE.Vector2(1, 1);
  }
  _renderGlassFBO() {
    if (this.overlayOpaque || !this.glassMeshes.some(m => m.group.visible)) return;
    if (this.frame % 2 !== 0) return; // production also throttles this
    const gl = this.renderer, cam = this.camera, mask = cam.layers.mask;
    gl.setRenderTarget(this.glassRT); gl.clear();
    cam.layers.mask = 1; gl.render(this.scene, cam); cam.layers.mask = mask;
    gl.setRenderTarget(null);
  }

  // ============================================================
  // 4. POST — flare + composite
  // ============================================================
  _buildPost() {
    this.sceneRT = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true, samples: 0 });
    this.flareRT = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.flareMat = new THREE.ShaderMaterial({ vertexShader: S.postVert, fragmentShader: S.flareFrag, depthTest: false, depthWrite: false,
      uniforms: { tDiffuse: { value: null }, uResolution: { value: new THREE.Vector2(1, 1) }, uEnabled: { value: 1 }, uStarRays: { value: FLARE.starRays }, uIntensity: { value: FLARE.intensity }, uThreshold: { value: FLARE.threshold }, uStreakScale: { value: FLARE.streakScale }, uHotspotPower: { value: FLARE.hotspotPower }, uGate: { value: FLARE.gate }, uTailColor: { value: new THREE.Color(FLARE.tail[this.theme]) } } });
    this.postScene = new THREE.Scene(); this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.flareMat); this.postQuad.frustumCulled = false;
    this.postScene.add(this.postQuad);
    // fluid push + pointer trail; also does the final composite (base + flare → screen)
    this.fluid = new FluidPass(this.renderer);
    this._fluidLast = new THREE.Vector2(-1, -1); this._fluidDelta = new THREE.Vector2();
    this.blackRT = new THREE.WebGLRenderTarget(2, 2); // stands in for "no flare"
  }
  _renderPost(dt) {
    const gl = this.renderer, dpr = gl.getPixelRatio(), w = innerWidth * dpr, h = innerHeight * dpr;
    // flare only while a glass-hosting section is on screen and the overlay isn't solid
    const flareOn = !this.overlayOpaque && (this.sectionInView('banner') || this.sectionInView('footer'));
    if (flareOn) {
      this.flareMat.uniforms.tDiffuse.value = this.sceneRT.texture; this.postQuad.material = this.flareMat;
      gl.setRenderTarget(this.flareRT); gl.render(this.postScene, this.postCam);
    }
    // pointer → fluid splat (device px, y-up)
    const mobile = innerWidth < 1024, active = this.pointer.inside && !mobile && !this.reduceMotion;
    if (active) {
      const x = this.pointer.uv.x * w, y = this.pointer.uv.y * h;
      if (this._fluidLast.x >= 0) this._fluidDelta.set(x - this._fluidLast.x, y - this._fluidLast.y); else this._fluidDelta.set(0, 0);
      this._fluidLast.set(x, y); this.fluid.setPointer(x, y, this._fluidDelta.x, this._fluidDelta.y);
    } else { this._fluidDelta.multiplyScalar(0.9); this.fluid.setPointer(-1, -1, 0, 0); }
    const idle = performance.now() - this.pointerMovedAt > 600;
    const fluidOn = active && !idle;
    this.fluid.setEffectEnabled(fluidOn); this.fluid.setPointerOverlayEnabled(false); // pointer trail removed
    this.fluid.updateTrail(this.pointer.uv, active, dt);
    if (fluidOn) this.fluid.simulate();
    this.fluid.display(this.sceneRT.texture, flareOn ? this.flareRT.texture : this.blackRT.texture);
  }

  // ============================================================
  // 3. IMAGE QUADS — one fullscreen quad per DOM placeholder
  // ============================================================
  _buildImages() {
    const loader = new THREE.TextureLoader();
    this.images = this.layers.map((L) => {
      const mat = new THREE.ShaderMaterial({ vertexShader: S.imageVert, fragmentShader: S.imageFrag, transparent: true, toneMapped: false, depthTest: false, depthWrite: false,
        uniforms: { map: { value: null }, mapHover: { value: null }, uRect: { value: new THREE.Vector4(0, 0, 1, 1) }, uCurlStrength: { value: 0 }, uPolarityPositive: { value: 0 }, uLayerOpacity: { value: 1 }, uRevealProgress: { value: 1 }, uRevealSoftness: { value: 0 }, uRevealDirection: { value: 1 }, uHoverRevealProgress: { value: 0 }, uDotPixelSize: { value: 18 }, uViewportPx: { value: new THREE.Vector2(1, 1) } } });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
      mesh.renderOrder = 20; mesh.frustumCulled = false; mesh.visible = false;
      this.scene.add(mesh);
      const img = { el: L.el, mesh, mat, hover: 0, hovered: false, polarity: 0, ready: false };
      const fix = (t) => { t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy()); t.generateMipmaps = !L.hoverUrl; t.minFilter = L.hoverUrl ? THREE.LinearFilter : THREE.LinearMipmapLinearFilter; };
      loader.load(L.url, (t) => { fix(t); mat.uniforms.map.value = t; mat.uniforms.mapHover.value = t; img.ready = true; this._ready(L.key); });
      if (L.hoverUrl) loader.load(L.hoverUrl, (t) => { fix(t); mat.uniforms.mapHover.value = t; });
      // hover state is read from the DOM card (pointer events on the <a>)
      const host = L.el.closest('a') || L.el;
      host.addEventListener('pointerenter', () => { img.hovered = true; });
      host.addEventListener('pointerleave', () => { img.hovered = false; });
      return img;
    });
    this._curl = { lastTop: null, vel: 0 };
  }
  _updateImages(dt) {
    // scroll velocity → curl strength (fast attack, slow release) — from the original
    const t = Math.max(1 / 240, Math.min(dt, 0.1)), top = this.scrollTop();
    const inst = this._curl.lastTop == null ? 0 : Math.abs(top - this._curl.lastTop) / t; this._curl.lastTop = top;
    const target = clamp(inst / 800, 0, 1), a = this._curl.vel;
    const s = 1 - Math.exp(-t / Math.max(target > a ? 0.025 : 0.175, 1e-4));
    this._curl.vel = a + (target - a) * s;
    const curl = 0.06 * this._curl.vel;
    const vh = this.vh(), vw = Math.max(1, innerWidth);
    for (const img of this.images) {
      if (!img.ready) { img.mesh.visible = false; continue; }
      const r = img.el.getBoundingClientRect();
      const margin = 0.25 * vh, near = r.bottom > -margin && r.top < vh + margin;
      if (!near || r.width <= 0) { img.mesh.visible = false; img.polarity = 0; img.mat.uniforms.uPolarityPositive.value = 0; continue; }
      img.mesh.visible = true;
      // hover reveal 0→1 in 0.42s, cosine-eased
      const step = Math.min(dt, 0.1) / 0.42;
      img.hover = img.hovered ? Math.min(1, img.hover + step) : Math.max(0, img.hover - step);
      img.mat.uniforms.uHoverRevealProgress.value = 0.5 - 0.5 * Math.cos(Math.PI * img.hover);
      // polarity: inverted → positive over 0.8s once actually on screen
      const onScreen = r.right > 0 && r.left < vw && r.bottom > 0 && r.top < vh;
      if (!onScreen) img.polarity = 0; else img.polarity = this.reduceMotion ? 1 : Math.min(1, img.polarity + dt / 0.8);
      const p = img.polarity, eased = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      img.mat.uniforms.uPolarityPositive.value = eased;
      img.mat.uniforms.uRect.value.set(r.left / vw, 1 - (r.top + r.height) / vh, r.width / vw, r.height / vh);
      img.mat.uniforms.uCurlStrength.value = curl;
      img.mat.uniforms.uViewportPx.value.set(vw, vh);
    }
  }

  // ============================================================
  // GLASS MODELS + HYPERSPACE ARROW
  // ============================================================
  _buildModels() {
    this.glassMeshes = [];
    const loader = new GLTFLoader();
    const load = (url) => new Promise((res, rej) => loader.load(url, (g) => res(mergeScene(g)), undefined, rej));

    // hello — banner
    load('/hero/work-in-progress.gltf').then((geo) => {
      this.glassMeshes.push(this._glass({ key: 'hello', geo, section: 'banner', position: [LAYOUT.textX, LAYOUT.textY, 2], beforeRot: [0, 240, 0], rot: [0, 4, 0], afterRot: [0, 90, 0], scale: 0.29, syncFactor: 0.72, float: true, reflective: true }));
    });
    // glass loading wheel — banner (12-bar iOS/macOS-style spinner, cast in high-refraction crystal glass)
    const crystalTint = { light: ['#eaf0ff', '#d9c9ff'], dark: ['#eaf0ff', '#c9d9ff'] };
    const crystalUniforms = () => ({ uOpacity: { value: 0.88 }, uTime: { value: 0 }, uEdgeStrength: { value: 0.5 }, uBloomStrength: { value: 1.3 } });
    // sits centred behind the hero text (z well behind the text's z:2) at 2× the previous size
    const wheelGeo = buildSpinnerGeometry(5.5, 4.2, 12, 1.1);
    this.glassMeshes.push(this._glass({
      key: 'h_star', geo: wheelGeo, section: 'banner', position: [LAYOUT.spinX, LAYOUT.spinY, -7], axisTilt: [0, 0, 0], renderOrder: -2,
      beforeRot: [0, 0, 0], rot: [0, 0, 0], afterRot: [0, 720, 0], scale: 0.6, syncFactor: 0.72, float: true,
      tint: crystalTint, cyber: true, wheel: true, highRefract: true, iridescent: true, frag: S.iridescentFrag, vert: S.iridescentVert,
      extraUniforms: { ...crystalUniforms(),
        uChaseSpeed: { value: SPIN.chaseSpeed }, uFilmSpeed: { value: SPIN.filmSpeed }, uFilmScale: { value: SPIN.filmScale },
        uSheenWhite: { value: SPIN.sheenWhite }, uIriSat: { value: SPIN.saturation },
        uTrailFloor: { value: SPIN.trailFloor }, uTrailGain: { value: SPIN.trailGain }, uTrailPow: { value: SPIN.trailPow } },
    }));
  }
  _ready(key) { this.readyCount++; this.onReady?.(key, this.readyCount); }

  _glass(o) {
    const u = {
      uTexture: { value: this.glassRT.texture },
      uIorR: { value: 1.15 }, uIorY: { value: 1.16 }, uIorG: { value: 1.18 }, uIorC: { value: 1.22 }, uIorB: { value: 1.22 }, uIorP: { value: 1.22 },
      uRefractPower: { value: 0.24 }, uChromaticAberration: { value: 0.24 }, uSaturation: { value: 1 }, uShininess: { value: 40 }, uDiffuseness: { value: 0.1 }, uFresnelPower: { value: 6 },
      uBrightness: { value: 1 }, uContrast: { value: 1 }, uGamma: { value: 1 }, uSpecularStrength: { value: 1.2 }, uFresnelStrength: { value: 1 }, uFresnelSideDir: { value: new THREE.Vector3(-1, 0.3, 1) },
      uTintColorA: { value: new THREE.Vector4(1, 1, 1, 1) }, uTintColorB: { value: new THREE.Vector4(1, 1, 1, 1) }, uTintLocalYRange: { value: new THREE.Vector2(0, 1) }, uTintEnabled: { value: 1 }, uTintMix: { value: 0.8 }, uTintThicknessMinAlpha: { value: 0.35 }, uTintThicknessMaxAlpha: { value: 1 },
      uDark: { value: 0 }, uLoop: { value: 6 }, uSceneRefractionEnabled: { value: 1 }, uRgbRefraction: { value: 0 }, uLight: { value: new THREE.Vector3(4, 9, 0.5) }, uScreenResolutionPx: { value: this.screenPx },
      uTime: { value: 0 }, uFrost: { value: 0 }, uFrostHaze: { value: 0 },
      uEnvStrength: { value: 0 }, uEnvSharp: { value: 1 }, uGlintStrength: { value: 0 }, uGlintPower: { value: 32 },
      uEdgeGlow: { value: 0 }, uSweepStrength: { value: 0 },
      ...(o.extraUniforms || {}),
    };
    const mat = new THREE.ShaderMaterial({ vertexShader: o.vert || S.glassVert, fragmentShader: o.frag || S.glassFrag, uniforms: u, toneMapped: false, transparent: true });
    const mesh = new THREE.Mesh(o.geo, mat); mesh.scale.setScalar(o.scale); mesh.layers.set(GLASS_LAYER);
    // transparent meshes are sorted back-to-front by centre distance, which puts the wide
    // spinner in front of the text it straddles; pin its draw order behind instead
    if (o.renderOrder !== undefined) mesh.renderOrder = o.renderOrder;
    o.geo.computeBoundingBox(); const bb = o.geo.boundingBox; u.uTintLocalYRange.value.set(bb.min.y, bb.max.y);
    const geoWidth = Math.max(bb.max.x - bb.min.x, 1e-4); // for fit-to-view scaling
    // group(position) > group(axisTilt) > group(animated rot) > group(-axisTilt) > mesh
    const tilt = (o.axisTilt || [0, 0, 0]).map(deg);
    const group = new THREE.Group(); group.position.set(...o.position); group.visible = false;
    const gTilt = new THREE.Group(); gTilt.rotation.set(...tilt);
    const gRot = new THREE.Group(); gRot.rotation.set(...o.beforeRot.map(deg));
    const gUntilt = new THREE.Group(); gUntilt.rotation.set(-tilt[0], -tilt[1], -tilt[2]);
    gUntilt.add(mesh); gRot.add(gUntilt); gTilt.add(gRot); group.add(gTilt); this.scene.add(group);
    const g = { ...o, geoWidth, mat, mesh, group, gRot, before: o.beforeRot.map(deg), rot: o.rot.map(deg), after: o.afterRot ? o.afterRot.map(deg) : null, wasVisible: null, frames: 0 };
    this._applyGlassTheme(g);
    return g;
  }
  _applyGlassTheme(g) {
    const t = this.theme, T = GLASS[t], u = g.mat.uniforms;
    u.uRefractPower.value = GLASS.refractPower; u.uChromaticAberration.value = GLASS.chromaticAberration;
    u.uDiffuseness.value = T.diffuseness; u.uShininess.value = T.shininess; u.uFresnelPower.value = T.fresnelPower; u.uSaturation.value = T.saturation;
    u.uBrightness.value = T.brightness; u.uContrast.value = T.contrast; u.uGamma.value = T.gamma; u.uSpecularStrength.value = GLASS.specularStrength; u.uFresnelStrength.value = T.fresnelStrength;
    u.uFresnelSideDir.value.set(...GLASS.fresnelSideDir); u.uTintMix.value = T.tintMix;
    u.uLoop.value = GLASS.loop; u.uRgbRefraction.value = GLASS.loop <= 3 ? 1 : 0;
    const tint = g.tint ? g.tint[t] : [T.tintA, T.tintB];
    const a = new THREE.Color(tint[0]), b = new THREE.Color(tint[1]);
    u.uTintColorA.value.set(a.r, a.g, a.b, 1); u.uTintColorB.value.set(b.r, b.g, b.b, 1);
    u.uTintThicknessMinAlpha.value = T.thickMin; u.uTintThicknessMaxAlpha.value = T.thickMax;
    u.uDark.value = t === 'dark' ? 1 : 0;
    if (g.cyber) {
      // faceted crystal cube: genuinely see-through, gentle dispersion, visible bevel edges for wall thickness
      u.uChromaticAberration.value = 0.32; u.uFresnelStrength.value = 1.6; u.uRefractPower.value = 0.22;
      u.uIorR.value = 1.08; u.uIorG.value = 1.16; u.uIorB.value = 1.26;
      u.uDiffuseness.value = 0.25; u.uShininess.value = 90; u.uSpecularStrength.value = 1.6;
      u.uTintMix.value = 0.12; u.uTintThicknessMinAlpha.value = 0.03; u.uTintThicknessMaxAlpha.value = 0.16;
      u.uBrightness.value *= 1.35; u.uSaturation.value = 0.7;
      if (u.uOpacity) u.uOpacity.value = 0.88;
      if (u.uEdgeStrength) u.uEdgeStrength.value = g.wheel ? 0.25 : 1.3;
      if (u.uBloomStrength) u.uBloomStrength.value = 1.7;
      if (g.highRefract) {
        // loading-wheel glass: push dispersion/bend hard so the rim visibly bends and fringes light
        u.uChromaticAberration.value = WHEEL.chroma; u.uRefractPower.value = WHEEL.refract;
        u.uIorR.value = WHEEL.iorR; u.uIorG.value = WHEEL.iorG; u.uIorB.value = WHEEL.iorB;
        u.uFresnelStrength.value = WHEEL.fresnel; u.uSpecularStrength.value = WHEEL.specular;
        if (u.uOpacity) u.uOpacity.value = WHEEL.opacity;
        if (u.uChaseSpeed) { u.uChaseSpeed.value = SPIN.chaseSpeed; u.uFilmSpeed.value = SPIN.filmSpeed; u.uFilmScale.value = SPIN.filmScale; u.uSheenWhite.value = SPIN.sheenWhite; u.uIriSat.value = SPIN.saturation;
          u.uTrailFloor.value = SPIN.trailFloor; u.uTrailGain.value = SPIN.trailGain; u.uTrailPow.value = SPIN.trailPow; }
      }
    }
    if (g.reflective) {
      // hero text: light frosted glass — broad soft sheen (low shininess, high diffuseness)
      // and a pale, barely-tinted body, rather than a hard polished-mirror highlight
      u.uSpecularStrength.value = TEXT.specular; u.uFresnelStrength.value = TEXT.fresnel;
      u.uShininess.value = TEXT.shininess; u.uDiffuseness.value = TEXT.diffuseness; u.uFresnelPower.value = TEXT.fresnelPower;
      u.uBrightness.value = TEXT.brightness; u.uSaturation.value = TEXT.saturation; u.uContrast.value = TEXT.contrast;
      u.uTintMix.value = TEXT.tintMix; u.uTintThicknessMinAlpha.value = TEXT.thickMin; u.uTintThicknessMaxAlpha.value = TEXT.thickMax;
      const fa = new THREE.Color(TEXT.tintA), fb = new THREE.Color(TEXT.tintB);
      u.uTintColorA.value.set(fa.r, fa.g, fa.b, 1); u.uTintColorB.value.set(fb.r, fb.g, fb.b, 1);
      u.uFrost.value = TEXT.frost; u.uFrostHaze.value = TEXT.frostHaze;
      u.uEnvStrength.value = TEXT.envStrength; u.uEnvSharp.value = TEXT.envSharp;
      u.uGlintStrength.value = TEXT.glintStrength; u.uGlintPower.value = TEXT.glintPower;
      u.uEdgeGlow.value = TEXT.edgeGlow; u.uSweepStrength.value = TEXT.sweepStrength;
    }
    // remember these as the "resting" values — the per-frame hover-boost multiplies off of them,
    // instead of the shared GLASS constants, so per-mesh overrides (cyber/highRefract) survive every frame
    g.baseRefract = u.uRefractPower.value; g.baseChroma = u.uChromaticAberration.value;
    g.baseFresnel = u.uFresnelStrength.value; g.baseSpecular = u.uSpecularStrength.value;
    g.baseBrightness = u.uBrightness.value; g.baseSaturation = u.uSaturation.value;
  }
  _updateGlass(dt) {
    const light = this._pointerLight.update({ uv: this.pointer.uv, inside: this.pointer.inside, camera: this.camera, delta: dt });
    for (const g of this.glassMeshes) {
      const inView = this.sectionInView(g.section);
      if (g.wasVisible !== inView) { g.wasVisible = inView; g.group.visible = inView; }
      if (!g.readyFired && ++g.frames >= 5) { g.readyFired = true; this._ready(g.key); }
      g.mat.uniforms.uTime.value = this.time;
      if (!inView) continue;
      // position: pinned to the section centre, moving at syncFactor × scroll speed
      const s = this.sectionRect(g.section);
      const floatY = g.float && !this.reduceMotion ? 0.18 * Math.sin(1.2 * this.time) + 0.06 * Math.sin(0.6 * this.time) : 0;
      g.group.position.y = this.worldYFromDocY(s.top + s.height / 2, g.position[2], g.syncFactor) + g.position[1] + floatY;
      // narrow viewports: shrink + pull x in so the models stay in frame (production tunes per breakpoint)
      // fit-to-view: cap the mesh's world width at 92% of the frustum width at
      // its depth (keeps the WIP text inside the viewport on every device),
      // easing its x-anchor toward centre as the cap bites on narrow screens
      const viewW = this.viewportAt(g.position[2]).width;
      const fit = Math.min(1, (0.84 * viewW) / (g.geoWidth * g.scale)); // 0.84: leaves room for the extrusion's perspective spread
      g.mesh.scale.setScalar(g.scale * fit);
      // anchor at the designed x, but clamp so the mesh's edges stay ≥4% inside the view
      const halfW = (g.geoWidth * g.scale * fit) / 2, edge = 0.44 * viewW;
      g.group.position.x = clamp(g.position[0] * fit, halfW - edge, edge - halfW);
      // rotation: before → rot as the section enters, then → after over the next viewport
      const { entry, after } = this.sectionProgress(g.section);
      let x = lerp(g.before[0], g.rot[0], entry), y = lerp(g.before[1], g.rot[1], entry), z = lerp(g.before[2], g.rot[2], entry);
      if (g.after) { x = lerp(x, g.after[0], after); y = lerp(y, g.after[1], after); z = lerp(z, g.after[2], after); }
      g.gRot.rotation.x = damp(g.gRot.rotation.x, x, 6, dt);
      g.gRot.rotation.y = damp(g.gRot.rotation.y, y, 6, dt);
      g.gRot.rotation.z = damp(g.gRot.rotation.z, z, 6, dt);
      g.mat.uniforms.uLight.value.set(light.x, light.y, GLASS.lightZ);
      // hover boost — stronger refraction, wider dispersion, more samples, hotter rim
      // (multiplies off each mesh's own resting values, so cyber/highRefract overrides survive)
      const b = this.hoverBoost, u = g.mat.uniforms;
      u.uRefractPower.value = g.baseRefract * lerp(1, BOOST.refract, b);
      u.uChromaticAberration.value = g.baseChroma * lerp(1, BOOST.chroma, b);
      u.uLoop.value = Math.round(lerp(GLASS.loop, BOOST.loop, b)); u.uRgbRefraction.value = u.uLoop.value <= 3 ? 1 : 0;
      u.uFresnelStrength.value = g.baseFresnel * lerp(1, BOOST.fresnel, b);
      u.uBrightness.value = g.baseBrightness * lerp(1, BOOST.brightness, b); u.uSaturation.value = g.baseSaturation * lerp(1, BOOST.saturation, b);
      u.uSpecularStrength.value = g.baseSpecular * lerp(1, BOOST.specular, b);
      // the 12-bar wheel animates via its shader's chasing fade, so it only needs a slow drift
      if (g.wheel) g.mesh.rotation.z -= dt * (this.reduceMotion ? 0 : SPIN.drift);
      // wobble the animated rotation group while boosted
      if (b > 0.001) { g.gRot.rotation.x += Math.sin(this.time * 2.1) * BOOST.wobble * b * dt * 4; g.gRot.rotation.z += Math.cos(this.time * 1.7) * BOOST.wobble * b * dt * 4; }
    }
  }

  // ---------- theme ----------
  _applyTheme() {
    const C = SKY[this.theme];
    this.skyTarget.bg.copy(v3(C.bg)); this.skyTarget.vignette.copy(v3(C.vignette)); this.skyTarget.output.copy(v3(C.output));
    this.skyPasses[0].material.uniforms.uEdgeIntensity.value = C.edgeIntensity;
    this.skyOutput.uniforms.uOutputMix.value = C.outputMix;
    this.flareMat.uniforms.uTailColor.value.set(FLARE.tail[this.theme]);
    this.overlayMat.uniforms.uColor.value.set(OVERLAY.colors[this.theme]);
    this.skyOutput.uniforms.uIriStrength.value = SKY_IRI.strength;
    this.skyOutput.uniforms.uIriScale.value = SKY_IRI.scale;
    for (const g of this.glassMeshes) this._applyGlassTheme(g);
  }

  // ---------- live tweak surface (see js/tweak.js) ----------
  // The panel mutates these objects in place, then calls applyTweaks() to push the
  // new values through the same code path a theme switch uses.
  tweakTargets() { return { SKY: SKY[this.theme], SKY_IRI, TEXT, GLASS: GLASS[this.theme], GLASS_SHARED: GLASS, BOOST, WHEEL, SPIN, LAYOUT }; }
  applyTweaks() {
    // positions are copied into each mesh at build time, so push LAYOUT back through them
    for (const g of this.glassMeshes) {
      if (g.key === 'hello') { g.position[0] = LAYOUT.textX; g.position[1] = LAYOUT.textY; }
      if (g.key === 'h_star') { g.position[0] = LAYOUT.spinX; g.position[1] = LAYOUT.spinY; }
    }
    this._applyTheme();
  }

  // ---------- resize ----------
  resize() {
    const w = innerWidth, h = innerHeight, dpr = this.renderer.getPixelRatio();
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.screenPx.set(w * dpr, h * dpr);
    this.glassRT.setSize(Math.floor(w * dpr * 0.5), Math.floor(h * dpr * 0.5));
    this.sceneRT.setSize(w * dpr, h * dpr);
    this.flareRT.setSize(Math.floor(w * dpr * FLARE.downsample), Math.floor(h * dpr * FLARE.downsample));
    this.flareMat.uniforms.uResolution.value.set(Math.floor(w * dpr * FLARE.downsample), Math.floor(h * dpr * FLARE.downsample));
    this.flareMat.uniforms.uStreakScale.value = FLARE.streakScale * (Math.max(1, w) / 1920) * (w < 1024 ? 2 : 1);
    this.fluid.setSize(w * dpr, h * dpr, w, h, dpr);
    this.overlayMat.uniforms.uResolution.value.set(w, h);
    const sw = Math.max(1, Math.floor(w * this.skyCfg.resolutionScale)), sh = Math.max(1, Math.floor(h * this.skyCfg.resolutionScale));
    this.skyRes.set(sw, sh); this.skyRT.read.setSize(sw, sh); this.skyRT.write.setSize(sw, sh);
  }

  // ---------- frame ----------
  _tick(tms) {
    const t = tms / 1000, dt = Math.min(0.1, t - (this._last ?? t)); this._last = t; this.time = t; this.frame++;
    if (document.hidden) return;
    // subtle camera parallax with the pointer
    const px = this.pointer.inside ? (this.pointer.uv.x - 0.5) : 0, py = this.pointer.inside ? (this.pointer.uv.y - 0.5) : 0;
    this.camera.position.x = damp(this.camera.position.x, this.camBase.x + px * 0.6, 3, dt);
    this.camera.position.y = damp(this.camera.position.y, this.camBase.y + py * 0.4, 3, dt);
    this.camera.lookAt(0, this.camera.position.y * 0.5, 0);

    this.hoverBoost = damp(this.hoverBoost, this.hoverTarget, 4, dt);
    this._updateOverlay();
    if (!this.overlayOpaque) this._updateSky(); // sky is fully hidden behind the dots → skip its 4 passes
    this._updateImages(dt);
    this._updateGlass(dt);
    this._renderGlassFBO();
    const gl = this.renderer;
    gl.setRenderTarget(this.sceneRT); gl.clear(); gl.render(this.scene, this.camera);
    this._renderPost(dt);
  }
}

// ---------- utils ----------
// merge every mesh in a glTF into one centred BufferGeometry (like the original)
function mergeScene(gltf) {
  gltf.scene.updateMatrixWorld(true);
  const geos = [];
  gltf.scene.traverse((o) => { if (o.isMesh && o.geometry) { const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); geos.push(g); } });
  let geo; try { geo = mergeGeometries(geos, false); } catch { geo = geos[0]; }
  if (!geo.attributes.normal) geo.computeVertexNormals();
  geo.computeBoundingBox(); const b = geo.boundingBox, c = new THREE.Vector3(); b.getCenter(c);
  geo.translate(-c.x, -c.y, -c.z); geo.computeBoundingSphere(); geo.computeBoundingBox();
  return geo;
}

// A classic 12-bar spinner: rounded capsule bars laid out radially around the origin,
// merged into one geometry. `aBar` carries each bar's index (0..1) so the shader can
// fade them in sequence, and `aBarV` runs 0..1 along a bar's own length.
function buildSpinnerGeometry(innerRadius, barLength, count, barWidth) {
  const geos = [];
  for (let i = 0; i < count; i++) {
    const bar = new THREE.CapsuleGeometry(barWidth, barLength, 6, 16);
    bar.translate(0, innerRadius + barLength / 2 + barWidth, 0);
    bar.rotateZ(-(i / count) * Math.PI * 2);
    const n = bar.attributes.position.count;
    const idx = new Float32Array(n).fill(i / count);
    bar.setAttribute('aBar', new THREE.BufferAttribute(idx, 1));
    geos.push(bar);
  }
  const geo = mergeGeometries(geos, false);
  geo.computeBoundingBox(); geo.computeBoundingSphere();
  return geo;
}

// The light that produces the specular highlight orbits at a fixed radius
// (hypot(4,9)) around the origin, always pointing *away* from the pointer's
// hit-point on the z=0 plane, damped so it swings smoothly. Rest angle atan2(9,4).
function pointerLight() {
  const bx = 4, by = 9, radius = Math.hypot(bx, by), rest = Math.atan2(by, bx);
  let angle = rest, current = rest;
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hit = new THREE.Vector3(), out = new THREE.Vector2(bx, by);
  return {
    update({ uv, inside, camera, delta }) {
      ndc.set(2 * uv.x - 1, 2 * uv.y - 1); ray.setFromCamera(ndc, camera);
      const ok = ray.ray.intersectPlane(plane, hit) !== null;
      if (inside && ok) { const x = -hit.x, y = -hit.y; if (x * x + y * y > 1e-6) angle = Math.atan2(y, x); }
      const target = inside && ok ? angle : rest;
      const d = Math.atan2(Math.sin(target - current), Math.cos(target - current));
      current += d * (1 - Math.exp(-6 * delta));
      out.set(radius * Math.cos(current), radius * Math.sin(current));
      return out;
    },
  };
}
