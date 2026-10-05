# Proto art assets

## `office_floor.png` (day-one empty plate)
1920×1080 isometric dollhouse background. **No baked talents, walkers, or UI chrome.**
Four empty seats with neutral dashed floor outlines. Place Pip/Miri (and later hires) via game sprites / `pip_marker.png` / `miri_marker.png` on top.

Archive of the earlier populated vibe plate: `office_floor_populated.png` (do not use under Open seats).

### Slotting (CSS only — leave `game.js` / JSON alone)
```css
.diorama {
  background: #d8cfe8 url("assets/office_floor.png") center / cover no-repeat;
}
```
Hide flat CSS wall/floor paint; keep desk / waypoint nodes for Assign snaps.

Dashed seat outlines are soft lilac/cream (low contrast) so empty seats whisper.
