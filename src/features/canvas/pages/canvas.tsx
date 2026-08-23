import * as React from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ChevronsLeft,
  ChevronsRight,
  ClipboardCopy,
  Eye,
  EyeOff,
  ExternalLink,
  Maximize2,
  MessageSquare,
  Minimize2,
  Minus,
  Moon,
  Palette,
  Plus,
  RotateCw,
  Scan,
  SlidersHorizontal,
  Smartphone,
  Sun,
  Trash2,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

/* ── design-system adapter (Flavor DS) ─────────────────────────────────────
   All project-specific data — routes, tokens, palette, color math, theming
   bridge — lives in ../design-system.ts per the canvas-maker adapter contract. */
import {
  GROUPS,
  ALL_PATHS,
  TYPOGRAPHY_TOKENS,
  TYPOGRAPHY_CSS_PROPS,
  COLOR_TOKENS,
  TEXT_COLOR_KEYS,
  BACKGROUND_COLOR_KEYS,
  PALETTE_GROUPS,
  SPACING_TOKENS,
  SPACING_CSS_PROPS,
  LAYOUT_CSS_PROPS,
  FLEX_DIRECTION_OPTIONS,
  FLEX_WRAP_OPTIONS,
  JUSTIFY_OPTIONS,
  ALIGN_OPTIONS,
  NONE,
  TOKEN_STORAGE_KEY,
  VAR_ALIAS_RE,
  parseHslTriplet,
  formatHslTriplet,
  hslToHsv,
  hsvToHsl,
  hslToHex,
  hexToHsl,
  resolveTripletForVar,
  formatStoredColor,
  getDocumentMode,
  setDocumentMode,
  type Hsv,
} from '../design-system';
import type { CanvasPage, CanvasGroup } from '../design-system';

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));


/* ── canvas geometry ───────────────────────────────────────────────────────
   Sections are stacked vertically down a left "spine" (the vertical stroke);
   each section's pages run horizontally off the spine (the cross-strokes) —
   an F/comb layout. Pan & zoom work like Figma: wheel = pan, ctrl/cmd+wheel
   (or trackpad pinch) = zoom to cursor, drag = pan, space+drag = pan.

   Each page occupies one column. A column stacks a desktop card and,
   optionally, a mobile card underneath it — row height is driven by the
   tallest column, mobile card included when it's shown.               */

const FRAME_W = 1440; // native desktop iframe render width
const MOBILE_FRAME_W = 390; // native mobile iframe render width
const DEFAULT_NATIVE_H = 900; // fallback desktop content height before measured
const DEFAULT_MOBILE_NATIVE_H = 800; // fallback mobile content height before measured
const THUMB_W = 420; // desktop card width in world units
// Both devices share ONE scale factor (world units per native px) so a phone
// renders genuinely narrower than a desktop frame, in true relative
// proportion — not stretched out to match the desktop card's width.
const THUMB_SCALE = THUMB_W / FRAME_W;
const MOBILE_CARD_W = MOBILE_FRAME_W * THUMB_SCALE; // narrower than THUMB_W, on purpose
const GAP_X = 56;
const GAP_Y = 96;
const MOBILE_CARD_GAP = 28; // gap between a desktop card's bottom and its mobile card's title
const GROUP_LABEL_H = 40; // room for the (now larger) section title
const GROUP_LABEL_GAP = 20;
const CARD_TITLE_H = 46; // fixed, explicit — no longer "assumed"
const SPINE_X = -28;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 5; // 500%
const LEFT_SIDEBAR_W = 256; // px, matches w-64 — used to keep content anchored on collapse
const EDGE_STRIP_W = 16; // px, matches w-4 — the reopen tab left behind when a sidebar closes
const ZOOM_SENSITIVITY = 0.0045; // ctrl/cmd + wheel (and trackpad pinch, reported the same way)

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

type DeviceKey = 'desktop' | 'mobile';
interface ViewportConfig {
  frameW: number;
  scale: number;
  label: string;
}
const VIEWPORTS: Record<DeviceKey, ViewportConfig> = {
  desktop: { frameW: FRAME_W, scale: THUMB_SCALE, label: `Desktop · ${FRAME_W}px` },
  mobile: { frameW: MOBILE_FRAME_W, scale: THUMB_SCALE, label: `Mobile · ${MOBILE_FRAME_W}px` },
};

interface View {
  x: number;
  y: number;
  zoom: number;
}

/** Rolling gesture-speed multiplier: rapid consecutive wheel events (a fast
 * flick or a quickly-spun mouse wheel) ramp this up so pan/zoom travel further
 * per event; a pause resets it. Makes speed — not just per-event delta — drive
 * how far a gesture moves the canvas. */
function bumpVelocity(ref: React.MutableRefObject<{ mult: number; last: number }>, now: number): number {
  const dt = now - ref.current.last;
  ref.current.last = now;
  if (dt < 0) return ref.current.mult;
  if (dt < 40) {
    ref.current.mult = Math.min(ref.current.mult + 0.18, 3.2);
  } else if (dt > 150) {
    ref.current.mult = 1;
  } else {
    ref.current.mult = Math.max(1, ref.current.mult - 0.3);
  }
  return ref.current.mult;
}


/* ── selector + classification + feedback helpers ────────────────────────── */

function computeSelector(el: Element | null): string {
  if (!el || el.nodeType !== 1) return '';
  const parts: string[] = [];
  let cur: Element | null = el;
  let depth = 0;
  while (cur && cur.nodeType === 1 && cur.tagName !== 'BODY' && cur.tagName !== 'HTML' && depth < 6) {
    let sel = cur.tagName.toLowerCase();
    const testid = cur.getAttribute('data-testid');
    if (testid) {
      parts.unshift(`${sel}[data-testid="${testid}"]`);
      break;
    }
    if (cur.id) {
      parts.unshift(`#${cur.id}`);
      break;
    }
    const parent: Element | null = cur.parentElement;
    if (parent) {
      const sibs = Array.from(parent.children).filter((c) => c.tagName === cur!.tagName);
      if (sibs.length > 1) sel += `:nth-of-type(${sibs.indexOf(cur) + 1})`;
    }
    parts.unshift(sel);
    cur = cur.parentElement;
    depth += 1;
  }
  return parts.join(' > ');
}

// Hover/click resolve to either the exact hovered element ("element"
// granularity) or the whole page body ("page" granularity) — replaces the
// old click-vs-drag heuristic for point vs. area pins.
function resolveSelectTarget(target: Element | null, granularity: 'element' | 'page', doc: Document): Element | null {
  if (granularity === 'page') return doc.body ?? null;
  if (!target || target.nodeType !== 1) return null;
  if (target === doc.documentElement) return doc.body ?? null;
  return target;
}

const TEXT_TAGS = new Set([
  'P', 'SPAN', 'A', 'BUTTON', 'LABEL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TD', 'TH', 'STRONG', 'EM', 'SMALL', 'B', 'I',
]);
function hasDirectText(el: Element): boolean {
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === 3 && (node.textContent || '').trim().length > 0) return true;
  }
  return false;
}
// Drives the scoped color picker: text-bearing elements only get text tokens,
// containers only get background/surface tokens.
function classifyElement(el: Element | null): 'text' | 'container' {
  if (!el) return 'container';
  if (TEXT_TAGS.has(el.tagName)) return 'text';
  return hasDirectText(el) ? 'text' : 'container';
}

interface SpacingSides {
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
}
interface SpacingTweak {
  padding?: SpacingSides;
  margin?: SpacingSides;
  gap?: string;
}
interface LayoutTweak {
  direction?: string;
  wrap?: string;
  justify?: string;
  align?: string;
}
interface AnnotationTweak {
  typography?: string;
  color?: { prop: 'color' | 'background-color'; token: string };
  spacing?: SpacingTweak;
  layout?: LayoutTweak;
}

interface Annotation {
  id: number;
  path: string;
  device: DeviceKey;
  x: number;
  y: number;
  w: number;
  h: number;
  selector: string;
  text: string;
  note: string;
  targetKind: 'text' | 'container';
  tweak?: AnnotationTweak;
}
type DraftAnnotation = Omit<Annotation, 'id' | 'note'>;

const FEEDBACK_PREFIX =
  "You're applying UI feedback collected on the Work in Progress /canvas board. For each numbered " +
  'item: open the file behind the given route, find the element or area described (by ' +
  'selector, visible text, and/or its pinned position), and make the requested change for the ' +
  'given device size. If a "tweak" spec is included, apply those exact token values — do not ' +
  'substitute different ones. A note that mentions "@N" is pointing at feedback item N in this ' +
  'same list — read that item too before acting. Every change must use design-system tokens ' +
  'only (see /design-system) — never hardcode a color, font size, or spacing value. After ' +
  'applying, run `npm run lint:tokens` and re-check the affected page.\n\n';

function tweakSpecLines(tweak: AnnotationTweak | undefined): string[] {
  if (!tweak) return [];
  const lines: string[] = [];
  if (tweak.typography && TYPOGRAPHY_TOKENS[tweak.typography]) {
    lines.push(`tweak: typography → ${TYPOGRAPHY_TOKENS[tweak.typography].spec}`);
  }
  if (tweak.color?.token && COLOR_TOKENS[tweak.color.token]) {
    const token = COLOR_TOKENS[tweak.color.token];
    const propLabel = tweak.color.prop === 'color' ? 'text color' : 'background';
    lines.push(`tweak: ${propLabel} → ${token.label} (var(${token.cssVar}))`);
  }
  const spacingLines = (label: string, sides: SpacingSides | undefined) => {
    if (!sides) return;
    (['top', 'right', 'bottom', 'left'] as const).forEach((side) => {
      const key = sides[side];
      if (key && SPACING_TOKENS[key]) {
        lines.push(`tweak: ${label}-${side} → ${SPACING_TOKENS[key].css} (${SPACING_TOKENS[key].label})`);
      }
    });
  };
  spacingLines('padding', tweak.spacing?.padding);
  spacingLines('margin', tweak.spacing?.margin);
  if (tweak.spacing?.gap && SPACING_TOKENS[tweak.spacing.gap]) {
    lines.push(`tweak: gap → ${SPACING_TOKENS[tweak.spacing.gap].css} (${SPACING_TOKENS[tweak.spacing.gap].label})`);
  }
  if (tweak.layout?.direction) lines.push(`tweak: flex-direction → ${tweak.layout.direction}`);
  if (tweak.layout?.wrap) lines.push(`tweak: flex-wrap → ${tweak.layout.wrap}`);
  if (tweak.layout?.justify) lines.push(`tweak: justify-content → ${tweak.layout.justify}`);
  if (tweak.layout?.align) lines.push(`tweak: align-items → ${tweak.layout.align}`);
  return lines;
}

