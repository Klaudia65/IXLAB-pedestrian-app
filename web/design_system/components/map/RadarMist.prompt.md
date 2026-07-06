Ambient radial blur field behind the map — represents an area of interest weighted to the user's preferences. Layer several, color-coded, behind route content.

```jsx
<RadarMist color="mint" size={420} style={{ top: 80, left: -60 }} />
<RadarMist color="orchid" size={260} intensity={0.4} style={{ bottom: 40, right: 0 }} />
```

Props: `color` (token/CSS), `size`, `intensity` (0–1), `blur`, `breathe`. Always decorative (`pointer-events:none`).
