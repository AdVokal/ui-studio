import { useState, useEffect, useCallback, useRef } from 'react';
import type { TimelineRow, ComponentRegistry, TimelineData } from './lib/types';
import { generateId } from './lib/utils';
import Toolbar from './components/Toolbar';
import FrameRuler from './components/FrameRuler';
import TimelineTable from './components/TimelineTable';
import './styles/global.css';

const MAX_UNDO = 50;
const REGISTRY_URL = 'http://localhost:5173/timeline-registry.json';
const API_URL = '/api/timeline';

export default function App() {
  const [rows, setRows] = useState<TimelineRow[]>([]);
  const [undoStack, setUndoStack] = useState<TimelineRow[][]>([]);
  const [redoStack, setRedoStack] = useState<TimelineRow[][]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [registry, setRegistry] = useState<ComponentRegistry | null>(null);
  const [fps, setFps] = useState(60);
  const [durationFrames, setDurationFrames] = useState(360);
  const [canvas, setCanvas] = useState<{ width: number; height: number }>({ width: 3840, height: 536 });
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);

  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const undoStackRef = useRef(undoStack);
  undoStackRef.current = undoStack;
  const redoStackRef = useRef(redoStack);
  redoStackRef.current = redoStack;

  useEffect(() => {
    fetch(REGISTRY_URL)
      .then(r => r.json())
      .then((data: ComponentRegistry) => setRegistry(data))
      .catch(console.error);

    fetch(API_URL)
      .then(r => r.json())
      .then((data: TimelineData) => {
        setFps(data.fps);
        setDurationFrames(data.durationFrames);
        if (data.canvas) setCanvas(data.canvas);
        setRows([...data.events.map(e => ({
          id: e.id,
          frame: e.frame,
          componentId: e.componentId,
          action: e.action,
          params: e.params,
          spring: e.spring,
        }))].sort((a, b) => a.frame - b.frame));
      })
      .catch(console.error);
  }, []);

  const updateRows = useCallback((newRows: TimelineRow[]) => {
    setUndoStack(stack => [...stack.slice(-(MAX_UNDO - 1)), rowsRef.current]);
    setRedoStack([]);
    setRows([...newRows].sort((a, b) => a.frame - b.frame));
    setIsDirty(true);
  }, []);

  const undo = useCallback(() => {
    const stack = undoStackRef.current;
    if (stack.length === 0) return;
    const prev = stack[stack.length - 1];
    setRedoStack(r => [...r, rowsRef.current]);
    setRows(prev);
    setUndoStack(stack.slice(0, -1));
    setIsDirty(true);
  }, []);

  const redo = useCallback(() => {
    const stack = redoStackRef.current;
    if (stack.length === 0) return;
    const next = stack[stack.length - 1];
    setUndoStack(u => [...u.slice(-(MAX_UNDO - 1)), rowsRef.current]);
    setRows(next);
    setRedoStack(stack.slice(0, -1));
    setIsDirty(true);
  }, []);

  const save = useCallback(async () => {
    const data: TimelineData = {
      version: 1,
      fps,
      durationFrames,
      canvas,
      events: rowsRef.current.map(r => ({
        id: r.id,
        frame: r.frame,
        componentId: r.componentId,
        action: r.action,
        params: r.params,
        ...(r.spring ? { spring: r.spring } : {}),
      })),
    };
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data, null, 2),
      });
      if (res.ok) setIsDirty(false);
    } catch (e) {
      console.error(e);
    }
  }, [fps, durationFrames, canvas]);

  const addRow = useCallback(() => {
    const newRow: TimelineRow = {
      id: generateId(),
      frame: Math.floor(durationFrames / 2),
      componentId: registry?.components[0]?.id ?? '',
      action: registry?.components[0]?.actions[0]?.id ?? '',
      params: {},
      _isNew: true,
    };
    updateRows([...rowsRef.current, newRow]);
  }, [durationFrames, registry, updateRows]);

  const onRulerFrameChange = useCallback((id: string, frame: number) => {
    updateRows(rowsRef.current.map(r => r.id === id ? { ...r, frame } : r));
  }, [updateRows]);

  const onFpsChange = useCallback((v: number) => {
    setFps(v);
    setIsDirty(true);
  }, []);

  const onDurationChange = useCallback((v: number) => {
    setDurationFrames(v);
    setIsDirty(true);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo, save]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--color-bg)' }}>
      <Toolbar
        durationFrames={durationFrames}
        fps={fps}
        isDirty={isDirty}
        onAdd={addRow}
        onUndo={undo}
        onRedo={redo}
        onSave={save}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        onFpsChange={onFpsChange}
        onDurationChange={onDurationChange}
      />
      <FrameRuler
        durationFrames={durationFrames}
        fps={fps}
        rows={rows}
        selectedRowId={selectedRowId}
        onRowFrameChange={onRulerFrameChange}
        onRowClick={setSelectedRowId}
      />
      <TimelineTable
        rows={rows}
        fps={fps}
        registry={registry}
        onChange={updateRows}
        selectedRowId={selectedRowId}
        onRowSelect={setSelectedRowId}
        durationFrames={durationFrames}
        canvas={canvas}
      />
    </div>
  );
}
