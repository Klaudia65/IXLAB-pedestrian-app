Pill text field (56px) for destinations and search — outline snaps to a solid Cobalt ring on focus.

```jsx
<Input placeholder="Where to?" leadingIcon={<SearchIcon/>} />
<Input value={q} onChange={e => setQ(e.target.value)} />
```

Props: `value`, `onChange`, `placeholder`, `leadingIcon`, `trailingIcon`, `size` (md/sm), `full`, `disabled`.
