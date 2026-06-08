Segmented selector for the three outing personalities — the signature control that re-themes the whole navigation experience (Solo / Couple / Friends).

```jsx
const [outing, setOuting] = React.useState("solo");
<OutingToggle value={outing} onChange={setOuting} />
```

The active segment fills with the outing accent (`--outing-solo/couple/friends`) and casts a matching glow. Pass `options` to customize.
