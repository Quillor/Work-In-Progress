import { useEffect, useRef } from 'react';
// Plain-JS WebGL scene (sky shader background, frosted 3D "WORK IN PROGRESS"
// text, crystal spinner, dot-dissolve transition into the body).
// @ts-expect-error — untyped JS module
import { Scene } from './scene.js';

/*
  Portable shader hero.

  How it works: a fixed, full-screen canvas sits at z-index -1 and paints the
  sky + 3D glass objects anchored to this component's <section> rect. As you
  scroll past the hero, a pixel-dot overlay dissolves the sky into a solid
  colour — we feed it the page's own background colour, so the canvas becomes
  indistinguishable from the page and the rest of the site renders as normal.

  While mounted, the body's background is made transparent so the canvas shows
  through; it's restored on unmount.
*/
export default function Hero() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    // canvas behind the page
    const canvas = document.createElement('canvas');
    Object.assign(canvas.style, {
      position: 'fixed', inset: '0', width: '100%', height: '100dvh',
      zIndex: '-1', display: 'block', pointerEvents: 'none',
    } as CSSStyleDeclaration);
    document.body.prepend(canvas);

    // let the canvas show through, remembering what we changed
    const roots = [document.documentElement, document.body, document.getElementById('root')].filter(
      (el): el is HTMLElement => !!el,
    );
    const siteBg = roots.map((el) => getComputedStyle(el).backgroundColor).find((c) => c && c !== 'rgba(0, 0, 0, 0)') || '#fff4dc';
    const saved = roots.map((el) => el.style.background);
    roots.forEach((el) => { el.style.background = 'transparent'; });

    let scene: any = null;
    try {
      scene = new Scene({
        canvas,
        scroller: { scrollTop: () => window.scrollY },
        getTheme: () => 'light',
        layers: [],                    // no scroll-synced images here
        sections: { banner: section }, // the hero anchors everything to this rect
        onReady: () => {},
      });
      // the dissolve lands on the site's own background colour
      scene.overlayMat.uniforms.uColor.value.set(siteBg);
      (window as any).__heroScene = scene;
    } catch (err) {
      console.error('hero scene failed', err);
    }

    // hover → shader boost (stronger refraction/dispersion/sky warp)
    const enter = () => { if (scene) scene.hoverTarget = 1; };
    const leave = () => { if (scene) scene.hoverTarget = 0; };
    section.addEventListener('pointerenter', enter);
    section.addEventListener('pointerleave', leave);

    return () => {
      section.removeEventListener('pointerenter', enter);
      section.removeEventListener('pointerleave', leave);
      scene?.renderer?.setAnimationLoop(null);
      scene?.renderer?.dispose();
      canvas.remove();
      roots.forEach((el, i) => { el.style.background = saved[i]; });
    };
  }, []);

  // Empty by design: the 3D text/spinner are drawn on the canvas behind this rect.
  return <section ref={sectionRef} aria-hidden="true" style={{ height: '100vh' }} />;
}
