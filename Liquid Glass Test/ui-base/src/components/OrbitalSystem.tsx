import { useEffect, useRef, useState, useCallback } from 'react';

const PANEL_SIZES = [
  { w: 128, h: 61 },
  { w: 180, h: 86 },
  { w: 240, h: 115 },
];

const SIZE_LABELS = ['S', 'M', 'L'];

const STIFFNESS = 0.042;
const DAMPING = 0.76;
const REPULSION = 3.5;
const GAP = 28;
const ORBIT_PAD = 40;

interface Panel {
  id: number;
  order: number;
  sizeIndex: number;
}

interface PhysicsState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface OrbitalPanelRenderData {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

function computeTargets(panels: Panel[], gap: number, orbitPad: number) {
  if (panels.length === 0) return { targets: {} as Record<number, { x: number; y: number; angle: number }>, radius: 180 };
  const sorted = [...panels].sort((a, b) => a.order - b.order);
  const halfDiags = sorted.map(w => {
    const d = PANEL_SIZES[w.sizeIndex];
    return Math.sqrt(d.w * d.w + d.h * d.h) / 2;
  });
  const totalArc = halfDiags.reduce((s, v) => s + v * 2 + gap, 0);
  const radius = Math.max(160, totalArc / (Math.PI * 2) + orbitPad);
  const targets: Record<number, { x: number; y: number; angle: number }> = {};
  let accumulated = -Math.PI / 2;
  sorted.forEach((w, i) => {
    const slotArc = halfDiags[i] * 2 + gap;
    const span = (slotArc / (radius * Math.PI * 2)) * Math.PI * 2;
    const angle = accumulated + span / 2;
    targets[w.id] = { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, angle };
    accumulated += span;
  });
  return { targets, radius };
}

interface OrbitalSystemProps {
  viewportWidth: number;
  viewportHeight: number;
  orbitalPanelsRef: React.MutableRefObject<OrbitalPanelRenderData[]>;
}

export default function OrbitalSystem({ viewportWidth, viewportHeight, orbitalPanelsRef }: OrbitalSystemProps) {
  const panelsRef = useRef<Panel[]>(
    Array.from({ length: 8 }, (_, i) => ({ id: i + 1, order: i, sizeIndex: 1 }))
  );
  const phy = useRef<Record<number, PhysicsState>>({});
  const drag = useRef<{
    id: number;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
    moved: boolean;
  } | null>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const reorderClock = useRef(0);
  const viewportRef = useRef({ width: viewportWidth, height: viewportHeight });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    viewportRef.current = { width: viewportWidth, height: viewportHeight };
  }, [viewportWidth, viewportHeight]);

  useEffect(() => {
    const panels = panelsRef.current;
    const { targets } = computeTargets(panels, GAP, ORBIT_PAD);
    panels.forEach(w => {
      if (!phy.current[w.id]) {
        const t = targets[w.id] ?? { x: 0, y: 0 };
        phy.current[w.id] = { x: 0, y: 0, vx: t.x * 0.15, vy: t.y * 0.15 };
      }
    });
  }, []);

  useEffect(() => {
    let last = performance.now();
    let rafId: number;

    const loop = (now: number) => {
      const dt = Math.min((now - last) / 16.67, 3);
      last = now;

      const panels = panelsRef.current;
      const { targets } = computeTargets(panels, GAP, ORBIT_PAD);

      reorderClock.current = Math.max(0, reorderClock.current - 1);
      if (drag.current?.moved && reorderClock.current === 0) {
        const { id } = drag.current;
        const dp = phy.current[id];
        const dw = panels.find(w => w.id === id);
        if (dp && dw) {
          const dragAngle = Math.atan2(dp.y, dp.x);
          let bestOrder = dw.order;
          let bestDist = Infinity;
          Object.entries(targets).forEach(([tid, t]) => {
            if (Number(tid) === id) return;
            const tw = panels.find(w => w.id === Number(tid));
            if (!tw) return;
            let diff = ((t.angle - dragAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
            diff = Math.abs(diff);
            if (diff < bestDist) { bestDist = diff; bestOrder = tw.order; }
          });
          const threshold = (Math.PI / panels.length) * 0.9;
          if (bestOrder !== dw.order && bestDist < threshold) {
            const swapWith = panels.find(w => w.order === bestOrder && w.id !== id);
            panelsRef.current = panels.map(w => {
              if (w.id === id) return { ...w, order: bestOrder };
              if (swapWith && w.id === swapWith.id) return { ...w, order: dw.order };
              return w;
            });
            reorderClock.current = 20;
          }
        }
      }

      panels.forEach(w => {
        const pp = phy.current[w.id];
        if (!pp) return;
        if (drag.current?.id === w.id) {
          pp.x = mouseRef.current.x;
          pp.y = mouseRef.current.y;
          pp.vx = 0;
          pp.vy = 0;
          return;
        }
        const tgt = targets[w.id];
        if (!tgt) return;
        const dx = tgt.x - pp.x;
        const dy = tgt.y - pp.y;
        pp.vx = (pp.vx + dx * STIFFNESS * dt) * Math.pow(DAMPING, dt);
        pp.vy = (pp.vy + dy * STIFFNESS * dt) * Math.pow(DAMPING, dt);
        pp.x += pp.vx;
        pp.y += pp.vy;
      });

      for (let i = 0; i < panels.length; i++) {
        for (let j = i + 1; j < panels.length; j++) {
          const pi = phy.current[panels[i].id];
          const pj = phy.current[panels[j].id];
          if (!pi || !pj) continue;
          const di = PANEL_SIZES[panels[i].sizeIndex];
          const dj = PANEL_SIZES[panels[j].sizeIndex];
          const dx = pi.x - pj.x;
          const dy = pi.y - pj.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
          const ri = Math.sqrt(di.w * di.w + di.h * di.h) / 2;
          const rj = Math.sqrt(dj.w * dj.w + dj.h * dj.h) / 2;
          const minDist = ri + rj + GAP * 0.5;
          if (dist < minDist) {
            const force = ((minDist - dist) / minDist) * REPULSION * dt;
            const nx = dx / dist;
            const ny = dy / dist;
            if (drag.current?.id !== panels[i].id) { pi.vx += nx * force; pi.vy += ny * force; }
            if (drag.current?.id !== panels[j].id) { pj.vx -= nx * force; pj.vy -= ny * force; }
          }
        }
      }

      const vw = viewportRef.current.width;
      const vh = viewportRef.current.height;
      orbitalPanelsRef.current = panelsRef.current.map(w => {
        const p = phy.current[w.id];
        const dims = PANEL_SIZES[w.sizeIndex];
        return {
          cx: vw / 2 + (p?.x ?? 0),
          cy: vh / 2 + (p?.y ?? 0),
          w: dims.w,
          h: dims.h,
        };
      });

      setTick(t => t + 1);
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [orbitalPanelsRef]);

  const onPanelPointerDown = useCallback((id: number, e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType !== 'touch') return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const pp = phy.current[id] ?? { x: 0, y: 0 };
    drag.current = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: pp.x,
      offsetY: pp.y,
      moved: false,
    };
    mouseRef.current = { x: pp.x, y: pp.y };
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.startX;
    const dy = e.clientY - drag.current.startY;
    if (Math.hypot(dx, dy) > 5) drag.current.moved = true;
    mouseRef.current = { x: drag.current.offsetX + dx, y: drag.current.offsetY + dy };
  }, []);

  const onPointerUp = useCallback((_e: React.PointerEvent) => {
    if (!drag.current) return;
    const { id, moved } = drag.current;
    drag.current = null;
    if (!moved) {
      const panels = panelsRef.current;
      const clicked = panels.find(w => w.id === id);
      panelsRef.current = panels.map(w =>
        w.id === id ? { ...w, sizeIndex: (w.sizeIndex + 1) % PANEL_SIZES.length } : w
      );
      panels.forEach(w => {
        if (w.id === id) return;
        const p = phy.current[w.id];
        if (!p) return;
        const ang = Math.atan2(p.y, p.x);
        const str = 2.5 + (clicked?.sizeIndex ?? 1) * 0.6;
        p.vx += Math.cos(ang) * str;
        p.vy += Math.sin(ang) * str;
      });
    }
    setTick(t => t + 1);
  }, []);

  const vw = viewportWidth;
  const vh = viewportHeight;

  return (
    <div
      style={{ position: 'absolute', left: 0, top: 0, width: vw, height: vh, pointerEvents: 'none' }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {panelsRef.current.map(w => {
        const p = phy.current[w.id];
        if (!p) return null;
        const dims = PANEL_SIZES[w.sizeIndex];
        const isDragging = drag.current?.id === w.id;
        return (
          <div
            key={w.id}
            style={{
              position: 'absolute',
              left: vw / 2 + p.x - dims.w / 2,
              top: vh / 2 + p.y - dims.h / 2,
              width: dims.w,
              height: dims.h,
              cursor: isDragging ? 'grabbing' : 'grab',
              pointerEvents: 'all',
              transition: isDragging ? 'none' : 'width 0.6s cubic-bezier(0.34,1.45,0.64,1), height 0.6s cubic-bezier(0.34,1.45,0.64,1)',
              borderRadius: dims.h * 0.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              userSelect: 'none',
            }}
            onPointerDown={e => onPanelPointerDown(w.id, e)}
          >
            <span style={{
              fontFamily: 'monospace',
              fontSize: '9px',
              letterSpacing: '0.16em',
              color: 'rgba(255,255,255,0.3)',
              pointerEvents: 'none',
            }}>
              {SIZE_LABELS[w.sizeIndex]}
            </span>
          </div>
        );
      })}
      {tick < 0 && null}
    </div>
  );
}
