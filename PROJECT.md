# Project Context — For Future LLM Sessions

This document describes the architecture, data flows, and nuances of this codebase at a level of detail that allows any LLM to pick up work without losing context.

---

## What This Is

A custom-built **liquid glass UI component** with a dual-mode rendering architecture:

1. **Live interactive mode** — runs in the browser via Vite (**UI Base** at `:5173`), responds to pointer input, fully interactive
2. **Video render mode** — runs headlessly via Remotion (**Remotion Studio** at `:3000`), produces a deterministic frame-accurate video at 3840×536 @ 60fps

The three apps:

| App | Folder | Port | Role |
|-----|--------|------|------|
| **UI Base** | `ui-base/` | `:5173` | Interactive live preview — WebGL glass, orbital panels, drag/click |
| **Remotion Studio** | `ui-base/` (same codebase) | `:3000` | Frame-accurate video render driven by `timeline-data.json` |
| **Timeline Editor** | `timeline-editor/` | `:5174` | JSON animation editor, reads/writes `timeline-data.json` |

The same `App.tsx` component powers both UI Base and Remotion. Its behavior is switched by whether a `timelineState` prop is passed to it.

---

## Dual-Mode Architecture

### Mode Detection

`App.tsx` checks for the `timelineState` prop:

```typescript
// If timelineState is passed → Remotion mode
// If not → Live mode (UI Base)
interface AppProps {
  timelineState?: TimelineState
  overrideWidth?: number
  overrideHeight?: number
  onReady?: () => void
  onFrameReady?: () => void
}
```

### Live Mode (UI Base)

- Canvas is **responsive** — scales to fill the browser window at a fixed aspect ratio (3840/536)
- **8 orbital glass panels** rendered via `OrbitalSystem.tsx` — spring physics, drag-to-reorder, click-to-cycle S/M/L sizes
- Panel positions are driven by orbital physics and fed directly to the WebGL multi-shape shader (`u_shapePositions[8]`, `u_shapeDims[8]`, `u_shapeCount`)
- The settings sidebar (press `X`) exposes all visual parameters as sliders — changes take effect immediately in the live WebGL render
- `requestAnimationFrame` loop runs the WebGL render continuously

### Remotion Mode (Studio + Render)

- Canvas is **fixed** at exactly `overrideWidth × overrideHeight` (3840×536)
- The glass panel position is **calculated from frame number**, not pointer input
- `DashboardComposition.tsx` drives `App.tsx` with a `sizeMultiplier` value computed from Remotion's `spring()` function
- Mouse position in shader is **simulated** — set to panel center via a `setInterval` running every 16ms
- Remotion's `delayRender()` / `continueRender()` pattern is used to block frame capture until the WebGL texture is loaded and the first frame is rendered
- `onReady` / `onFrameReady` callbacks signal render readiness back to the Remotion runtime

---

## Animation System

### Live vs Remotion Spring Comparison

Both modes use **identical spring parameters** intentionally, so the motion feel matches:

| Property | Value |
|----------|-------|
| Stiffness / Tension | 280 |
| Damping / Friction | 24 |
| Mass | 1 |

**Live mode** uses `@react-spring/web` — `useSpring`, `animated.div`
**Remotion mode** uses Remotion's own `spring()` utility — pure function, frame-indexed

### Timeline (Remotion)

```
Frame 0–59:    Idle (panel at rest, sizeMultiplier = 1.0)
Frame 60:      Expand click fires
Frame 62–239:  Expanded state (spring easing, sizeMultiplier rises to ~1.8)
Frame 240:     Collapse click fires
Frame 242–359: Collapse spring easing, sizeMultiplier returns to 1.0
```

`netExpansion = Math.max(0, expandProgress - collapseProgress)`
`sizeMultiplier = 1 + netExpansion * 0.8`

The `isExpanded` boolean passed alongside controls whether the panel content shows the expanded layout.

---

## WebGL Rendering — What Gets Passed Where

The WebGL system runs entirely on the GPU via four GLSL passes. The CPU side (React + TypeScript) computes values and uploads them as uniforms each frame.

### Uniform Categories

**Geometry uniforms** (panel shape, sent to all passes):
- `u_mouse` — panel center in canvas pixels (live: orbital center; render: simulated interval)
- `u_mouseSpring` — smoothed version with velocity for edge calculations
- `u_shapeWidth`, `u_shapeHeight` — single-panel dimensions (used when `u_shapeCount == 0`)
- `u_shapeRadius` — corner radius as 0.0–1.0 percentage
- `u_shapeRoundness` — superellipse exponent (2.0 = rounded rect, 7.0 = near-rectangle)
- `u_mergeRate` — controls smooth union blending between shapes

