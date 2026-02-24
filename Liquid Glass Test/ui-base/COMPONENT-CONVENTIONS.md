# Component Conventions — Timeline Editor Integration

Every component that should be controllable from the Timeline Editor must follow this pattern.

---

## 1. Register in `public/timeline-registry.json`

Add an entry under `components` with all actions and their parameter definitions.

```json
{
  "id": "MyComponent",
  "displayName": "My Component",
  "actions": [
    { "id": "Show", "label": "Show", "params": [] },
    { "id": "Hide", "label": "Hide", "params": [] },
    {
      "id": "SetOpacity", "label": "Set Opacity",
      "params": [
        { "id": "value", "label": "Value", "type": "number", "default": 1, "min": 0, "max": 1 }
      ]
    }
  ]
}
```

**Component ID convention:** PascalCase, matching the React component name exactly.

**Param types:** `number`, `boolean`, `string`

---

## 2. Handle actions in `DashboardComposition.tsx`

Filter events by `componentId` and compute springs per action, then derive the props you need:

```typescript
const myEvents = timelineData.events.filter(
  e => e.componentId === 'MyComponent' && e.frame <= frame
);

const showSprings = myEvents
  .filter(e => e.action === 'Show')
  .map(e => spring({ fps, frame: frame - e.frame, config: e.spring ?? DEFAULT_SPRING, from: 0, to: 1 }));

const hideSprings = myEvents
  .filter(e => e.action === 'Hide')
  .map(e => spring({ fps, frame: frame - e.frame, config: e.spring ?? DEFAULT_SPRING, from: 0, to: 1 }));

const maxShow = showSprings.length > 0 ? Math.max(...showSprings) : 0;
const maxHide = hideSprings.length > 0 ? Math.max(...hideSprings) : 0;
const opacity = Math.max(0, maxShow - maxHide);
```

Pass the derived values as props to `<App />` via `timelineState`.

---

## 3. Spring config

Spring config is optional per-event. The default is:

```json
{ "stiffness": 280, "damping": 24, "mass": 1 }
```

To override per-event, set the `spring` field in `timeline-data.json`:

```json
{
  "id": "evt-003",
  "frame": 120,
  "componentId": "MyComponent",
  "action": "Show",
  "params": {},
  "spring": { "stiffness": 180, "damping": 20, "mass": 1.2 }
}
```

---

## 4. Adding params to `timeline-data.json`

Params are stored as a flat `Record<string, number | string | boolean>` on each event:

```json
{
  "id": "evt-004",
  "frame": 90,
  "componentId": "MyComponent",
  "action": "SetOpacity",
  "params": { "value": 0.5 }
}
```

Access in `DashboardComposition.tsx` as `event.params.value`.

---

## 5. Summary checklist

- [ ] Add component entry to `public/timeline-registry.json`
- [ ] Add action handling in `DashboardComposition.tsx`
- [ ] Pass derived values through `timelineState` to `<App />`
- [ ] Handle derived values in `App.tsx` (Remotion mode branch)
