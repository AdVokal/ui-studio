export interface DesignSystemConfig {
  canvasWidth: number;
  canvasHeight: number;
  framerate: number;
  noGoBorder: number;
  barHeight: number;
  sectionPadding: number;
  columnsPerSection: number;
  baseSpacing: number;
  cornerRadiusSmall: number;
  cornerRadiusMedium: number;
  cornerRadiusLarge: number;
}

export const DESIGN_SYSTEM_DEFAULTS: DesignSystemConfig = {
  canvasWidth: 3840,
  canvasHeight: 536,
  framerate: 60,
  noGoBorder: 18,
  barHeight: 36,
  sectionPadding: 12,
  columnsPerSection: 12,
  baseSpacing: 12,
  cornerRadiusSmall: 3,
  cornerRadiusMedium: 6,
  cornerRadiusLarge: 9,
};