**Multi-shape orbital uniforms** (used in UI Base interactive mode):
- `u_shapeCount` — number of active orbital panels (0 = single-shape fallback)
- `u_shapePositions[8]` — flat vec2 array of panel centers in device pixels (WebGL Y-up)
- `u_shapeDims[8]` — flat vec2 array of panel dimensions in CSS pixels
- `u_radiusPct` — corner radius percentage applied to all orbital panels

**Blur uniforms** (recomputed when `blurRadius` changes):
- `u_blurRadius` — integer radius in pixels
- `u_blurWeights[201]` — precomputed Gaussian kernel array

**Visual effect uniforms** (from `LiquidGlassSettings`, set in settings sidebar):
- Refraction: `u_refThickness`, `u_refFactor`, `u_refDispersion`
- Fresnel: `u_refFresnelRange`, `u_refFresnelHardness`, `u_refFresnelFactor`
- Glare: `u_glareRange`, `u_glareHardness`, `u_glareFactor`, `u_glareConvergence`, `u_glareOppositeFactor`, `u_glareAngle`
- Shadow: `u_shadowExpand`, `u_shadowFactor` (disabled in orbital mode)
- Tint: `u_tint` (RGBA vec4)

**Environment uniforms**:
- `u_resolution` — canvas pixel dimensions
- `u_dpr` — device pixel ratio (1.0 in Remotion, screen DPR in live)
- `u_bgTexture` — sampler2D for background image (landscape-bg.jpg)
- `u_bgTextureRatio` — image aspect ratio for correct UV mapping
- `u_bgTextureReady` — 0/1 flag; shader draws checkerboard until texture is loaded

---

## Data Sources at Runtime

| Data | UI Base (Live) | Remotion Source |
|------|----------------|-----------------|
| Canvas size | `window.innerWidth` scaled to aspect ratio | `overrideWidth / overrideHeight` (3840×536) |
| Panel positions | `OrbitalSystem.tsx` physics → `orbitalPanelsRef` | Derived from `sizeMultiplier`, centered |
| Panel size | `OrbitalSystem.tsx` (S/M/L) | `sizeMultiplier` from `DashboardComposition.tsx` |
| Mouse uniform | Viewport center (orbital mode) | `setInterval` at 16ms using panel center |
| Visual parameters | Settings sidebar sliders | Hardcoded defaults (`LIQUID_GLASS_DEFAULTS`) |
| Background texture | Async load from `assets/landscape-bg.jpg` | Same — blocked with `delayRender()` until ready |
| Blur kernel | `computeGaussianKernelByRadius(blurRadius)` — runs on CPU | Same |
| DPR | `window.devicePixelRatio` | Always `1.0` |

---

## Settings & Defaults

All visual parameters live in `LIQUID_GLASS_DEFAULTS` inside `App.tsx`. In live mode these are editable via the sidebar. In Remotion render mode the defaults are used as-is — there is no settings panel in render output.

The design system constants (canvas size, grid, spacing, radii) live in `src/config/designSystem.ts` as `DESIGN_SYSTEM_DEFAULTS`. These are consumed by both App and the Remotion composition.

---

## Shader Pipeline — Roles

