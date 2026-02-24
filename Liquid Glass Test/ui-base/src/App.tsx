import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import styles from './App.module.scss';
import {
  loadTextureFromURL,
  MultiPassRenderer,
} from './utils/GLUtils';
import { useSpring, animated, useSpringRef } from '@react-spring/web';

import VertexShader from './shaders/vertex.glsl?raw';
import FragmentBgShader from './shaders/fragment-bg.glsl?raw';
import FragmentBgVblurShader from './shaders/fragment-bg-vblur.glsl?raw';
import FragmentBgHblurShader from './shaders/fragment-bg-hblur.glsl?raw';
import FragmentMainShader from './shaders/fragment-main.glsl?raw';
import { Controller } from '@react-spring/web';
import OrbitalSystem, { type OrbitalPanelRenderData } from './components/OrbitalSystem';

import { computeGaussianKernelByRadius } from './utils';
import landscapeBg from '@/assets/landscape-bg.jpg';
import { DESIGN_SYSTEM_DEFAULTS, type DesignSystemConfig } from './config/designSystem';

const ASPECT_RATIO = 3840 / 536;
const GRID_SIZE = 60;

export interface TimelineState {
  sizeMultiplier: number;
  isExpanded: boolean;
  panelX?: number;
  panelY?: number;
}

export interface LiquidGlassSettings {
  width: number;
  height: number;
  radius: number;
  roundness: number;
  blurRadius: number;
  refThickness: number;
  refFactor: number;
  refDispersion: number;
  refFresnelRange: number;
  refFresnelHardness: number;
  refFresnelFactor: number;
  glareRange: number;
  glareHardness: number;
  glareFactor: number;
  glareConvergence: number;
  glareOppositeFactor: number;
  glareAngle: number;
  shadowExpand: number;
  shadowFactor: number;
  tintR: number;
  tintG: number;
  tintB: number;
  tintA: number;
}

export const LIQUID_GLASS_DEFAULTS: LiquidGlassSettings = {
  width: 259,
  height: 124,
  radius: 100,
  roundness: 3.2,
  blurRadius: 22,
  refThickness: 39,
  refFactor: 1.2,
  refDispersion: 28,
  refFresnelRange: 20,
  refFresnelHardness: 47,
  refFresnelFactor: 35,
  glareRange: 27,
  glareHardness: 10,
  glareFactor: 110,
  glareConvergence: 91,
  glareOppositeFactor: 100,
  glareAngle: 46,
  shadowExpand: 37,
  shadowFactor: 0,
  tintR: 255,
  tintG: 255,
  tintB: 255,
  tintA: 0,
};

function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

interface AppProps {
  timelineState?: TimelineState;
  overrideWidth?: number;
  overrideHeight?: number;
  onReady?: () => void;
  onFrameReady?: () => void;
}