function buildFeedback(annotations: Annotation[]): string {
  if (annotations.length === 0) return 'No annotations yet.';
  let out = FEEDBACK_PREFIX + `# Canvas feedback — ${annotations.length} item${annotations.length === 1 ? '' : 's'}\n\n`;
  annotations.forEach((a, i) => {
    out += `[${i + 1}] ${a.path}\n`;
    out += `    device: ${VIEWPORTS[a.device].label}\n`;
    out += `    element: ${a.selector || '(full page)'} — ${Math.round(a.w)}×${Math.round(a.h)}px at (${Math.round(a.x)}, ${Math.round(a.y)})\n`;
    if (a.text) out += `    text: "${a.text}"\n`;
    tweakSpecLines(a.tweak).forEach((line) => (out += `    ${line}\n`));
    out += `    feedback: ${a.note.trim() || '(no note yet)'}\n\n`;
  });
  return out;
}

/* ── layout: F-shaped — sections vertical, pages horizontal ─────────────── */

interface PositionedPage {
  page: CanvasPage;
  x: number;
  y: number;
  nativeH: number;
  heightWorld: number;
  showMobile: boolean;
  mobileY?: number;
  mobileNativeH?: number;
  mobileHeightWorld?: number;
}
interface PositionedGroup {
  group: CanvasGroup;
  labelY: number;
  rowY: number;
  rowHeight: number;
  pages: PositionedPage[];
}

function layoutGroups(
  groups: CanvasGroup[],
  isVisible: (path: string) => boolean,
  heights: Record<string, number>,
  mobileHeights: Record<string, number>,
  isMobileVisible: (path: string) => boolean,
): { rows: PositionedGroup[]; maxX: number; maxY: number } {
  let cursorY = 0;
  let maxX = 0;
  const rows: PositionedGroup[] = [];
  for (const group of groups) {
    const pages = group.pages.filter((p) => isVisible(p.path));
    if (pages.length === 0) continue;
    const labelY = cursorY;
    const rowY = labelY + GROUP_LABEL_H + GROUP_LABEL_GAP + CARD_TITLE_H;
    const positioned: PositionedPage[] = pages.map((page, i) => {
      const nativeH = heights[page.path] ?? DEFAULT_NATIVE_H;
      const heightWorld = nativeH * VIEWPORTS.desktop.scale;
      const x = i * (THUMB_W + GAP_X);
      const showMobile = isMobileVisible(page.path);
      let mobileY: number | undefined;
      let mobileNativeH: number | undefined;
      let mobileHeightWorld: number | undefined;
      if (showMobile) {
        mobileNativeH = mobileHeights[page.path] ?? DEFAULT_MOBILE_NATIVE_H;
        mobileHeightWorld = mobileNativeH * VIEWPORTS.mobile.scale;
        mobileY = rowY + heightWorld + MOBILE_CARD_GAP + CARD_TITLE_H;
      }
      maxX = Math.max(maxX, x + THUMB_W);
      return { page, x, y: rowY, nativeH, heightWorld, showMobile, mobileY, mobileNativeH, mobileHeightWorld };
    });
    const rowHeight = Math.max(
      ...positioned.map((p) => (p.showMobile ? p.mobileY! - p.y + p.mobileHeightWorld! : p.heightWorld)),
      0,
    );
    rows.push({ group, labelY, rowY, rowHeight, pages: positioned });
    cursorY = rowY + rowHeight + GAP_Y;
  }
  return { rows, maxX, maxY: Math.max(cursorY - GAP_Y, 0) };
}

/* ── device frame (one iframe + its own annotations + live tweak apply) ──── */

type FrameStatus = 'loading' | 'ok' | 'error';

