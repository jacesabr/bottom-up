# eXit scene art (drop-in override)

The game renders each scene as procedural pixel-art on a `<canvas>` (in the
show's blocky teal CRT style). To replace any scene with a **real image**, drop a
PNG here named after the scene — the game loads it automatically and falls back to
the procedural render if the file is missing.

Recognised names (→ `/game1/scenes/<name>.png`):

| name           | beat                                            |
|----------------|-------------------------------------------------|
| `boot`         | title / disk boot                               |
| `dungeon`      | "trapped in a dungeon… you see a barrel"        |
| `tunnel`       | "the barrel rolls aside… a secret tunnel"       |
| `friend`       | "your friend is too weak… hands you a note"     |
| `dark`         | "it is too dark to read the note"               |
| `note`         | the note — "don't leave me here"                |
| `beach`        | "the tunnel leads to a beach"                   |
| `boat`         | "in the water you see a boat"                   |
| `island`       | hollow ending — "heading to a new world"        |

Use a low-res PNG (roughly 220×120 or any 16:9-ish pixel image); CSS scales it up
with `image-rendering: pixelated`, so small/crunchy looks correct.