function App({ timelineState, overrideWidth, overrideHeight, onReady, onFrameReady }: AppProps = {}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<MultiPassRenderer | null>(null);
  const renderRef = useRef<(() => void) | null>(null);
  const orbitalPanelsRef = useRef<OrbitalPanelRenderData[]>([]);
  const timelineModeRef = useRef(!!timelineState);
  timelineModeRef.current = !!timelineState;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const onFrameReadyRef = useRef(onFrameReady);
  onFrameReadyRef.current = onFrameReady;

  const [viewportSize, setViewportSize] = useState(() => {
    if (overrideWidth && overrideHeight) {
      return { width: overrideWidth, height: overrideHeight };
    }
    return { width: window.innerWidth, height: window.innerWidth / ASPECT_RATIO };
  });

  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<LiquidGlassSettings>({ ...LIQUID_GLASS_DEFAULTS });
  const [designSystem, setDesignSystem] = useState<DesignSystemConfig>({ ...DESIGN_SYSTEM_DEFAULTS });
  const [isExpanded, setIsExpanded] = useState(false);

  const effectiveIsExpanded = timelineState?.isExpanded ?? isExpanded;

  const baseSize = useMemo(() => ({
    width: settings.width,
    height: settings.height,
  }), [settings.width, settings.height]);

  const expandedSize = useMemo(() => ({
    width: Math.round(settings.width * 1.8),
    height: Math.round(settings.height * 1.8),
  }), [settings.width, settings.height]);

  const targetWidth = effectiveIsExpanded ? expandedSize.width : baseSize.width;
  const targetHeight = effectiveIsExpanded ? expandedSize.height : baseSize.height;

  const timelinePanelWidth = timelineState
    ? Math.round(settings.width * timelineState.sizeMultiplier)
    : targetWidth;
  const timelinePanelHeight = timelineState
    ? Math.round(settings.height * timelineState.sizeMultiplier)
    : targetHeight;

  const posRef = useSpringRef<{ x: number; y: number }>();
  const posSpring = useSpring({
    ref: posRef,
    from: { x: GRID_SIZE * 2, y: GRID_SIZE },
    config: { tension: 280, friction: 24 },
  });

  const sizeSpring = useSpring({
    width: targetWidth,
    height: targetHeight,
    config: { tension: 280, friction: 24 },
  });

  const dragState = useRef({
    isDragging: false,
    startX: 0,
    startY: 0,
    startPanelX: 0,
    startPanelY: 0,
    hasMoved: false,
  });

  const committedPos = useRef({ x: GRID_SIZE * 2, y: GRID_SIZE });

  const stateRef = useRef<{
    canvasInfo: { width: number; height: number; dpr: number };
    blurWeights: number[];
    mouseSpring: Controller<{ x: number; y: number }>;
    mouseSpringSpeed: { x: number; y: number };
    lastMouseSpringValue: { x: number; y: number };
    lastMouseSpringTime: number | null;
    bgTexture: WebGLTexture | null;
    bgTextureRatio: number;
    bgTextureReady: boolean;
    panelPos: { x: number; y: number };
    panelSize: { width: number; height: number };
    settings: LiquidGlassSettings;
  }>({
    canvasInfo: {
      width: overrideWidth ?? window.innerWidth,
      height: overrideHeight ?? (window.innerWidth / ASPECT_RATIO),
      dpr: window.devicePixelRatio,
    },
    blurWeights: computeGaussianKernelByRadius(LIQUID_GLASS_DEFAULTS.blurRadius),
    mouseSpring: new Controller({
      x: (overrideWidth ?? window.innerWidth) / 2,
      y: (overrideHeight ?? (window.innerWidth / ASPECT_RATIO)) / 2,
      onChange: (c) => {
        if (!stateRef.current.lastMouseSpringTime) {
          stateRef.current.lastMouseSpringTime = Date.now();
          stateRef.current.lastMouseSpringValue = c.value;
          return;
        }
        const now = Date.now();
        const lastValue = stateRef.current.lastMouseSpringValue;
        const dt = Math.max(now - stateRef.current.lastMouseSpringTime, 1);
        const speed = {
          x: (c.value.x - lastValue.x) / dt,
          y: (c.value.y - lastValue.y) / dt,
        };
        if (Math.abs(speed.x) > 1e10 || Math.abs(speed.y) > 1e10) {
          speed.x = 0;
          speed.y = 0;
        }
        stateRef.current.mouseSpringSpeed = speed;
        stateRef.current.lastMouseSpringValue = c.value;
        stateRef.current.lastMouseSpringTime = now;
      },
    }),
    mouseSpringSpeed: { x: 0, y: 0 },
    lastMouseSpringValue: { x: 0, y: 0 },
    lastMouseSpringTime: null,
    bgTexture: null,
    bgTextureRatio: 1,
    bgTextureReady: false,
    panelPos: { x: GRID_SIZE * 2, y: GRID_SIZE },
    panelSize: { width: LIQUID_GLASS_DEFAULTS.width, height: LIQUID_GLASS_DEFAULTS.height },
    settings: { ...LIQUID_GLASS_DEFAULTS },
  });

  useEffect(() => {
    stateRef.current.settings = settings;
    stateRef.current.blurWeights = computeGaussianKernelByRadius(settings.blurRadius);
  }, [settings]);

  useLayoutEffect(() => {
    if (!timelineState) return;
    const w = Math.round(settings.width * timelineState.sizeMultiplier);
    const h = Math.round(settings.height * timelineState.sizeMultiplier);
    const x = timelineState.panelX !== undefined ? timelineState.panelX : (viewportSize.width - w) / 2;
    const y = timelineState.panelY !== undefined ? timelineState.panelY : (viewportSize.height - h) / 2;
    stateRef.current.panelPos = { x, y };
    stateRef.current.panelSize = { width: w, height: h };
    renderRef.current?.();
    onFrameReadyRef.current?.();
  }, [timelineState, settings.width, settings.height, viewportSize]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'x' || e.key === 'X') {
        setShowSettings(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useLayoutEffect(() => {
    if (overrideWidth && overrideHeight) {
      setViewportSize({ width: overrideWidth, height: overrideHeight });
      stateRef.current.canvasInfo = { width: overrideWidth, height: overrideHeight, dpr: window.devicePixelRatio };
      return;
    }
    const updateSize = () => {
      const width = window.innerWidth;
      const height = width / ASPECT_RATIO;
      setViewportSize({ width, height });
      stateRef.current.canvasInfo = { width, height, dpr: window.devicePixelRatio };
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [overrideWidth, overrideHeight]);

  useLayoutEffect(() => {
    if (!canvasRef.current) return;
    const dpr = window.devicePixelRatio;
    canvasRef.current.width = viewportSize.width * dpr;
    canvasRef.current.height = viewportSize.height * dpr;
  }, [viewportSize]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragState.current = {
      isDragging: true,
      startX: e.clientX,
      startY: e.clientY,
      startPanelX: committedPos.current.x,
      startPanelY: committedPos.current.y,
      hasMoved: false,
    };
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragState.current.isDragging) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      dragState.current.hasMoved = true;
    }
    if (!dragState.current.hasMoved) return;
    const newX = dragState.current.startPanelX + dx;
    const newY = dragState.current.startPanelY + dy;
    posRef.start({ x: newX, y: newY, immediate: true });
  }, [posRef]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragState.current.isDragging) return;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    const currentX = posSpring.x.get();
    const currentY = posSpring.y.get();
    const currentWidth = sizeSpring.width.get();
    const currentHeight = sizeSpring.height.get();
    const wasDrag = dragState.current.hasMoved;
    dragState.current.isDragging = false;
    dragState.current.hasMoved = false;
    if (wasDrag) {
      const snappedX = snapToGrid(currentX, GRID_SIZE);
      const snappedY = snapToGrid(currentY, GRID_SIZE);
      const clampedX = Math.max(0, Math.min(snappedX, viewportSize.width - currentWidth));
      const clampedY = Math.max(0, Math.min(snappedY, viewportSize.height - currentHeight));
      committedPos.current = { x: clampedX, y: clampedY };
      posRef.start({ x: clampedX, y: clampedY });
    } else {
      setIsExpanded(prev => !prev);
    }
  }, [posRef, posSpring, sizeSpring, viewportSize]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!timelineState) {
        stateRef.current.panelPos = { x: posSpring.x.get(), y: posSpring.y.get() };
        stateRef.current.panelSize = { width: sizeSpring.width.get(), height: sizeSpring.height.get() };
      }
      const cInfo = stateRef.current.canvasInfo;
      const { panelPos, panelSize } = stateRef.current;
      const centerX = (panelPos.x + panelSize.width / 2) * cInfo.dpr;
      const centerY = (cInfo.height - panelPos.y - panelSize.height / 2) * cInfo.dpr;
      stateRef.current.mouseSpring.start({ x: centerX, y: centerY, immediate: timelineModeRef.current });
    }, 16);
    return () => clearInterval(interval);
  }, [posSpring, sizeSpring, timelineState]);

  useEffect(() => {
    if (!canvasRef.current) return;

    let renderer: MultiPassRenderer;
    try {
      renderer = new MultiPassRenderer(canvasRef.current, [
        { name: 'bgPass', shader: { vertex: VertexShader, fragment: FragmentBgShader } },
        { name: 'vBlurPass', shader: { vertex: VertexShader, fragment: FragmentBgVblurShader }, inputs: { u_prevPassTexture: 'bgPass' } },
        { name: 'hBlurPass', shader: { vertex: VertexShader, fragment: FragmentBgHblurShader }, inputs: { u_prevPassTexture: 'vBlurPass' } },
        { name: 'mainPass', shader: { vertex: VertexShader, fragment: FragmentMainShader }, inputs: { u_blurredBg: 'hBlurPass', u_bg: 'bgPass' }, outputToScreen: true },
      ], { preserveDrawingBuffer: true });
    } catch {
      onReadyRef.current?.();
      return;
    }
    rendererRef.current = renderer;
    const gl = renderer.getGL();

    const doRender = () => {
      const cInfo = stateRef.current.canvasInfo;
      const s = stateRef.current.settings;
      const orbs = orbitalPanelsRef.current;
      const isOrbital = orbs.length > 0;

      gl.viewport(0, 0, Math.round(cInfo.width * cInfo.dpr), Math.round(cInfo.height * cInfo.dpr));
      renderer.resize(cInfo.width * cInfo.dpr, cInfo.height * cInfo.dpr);

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      let mouseX: number, mouseY: number, shapeW: number, shapeH: number, shapeR: number;

      if (isOrbital) {
        mouseX = (cInfo.width * cInfo.dpr) / 2;
        mouseY = (cInfo.height * cInfo.dpr) / 2;
        shapeW = s.width;
        shapeH = s.height;
        shapeR = (Math.min(s.width, s.height) / 2) * (s.radius / 100);
      } else {
        const pPos = stateRef.current.panelPos;
        const pSize = stateRef.current.panelSize;
        mouseX = (pPos.x + pSize.width / 2) * cInfo.dpr;
        mouseY = (cInfo.height - pPos.y - pSize.height / 2) * cInfo.dpr;
        const springSizeFactor = 8;
        shapeW = pSize.width + Math.abs(stateRef.current.mouseSpringSpeed.x) * pSize.width * springSizeFactor / 100;
        shapeH = pSize.height + Math.abs(stateRef.current.mouseSpringSpeed.y) * pSize.height * springSizeFactor / 100;
        shapeR = (Math.min(shapeW, shapeH) / 2) * (s.radius / 100);
      }

      const globalUniforms: Record<string, unknown> = {
        u_resolution: [cInfo.width * cInfo.dpr, cInfo.height * cInfo.dpr],
        u_dpr: cInfo.dpr,
        u_blurWeights: stateRef.current.blurWeights,
        u_blurRadius: s.blurRadius,
        u_mouse: [mouseX, mouseY],
        u_mouseSpring: [mouseX, mouseY],
        u_shapeWidth: shapeW,
        u_shapeHeight: shapeH,
        u_shapeRadius: shapeR,
        u_shapeRoundness: s.roundness,
        u_mergeRate: 0.03,
        u_glareAngle: (s.glareAngle * Math.PI) / 180,
        u_showShape1: 0,
        u_shapeCount: isOrbital ? orbs.length : 0,
        u_radiusPct: s.radius / 100,
      };

      if (isOrbital) {
        const positions: number[] = [];
        const dims: number[] = [];
        for (const orb of orbs) {
          positions.push(orb.cx * cInfo.dpr, (cInfo.height - orb.cy) * cInfo.dpr);
          dims.push(orb.w, orb.h);
        }
        globalUniforms.u_shapePositions = positions;
        globalUniforms.u_shapeDims = dims;
      }

      renderer.setUniforms(globalUniforms);

      renderer.render({
        bgPass: {
          u_bgType: 3,
          u_bgTexture: stateRef.current.bgTexture ?? undefined,
          u_bgTextureRatio: stateRef.current.bgTexture ? stateRef.current.bgTextureRatio : undefined,
          u_bgTextureReady: stateRef.current.bgTextureReady ? 1 : 0,
          u_shadowExpand: s.shadowExpand,
          u_shadowFactor: isOrbital ? 0 : s.shadowFactor / 100,
          u_shadowPosition: isOrbital ? [0, 0] : [0, 12],
        },
        mainPass: {
          u_tint: [s.tintR / 255, s.tintG / 255, s.tintB / 255, s.tintA / 100],
          u_refThickness: s.refThickness,
          u_refFactor: s.refFactor,
          u_refDispersion: s.refDispersion,
          u_refFresnelRange: s.refFresnelRange,
          u_refFresnelHardness: s.refFresnelHardness / 100,
          u_refFresnelFactor: s.refFresnelFactor / 100,
          u_glareRange: s.glareRange,
          u_glareHardness: s.glareHardness / 100,
          u_glareConvergence: s.glareConvergence / 100,
          u_glareOppositeFactor: s.glareOppositeFactor / 100,
          u_glareFactor: s.glareFactor / 100,
          u_blurEdge: 1,
          STEP: 9,
        },
      });

      gl.finish();
    };

    renderRef.current = doRender;

    loadTextureFromURL(gl, landscapeBg)
      .then(({ texture, ratio }) => {
        stateRef.current.bgTexture = texture;
        stateRef.current.bgTextureRatio = ratio;
        stateRef.current.bgTextureReady = true;
        doRender();
        onReadyRef.current?.();
      })
      .catch(() => {
        onReadyRef.current?.();
      });

    let raf: number;
    const rafLoop = () => {
      raf = requestAnimationFrame(rafLoop);
      if (!timelineModeRef.current) doRender();
    };
    raf = requestAnimationFrame(rafLoop);

    return () => {
      cancelAnimationFrame(raf);
      renderRef.current = null;
      renderer.dispose();
    };
  }, []);

  const updateSetting = useCallback(<K extends keyof LiquidGlassSettings>(key: K, value: LiquidGlassSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  }, []);

  const updateDesignSystem = useCallback(<K extends keyof DesignSystemConfig>(key: K, value: DesignSystemConfig[K]) => {
    setDesignSystem(prev => ({ ...prev, [key]: value }));
  }, []);

  const gridLines = useMemo(() => {
    const lines = [];
    const cols = Math.ceil(viewportSize.width / GRID_SIZE) + 1;
    const rows = Math.ceil(viewportSize.height / GRID_SIZE) + 1;
    for (let i = 0; i < cols; i++) {
      lines.push(<div key={`v-${i}`} className={styles.gridLineVertical} style={{ left: i * GRID_SIZE }} />);
    }
    for (let i = 0; i < rows; i++) {
      lines.push(<div key={`h-${i}`} className={styles.gridLineHorizontal} style={{ top: i * GRID_SIZE }} />);
    }
    return lines;
  }, [viewportSize]);

  const centeredX = timelineState?.panelX !== undefined ? timelineState.panelX : (viewportSize.width - timelinePanelWidth) / 2;
  const centeredY = timelineState?.panelY !== undefined ? timelineState.panelY : (viewportSize.height - timelinePanelHeight) / 2;

  return (
    <div
      className={styles.viewport}
      style={overrideWidth ? { width: overrideWidth, height: overrideHeight } : undefined}
    >
      <div
        ref={containerRef}
        className={styles.container}
        style={{ width: viewportSize.width, height: viewportSize.height }}
      >
        <div className={styles.grid}>{gridLines}</div>

        <canvas
          ref={canvasRef}
          className={styles.canvas}
          style={{ width: viewportSize.width, height: viewportSize.height }}
        />

        {!timelineState && (
          <OrbitalSystem
            viewportWidth={viewportSize.width}
            viewportHeight={viewportSize.height}
            orbitalPanelsRef={orbitalPanelsRef}
          />
        )}

        {timelineState && (
          <div
            className={styles.panelOverlay}
            style={{ left: centeredX, top: centeredY, width: timelinePanelWidth, height: timelinePanelHeight }}
          >
            <div className={styles.panelContent}>
              <div className={styles.panelLabel}>{effectiveIsExpanded ? 'Click to Shrink' : 'Click to Expand'}</div>
              <div className={styles.panelHint}>Drag to move • Snaps to grid</div>
            </div>
          </div>
        )}

        <div className={styles.info}>
          <span>Liquid Glass Panel</span>
          <span className={styles.infoDim}>{viewportSize.width.toFixed(0)} × {viewportSize.height.toFixed(0)}</span>
          <span className={styles.infoDim}>Press X for settings</span>
        </div>
      </div>

      <div className={`${styles.settingsPanel} ${showSettings ? styles.settingsPanelVisible : ''}`}>
        <div className={styles.settingsHeader}>
          <span>Settings</span>
          <button onClick={() => setShowSettings(false)}>×</button>
        </div>
        <div className={styles.settingsContent}>
          <div className={styles.settingsSection}>
            <h4>Canvas / Output</h4>
            <label>Width: {designSystem.canvasWidth}px<input type="range" min="960" max="3840" step="480" value={designSystem.canvasWidth} onChange={e => updateDesignSystem('canvasWidth', +e.target.value)} /></label>
            <label>Height: {designSystem.canvasHeight}px<input type="range" min="268" max="1080" step="67" value={designSystem.canvasHeight} onChange={e => updateDesignSystem('canvasHeight', +e.target.value)} /></label>
            <label>Framerate: {designSystem.framerate}fps<input type="range" min="24" max="60" step="6" value={designSystem.framerate} onChange={e => updateDesignSystem('framerate', +e.target.value)} /></label>
          </div>
          <div className={styles.settingsSection}>
            <h4>Layout</h4>
            <label>No-Go Border: {designSystem.noGoBorder}px<input type="range" min="0" max="48" step="3" value={designSystem.noGoBorder} onChange={e => updateDesignSystem('noGoBorder', +e.target.value)} /></label>
            <label>Bar Height: {designSystem.barHeight}px<input type="range" min="24" max="72" step="3" value={designSystem.barHeight} onChange={e => updateDesignSystem('barHeight', +e.target.value)} /></label>
            <label>Section Padding: {designSystem.sectionPadding}px<input type="range" min="0" max="36" step="3" value={designSystem.sectionPadding} onChange={e => updateDesignSystem('sectionPadding', +e.target.value)} /></label>
          </div>
          <div className={styles.settingsSection}>
            <h4>Grid</h4>
            <label>Columns/Section: {designSystem.columnsPerSection}<input type="range" min="4" max="16" step="2" value={designSystem.columnsPerSection} onChange={e => updateDesignSystem('columnsPerSection', +e.target.value)} /></label>
            <label>Base Spacing: {designSystem.baseSpacing}px<input type="range" min="3" max="24" step="3" value={designSystem.baseSpacing} onChange={e => updateDesignSystem('baseSpacing', +e.target.value)} /></label>
          </div>
          <div className={styles.settingsSection}>
            <h4>Corner Radius</h4>
            <label>Small (btns): {designSystem.cornerRadiusSmall}px<input type="range" min="0" max="12" step="1" value={designSystem.cornerRadiusSmall} onChange={e => updateDesignSystem('cornerRadiusSmall', +e.target.value)} /></label>
            <label>Medium (cards): {designSystem.cornerRadiusMedium}px<input type="range" min="0" max="18" step="1" value={designSystem.cornerRadiusMedium} onChange={e => updateDesignSystem('cornerRadiusMedium', +e.target.value)} /></label>
            <label>Large (panels): {designSystem.cornerRadiusLarge}px<input type="range" min="0" max="24" step="1" value={designSystem.cornerRadiusLarge} onChange={e => updateDesignSystem('cornerRadiusLarge', +e.target.value)} /></label>
          </div>
          <div className={styles.settingsDivider} />
          <div className={styles.settingsSection}>
            <h4>Panel Size</h4>
            <label>Width: {settings.width}<input type="range" min="100" max="600" value={settings.width} onChange={e => updateSetting('width', +e.target.value)} /></label>
            <label>Height: {settings.height}<input type="range" min="80" max="400" value={settings.height} onChange={e => updateSetting('height', +e.target.value)} /></label>
            <label>Radius: {settings.radius}%<input type="range" min="0" max="100" value={settings.radius} onChange={e => updateSetting('radius', +e.target.value)} /></label>
            <label>Roundness: {settings.roundness}<input type="range" min="2" max="7" step="0.1" value={settings.roundness} onChange={e => updateSetting('roundness', +e.target.value)} /></label>
          </div>
          <div className={styles.settingsSection}>
            <h4>Blur</h4>
            <label>Blur Radius: {settings.blurRadius}<input type="range" min="1" max="100" value={settings.blurRadius} onChange={e => updateSetting('blurRadius', +e.target.value)} /></label>
          </div>
          <div className={styles.settingsSection}>
            <h4>Refraction</h4>
            <label>Thickness: {settings.refThickness}<input type="range" min="1" max="80" value={settings.refThickness} onChange={e => updateSetting('refThickness', +e.target.value)} /></label>
            <label>Factor: {settings.refFactor}<input type="range" min="1" max="4" step="0.1" value={settings.refFactor} onChange={e => updateSetting('refFactor', +e.target.value)} /></label>
            <label>Dispersion: {settings.refDispersion}<input type="range" min="0" max="50" value={settings.refDispersion} onChange={e => updateSetting('refDispersion', +e.target.value)} /></label>
          </div>
          <div className={styles.settingsSection}>
            <h4>Fresnel</h4>
            <label>Range: {settings.refFresnelRange}<input type="range" min="0" max="100" value={settings.refFresnelRange} onChange={e => updateSetting('refFresnelRange', +e.target.value)} /></label>
            <label>Hardness: {settings.refFresnelHardness}%<input type="range" min="0" max="100" value={settings.refFresnelHardness} onChange={e => updateSetting('refFresnelHardness', +e.target.value)} /></label>
            <label>Factor: {settings.refFresnelFactor}%<input type="range" min="0" max="100" value={settings.refFresnelFactor} onChange={e => updateSetting('refFresnelFactor', +e.target.value)} /></label>
          </div>
          <div className={styles.settingsSection}>
            <h4>Glare</h4>
            <label>Range: {settings.glareRange}<input type="range" min="0" max="100" value={settings.glareRange} onChange={e => updateSetting('glareRange', +e.target.value)} /></label>
            <label>Hardness: {settings.glareHardness}%<input type="range" min="0" max="100" value={settings.glareHardness} onChange={e => updateSetting('glareHardness', +e.target.value)} /></label>
            <label>Factor: {settings.glareFactor}%<input type="range" min="0" max="120" value={settings.glareFactor} onChange={e => updateSetting('glareFactor', +e.target.value)} /></label>
            <label>Convergence: {settings.glareConvergence}%<input type="range" min="0" max="100" value={settings.glareConvergence} onChange={e => updateSetting('glareConvergence', +e.target.value)} /></label>
            <label>Opposite: {settings.glareOppositeFactor}%<input type="range" min="0" max="100" value={settings.glareOppositeFactor} onChange={e => updateSetting('glareOppositeFactor', +e.target.value)} /></label>
            <label>Angle: {settings.glareAngle}°<input type="range" min="-180" max="180" value={settings.glareAngle} onChange={e => updateSetting('glareAngle', +e.target.value)} /></label>
          </div>
          <div className={styles.settingsSection}>
            <h4>Shadow</h4>
            <label>Expand: {settings.shadowExpand}<input type="range" min="2" max="100" value={settings.shadowExpand} onChange={e => updateSetting('shadowExpand', +e.target.value)} /></label>
            <label>Factor: {settings.shadowFactor}%<input type="range" min="0" max="100" value={settings.shadowFactor} onChange={e => updateSetting('shadowFactor', +e.target.value)} /></label>
          </div>
          <div className={styles.settingsSection}>
            <h4>Tint</h4>
            <label>R: {settings.tintR}<input type="range" min="0" max="255" value={settings.tintR} onChange={e => updateSetting('tintR', +e.target.value)} /></label>
            <label>G: {settings.tintG}<input type="range" min="0" max="255" value={settings.tintG} onChange={e => updateSetting('tintG', +e.target.value)} /></label>
            <label>B: {settings.tintB}<input type="range" min="0" max="255" value={settings.tintB} onChange={e => updateSetting('tintB', +e.target.value)} /></label>
            <label>Alpha: {settings.tintA}%<input type="range" min="0" max="100" value={settings.tintA} onChange={e => updateSetting('tintA', +e.target.value)} /></label>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
