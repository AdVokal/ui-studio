import { AbsoluteFill, Sequence, continueRender, delayRender, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { useState, useCallback, useMemo } from 'react';
import App from '../App';
import timelineDataJson from './timeline-data.json';
import type { TimelineData, TimelineEvent } from '../types/timeline';

const timelineData = timelineDataJson as unknown as TimelineData;

const DEFAULT_SPRING = { stiffness: 280, damping: 24, mass: 1 };

function getSegments(events: TimelineEvent[], durationFrames: number) {
  const sorted = [...events].sort((a, b) => a.frame - b.frame);
  const segments: { name: string; from: number; duration: number }[] = [];

  if (sorted.length === 0) {
    segments.push({ name: 'Idle', from: 0, duration: durationFrames });
    return segments;
  }

  if (sorted[0].frame > 0) {
    segments.push({ name: 'Idle', from: 0, duration: sorted[0].frame });
  }

  for (let i = 0; i < sorted.length; i++) {
    const evt = sorted[i];
    const nextFrame = i < sorted.length - 1 ? sorted[i + 1].frame : durationFrames;

    segments.push({ name: `↓ Click: ${evt.action}`, from: evt.frame, duration: 2 });

    const stateStart = evt.frame + 2;
    const stateDuration = nextFrame - stateStart;
    if (stateDuration > 0) {
      const stateName = evt.action === 'Expand' ? 'Expanded' : 'Idle';
      segments.push({ name: stateName, from: stateStart, duration: stateDuration });
    }
  }

  return segments;
}

export function DashboardComposition() {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const [handle] = useState(() => delayRender('Loading texture'));
  const onReady = useCallback(() => continueRender(handle), [handle]);

  const frameHandle = useMemo(() => delayRender(`Frame ${frame}`), [frame]);
  const onFrameReady = useCallback(() => continueRender(frameHandle), [frameHandle]);

  const glassEvents = timelineData.events.filter(
    e => e.componentId === 'GlassPanel' && e.frame <= frame
  );

  const expandEvents = glassEvents.filter(e => e.action === 'Expand');
  const collapseEvents = glassEvents.filter(e => e.action === 'Collapse');

  const expandSum = expandEvents.reduce(
    (sum, e) => sum + spring({ fps, frame: frame - e.frame, config: e.spring ?? DEFAULT_SPRING, from: 0, to: 1 }),
    0
  );
  const collapseSum = collapseEvents.reduce(
    (sum, e) => sum + spring({ fps, frame: frame - e.frame, config: e.spring ?? DEFAULT_SPRING, from: 0, to: 1 }),
    0
  );

  const netExpansion = Math.max(0, Math.min(1, expandSum - collapseSum));
  const sizeMultiplier = 1 + netExpansion * 0.8;

  const lastExpandFrame = expandEvents.reduce((max, e) => Math.max(max, e.frame), -1);
  const lastCollapseFrame = collapseEvents.reduce((max, e) => Math.max(max, e.frame), -1);
  const isExpanded = lastExpandFrame > lastCollapseFrame;

  const firedPositionEvents = timelineData.events
    .filter(e => e.componentId === 'GlassPanel' && e.action === 'SetPosition' && e.frame <= frame)
    .sort((a, b) => a.frame - b.frame);

  let panelX: number | undefined;
  let panelY: number | undefined;

  if (firedPositionEvents.length > 0) {
    const latest = firedPositionEvents[firedPositionEvents.length - 1];
    const prev = firedPositionEvents.length > 1 ? firedPositionEvents[firedPositionEvents.length - 2] : null;
    const defaultX = (width - 259) / 2;
    const defaultY = (height - 124) / 2;
    const targetX = Number(latest.params.x ?? defaultX);
    const targetY = Number(latest.params.y ?? defaultY);
    const startX = prev ? Number(prev.params.x ?? defaultX) : defaultX;
    const startY = prev ? Number(prev.params.y ?? defaultY) : defaultY;
    const t = spring({ fps, frame: frame - latest.frame, config: latest.spring ?? DEFAULT_SPRING, from: 0, to: 1 });
    panelX = startX + (targetX - startX) * t;
    panelY = startY + (targetY - startY) * t;
  }

  const segments = getSegments(
    timelineData.events.filter(e => e.componentId === 'GlassPanel'),
    timelineData.durationFrames
  );

  return (
    <AbsoluteFill>
      <App
        timelineState={{ sizeMultiplier, isExpanded, panelX, panelY }}
        overrideWidth={width}
        overrideHeight={height}
        onReady={onReady}
        onFrameReady={onFrameReady}
      />
      {segments.map(seg => (
        <Sequence key={`${seg.name}-${seg.from}`} name={seg.name} from={seg.from} durationInFrames={seg.duration} layout="none">
          <></>
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
