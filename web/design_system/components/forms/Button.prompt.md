Pill-shaped action control (56px) — the primary tap target across Wander; use `outline` for secondary actions that fill with Cobalt on hover.

```jsx
<Button variant="primary">Start wander</Button>
<Button variant="outline" size="sm">Save place</Button>
<Button variant="glow" full>Begin navigation</Button>
```

Variants: `primary` (solid Cobalt), `outline` (Cobalt stroke → fills on hover/active), `ghost` (text only), `glow` (primary + Cobalt halo). Sizes: `md` 56px, `sm` 44px. Supports `leadingIcon` / `trailingIcon`, `full`, `disabled`.
