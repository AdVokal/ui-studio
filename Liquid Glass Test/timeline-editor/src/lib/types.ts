export interface SpringConfig {
  stiffness: number;
  damping: number;
  mass: number;
}

export interface TimelineRow {
  id: string;
  frame: number;
  componentId: string;
  action: string;
  params: Record<string, number | string | boolean>;
  spring?: SpringConfig;
  _isNew?: boolean;
}

export interface TimelineData {
  version: number;
  fps: number;
  durationFrames: number;
  canvas?: { width: number; height: number };
  events: Array<{
    id: string;
    frame: number;
    componentId: string;
    action: string;
    params: Record<string, number | string | boolean>;
    spring?: SpringConfig;
  }>;
}

export interface ParamDef {
  id: string;
  label: string;
  type: 'number' | 'boolean' | 'string';
  default: number | boolean | string;
  min?: number;
  max?: number;
}

export interface ActionDef {
  id: string;
  label: string;
  params: ParamDef[];
}

export interface ComponentMeta {
  id: string;
  displayName: string;
  defaultSize?: { width: number; height: number };
  actions: ActionDef[];
}

export interface ComponentRegistry {
  version: number;
  components: ComponentMeta[];
}
