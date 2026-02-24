interface ToolbarProps {
  durationFrames: number;
  fps: number;
  isDirty: boolean;
  onAdd: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onDurationChange: (v: number) => void;
  onFpsChange: (v: number) => void;
}

const INPUT_STYLE: React.CSSProperties = {
  width: '52px',
  textAlign: 'center',
  background: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
  padding: '2px 4px',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--font-size)',
  color: 'var(--color-text-primary)',
};

export default function Toolbar({
  durationFrames, fps, isDirty,
  onAdd, onUndo, onRedo, onSave,
  canUndo, canRedo,
  onDurationChange, onFpsChange,
}: ToolbarProps) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px',
      height: '40px',
      background: 'var(--color-surface)',
      borderBottom: '1px solid var(--color-border)',
      flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <span style={{ fontWeight: 600, letterSpacing: '0.08em' }}>UI BASE — TIMELINE</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-text-secondary)' }}>
          <input
            type="number"
            value={durationFrames}
            min={1}
            style={{ ...INPUT_STYLE, width: '56px' }}
            onChange={e => { const v = Number(e.target.value); if (v > 0) onDurationChange(v); }}
          />
          fr /
          <input
            type="number"
            value={fps}
            min={1}
            max={120}
            style={{ ...INPUT_STYLE, width: '40px' }}
            onChange={e => { const v = Number(e.target.value); if (v > 0) onFpsChange(v); }}
          />
          fps
        </span>
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={onAdd}>+ Add Row</button>
        <button onClick={onUndo} disabled={!canUndo} title="Ctrl+Z">↩ Undo</button>
        <button onClick={onRedo} disabled={!canRedo} title="Ctrl+Y">↪ Redo</button>
        <button
          onClick={onSave}
          title="Ctrl+S"
          style={isDirty ? { borderColor: 'var(--color-accent)', color: 'var(--color-accent)' } : {}}
        >
          {isDirty ? '● Save*' : '● Save'}
        </button>
      </div>
    </div>
  );
}