function DeviceFrame({
  page,
  frameW,
  scale,
  nativeH,
  heightWorld,
  interactive,
  annotations,
  onLoad,
  onMeasure,
  forceRetryTick,
  forceReloadTick,
  onStatusChange,
}: {
  page: CanvasPage;
  frameW: number;
  scale: number;
  nativeH: number;
  heightWorld: number;
  interactive: boolean;
  annotations: Annotation[];
  onLoad: (iframe: HTMLIFrameElement) => void;
  onMeasure: (h: number) => void;
  forceRetryTick: number;
  forceReloadTick: number;
  onStatusChange: (status: FrameStatus) => void;
}) {
  const ref = React.useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = React.useState<FrameStatus>('loading');
  const [retryNonce, setRetryNonce] = React.useState(0);
  const statusRef = React.useRef(status);

  React.useEffect(() => {
    statusRef.current = status;
    onStatusChange(status);
  }, [status, onStatusChange]);

  const retry = React.useCallback(() => {
    setStatus('loading');
    setRetryNonce((n) => n + 1);
  }, []);

  // A header-level "retry all down" bump lands here too — only frames that
  // are currently actually down act on it, so healthy pages don't reload.
  const skipFirstTick = React.useRef(true);
  React.useEffect(() => {
    if (skipFirstTick.current) {
      skipFirstTick.current = false;
      return;
    }
    if (statusRef.current === 'error') retry();
  }, [forceRetryTick, retry]);

  // The unconditional "Reload" button in the header lands here — every frame
  // remounts, even ones that report "ok" but are actually showing stale or
  // blank content (a status a plain error check can't catch).
  const skipFirstReloadTick = React.useRef(true);
  React.useEffect(() => {
    if (skipFirstReloadTick.current) {
      skipFirstReloadTick.current = false;
      return;
    }
    retry();
  }, [forceReloadTick, retry]);

  const handleLoad = () => {
    const iframe = ref.current;
    if (!iframe) return;
    onLoad(iframe);
    const measure = () => {
      try {
        const doc = iframe.contentDocument;
        if (doc?.body) {
          onMeasure(doc.body.scrollHeight);
          setStatus('ok');
        } else {
          setStatus('error');
        }
      } catch {
        setStatus('error');
      }
    };
    measure();
    window.setTimeout(measure, 800);
  };
  const handleError = () => setStatus('error');

  // Live-apply each annotation's token "tweak" as inline styles on its target
  // element, inside this page's own document — so the change previews
  // immediately. Re-runs whenever any tweak on this page changes.
  const tweakKey = JSON.stringify(annotations.map((a) => [a.selector, a.tweak]));
  React.useEffect(() => {
    const doc = ref.current?.contentDocument;
    if (!doc) return;
    for (const a of annotations) {
      if (!a.selector) continue;
      let el: HTMLElement | null = null;
      try {
        el = doc.querySelector(a.selector);
      } catch {
        continue;
      }
      if (!el) continue;
      const style = el.style;
      [...TYPOGRAPHY_CSS_PROPS, ...SPACING_CSS_PROPS, ...LAYOUT_CSS_PROPS].forEach((p) => style.removeProperty(p));
      const t = a.tweak;
      if (!t) continue;
      if (t.typography && TYPOGRAPHY_TOKENS[t.typography]) {
        Object.entries(TYPOGRAPHY_TOKENS[t.typography].css).forEach(([prop, val]) => style.setProperty(prop, val));
      }
      if (t.color?.token && COLOR_TOKENS[t.color.token]) {
        style.setProperty(t.color.prop, `var(${COLOR_TOKENS[t.color.token].cssVar})`);
      }
      const applySides = (prop: 'padding' | 'margin', sides: SpacingSides | undefined) => {
        if (!sides) return;
        (['top', 'right', 'bottom', 'left'] as const).forEach((side) => {
          const key = sides[side];
          if (key && SPACING_TOKENS[key]) style.setProperty(`${prop}-${side}`, SPACING_TOKENS[key].css);
        });
      };
      applySides('padding', t.spacing?.padding);
      applySides('margin', t.spacing?.margin);
      if (t.spacing?.gap && SPACING_TOKENS[t.spacing.gap]) {
        style.setProperty('gap', SPACING_TOKENS[t.spacing.gap].css);
      }
      if (t.layout && (t.layout.direction || t.layout.wrap || t.layout.justify || t.layout.align)) {
        style.setProperty('display', 'flex');
        if (t.layout.direction) style.setProperty('flex-direction', t.layout.direction);
        if (t.layout.wrap) style.setProperty('flex-wrap', t.layout.wrap);
        if (t.layout.justify) style.setProperty('justify-content', t.layout.justify);
        if (t.layout.align) style.setProperty('align-items', t.layout.align);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tweakKey]);

  return (
    <div
      className="relative overflow-hidden rounded-lg border bg-card shadow-sm"
      style={{ width: frameW * scale, height: heightWorld }}
    >
      <div className="absolute left-0 top-0 origin-top-left" style={{ width: frameW, height: nativeH, transform: `scale(${scale})` }}>
        <iframe
          key={retryNonce}
          ref={ref}
          src={page.path}
          title={page.label}
          onLoad={handleLoad}
          onError={handleError}
          style={{ width: frameW, height: nativeH, border: '0', pointerEvents: interactive ? 'auto' : 'none' }}
        />
        {status === 'error' ? (
          <div
            className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-card/95"
            style={{ width: frameW, height: nativeH }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-muted-foreground">This page didn't load</p>
            <Button size="sm" className="h-7 gap-1.5 px-3" onClick={retry}>
              <RotateCw className="h-3.5 w-3.5" /> Retry
            </Button>
          </div>
        ) : null}
        {annotations.map((a) => (
          <div key={a.id} className="pointer-events-none absolute z-10" style={{ left: a.x, top: a.y, width: a.w, height: a.h }}>
            <div className="absolute inset-0 rounded-sm border-2 border-primary bg-primary/10" />
            <span className="absolute -left-1 -top-1 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground shadow-md ring-2 ring-background">
              {a.id}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── page card: desktop device frame + optional mobile device frame ──────── */

function PageCard({
  page,
  x,
  desktopY,
  desktopNativeH,
  desktopHeightWorld,
  showMobile,
  mobileOverrideActive,
  mobileY,
  mobileNativeH,
  mobileHeightWorld,
  interactive,
  desktopAnnotations,
  mobileAnnotations,
  onLoad,
  onMeasure,
  onToggleMobile,
  forceRetryTick,
  forceReloadTick,
  onStatusChange,
}: {
  page: CanvasPage;
  x: number;
  desktopY: number;
  desktopNativeH: number;
  desktopHeightWorld: number;
  showMobile: boolean;
  mobileOverrideActive: boolean;
  mobileY?: number;
  mobileNativeH?: number;
  mobileHeightWorld?: number;
  interactive: boolean;
  desktopAnnotations: Annotation[];
  mobileAnnotations: Annotation[];
  onLoad: (device: DeviceKey, iframe: HTMLIFrameElement) => void;
  onMeasure: (device: DeviceKey, h: number) => void;
  onToggleMobile: () => void;
  forceRetryTick: number;
  forceReloadTick: number;
  onStatusChange: (device: DeviceKey, status: FrameStatus) => void;
}) {
  return (
    <>
      <div className="absolute" style={{ left: x, top: desktopY - CARD_TITLE_H, width: THUMB_W }}>
        <div
          className="flex items-start justify-between gap-2 overflow-hidden pt-1"
          style={{ height: CARD_TITLE_H }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium leading-tight text-foreground">{page.label}</p>
            <p className="truncate font-mono text-[0.65rem] leading-tight text-muted-foreground">{page.path}</p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={onToggleMobile}
              title={showMobile ? 'Hide mobile view for this page' : 'Show mobile view for this page'}
              className={cn(
                'text-muted-foreground hover:text-foreground',
                mobileOverrideActive && 'text-primary',
              )}
            >
              <Smartphone className="h-3.5 w-3.5" />
            </button>
            <a
              href={page.path}
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground hover:text-foreground"
              title="Open in new tab"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
        <DeviceFrame
          page={page}
          frameW={VIEWPORTS.desktop.frameW}
          scale={VIEWPORTS.desktop.scale}
          nativeH={desktopNativeH}
          heightWorld={desktopHeightWorld}
          interactive={interactive}
          annotations={desktopAnnotations}
          onLoad={(iframe) => onLoad('desktop', iframe)}
          onMeasure={(h) => onMeasure('desktop', h)}
          forceRetryTick={forceRetryTick}
          forceReloadTick={forceReloadTick}
          onStatusChange={(status) => onStatusChange('desktop', status)}
        />
      </div>

      {showMobile && mobileY !== undefined && mobileNativeH !== undefined && mobileHeightWorld !== undefined ? (
        <div className="absolute" style={{ left: x, top: mobileY - CARD_TITLE_H, width: MOBILE_CARD_W }}>
          <div
            className="flex items-center gap-1.5 overflow-hidden pt-1 text-muted-foreground"
            style={{ height: CARD_TITLE_H }}
          >
            <Smartphone className="h-3 w-3" />
            <p className="truncate text-xs">{VIEWPORTS.mobile.label}</p>
          </div>
          <DeviceFrame
            page={page}
            frameW={VIEWPORTS.mobile.frameW}
            scale={VIEWPORTS.mobile.scale}
            nativeH={mobileNativeH}
            heightWorld={mobileHeightWorld}
            interactive={interactive}
            annotations={mobileAnnotations}
            onLoad={(iframe) => onLoad('mobile', iframe)}
            onMeasure={(h) => onMeasure('mobile', h)}
            forceRetryTick={forceRetryTick}
            forceReloadTick={forceReloadTick}
            onStatusChange={(status) => onStatusChange('mobile', status)}
          />
        </div>
      ) : null}
    </>
  );
}

/* ── mention-aware textarea ───────────────────────────────────────────────
   Typing "@" opens a small dropdown of existing feedback items (by number,
   note, or pinned text) so a note can reference another item — selecting
   one inserts "@{id}".                                                    */

function MentionTextarea({
  value,
  onChange,
  placeholder,
  className,
  annotations,
  autoFocus,
  onKeyDown,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  annotations: Annotation[];
  autoFocus?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    onChange(v);
    const caret = e.target.selectionStart ?? v.length;
    const match = v.slice(0, caret).match(/@(\w*)$/);
    if (match) {
      setQuery(match[1]);
      setOpen(true);
    } else {
      setOpen(false);
    }
  };

  const matches = React.useMemo(() => {
    if (!open) return [];
    const q = query.toLowerCase();
    return annotations
      .filter((a) => String(a.id).includes(q) || a.note.toLowerCase().includes(q) || a.text.toLowerCase().includes(q))
      .slice(0, 6);
  }, [open, query, annotations]);

  const select = (id: number) => {
    const el = ref.current;
    const caret = el?.selectionStart ?? value.length;
    const before = value.slice(0, caret).replace(/@(\w*)$/, `@${id} `);
    const after = value.slice(caret);
    const next = before + after;
    onChange(next);
    setOpen(false);
    window.setTimeout(() => {
      el?.focus();
      el?.setSelectionRange(before.length, before.length);
    }, 0);
  };

  return (
    <div className="relative">
      <Textarea
        ref={ref}
        value={value}
        onChange={handleChange}
        onKeyDown={onKeyDown}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        placeholder={placeholder}
        className={className}
        autoFocus={autoFocus}
      />
      {open && matches.length > 0 ? (
        <div className="absolute left-0 top-full z-30 mt-1 max-h-40 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
          {matches.map((a) => (
            <button
              key={a.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                select(a.id);
              }}
              className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-accent"
            >
              <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-primary text-[0.6rem] font-bold text-primary-foreground">
                {a.id}
              </span>
              <span className="truncate text-muted-foreground">{a.note || a.text || '(no note)'}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ── page ──────────────────────────────────────────────────────────────── */

export default function CanvasBoardPage() {
  const [hidden, setHidden] = React.useState<Set<string>>(new Set());
  const [mode, setMode] = React.useState<'preview' | 'comment' | 'tokens'>('preview');
  const [selectGranularity, setSelectGranularity] = React.useState<'element' | 'page'>('element');
  const [annotations, setAnnotations] = React.useState<Annotation[]>([]);
  const [draft, setDraft] = React.useState<DraftAnnotation | null>(null);
  const [draftNote, setDraftNote] = React.useState('');
  const [tweakOpen, setTweakOpen] = React.useState<Set<number>>(new Set());
  const [heights, setHeights] = React.useState<Record<string, number>>({});
  const [mobileHeights, setMobileHeights] = React.useState<Record<string, number>>({});
  const [mobileGlobal, setMobileGlobal] = React.useState(false);
  const [mobileOverrides, setMobileOverrides] = React.useState<Record<string, boolean>>({});
  const [frameStatuses, setFrameStatuses] = React.useState<Record<string, FrameStatus>>({});
  const [retryTick, setRetryTick] = React.useState(0);
  const [reloadTick, setReloadTick] = React.useState(0);
  const [tokenOverrides, setTokenOverrides] = React.useState<Record<string, string>>(() => {
    try {
      const raw = window.localStorage.getItem(TOKEN_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  // Which theme every preview (and the canvas chrome + token editor) renders
  // in. Seeded from whatever the app's ThemeProvider already resolved, then
  // owned by the canvas so you can review both themes without leaving.
  const [canvasTheme, setCanvasTheme] = React.useState<'light' | 'dark'>(() =>
    typeof document !== 'undefined' ? getDocumentMode() : 'light',
  );
  const [view, setView] = React.useState<View>({ x: 80, y: 60, zoom: 0.22 });
  const [isPanning, setIsPanning] = React.useState(false);
  const [spaceHeld, setSpaceHeld] = React.useState(false);
  const [leftOpen, setLeftOpen] = React.useState(true);
  const [rightOpen, setRightOpen] = React.useState(true);

  const viewportRef = React.useRef<HTMLDivElement>(null);
  const commentModeRef = React.useRef(false);
  const selectGranularityRef = React.useRef(selectGranularity);
  const spaceHeldRef = React.useRef(false);
  const idRef = React.useRef(0);
  const didAutoFitRef = React.useRef(false);
  const panRef = React.useRef({ active: false, lastX: 0, lastY: 0 });
  // Last known cursor position over the canvas, in viewport-local px — every
  // zoom action (wheel, buttons, shortcuts) centers on this, so zoom always
  // happens "where I am" rather than a fixed point.
  const pointerRef = React.useRef({ x: 0, y: 0 });
  const velocityRef = React.useRef({ mult: 1, last: 0 });
  const leftOpenRef = React.useRef(true);
  const rightOpenRef = React.useRef(true);
  const viewRef = React.useRef(view);
  const layoutRef = React.useRef<ReturnType<typeof layoutGroups> | null>(null);
  const frameDocsRef = React.useRef<Set<Document>>(new Set());
  const tokenOverridesRef = React.useRef(tokenOverrides);
  const canvasThemeRef = React.useRef(canvasTheme);

  React.useEffect(() => {
    commentModeRef.current = mode === 'comment';
  }, [mode]);
  React.useEffect(() => {
    selectGranularityRef.current = selectGranularity;
  }, [selectGranularity]);
  React.useEffect(() => {
    spaceHeldRef.current = spaceHeld;
  }, [spaceHeld]);
  React.useEffect(() => {
    leftOpenRef.current = leftOpen;
  }, [leftOpen]);
  React.useEffect(() => {
    rightOpenRef.current = rightOpen;
  }, [rightOpen]);
  React.useEffect(() => {
    viewRef.current = view;
  }, [view]);

  // Seed the pointer target at the viewport's center so a zoom triggered
  // before the mouse ever touches the canvas still has a sensible origin.
  React.useEffect(() => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (rect) pointerRef.current = { x: rect.width / 2, y: rect.height / 2 };
  }, []);

  const isVisible = (path: string) => !hidden.has(path);
  const toggle = (path: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  const toggleGroup = (group: CanvasGroup, show: boolean) =>
    setHidden((prev) => {
      const next = new Set(prev);
      group.pages.forEach((p) => (show ? next.delete(p.path) : next.add(p.path)));
      return next;
    });

  const isMobileVisible = (path: string) => mobileOverrides[path] ?? mobileGlobal;
  const toggleMobileGlobal = () => {
    setMobileGlobal((g) => !g);
    setMobileOverrides({});
  };
  const toggleMobileForPage = (path: string) =>
    setMobileOverrides((prev) => ({ ...prev, [path]: !isMobileVisible(path) }));
  const toggleGroupMobile = (group: CanvasGroup, show: boolean) =>
    setMobileOverrides((prev) => {
      const next = { ...prev };
      group.pages.forEach((p) => (next[p.path] = show));
      return next;
    });

  // Tracks which page/device iframes failed to load (e.g. the dev server
  // went down) so a header-level "retry all down" button can bump every
  // failed one at once, without touching the ones that are fine.
  const handleFrameStatus = React.useCallback((path: string, device: DeviceKey, status: FrameStatus) => {
    const key = `${device}:${path}`;
    setFrameStatuses((prev) => (prev[key] === status ? prev : { ...prev, [key]: status }));
  }, []);
  const downCount = Object.values(frameStatuses).filter((s) => s === 'error').length;
  const retryAllDown = () => setRetryTick((t) => t + 1);
  const reloadAll = () => setReloadTick((t) => t + 1);

  const layout = React.useMemo(
    () => layoutGroups(GROUPS, isVisible, heights, mobileHeights, isMobileVisible),
    [hidden, heights, mobileHeights, mobileGlobal, mobileOverrides],
  );
  React.useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  /* ── token editor: live-apply + persist ───────────────────────────────── */

  const applyTokenOverrides = React.useCallback((doc: Document, overrides: Record<string, string>) => {
    const root = doc.documentElement;
    Object.values(COLOR_TOKENS).forEach((token) => root.style.removeProperty(token.cssVar));
    Object.entries(overrides).forEach(([cssVar, value]) => root.style.setProperty(cssVar, value));
  }, []);

  React.useEffect(() => {
    tokenOverridesRef.current = tokenOverrides;
    frameDocsRef.current.forEach((doc) => applyTokenOverrides(doc, tokenOverrides));
    try {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokenOverrides));
    } catch {
      /* storage unavailable — live preview still works, just won't persist */
    }
  }, [tokenOverrides, applyTokenOverrides]);

  /* ── light / dark preview: apply data-mode to the canvas + every frame ─────
     Flavor themes via <html data-mode>; the whole review surface (chrome,
     token editor, and every page iframe) flips together, so the token editor's
     swatches and picker read the active theme's values straight from live CSS
     with no extra plumbing.                                                */

  const applyCanvasTheme = React.useCallback((root: HTMLElement, theme: 'light' | 'dark') => {
    setDocumentMode(root, theme);
    root.style.colorScheme = theme;
  }, []);

  // Restore the app's own theme when leaving the canvas, so navigating back
  // doesn't strand the app in whatever theme was last previewed here.
  React.useEffect(() => {
    const root = document.documentElement;
    const prevMode = getDocumentMode(root);
    const prevColorScheme = root.style.colorScheme;
    return () => {
      setDocumentMode(root, prevMode);
      root.style.colorScheme = prevColorScheme;
    };
  }, []);

  React.useEffect(() => {
    canvasThemeRef.current = canvasTheme;
    applyCanvasTheme(document.documentElement, canvasTheme);
    frameDocsRef.current.forEach((doc) => applyCanvasTheme(doc.documentElement, canvasTheme));
  }, [canvasTheme, applyCanvasTheme]);

  const setTokenValue = (cssVar: string, value: string) =>
    setTokenOverrides((prev) => ({ ...prev, [cssVar]: value }));
  const resetToken = (cssVar: string) =>
    setTokenOverrides((prev) => {
      const next = { ...prev };
      delete next[cssVar];
      return next;
    });
  const resetAllTokens = () => setTokenOverrides({});

  /* ── pan / zoom engine ──────────────────────────────────────────────── */

  const zoomAt = React.useCallback((cx: number, cy: number, factor: number) => {
    setView((v) => {
      const newZoom = clamp(v.zoom * factor, MIN_ZOOM, MAX_ZOOM);
      const wx = (cx - v.x) / v.zoom;
      const wy = (cy - v.y) / v.zoom;
      return { zoom: newZoom, x: cx - wx * newZoom, y: cy - wy * newZoom };
    });
  }, []);

  const zoomToFit = React.useCallback(() => {
    const el = viewportRef.current;
    if (!el || layout.rows.length === 0) return;
    const rect = el.getBoundingClientRect();
    const pad = 72;
    const contentW = layout.maxX - SPINE_X;
    const contentH = layout.maxY;
    if (contentW <= 0 || contentH <= 0) return;
    const zx = (rect.width - pad * 2) / contentW;
    const zy = (rect.height - pad * 2) / contentH;
    const newZoom = clamp(Math.min(zx, zy), MIN_ZOOM, MAX_ZOOM);
    setView({ zoom: newZoom, x: pad - SPINE_X * newZoom, y: pad });
  }, [layout]);

  // Auto-fit once, shortly after mount (lets initial iframe loads settle).
  React.useEffect(() => {
    if (didAutoFitRef.current) return;
    const t = window.setTimeout(() => {
      didAutoFitRef.current = true;
      zoomToFit();
    }, 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Forward a wheel gesture that originated INSIDE a same-origin page iframe
  // up to this canvas's own pan/zoom state. Browsers never bubble events
  // across a frame boundary, so without this, panning/zooming would stop
  // dead the moment the cursor crossed onto a page's rendered content while
  // Comment mode has it pointer-interactive. Reads view/layout via refs (not
  // closed-over state) since the listener that calls this is attached once,
  // when that iframe loads.
  const forwardFrameWheel = React.useCallback(
    (path: string, device: DeviceKey, e: WheelEvent) => {
      const found = layoutRef.current?.rows.flatMap((r) => r.pages).find((p) => p.page.path === path);
      if (!found) return;
      const v = viewRef.current;
      const baseY = device === 'mobile' ? found.mobileY ?? found.y : found.y;
      const scale = VIEWPORTS[device].scale;
      const cx = v.x + (found.x + e.clientX * scale) * v.zoom;
      const cy = v.y + (baseY + e.clientY * scale) * v.zoom;
      pointerRef.current = { x: cx, y: cy };
      const vel = bumpVelocity(velocityRef, performance.now());
      if (e.ctrlKey || e.metaKey) {
        zoomAt(cx, cy, Math.exp(-e.deltaY * ZOOM_SENSITIVITY * vel));
      } else if (e.shiftKey) {
        setView((cur) => ({ ...cur, x: cur.x - e.deltaY * vel }));
      } else {
        setView((cur) => ({ ...cur, x: cur.x - e.deltaX * vel, y: cur.y - e.deltaY * vel }));
      }
    },
    [zoomAt],
  );

  // Native, non-passive wheel listener: plain wheel = pan, ctrl/cmd (or
  // trackpad pinch, which browsers report with ctrlKey) = zoom to cursor,
  // shift = horizontal pan. A rolling velocity multiplier (bumpVelocity) makes
  // fast, sustained gestures travel further per event than slow, deliberate
  // ones — most noticeable spinning a plain mouse wheel quickly, or pinching
  // briskly on a trackpad.
  React.useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      pointerRef.current = { x: cx, y: cy };
      const vel = bumpVelocity(velocityRef, performance.now());
      if (e.ctrlKey || e.metaKey) {
        zoomAt(cx, cy, Math.exp(-e.deltaY * ZOOM_SENSITIVITY * vel));
      } else if (e.shiftKey) {
        setView((v) => ({ ...v, x: v.x - e.deltaY * vel }));
      } else {
        setView((v) => ({ ...v, x: v.x - e.deltaX * vel, y: v.y - e.deltaY * vel }));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  // Closing the left sidebar shifts the canvas's screen-space origin; nudge
  // the pan by the same amount so content doesn't visually jump. (The right
  // sidebar only changes the viewport's width, not its origin, so it needs no
  // compensation.) Only the delta down to the reopen strip's width matters,
  // since that strip stays docked in the sidebar's place when closed.
  const compensateLeft = React.useCallback((wasOpen: boolean) => {
    const delta = LEFT_SIDEBAR_W - EDGE_STRIP_W;
    setView((v) => ({ ...v, x: v.x + (wasOpen ? delta : -delta) }));
  }, []);
  const toggleLeftSidebar = () => {
    compensateLeft(leftOpen);
    setLeftOpen((o) => !o);
  };
  const toggleRightSidebar = () => setRightOpen((o) => !o);

  // Space bar = temporary pan tool (ignored while typing in a field).
  // C = toggle Comment mode. ⌘/Ctrl + / = toggle both sidebars.
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === 'TEXTAREA' || tag === 'INPUT';

      if ((e.metaKey || e.ctrlKey) && (e.key === '/' || e.code === 'Slash')) {
        e.preventDefault();
        const bothOpen = leftOpenRef.current && rightOpenRef.current;
        const nextOpen = !bothOpen;
        if (nextOpen !== leftOpenRef.current) compensateLeft(leftOpenRef.current);
        setLeftOpen(nextOpen);
        setRightOpen(nextOpen);
        return;
      }
      if (!typing && (e.key === 'c' || e.key === 'C') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setMode((m) => (m === 'comment' ? 'preview' : 'comment'));
        return;
      }
      if (e.code !== 'Space' || e.repeat || typing) return;
      e.preventDefault();
      setSpaceHeld(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceHeld(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [compensateLeft]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    panRef.current = { active: true, lastX: e.clientX, lastY: e.clientY };
    setIsPanning(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (rect) pointerRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    if (!panRef.current.active) return;
    const dx = e.clientX - panRef.current.lastX;
    const dy = e.clientY - panRef.current.lastY;
    panRef.current.lastX = e.clientX;
    panRef.current.lastY = e.clientY;
    setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
  };
  const endPan = () => {
    panRef.current.active = false;
    setIsPanning(false);
  };

  /* ── annotations / draft comments ─────────────────────────────────────── */

  const addAnnotation = React.useCallback((a: Omit<Annotation, 'id'>) => {
    idRef.current += 1;
    const id = idRef.current;
    setAnnotations((prev) => [...prev, { ...a, id }]);
    return id;
  }, []);

  const openDraft = React.useCallback((payload: DraftAnnotation) => {
    setDraft(payload);
    setDraftNote('');
  }, []);
  const cancelDraft = () => {
    setDraft(null);
    setDraftNote('');
  };
  const saveDraft = () => {
    if (!draft) return;
    addAnnotation({ ...draft, note: draftNote });
    setDraft(null);
    setDraftNote('');
  };
  const updateDraftTweak = (patch: Partial<AnnotationTweak>) =>
    setDraft((d) => (d ? { ...d, tweak: { ...(d.tweak ?? {}), ...patch } } : d));

  // Enter saves the draft, Escape cancels it. Shift+Enter still inserts a
  // newline in the note. Scoped to the note field so keys inside the tweak
  // Selects (Enter to open, Escape to close) aren't hijacked.
  const handleDraftNoteKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveDraft();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelDraft();
    }
  };

  const attachFrame = React.useCallback(
    (path: string, device: DeviceKey, iframe: HTMLIFrameElement) => {
      try {
        const doc = iframe.contentDocument;
        if (!doc) return;
        if (!doc.getElementById('canvas-inject')) {
          const style = doc.createElement('style');
          style.id = 'canvas-inject';
          style.textContent = '[data-designer-banner]{display:none !important}';
          doc.head.appendChild(style);
        }
        frameDocsRef.current.add(doc);
        applyTokenOverrides(doc, tokenOverridesRef.current);
        applyCanvasTheme(doc.documentElement, canvasThemeRef.current);

        let highlightEl = doc.getElementById('canvas-select-highlight') as HTMLElement | null;
        if (!highlightEl) {
          highlightEl = doc.createElement('div');
          highlightEl.id = 'canvas-select-highlight';
          Object.assign(highlightEl.style, {
            position: 'absolute',
            zIndex: '2147483647',
            pointerEvents: 'none',
            border: '2px solid rgba(37,99,235,0.9)',
            background: 'rgba(37,99,235,0.12)',
            borderRadius: '2px',
            display: 'none',
          });
          doc.body?.appendChild(highlightEl);
        }
        const highlight = highlightEl;

        // Pan & zoom keep working even while the cursor is over this page's
        // own content (Comment mode makes the iframe pointer-interactive).
        doc.addEventListener(
          'wheel',
          (e) => {
            e.preventDefault();
            forwardFrameWheel(path, device, e as WheelEvent);
          },
          { passive: false, capture: true },
        );

        // Hover highlights the exact element (or the whole page, in "page"
        // granularity) under the cursor — this is the "select" surface.
        doc.addEventListener(
          'mousemove',
          (e) => {
            if (!commentModeRef.current) {
              highlight.style.display = 'none';
              return;
            }
            const target = resolveSelectTarget(e.target as Element, selectGranularityRef.current, doc);
            if (!target) {
              highlight.style.display = 'none';
              return;
            }
            const rect = target.getBoundingClientRect();
            const sx = doc.defaultView?.scrollX ?? 0;
            const sy = doc.defaultView?.scrollY ?? 0;
            highlight.style.display = 'block';
            highlight.style.left = `${rect.left + sx}px`;
            highlight.style.top = `${rect.top + sy}px`;
            highlight.style.width = `${rect.width}px`;
            highlight.style.height = `${rect.height}px`;
          },
          true,
        );
        doc.addEventListener('mouseleave', () => { highlight.style.display = 'none'; }, true);

        // Clicking the highlighted target opens a draft comment — nothing is
        // added to the feedback list until it's explicitly saved.
        doc.addEventListener(
          'click',
          (e) => {
            if (!commentModeRef.current) return;
            e.preventDefault();
            e.stopPropagation();
            const granularity = selectGranularityRef.current;
            const target = resolveSelectTarget(e.target as Element, granularity, doc);
            if (!target) return;
            const rect = target.getBoundingClientRect();
            const sx = doc.defaultView?.scrollX ?? 0;
            const sy = doc.defaultView?.scrollY ?? 0;
            const isPage = granularity === 'page';
            openDraft({
              path,
              device,
              x: rect.left + sx,
              y: rect.top + sy,
              w: rect.width,
              h: rect.height,
              selector: isPage ? '' : computeSelector(target),
              text: isPage ? '' : (target.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60),
              targetKind: classifyElement(target),
            });
          },
          true,
        );
      } catch {
        /* cross-origin — ignore */
      }
    },
    [applyTokenOverrides, applyCanvasTheme, forwardFrameWheel, openDraft],
  );

  const updateNote = (id: number, note: string) =>
    setAnnotations((prev) => prev.map((a) => (a.id === id ? { ...a, note } : a)));
  const updateTweak = (id: number, patch: Partial<AnnotationTweak>) =>
    setAnnotations((prev) =>
      prev.map((a) => (a.id === id ? { ...a, tweak: { ...(a.tweak ?? {}), ...patch } } : a)),
    );
  const removeAnnotation = (id: number) =>
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
  const toggleTweakOpen = (id: number) =>
    setTweakOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const copyFeedback = async () => {
    try {
      await navigator.clipboard.writeText(buildFeedback(annotations));
      toast.success('Feedback copied to clipboard');
    } catch {
      toast.error('Copy failed — select the text manually');
    }
  };

  // Where the floating draft-comment card should sit on screen — computed in
  // screen space (not the scaled world transform) so it stays a fixed,
  // usable size no matter the current zoom level.
  const draftScreen = React.useMemo(() => {
    if (!draft) return null;
    const found = layout.rows.flatMap((r) => r.pages).find((p) => p.page.path === draft.path);
    if (!found) return null;
    const baseY = draft.device === 'mobile' ? found.mobileY ?? found.y : found.y;
    const scale = VIEWPORTS[draft.device].scale;
    const worldX = found.x + draft.x * scale;
    const worldY = baseY + draft.y * scale;
    return {
      left: view.x + worldX * view.zoom,
      top: view.y + worldY * view.zoom,
      height: draft.h * scale * view.zoom,
    };
  }, [draft, layout, view]);

  const visibleCount = ALL_PATHS.filter(isVisible).length;
  const commentMode = mode === 'comment';
  // Pages are pointer-interactive in both Preview (click through / navigate the
  // real app) and Comment (hover + click to pin feedback) — only the token
  // editor keeps them inert. Holding space always reclaims the cursor for
  // panning. In Preview the frame click handler no-ops, so native links,
  // buttons, and inputs behave normally.
  const iframesInteractive = mode !== 'tokens' && !spaceHeld;
  const GRID = 32;

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* top bar */}
      <header className="brand-navy-surface flex h-14 flex-shrink-0 items-center justify-between border-b border-brand-teal/30 px-5 text-brand-navy-foreground">
        <div className="flex items-baseline gap-2 font-display">
          <span className="text-base font-bold tracking-tight">Work in Progress</span>
          <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-brand-teal-bright">
            Canvas
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <div className="flex items-center gap-0.5 rounded-md bg-white/10 p-0.5">
            {(['preview', 'comment', 'tokens'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                title={m === 'preview' ? 'Preview' : m === 'comment' ? 'Comment (C)' : 'Token editor'}
                className={cn(
                  'flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium capitalize text-brand-navy-foreground/70 transition-colors hover:text-brand-navy-foreground',
                  mode === m && 'bg-white/15 text-brand-navy-foreground',
                )}
              >
                {m === 'preview' ? (
                  <Eye className="h-3.5 w-3.5" />
                ) : m === 'comment' ? (
                  <MessageSquare className="h-3.5 w-3.5" />
                ) : (
                  <Palette className="h-3.5 w-3.5" />
                )}
                {m}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-0.5 rounded-md bg-white/10 p-0.5">
            {(['light', 'dark'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setCanvasTheme(t)}
                aria-pressed={canvasTheme === t}
                title={t === 'light' ? 'Preview light mode' : 'Preview dark mode'}
                className={cn(
                  'flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium capitalize text-brand-navy-foreground/70 transition-colors hover:text-brand-navy-foreground',
                  canvasTheme === t && 'bg-white/15 text-brand-navy-foreground',
                )}
              >
                {t === 'light' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                {t}
              </button>
            ))}
          </div>

          {commentMode ? (
            <div className="flex items-center gap-0.5 rounded-md bg-white/10 p-0.5">
              {(['element', 'page'] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setSelectGranularity(g)}
                  aria-pressed={selectGranularity === g}
                  title={g === 'element' ? 'Select a single element' : 'Select the full page'}
                  className={cn(
                    'rounded px-2 py-1 text-xs capitalize text-brand-navy-foreground/70 hover:text-brand-navy-foreground',
                    selectGranularity === g && 'bg-white/15 text-brand-navy-foreground',
                  )}
                >
                  {g}
                </button>
              ))}
            </div>
          ) : null}

          <button
            type="button"
            onClick={reloadAll}
            title="Reload every frame — use this if any page looks blank or stale"
            className="rounded-md p-1.5 text-brand-navy-foreground/80 transition-colors hover:bg-white/10 hover:text-brand-navy-foreground"
          >
            <RotateCw className="h-4 w-4" />
          </button>

          {downCount > 0 ? (
            <button
              type="button"
              onClick={retryAllDown}
              title={`Retry ${downCount} page${downCount === 1 ? '' : 's'} that didn't load`}
              className="flex items-center gap-1.5 rounded-md bg-warning/20 px-2.5 py-1 text-xs font-medium text-warning transition-colors hover:bg-warning/30"
            >
              <RotateCw className="h-3.5 w-3.5" /> {downCount} down · Retry
            </button>
          ) : null}

          <div className="h-5 w-px bg-white/15" />
          <Link
            to="/app"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-brand-navy-foreground/80 transition-colors hover:bg-white/10 hover:text-brand-navy-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back to app
          </Link>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* left sidebar — page visibility (fixed/docked, collapsible) */}
        {leftOpen ? (
          <aside className="flex w-64 min-w-0 flex-shrink-0 flex-col overflow-hidden border-r bg-surface-sunken/40">
            <div className="flex h-full w-64 flex-col overflow-y-auto p-4">
              <div className="mb-1 flex items-center justify-between">
                <p className="text-mono-label text-muted-foreground">
                  Pages ({visibleCount}/{ALL_PATHS.length})
                </p>
                <button
                  type="button"
                  onClick={toggleLeftSidebar}
                  title="Hide pages panel"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ChevronsLeft className="h-4 w-4" />
                </button>
              </div>
              {/* One consolidated toolbar for both devices: Desktop show/hide-all
                  next to Mobile's default-for-every-page toggle. Per-group and
                  per-page rows below mirror this same desktop/mobile pairing. */}
              <div className="mb-3 flex items-center gap-1 text-xs">
                <span className="mr-0.5 text-muted-foreground">Desktop</span>
                <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs" onClick={() => setHidden(new Set())}>
                  All
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-xs"
                  onClick={() => setHidden(new Set(ALL_PATHS))}
                >
                  None
                </Button>
                <div className="mx-1 h-4 w-px bg-border" />
                <span className="mr-0.5 text-muted-foreground">Mobile</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn('h-6 gap-1 px-1.5 text-xs', mobileGlobal && 'text-primary')}
                  onClick={toggleMobileGlobal}
                  title="Show mobile view for every page by default"
                  aria-pressed={mobileGlobal}
                >
                  <Smartphone className="h-3 w-3" /> {mobileGlobal ? 'On' : 'Off'}
                </Button>
              </div>
              <div className="space-y-4">
                {GROUPS.map((group) => {
                  const shown = group.pages.filter((p) => isVisible(p.path)).length;
                  const mobileShown = group.pages.filter((p) => isMobileVisible(p.path)).length;
                  return (
                    <div key={group.label} className="space-y-1">
                      <div className="flex items-center justify-between px-1">
                        <p className="text-xs font-semibold text-foreground">{group.label}</p>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => toggleGroup(group, shown !== group.pages.length)}
                            className="text-muted-foreground hover:text-foreground"
                            title={shown === group.pages.length ? 'Hide group (desktop)' : 'Show group (desktop)'}
                          >
                            {shown === group.pages.length ? (
                              <Eye className="h-3.5 w-3.5" />
                            ) : (
                              <EyeOff className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleGroupMobile(group, mobileShown !== group.pages.length)}
                            className={cn(
                              'text-muted-foreground hover:text-foreground',
                              mobileShown > 0 && 'text-primary',
                            )}
                            title={
                              mobileShown === group.pages.length
                                ? 'Hide mobile view for this group'
                                : 'Show mobile view for this group'
                            }
                          >
                            <Smartphone className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      {group.pages.map((p) => (
                        <div
                          key={p.path}
                          className="flex items-center gap-2 rounded px-1 py-0.5 text-sm text-muted-foreground hover:text-foreground"
                        >
                          <input
                            type="checkbox"
                            checked={isVisible(p.path)}
                            onChange={() => toggle(p.path)}
                            className="h-3.5 w-3.5 flex-shrink-0 cursor-pointer accent-primary"
                            aria-label={`Show ${p.label} on desktop`}
                          />
                          <button
                            type="button"
                            onClick={() => toggle(p.path)}
                            className="min-w-0 flex-1 truncate text-left"
                          >
                            {p.label}
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleMobileForPage(p.path)}
                            title={
                              isMobileVisible(p.path)
                                ? 'Hide mobile view for this page'
                                : 'Show mobile view for this page'
                            }
                            className={cn(
                              'flex-shrink-0 text-muted-foreground hover:text-foreground',
                              isMobileVisible(p.path) && 'text-primary',
                            )}
                          >
                            <Smartphone className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 space-y-1 border-t pt-4 text-xs text-muted-foreground">
                <p className="text-mono-label text-muted-foreground">Navigate</p>
                <p>2-finger swipe (or scroll) to pan</p>
                <p>Pinch, or ⌘/Ctrl + scroll, to zoom — up to 500%</p>
                <p>Drag, or hold Space + drag, to pan</p>
                <p>Faster gestures move further</p>
                <p className="text-mono-label text-muted-foreground pt-2">Comment (C)</p>
                <p>Hover to highlight an element — or switch to Page in the header</p>
                <p>Click the highlight to open a draft comment</p>
                <p>Save or Cancel — nothing is pinned until you Save</p>
                <p>Type @ in a note to reference another item</p>
                <p>Pan/zoom still work while commenting</p>
                <p className="pt-2">⌘/Ctrl + / to hide panels</p>
              </div>
            </div>
          </aside>
        ) : (
          <button
            type="button"
            onClick={toggleLeftSidebar}
            title="Show pages panel"
            className="flex w-4 flex-shrink-0 items-center justify-center border-r bg-surface-sunken/40 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ChevronsRight className="h-3.5 w-3.5" />
          </button>
        )}

        {/* canvas viewport */}
        <main className="relative min-w-0 flex-1 overflow-hidden">
          <div
            ref={viewportRef}
            className={cn('h-full w-full', isPanning || spaceHeld ? 'cursor-grabbing' : 'cursor-grab')}
            style={{
              backgroundImage: 'radial-gradient(hsl(var(--border)) 1px, transparent 1px)',
              backgroundSize: `${GRID * view.zoom}px ${GRID * view.zoom}px`,
              backgroundPosition: `${view.x}px ${view.y}px`,
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endPan}
            onPointerLeave={endPan}
          >
            <div
              className="absolute left-0 top-0"
              style={{
                transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
                transformOrigin: '0 0',
              }}
            >
              {/* spine — the vertical stroke the sections hang off */}
              {layout.rows.length > 0 ? (
                <div
                  className="absolute bg-border"
                  style={{ left: SPINE_X, top: 0, width: 2, height: layout.maxY }}
                />
              ) : null}

              {layout.rows.map((row) => (
                <React.Fragment key={row.group.label}>
                  <div
                    className="absolute bg-border"
                    style={{ left: SPINE_X, top: row.labelY + GROUP_LABEL_H / 2, width: -SPINE_X, height: 2 }}
                  />
                  <h2
                    className="absolute whitespace-nowrap text-title text-foreground"
                    style={{ left: 0, top: row.labelY }}
                  >
                    {row.group.label}
                  </h2>
                  {row.pages.map((pc) => (
                    <PageCard
                      key={pc.page.path}
                      page={pc.page}
                      x={pc.x}
                      desktopY={pc.y}
                      desktopNativeH={pc.nativeH}
                      desktopHeightWorld={pc.heightWorld}
                      showMobile={pc.showMobile}
                      mobileOverrideActive={pc.page.path in mobileOverrides}
                      mobileY={pc.mobileY}
                      mobileNativeH={pc.mobileNativeH}
                      mobileHeightWorld={pc.mobileHeightWorld}
                      interactive={iframesInteractive}
                      desktopAnnotations={annotations.filter((a) => a.path === pc.page.path && a.device === 'desktop')}
                      mobileAnnotations={annotations.filter((a) => a.path === pc.page.path && a.device === 'mobile')}
                      onLoad={(device, iframe) => attachFrame(pc.page.path, device, iframe)}
                      onMeasure={(device, h) => {
                        if (device === 'desktop') {
                          setHeights((prev) => ({ ...prev, [pc.page.path]: clamp(h, 400, 2600) }));
                        } else {
                          setMobileHeights((prev) => ({ ...prev, [pc.page.path]: clamp(h, 400, 3600) }));
                        }
                      }}
                      onToggleMobile={() => toggleMobileForPage(pc.page.path)}
                      forceRetryTick={retryTick}
                      forceReloadTick={reloadTick}
                      onStatusChange={(device, status) => handleFrameStatus(pc.page.path, device, status)}
                    />
                  ))}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* floating draft comment — nothing is added to feedback until Save.
              Placement is clamped to the visible canvas so the whole card stays
              on screen: it flips above the target when there's more room there,
              its left edge is pinned inside the viewport, and its height is
              capped to the space available (the body scrolls past that). */}
          {draft && draftScreen ? (() => {
            const CARD_W = 300;
            const M = 8;
            const vp = viewportRef.current;
            const vpW = vp?.clientWidth ?? window.innerWidth;
            const vpH = vp?.clientHeight ?? window.innerHeight;
            const below = draftScreen.top + draftScreen.height + M;
            const spaceBelow = vpH - below - M;
            const spaceAbove = draftScreen.top - 2 * M;
            const placeAbove = spaceBelow < 220 && spaceAbove > spaceBelow;
            const maxHeight = Math.max(
              160,
              Math.min(placeAbove ? spaceAbove : spaceBelow, vpH - 2 * M),
            );
            let top = placeAbove ? draftScreen.top - M - maxHeight : below;
            top = Math.max(M, Math.min(top, vpH - M - maxHeight));
            const left = Math.max(M, Math.min(draftScreen.left, vpW - CARD_W - M));
            return (
              <div className="absolute z-30" style={{ left, top, width: CARD_W }}>
                <div
                  className="space-y-2 overflow-y-auto rounded-lg border bg-popover p-3 shadow-lg"
                  style={{ maxHeight }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-[0.65rem] text-muted-foreground">
                      {draft.selector || VIEWPORTS[draft.device].label}
                    </span>
                    <button type="button" onClick={cancelDraft} className="flex-shrink-0 text-muted-foreground hover:text-foreground">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <MentionTextarea
                    value={draftNote}
                    onChange={setDraftNote}
                    placeholder="Your feedback…"
                    className="min-h-[64px] text-sm"
                    annotations={annotations}
                    autoFocus
                    onKeyDown={handleDraftNoteKeyDown}
                  />
                  {draft.selector ? <TweakPanel annotation={draft} onChange={updateDraftTweak} /> : null}
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="text-[0.6rem] text-muted-foreground">↵ save · esc cancel</span>
                    <div className="flex gap-1.5">
                      <Button variant="ghost" size="sm" className="h-7 px-2" onClick={cancelDraft}>
                        Cancel
                      </Button>
                      <Button size="sm" className="h-7 px-3" onClick={saveDraft}>
                        Save
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })() : null}

          {/* zoom HUD */}
          <div className="absolute bottom-4 left-4 z-20 flex items-center gap-0.5 rounded-lg border bg-popover p-1 shadow-md">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => zoomAt(pointerRef.current.x, pointerRef.current.y, 1 / 1.25)}
              aria-label="Zoom out"
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <button
              type="button"
              onClick={() => zoomAt(pointerRef.current.x, pointerRef.current.y, 1 / view.zoom)}
              className="min-w-[3.5rem] rounded px-1.5 py-1 text-center text-xs font-medium text-foreground hover:bg-accent"
              title="Reset to 100%"
            >
              {Math.round(view.zoom * 100)}%
            </button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => zoomAt(pointerRef.current.x, pointerRef.current.y, 1.25)}
              aria-label="Zoom in"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <div className="mx-0.5 h-5 w-px bg-border" />
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={zoomToFit} aria-label="Zoom to fit">
              <Scan className="h-3.5 w-3.5" />
            </Button>
          </div>
        </main>

        {/* right sidebar — feedback or token editor (fixed/docked, collapsible) */}
        {rightOpen ? (
          <aside className="flex w-80 min-w-0 flex-shrink-0 flex-col overflow-hidden border-l bg-surface-sunken/40">
            <div className="flex h-full w-80 flex-col overflow-hidden">
              <div className="flex items-center justify-between border-b p-4">
                <p className="text-mono-label text-muted-foreground">
                  {mode === 'tokens' ? (
                    'Tokens'
                  ) : (
                    <>
                      Feedback <Badge variant="muted" className="ml-1">{annotations.length}</Badge>
                    </>
                  )}
                </p>
                <div className="flex items-center gap-1">
                  {mode !== 'tokens' ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1.5 px-2"
                        disabled={annotations.length === 0}
                        onClick={copyFeedback}
                      >
                        <ClipboardCopy className="h-3.5 w-3.5" /> Copy
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        disabled={annotations.length === 0}
                        onClick={() => setAnnotations([])}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    onClick={toggleRightSidebar}
                    title="Hide panel"
                    className="ml-1 text-muted-foreground hover:text-foreground"
                  >
                    <ChevronsRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {mode === 'tokens' ? (
                <TokenEditorPanel
                  overrides={tokenOverrides}
                  onChange={setTokenValue}
                  onReset={resetToken}
                  onResetAll={resetAllTokens}
                />
              ) : (
                <div className="flex-1 space-y-3 overflow-y-auto p-4">
                  {annotations.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {commentMode
                        ? 'Hover to highlight an element, then click it to open a draft comment.'
                        : 'Switch to Comment (or press C), then hover and click to pin feedback you can copy back to Claude Code.'}
                    </p>
                  ) : (
                    annotations.map((a) => (
                      <div key={a.id} className="space-y-1.5 rounded-lg border bg-card p-3">
                        <div className="flex items-center gap-2">
                          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary text-[0.65rem] font-bold text-primary-foreground">
                            {a.id}
                          </span>
                          <span className="truncate font-mono text-[0.65rem] text-muted-foreground" title={a.path}>
                            {a.path}
                          </span>
                          <Badge variant="outline" className="px-1.5 py-0 text-[0.6rem]">
                            {a.device}
                          </Badge>
                          {a.selector ? (
                            <button
                              type="button"
                              onClick={() => toggleTweakOpen(a.id)}
                              aria-pressed={tweakOpen.has(a.id)}
                              title="Tweak with design tokens"
                              className={cn(
                                'ml-auto text-muted-foreground hover:text-foreground',
                                tweakOpen.has(a.id) && 'text-primary',
                              )}
                            >
                              <SlidersHorizontal className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => removeAnnotation(a.id)}
                            className={cn('text-muted-foreground hover:text-destructive', !a.selector && 'ml-auto')}
                            aria-label="Remove annotation"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <p className="truncate font-mono text-[0.65rem] text-muted-foreground" title={a.selector}>
                          {a.selector || '(full page)'}
                        </p>
                        {a.text ? (
                          <p className="truncate text-xs text-muted-foreground">“{a.text}”</p>
                        ) : null}
                        <MentionTextarea
                          value={a.note}
                          onChange={(v) => updateNote(a.id, v)}
                          placeholder="Your feedback…"
                          className="min-h-[56px] text-sm"
                          annotations={annotations}
                        />

                        {tweakOpen.has(a.id) && a.selector ? (
                          <TweakPanel annotation={a} onChange={(patch) => updateTweak(a.id, patch)} />
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </aside>
        ) : (
          <button
            type="button"
            onClick={toggleRightSidebar}
            title="Show panel"
            className="flex w-4 flex-shrink-0 items-center justify-center border-l bg-surface-sunken/40 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ChevronsLeft className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

/* ── token editor panel ───────────────────────────────────────────────────
   Edits the semantic color tokens directly (raw "H S% L%", matching how the
   design system stores them) and live-patches every loaded iframe's root —
   changes persist to localStorage so they survive a reload.               */

function TokenEditorPanel({
  overrides,
  onChange,
  onReset,
  onResetAll,
}: {
  overrides: Record<string, string>;
  onChange: (cssVar: string, value: string) => void;
  onReset: (cssVar: string) => void;
  onResetAll: () => void;
}) {
  const hasAny = Object.keys(overrides).length > 0;
  return (
    <div className="flex-1 space-y-3 overflow-y-auto p-4">
      <p className="text-xs text-muted-foreground">
        Click a swatch to pick a color, type a hex code, or alias the token to a palette color. Changes live-preview
        across every visible page and persist locally on this machine.
      </p>
      <Button variant="outline" size="sm" className="h-7 w-full" disabled={!hasAny} onClick={onResetAll}>
        Reset all
      </Button>
      <div className="space-y-2">
        {Object.entries(COLOR_TOKENS).map(([key, token]) => {
          const value = overrides[token.cssVar];
          const alias = value?.trim().match(VAR_ALIAS_RE);
          const detail = alias ? `→ ${alias[1]}` : value ?? token.cssVar;
          return (
            <div key={key} className="flex items-center gap-2 rounded-md border bg-card p-2">
              <TokenColorControl
                cssVar={token.cssVar}
                label={token.label}
                value={value}
                onChange={(v) => onChange(token.cssVar, v)}
                onReset={() => onReset(token.cssVar)}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-foreground">{token.label}</p>
                <p className="truncate font-mono text-[0.6rem] uppercase text-muted-foreground">{detail}</p>
              </div>
              {value ? (
                <button type="button" onClick={() => onReset(token.cssVar)} title="Reset to default" className="text-muted-foreground hover:text-destructive">
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── token color control ──────────────────────────────────────────────────
   Swatch trigger → popover with a saturation/value square + hue slider, hex
   and raw-HSL inputs, and a palette tab for aliasing the token to a scale
   color. Emits the design-system storage format (hex for Flavor DS, or a
   `var(--flavor-…)` alias) so live-apply + persistence keep working as-is. */

function TokenColorControl({
  cssVar,
  label,
  value,
  onChange,
  onReset,
}: {
  cssVar: string;
  label: string;
  value: string | undefined;
  onChange: (value: string) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const draggingRef = React.useRef<null | 'sv' | 'hue'>(null);
  const [hsv, setHsv] = React.useState<Hsv>(() => hslToHsv(resolveTripletForVar(value, cssVar)));
  const [hexDraft, setHexDraft] = React.useState('');
  const [hslDraft, setHslDraft] = React.useState('');

  const alias = value?.trim().match(VAR_ALIAS_RE)?.[1];

  // Re-seed the picker from the current value whenever it changes externally
  // (reset, palette pick, another edit) — but never mid-drag, which would
  // fight the pointer.
  const syncKey = value ?? `default:${cssVar}`;
  React.useEffect(() => {
    if (draggingRef.current) return;
    const hsl = resolveTripletForVar(value, cssVar);
    setHsv(hslToHsv(hsl));
    setHexDraft(hslToHex(hsl));
    setHslDraft(formatHslTriplet(hsl));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncKey, open]);

  const emitHsv = (next: Hsv) => {
    setHsv(next);
    const hsl = hsvToHsl(next);
    setHexDraft(hslToHex(hsl));
    setHslDraft(formatHslTriplet(hsl));
    onChange(formatStoredColor(hsl));
  };

  const svRef = React.useRef<HTMLDivElement>(null);
  const hueRef = React.useRef<HTMLDivElement>(null);

  const handleSv = (e: React.PointerEvent) => {
    const rect = svRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = clamp01((e.clientX - rect.left) / rect.width);
    const y = clamp01((e.clientY - rect.top) / rect.height);
    emitHsv({ h: hsv.h, s: x * 100, v: (1 - y) * 100 });
  };
  const handleHue = (e: React.PointerEvent) => {
    const rect = hueRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = clamp01((e.clientX - rect.left) / rect.width);
    emitHsv({ ...hsv, h: x * 360 });
  };

  const startDrag =
    (kind: 'sv' | 'hue', handler: (e: React.PointerEvent) => void) => (e: React.PointerEvent) => {
      draggingRef.current = kind;
      e.currentTarget.setPointerCapture(e.pointerId);
      handler(e);
    };
  const moveDrag =
    (kind: 'sv' | 'hue', handler: (e: React.PointerEvent) => void) => (e: React.PointerEvent) => {
      if (draggingRef.current === kind) handler(e);
    };
  const endDrag = (e: React.PointerEvent) => {
    draggingRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
  };

  const commitHex = (raw: string) => {
    const hsl = hexToHsl(raw);
    if (!hsl) {
      const cur = resolveTripletForVar(value, cssVar);
      setHexDraft(hslToHex(cur));
      return;
    }
    setHsv(hslToHsv(hsl));
    setHexDraft(hslToHex(hsl));
    setHslDraft(formatHslTriplet(hsl));
    onChange(formatStoredColor(hsl));
  };
  const commitHsl = (raw: string) => {
    const hsl = parseHslTriplet(raw);
    if (!hsl) {
      const cur = resolveTripletForVar(value, cssVar);
      setHslDraft(formatHslTriplet(cur));
      return;
    }
    setHsv(hslToHsv(hsl));
    setHexDraft(hslToHex(hsl));
    onChange(formatStoredColor(hsl));
  };

  // Stored values (hex or a var() alias) are valid CSS colors as-is.
  const swatchBg = value ?? `var(${cssVar})`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={`Edit ${label}`}
          className="h-6 w-6 flex-shrink-0 rounded border ring-offset-background transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          style={{ background: swatchBg }}
        />
      </PopoverTrigger>
      <PopoverContent align="end" side="left" className="w-64 p-3">
        <Tabs defaultValue="picker">
          <div className="mb-3 flex items-center gap-2">
            <span className="h-7 w-7 flex-shrink-0 rounded border" style={{ background: swatchBg }} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-foreground">{label}</p>
              <p className="truncate font-mono text-[0.6rem] text-muted-foreground">{cssVar}</p>
            </div>
          </div>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="picker" className="text-xs">Picker</TabsTrigger>
            <TabsTrigger value="tokens" className="text-xs">Tokens</TabsTrigger>
          </TabsList>

          <TabsContent value="picker" className="mt-3 space-y-3">
            {/* saturation / value square */}
            <div
              ref={svRef}
              onPointerDown={startDrag('sv', handleSv)}
              onPointerMove={moveDrag('sv', handleSv)}
              onPointerUp={endDrag}
              className="relative h-32 w-full cursor-crosshair rounded-md border"
              style={{
                background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h} 100% 50%))`,
              }}
            >
              <span
                className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
                style={{ left: `${hsv.s}%`, top: `${100 - hsv.v}%` }}
              />
            </div>
            {/* hue slider */}
            <div
              ref={hueRef}
              onPointerDown={startDrag('hue', handleHue)}
              onPointerMove={moveDrag('hue', handleHue)}
              onPointerUp={endDrag}
              className="relative h-3 w-full cursor-pointer rounded-full border"
              style={{
                background:
                  'linear-gradient(to right, hsl(0 100% 50%), hsl(60 100% 50%), hsl(120 100% 50%), hsl(180 100% 50%), hsl(240 100% 50%), hsl(300 100% 50%), hsl(360 100% 50%))',
              }}
            >
              <span
                className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
                style={{ left: `${(hsv.h / 360) * 100}%` }}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-[0.6rem] font-medium uppercase text-muted-foreground">Hex</span>
                <Input
                  value={hexDraft}
                  onChange={(e) => setHexDraft(e.target.value)}
                  onBlur={(e) => commitHex(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitHex((e.target as HTMLInputElement).value);
                  }}
                  placeholder="#000000"
                  className="h-7 font-mono text-xs uppercase"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[0.6rem] font-medium uppercase text-muted-foreground">HSL</span>
                <Input
                  value={hslDraft}
                  onChange={(e) => setHslDraft(e.target.value)}
                  onBlur={(e) => commitHsl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitHsl((e.target as HTMLInputElement).value);
                  }}
                  placeholder="H S% L%"
                  className="h-7 font-mono text-xs"
                />
              </label>
            </div>
          </TabsContent>

          <TabsContent value="tokens" className="mt-3 space-y-3">
            <div className="max-h-56 space-y-2.5 overflow-y-auto pr-1">
              {PALETTE_GROUPS.map((group) => (
                <div key={group.label} className="space-y-1">
                  <p className="text-[0.6rem] font-medium uppercase text-muted-foreground">{group.label}</p>
                  <div className="grid grid-cols-6 gap-1">
                    {group.tokens.map((tok) => {
                      const active = alias === tok;
                      return (
                        <button
                          key={tok}
                          type="button"
                          title={tok}
                          onClick={() => onChange(`var(${tok})`)}
                          className={cn(
                            'h-6 w-full rounded border transition hover:scale-110',
                            active && 'ring-2 ring-ring ring-offset-1 ring-offset-background',
                          )}
                          style={{ background: `var(${tok})` }}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        {value ? (
          <Button
            variant="ghost"
            size="sm"
            className="mt-3 h-7 w-full text-xs text-muted-foreground"
            onClick={() => {
              onReset();
              setOpen(false);
            }}
          >
            Reset to default
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

/* ── figma-style spacing control ──────────────────────────────────────────
   Defaults to linked Horizontal/Vertical selects (mirrors Figma's padding
   UI); an expand toggle reveals the 4 individual sides.                   */

function SpacingControl({
  sides,
  onChange,
}: {
  sides: SpacingSides | undefined;
  onChange: (sides: SpacingSides | undefined) => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const s = sides ?? {};

  const commit = (next: SpacingSides) => {
    const hasAny = Object.values(next).some((v) => v !== undefined);
    onChange(hasAny ? next : undefined);
  };
  const setSide = (key: keyof SpacingSides, value: string | undefined) => commit({ ...s, [key]: value });
  const setPair = (keys: Array<keyof SpacingSides>, value: string | undefined) => {
    const next = { ...s };
    keys.forEach((k) => { next[k] = value; });
    commit(next);
  };

  const renderSelect = (value: string | undefined, onSel: (v: string | undefined) => void, placeholder: string) => (
    <Select value={value ?? NONE} onValueChange={(v) => onSel(v === NONE ? undefined : v)}>
      <SelectTrigger className="h-7 text-xs"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>None</SelectItem>
        {Object.entries(SPACING_TOKENS).map(([key, sp]) => (
          <SelectItem key={key} value={key}>{sp.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  if (!expanded) {
    const horizontal = s.left !== undefined && s.left === s.right ? s.left : undefined;
    const vertical = s.top !== undefined && s.top === s.bottom ? s.top : undefined;
    return (
      <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5">
        {renderSelect(horizontal, (v) => setPair(['left', 'right'], v), 'Horizontal')}
        {renderSelect(vertical, (v) => setPair(['top', 'bottom'], v), 'Vertical')}
        <button
          type="button"
          onClick={() => setExpanded(true)}
          title="Customize all 4 sides"
          className="flex h-7 w-7 items-center justify-center rounded border text-muted-foreground hover:text-foreground"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5">
        {renderSelect(s.top, (v) => setSide('top', v), 'Top')}
        {renderSelect(s.right, (v) => setSide('right', v), 'Right')}
        <button
          type="button"
          onClick={() => setExpanded(false)}
          title="Collapse to horizontal / vertical"
          className="flex h-7 w-7 items-center justify-center rounded border text-muted-foreground hover:text-foreground"
        >
          <Minimize2 className="h-3.5 w-3.5" />
        </button>
        {renderSelect(s.bottom, (v) => setSide('bottom', v), 'Bottom')}
        {renderSelect(s.left, (v) => setSide('left', v), 'Left')}
        <div />
      </div>
    </div>
  );
}

/* ── live token-tweak inspector ────────────────────────────────────────── */

function TweakPanel({
  annotation,
  onChange,
}: {
  // Works for a saved Annotation or an in-progress DraftAnnotation — only
  // targetKind/tweak are read, so both shapes satisfy this structurally.
  annotation: Pick<Annotation, 'targetKind' | 'tweak'>;
  onChange: (patch: Partial<AnnotationTweak>) => void;
}) {
  const t = annotation.tweak ?? {};
  const specs = tweakSpecLines(t);
  const colorKeys = annotation.targetKind === 'text' ? TEXT_COLOR_KEYS : BACKGROUND_COLOR_KEYS;
  const colorProp: 'color' | 'background-color' = annotation.targetKind === 'text' ? 'color' : 'background-color';

  return (
    <div className="space-y-2.5 rounded-md border bg-surface-sunken/50 p-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
          Tweak — tokens only
        </p>
        {specs.length > 0 ? (
          <button
            type="button"
            onClick={() => onChange({ typography: undefined, color: undefined, spacing: undefined, layout: undefined })}
            className="inline-flex items-center gap-0.5 text-[0.65rem] text-muted-foreground hover:text-destructive"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        ) : null}
      </div>

      <TweakRow label="Typography">
        <Select
          value={t.typography ?? NONE}
          onValueChange={(v) => onChange({ typography: v === NONE ? undefined : v })}
        >
          <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="None" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>None</SelectItem>
            {Object.entries(TYPOGRAPHY_TOKENS).map(([key, preset]) => (
              <SelectItem key={key} value={key}>
                {preset.label} · {preset.css['font-size']}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TweakRow>

      <TweakRow label={annotation.targetKind === 'text' ? 'Text color' : 'Background'}>
        <Select
          value={t.color?.token ?? NONE}
          onValueChange={(v) => onChange({ color: v === NONE ? undefined : { prop: colorProp, token: v } })}
        >
          <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Token" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>None</SelectItem>
            {colorKeys.map((key) => (
              <SelectItem key={key} value={key}>{COLOR_TOKENS[key].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TweakRow>

      <TweakRow label="Padding">
        <SpacingControl
          sides={t.spacing?.padding}
          onChange={(padding) => onChange({ spacing: { ...(t.spacing ?? {}), padding } })}
        />
      </TweakRow>

      <TweakRow label="Margin">
        <SpacingControl
          sides={t.spacing?.margin}
          onChange={(margin) => onChange({ spacing: { ...(t.spacing ?? {}), margin } })}
        />
      </TweakRow>

      <TweakRow label="Gap">
        <Select
          value={t.spacing?.gap ?? NONE}
          onValueChange={(v) => onChange({ spacing: { ...(t.spacing ?? {}), gap: v === NONE ? undefined : v } })}
        >
          <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="None" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>None</SelectItem>
            {Object.entries(SPACING_TOKENS).map(([key, sp]) => (
              <SelectItem key={key} value={key}>{sp.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TweakRow>

      <TweakRow label="Layout">
        <div className="grid grid-cols-2 gap-1.5">
          <Select
            value={t.layout?.direction ?? NONE}
            onValueChange={(v) => onChange({ layout: { ...(t.layout ?? {}), direction: v === NONE ? undefined : v } })}
          >
            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Direction" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>None</SelectItem>
              {FLEX_DIRECTION_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={t.layout?.wrap ?? NONE}
            onValueChange={(v) => onChange({ layout: { ...(t.layout ?? {}), wrap: v === NONE ? undefined : v } })}
          >
            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Wrap" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>None</SelectItem>
              {FLEX_WRAP_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={t.layout?.justify ?? NONE}
            onValueChange={(v) => onChange({ layout: { ...(t.layout ?? {}), justify: v === NONE ? undefined : v } })}
          >
            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Justify" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>None</SelectItem>
              {JUSTIFY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={t.layout?.align ?? NONE}
            onValueChange={(v) => onChange({ layout: { ...(t.layout ?? {}), align: v === NONE ? undefined : v } })}
          >
            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Align" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>None</SelectItem>
              {ALIGN_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </TweakRow>

      {specs.length > 0 ? (
        <div className="space-y-0.5 border-t pt-2">
          {specs.map((line, i) => (
            <p key={i} className="font-mono text-[0.6rem] leading-snug text-muted-foreground">
              {line}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TweakRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <p className="w-16 flex-shrink-0 text-[0.65rem] leading-tight text-muted-foreground">{label}</p>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
