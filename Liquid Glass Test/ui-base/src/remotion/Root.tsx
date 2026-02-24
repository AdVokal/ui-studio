import { Composition } from 'remotion';
import { DashboardComposition } from './DashboardComposition';
import { DESIGN_SYSTEM_DEFAULTS } from '../config/designSystem';
import timelineDataJson from './timeline-data.json';
import type { TimelineData } from '../types/timeline';

const timelineData = timelineDataJson as unknown as TimelineData;

export function Root() {
  const { canvasWidth, canvasHeight } = DESIGN_SYSTEM_DEFAULTS;

  return (
    <Composition
      id="Dashboard"
      component={DashboardComposition}
      durationInFrames={timelineData.durationFrames}
      fps={timelineData.fps}
      width={canvasWidth}
      height={canvasHeight}
    />
  );
}
