# Legacy UI gap analysis

This doc highlights visual/behavior gaps between the extracted Tkinter spec (`ui_spec.md`) and the current web UI. Use it to drive targeted polish.

## Visual
- Font stack: Use Arial across app, with sizes 8–16 and bold per headings (see `ui_theme.css`). Status: adopt CSS variables + utility classes.
- Color palette: Map primary/success/danger/warning to legacy hexes (#2980b9, #27ae60, #e74c3c, #f39c12). Status: add to CSS and use on buttons/badges.
- LabelFrame look: Many panels are titled frames. Status: wrap right-side sections in `.ui-labelframe` with a `.ui-title` caption.
- Buttons: Several emoji-prefixed labels (Accept, Reject, Create Trade). Status: ensure these labels are used in TradePanel/ActionPanel.
- Right panel spacing: Padding 10–12px and subtle borders. Status: tune actions panel container.

## Behavior
- Trades: “Pending Trades” list and “Refresh Pending Trades” action. Status: add persistent trade history on server/state and render a list with refresh.
- Menu/titles: Several windows (e.g., Advanced Trading System). Status: modal headers should reflect these titles.
- Combined Trading tabs: Notebook-like tabs for Traditional vs Advanced. Status: keep Advanced Trade as a separate modal with clear header and sectioning.

## Concrete tasks
- Apply `ui_theme.css` variables to `web/src/index.css` and component styles.
- Update ActionPanel button classes to btn-* variants to match colors.
- Wrap groups (Players Overview, Dice, Controls) in `.ui-labelframe` + `.ui-title`.
- Ensure labels reflect spec: “✅ Accept Trade”, “❌ Reject Trade”, “➕ Create New Trade”, etc.
- Add badges for Ready/Not Ready using `.badge-success`/`.badge-danger` in lobby.
- Add a basic persistent trades list (client-only to start) with items titled “Trade #N — Proposed at …”.

## Notes
- The extractor previously picked some environment/venv files; the script now prunes common venv/site-packages paths.
- Where dynamic f-strings exist, {expr} markers appear—keep the overall phrasing.