1. **fragment-bg.glsl** — draws the background (landscape texture), renders a drop shadow using SDF distance from the panel shape
2. **fragment-bg-vblur.glsl** — vertical pass of separable Gaussian blur on the background
3. **fragment-bg-hblur.glsl** — horizontal pass, completes the blur
4. **fragment-main.glsl** — composites everything: samples both blurred and unblurred background, applies refraction (Snell's law), Fresnel edge effect, glare/specular highlight, chromatic aberration (R/G/B UV offsets), tint in LCH color space. Supports both single-shape (legacy) and multi-shape (orbital) rendering via `u_shapeCount`.

The main pass has a `STEP` debug mode (0–9) that exposes intermediate render stages (SDF, normals, refraction stages). In production it runs at step 9 (full composite).

---

## Remotion Render Pipeline Specifics

- **GL backend**: ANGLE (set in `remotion.config.ts`) — uses hardware WebGL2 via Chromium's Angle layer
- **Shader loading**: Webpack `raw-loader` (via `remotion.config.ts`) — loads `.glsl` files as raw strings at build time
- **SCSS**: Compiled with `sass-loader` + `css-loader` + `style-loader` in the webpack config
- **Float textures**: `FrameBuffer` in `GLUtils.ts` detects `EXT_color_buffer_float` support and falls back to `RGBA8` if unavailable (relevant for software renderers)
- **Render blocking**: `delayRender()` is called immediately; `continueRender()` is only called after the background texture loads AND the first WebGL frame renders — prevents blank frames in output video

---

## Timeline Editor

A standalone Vite app (`:5174`) that reads and writes `src/remotion/timeline-data.json` via a custom Vite plugin API.

### Architecture

```
Timeline Editor (:5174)
  GET /api/timeline   → reads  ui-base/src/remotion/timeline-data.json
  POST /api/timeline  → writes ui-base/src/remotion/timeline-data.json

UI Base (:5173)
  GET /timeline-registry.json  → served from public/ (component autocomplete data)

Remotion Studio (:3000)
  Hot-reloads automatically when timeline-data.json changes
```

### Data flow

1. Timeline Editor fetches `timeline-registry.json` from `:5173` → populates component/action autocomplete
2. Timeline Editor fetches current `timeline-data.json` via `GET /api/timeline` → displays rows
3. User edits events (frame numbers, actions, params), clicks Save
4. Timeline Editor `POST /api/timeline` → writes `timeline-data.json` to disk
5. Remotion Studio detects file change → hot-reloads composition → animation updates instantly

### How to run

```bash
# From Liquid Glass Test/
./start-all.sh   # starts all 3 servers and opens Chrome tabs

# Or manually:
cd ui-base && npm run dev              # :5173
cd ui-base && npm run remotion:studio  # :3000
cd timeline-editor && npm run dev      # :5174
```

### How to add new components to the Timeline

See `COMPONENT-CONVENTIONS.md` in `ui-base/`.

---

## What Is NOT Shared Between Modes

- The settings sidebar UI only exists in live mode — no UI controls in Remotion output
- Grid overlay (60px visual grid) renders in live mode only
- Drag interaction, pointer events, keyboard shortcuts (`X` to toggle sidebar) — live only
- Orbital panel system (`OrbitalSystem.tsx`) — live mode only; Remotion uses single-panel `timelineState`
- `leva` package is listed as a dependency but is not used in the current codebase (likely a leftover)

---

## File Structure Reference

```
ui-base/src/
├── App.tsx                        Main component, dual-mode
├── main.tsx                       React entry
├── index.scss                     Global styles
├── App.module.scss                Scoped styles
├── components/
│   └── OrbitalSystem.tsx          8-panel orbital physics + glass hitboxes (live mode)
├── config/
│   └── designSystem.ts            Constants: 3840×536, 60fps, grid, radii
├── utils/
│   ├── GLUtils.ts                 WebGL2 engine (ShaderProgram, FrameBuffer, RenderPass, MultiPassRenderer)
│   └── index.ts                   Gaussian blur kernel math
├── shaders/
│   ├── vertex.glsl                Fullscreen quad vertex
│   ├── fragment-bg.glsl           Pass 1: background + shadow
│   ├── fragment-bg-vblur.glsl     Pass 2: vertical blur
│   ├── fragment-bg-hblur.glsl     Pass 3: horizontal blur
│   └── fragment-main.glsl         Pass 4: glass composite (single + multi-shape)
├── remotion/
│   ├── index.ts                   Remotion registration
│   ├── Root.tsx                   Composition definition
│   ├── DashboardComposition.tsx   Animation timeline
│   ├── timeline-data.json         Source of truth for all animation events
│   └── timeline.ts                TimelineState type
└── assets/
    └── landscape-bg.jpg           Background texture

remotion.config.ts                 ANGLE backend, webpack GLSL/SCSS
vite.config.ts                     Dev server config
```

---

## Key Things to Know Before Making Changes

1. **App.tsx runs in two contexts** — any change to it affects both the live preview and the rendered video. Always test both.
2. **Shader uniforms must stay in sync** — if you add a new visual parameter, you need to: add it to `LiquidGlassSettings`, wire it in App.tsx's settings sidebar, pass it as a uniform in the render loop, and reference it in the appropriate GLSL file.
3. **Remotion spring ≠ React Spring** — the Remotion composition uses Remotion's own `spring()` (a pure function over frame number), not `@react-spring/web`. They share parameters but are different libraries.
4. **Mouse position in shaders is panel center, not cursor** — in Remotion mode there is no real mouse. The shader receives a simulated position derived from the panel's calculated center.
5. **Blur kernel is CPU-side** — the Gaussian weights are computed in TypeScript (`computeGaussianKernelByRadius`) and uploaded as a uniform array. Changing `blurRadius` triggers a full kernel recompute.
6. **The `out/` directory** contains rendered video output — it is gitignored and should not be committed.
7. **`leva` is installed but unused** — do not add it to the UI without discussing first.
8. **Orbital mode vs single-panel mode** — in live mode `u_shapeCount > 0` activates multi-shape shader path. In Remotion mode `u_shapeCount = 0` and the old single-shape path is used.
