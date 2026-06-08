Draws a navigation route over the map as a pill-capped SVG stroke. Overlay it (absolute) inside a positioned map container.

```jsx
<MapRoute variant="primary" points={[[10,90],[30,60],[55,55],[80,20]]} active />
<MapRoute variant="alternate" points={[[10,90],[45,80],[80,20]]} />
```

Variants: `primary` (Mint), `preference` (Lime), `alternate` (thin Liliac). `active` intensifies glow + pulse. `points` are in viewBox units (default 0–100).
