import { useState, useRef, useCallback } from 'react';
import type { TimelineRow, ComponentRegistry } from '../lib/types';
import { frameToTimecode, timecodeToFrame, generateId } from '../lib/utils';

const COLORS = ['#2563EB', '#D946EF', '#F59E0B', '#10B981', '#EF4444', '#8B5CF6'];
function componentColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) { hash = ((hash << 5) - hash) + id.charCodeAt(i); hash |= 0; }
  return COLORS[Math.abs(hash) % COLORS.length];
}

interface TimelineTableProps {
  rows: TimelineRow[];
  fps: number;
  registry: ComponentRegistry | null;
  onChange: (rows: TimelineRow[]) => void;
  selectedRowId: string | null;
  onRowSelect: (id: string | null) => void;
  durationFrames: number;
  canvas: { width: number; height: number };
}

interface ContextMenu { x: number; y: number; rowIndex: number }
interface AutocompleteState { rowId: string; query: string; open: boolean }

export default function TimelineTable({ rows, fps, registry, onChange, selectedRowId, onRowSelect, durationFrames, canvas }: TimelineTableProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [autocomplete, setAutocomplete] = useState<AutocompleteState | null>(null);
  const dragSourceRef = useRef<number | null>(null);

  const updateRow = useCallback((id: string, patch: Partial<TimelineRow>) => {
    const updated = rows.map(r => r.id === id ? { ...r, ...patch } : r);
    onChange([...updated].sort((a, b) => a.frame - b.frame));
  }, [rows, onChange]);

  const deleteRow = useCallback((index: number) => {
    onChange(rows.filter((_, i) => i !== index));
  }, [rows, onChange]);

  const insertRow = useCallback((index: number) => {
    const newRow: TimelineRow = {
      id: generateId(),
      frame: 0,
      componentId: registry?.components[0]?.id ?? '',
      action: registry?.components[0]?.actions[0]?.id ?? '',
      params: {},
    };
    const next = [...rows];
    next.splice(index, 0, newRow);
    onChange([...next].sort((a, b) => a.frame - b.frame));
  }, [rows, registry, onChange]);

  const getComponentMeta = (id: string) =>
    registry?.components.find(c => c.id === id || c.displayName === id);

  const getActionDef = (componentId: string, actionId: string) =>
    getComponentMeta(componentId)?.actions.find(a => a.id === actionId);

  const autocompleteOptions = (query: string) => {
    if (!registry) return [];
    if (!query) return registry.components.map(c => ({ id: c.id, label: c.displayName }));
    const q = query.toLowerCase();
    return registry.components
      .filter(c => c.id.toLowerCase().includes(q) || c.displayName.toLowerCase().includes(q))
      .map(c => ({ id: c.id, label: c.displayName }));
  };

  const CELL: React.CSSProperties = { padding: '0 8px', borderRight: '1px solid var(--color-border)', verticalAlign: 'middle' };

  return (
    <div style={{ flex: 1, overflow: 'auto' }} onClick={() => setContextMenu(null)}>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '28px' }} />
          <col style={{ width: '80px' }} />
          <col style={{ width: '110px' }} />
          <col style={{ width: '160px' }} />
          <col style={{ width: '140px' }} />
          <col />
          <col style={{ width: '32px' }} />
        </colgroup>
        <thead>
          <tr style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)', position: 'sticky', top: 0, zIndex: 1 }}>
            {['≡', 'FRAME', 'TIME', 'COMPONENT', 'ACTION', 'PARAMS', '×'].map(h => (
              <th key={h} style={{ ...CELL, height: 'var(--row-height)', textAlign: 'left', fontWeight: 600, letterSpacing: '0.06em', color: 'var(--color-text-secondary)', borderRight: h !== '×' ? '1px solid var(--color-border)' : 'none' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const compMeta = getComponentMeta(row.componentId);
            const actionDef = getActionDef(row.componentId, row.action);
            const isACOpen = autocomplete?.rowId === row.id && autocomplete.open;
            const isSelected = row.id === selectedRowId;
            const color = componentColor(row.componentId);

            return (
              <tr
                key={row.id}
                draggable
                onClick={() => onRowSelect(row.id)}
                onDragStart={() => { dragSourceRef.current = index; }}
                onDragOver={e => e.preventDefault()}
                onDrop={() => {
                  if (dragSourceRef.current === null || dragSourceRef.current === index) return;
                  const sourceIndex = dragSourceRef.current;
                  const targetIndex = index;
                  const draggedRow = rows[sourceIndex];
                  const withoutDragged = rows.filter((_, i) => i !== sourceIndex);
                  const insertAt = targetIndex > sourceIndex ? targetIndex - 1 : targetIndex;
                  const prevRow = insertAt > 0 ? withoutDragged[insertAt - 1] : null;
                  const nextRow = insertAt < withoutDragged.length ? withoutDragged[insertAt] : null;
                  let newFrame: number;
                  if (!prevRow && !nextRow) newFrame = draggedRow.frame;
                  else if (!prevRow) newFrame = Math.max(0, nextRow!.frame - 30);
                  else if (!nextRow) newFrame = Math.min(durationFrames, prevRow.frame + 30);
                  else newFrame = Math.round((prevRow.frame + nextRow.frame) / 2);
                  const result = [...withoutDragged];
                  result.splice(insertAt, 0, { ...draggedRow, frame: newFrame });
                  onChange(result.sort((a, b) => a.frame - b.frame));
                  dragSourceRef.current = null;
                }}
                onContextMenu={e => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, rowIndex: index }); }}
                style={{
                  height: 'var(--row-height)',
                  borderBottom: '1px solid var(--color-border)',
                  background: isSelected ? 'rgba(37,99,235,0.08)' : (index % 2 === 0 ? 'var(--color-bg)' : 'var(--color-surface)'),
                  borderLeft: isSelected ? `3px solid ${color}` : '3px solid transparent',
                  cursor: 'default',
                }}
              >
                <td style={{ ...CELL, cursor: 'grab', color: 'var(--color-text-secondary)', textAlign: 'center' }}>≡</td>

                <td style={CELL}>
                  <input type="number" value={row.frame} min={0} onChange={e => updateRow(row.id, { frame: Number(e.target.value) })} />
                </td>

                <td style={CELL}>
                  <input
                    type="text"
                    value={frameToTimecode(row.frame, fps)}
                    onChange={e => { const f = timecodeToFrame(e.target.value, fps); if (!isNaN(f) && f >= 0) updateRow(row.id, { frame: f }); }}
                    placeholder="00:00:00:00"
                  />
                </td>

                <td style={{ ...CELL, position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <input
                      type="text"
                      value={isACOpen ? autocomplete.query : (compMeta?.displayName ?? row.componentId)}
                      onFocus={() => setAutocomplete({ rowId: row.id, query: compMeta?.displayName ?? row.componentId, open: true })}
                      onChange={e => setAutocomplete({ rowId: row.id, query: e.target.value, open: true })}
                      onBlur={() => setTimeout(() => setAutocomplete(null), 150)}
                      placeholder="Component..."
                    />
                  </div>
                  {isACOpen && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--color-surface)', border: '1px solid var(--color-border)', zIndex: 100, maxHeight: '120px', overflowY: 'auto' }}>
                      {autocompleteOptions(autocomplete.query).map(opt => (
                        <div
                          key={opt.id}
                          onMouseDown={() => {
                            const firstAction = registry?.components.find(c => c.id === opt.id)?.actions[0]?.id ?? '';
                            updateRow(row.id, { componentId: opt.id, action: firstAction, params: {} });
                            setAutocomplete(null);
                          }}
                          style={{ padding: '6px 8px', cursor: 'pointer', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: '6px' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--color-bg)'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; }}
                        >
                          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: componentColor(opt.id), flexShrink: 0 }} />
                          {opt.label}
                        </div>
                      ))}
                    </div>
                  )}
                </td>

                <td style={CELL}>
                  <select value={row.action} onChange={e => updateRow(row.id, { action: e.target.value, params: {} })} style={{ width: '100%' }}>
                    {(compMeta?.actions ?? []).map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                    {!compMeta && <option value={row.action}>{row.action}</option>}
                  </select>
                </td>

                <td style={CELL}>
                  {actionDef && actionDef.params.length > 0 ? (() => {
                    const hasX = actionDef.params.some(p => p.id === 'x');
                    const hasY = actionDef.params.some(p => p.id === 'y');
                    const isPositionAction = hasX && hasY;
                    const compMeta2 = getComponentMeta(row.componentId);
                    const elemW = compMeta2?.defaultSize?.width ?? 0;
                    const elemH = compMeta2?.defaultSize?.height ?? 0;
                    const cx = Math.round((canvas.width - elemW) / 2);
                    const cy = Math.round((canvas.height - elemH) / 2);

                    const PRESET_BTN: React.CSSProperties = {
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-bg)',
                      color: 'var(--color-text-secondary)',
                      fontSize: '10px',
                      padding: '1px 5px',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      lineHeight: '18px',
                    };

                    return (
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                        {actionDef.params.map(p => (
                          <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--color-text-secondary)' }}>
                            {p.label}:
                            <input
                              type={p.type === 'number' ? 'number' : 'text'}
                              value={String(row.params[p.id] ?? p.default)}
                              min={p.min} max={p.max}
                              onChange={e => {
                                const val: number | string = p.type === 'number' ? Number(e.target.value) : e.target.value;
                                updateRow(row.id, { params: { ...row.params, [p.id]: val } });
                              }}
                              style={{ width: p.type === 'number' ? '60px' : '80px' }}
                            />
                          </label>
                        ))}
                        {isPositionAction && (
                          <div style={{ display: 'flex', gap: '3px', marginLeft: '2px' }}>
                            <button style={PRESET_BTN} title="Center X and Y"
                              onMouseDown={e => { e.preventDefault(); updateRow(row.id, { params: { ...row.params, x: cx, y: cy } }); }}>
                              ⊕
                            </button>
                            <button style={PRESET_BTN} title={`Center X (${cx})`}
                              onMouseDown={e => { e.preventDefault(); updateRow(row.id, { params: { ...row.params, x: cx } }); }}>
                              ↔
                            </button>
                            <button style={PRESET_BTN} title={`Center Y (${cy})`}
                              onMouseDown={e => { e.preventDefault(); updateRow(row.id, { params: { ...row.params, y: cy } }); }}>
                              ↕
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })() : (
                    <span style={{ color: 'var(--color-text-secondary)' }}>—</span>
                  )}
                </td>

                <td style={{ padding: 0, textAlign: 'center' }}>
                  <button onClick={e => { e.stopPropagation(); deleteRow(index); }} style={{ border: 'none', color: 'var(--color-text-secondary)', padding: '0 8px', width: '100%', height: 'var(--row-height)' }}>×</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {rows.length === 0 && (
        <div style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
          No events. Click "+ Add Row" to add one.
        </div>
      )}

      {contextMenu && (
        <div style={{ position: 'fixed', left: contextMenu.x, top: contextMenu.y, background: 'var(--color-surface)', border: '1px solid var(--color-border)', zIndex: 1000, minWidth: '160px', boxShadow: '0 4px 12px rgba(0,0,0,0.12)' }}>
          {[
            { label: 'Insert row above', action: () => insertRow(contextMenu.rowIndex) },
            { label: 'Insert row below', action: () => insertRow(contextMenu.rowIndex + 1) },
            { label: 'Delete', action: () => deleteRow(contextMenu.rowIndex) },
          ].map(item => (
            <div key={item.label} onClick={() => { item.action(); setContextMenu(null); }}
              style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--color-border)', color: item.label === 'Delete' ? '#DC2626' : 'var(--color-text-primary)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--color-bg)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; }}
            >
              {item.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
