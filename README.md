# UI Studio

A WebGL2-based liquid glass UI component system with a JSON-driven animation timeline. Built with React, Vite, and Remotion. Supports interactive real-time preview, frame-accurate video rendering at 3840×536 @ 60fps, and a standalone Timeline Editor for authoring animations without touching code.

---

## Three Apps

| App | Port | Purpose |
|-----|------|---------|
| **UI Base** (Vite) | `:5173` | Interactive live preview — drag, click, tweak visual params |
| **Remotion Studio** | `:3000` | Frame-accurate animation playback and video render |
| **Timeline Editor** | `:5174` | Spreadsheet UI for editing animation events in `timeline-data.json` |

---

## Startup & Shutdown

### One command (recommended)

```bash
# From Liquid Glass Test/
./start-all.sh
```

Starts all three apps and opens them in Chrome. To stop everything:

```bash
./stop-all.sh
```

### Manual startup

```bash
# UI Base — interactive preview
cd ui-base
npm install
npm run dev

# Remotion Studio — animation timeline
npm run remotion:studio

# Timeline Editor
cd timeline-editor
npm install
npm run dev
```

---

## Timeline Editor

The Timeline Editor at `:5174` is the main tool for authoring animations. It reads and writes `ui-base/src/remotion/timeline-data.json` directly — no code changes needed to update animation timing.

### What it does

- Lists all animation events as editable rows
- Edit frame numbers or timecodes (HH:MM:SS:FF) — both stay in sync
- Component and action dropdowns are populated from `timeline-registry.json` (fetched from `:5173`)
- Param fields render automatically based on the action's definition
- Drag rows to reorder
- Right-click any row for Insert / Delete
- Ctrl+Z / Ctrl+Y for undo/redo (50-step history)
- Ctrl+S or the Save button writes the file — Remotion Studio hot-reloads instantly

### How animation events work

All animation events live in `src/remotion/timeline-data.json`:

```json
{
  "fps": 60,
  "durationFrames": 360,
  "events": [
    { "id": "evt-001", "frame": 60, "componentId": "GlassPanel", "action": "Expand", "params": {} },
    { "id": "evt-002", "frame": 240, "componentId": "GlassPanel", "action": "Collapse", "params": {} }
  ]
}
```

Each event triggers a spring animation at its frame. Expand and Collapse events accumulate as a signed sum — this means re-expansion after collapse works correctly for any number of events in any order.

### Adding new components

See `ui-base/COMPONENT-CONVENTIONS.md`.

---

## Rendering to Video

```bash
cd ui-base
npm run remotion:render
```

Renders `Dashboard` composition to `~/Desktop/dashboard.mp4`.

- Resolution: 3840 × 536
- Frame rate: 60fps
- GL backend: ANGLE (hardware WebGL2 via Chromium)

---

## Tech Stack

- **React 19** — UI and state
- **Vite 6** — Dev server and bundler
- **Remotion 4** — Frame-accurate video rendering
- **WebGL2** — Custom multi-pass GLSL rendering pipeline
- **React Spring** — Spring animation for live mode
- **TypeScript** — Strict mode throughout
- **SCSS Modules** — Scoped component styles

---

## Project Structure

```
Liquid Glass Test/
├── ui-base/                      UI Base (Vite :5173) + Remotion (:3000)
│   ├── public/
│   │   └── timeline-registry.json      component/action definitions for autocomplete
│   ├── src/
│   │   ├── remotion/
│   │   │   ├── timeline-data.json      source of truth for all animation events
│   │   │   ├── DashboardComposition.tsx
│   │   │   └── Root.tsx
│   │   ├── types/
│   │   │   └── timeline.ts             shared TypeScript types
│   │   └── ...
│   └── COMPONENT-CONVENTIONS.md
├── timeline-editor/              Timeline Editor (:5174)
│   └── src/
│       ├── App.tsx               state, undo/redo, save
│       ├── components/
│       │   ├── Toolbar.tsx
│       │   ├── FrameRuler.tsx
│       │   └── TimelineTable.tsx
│       └── lib/
│           ├── types.ts
│           └── utils.ts          frameToTimecode, timecodeToFrame, generateId
├── start-all.sh
└── stop-all.sh
```

---

## WebGL Rendering Pipeline

```
Pass 1: fragment-bg.glsl       → background texture + SDF shadow → FBO A
Pass 2: fragment-bg-vblur.glsl → vertical Gaussian blur          → FBO B
Pass 3: fragment-bg-hblur.glsl → horizontal Gaussian blur        → FBO C
Pass 4: fragment-main.glsl     → glass composite (refraction, Fresnel, glare, tint, chromatic aberration)
```

---

## npm Scripts (ui-base)

```bash
npm run dev              # Vite dev server :5173
npm run remotion:studio  # Remotion Studio :3000
npm run remotion:render  # Render to ~/Desktop/dashboard.mp4
npm run build            # Production build
npm run lint             # ESLint
```
