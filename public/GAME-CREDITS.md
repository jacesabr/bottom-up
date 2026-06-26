# Unlockable games — sources & licenses

All games are **external embeds** loaded read-only in an iframe from their original hosts. Nothing is
vendored, recreated, or coded by us. Each URL is verified two ways: (1) headers — no `X-Frame-Options` /
CSP `frame-ancestors` block; (2) **eyes-on** — render-screenshotted inside the actual dark-overlay iframe
(headless + real-GPU Chrome, 2026-06-26) to confirm it actually draws a game, not a blank frame.
Genre-balanced toward action: racing, shooters, runner, maze adventure, multiplayer. Order in the app =
node-unlock order (quick arcade → 3D → multiplayer).

| Game | Genre | Host / Author | URL |
|---|---|---|---|
| HexGL | racing (neon 3D) | BKcore — Thibaut Despoulain | https://hexgl.bkcore.com/play/ |
| T-Rex Runner | endless runner | wayou (Chrome dino clone) | https://wayou.github.io/t-rex-runner/ |
| 2048 | number-merge puzzle | hczhcz fork of Gabriele Cirulli | https://hczhcz.github.io/2048/ |
| BlockRain | Tetris | Aerolab | https://aerolab.github.io/blockrain.js/ |
| Hextris | hexagon puzzle | hextris (open source) | https://hextris.github.io/ |
| Snake | arcade | Ramazan Çetinkaya | https://ramazancetinkaya.github.io/snake-game/ |
| Clumsy Bird | flappy arcade | Ellison Leão | https://ellisonleao.github.io/clumsy-bird/ |
| Astray | 3D marble-maze adventure | wwwtyro | https://wwwtyro.github.io/Astray/ |
| Arena5 | twin-stick shooter | Kevin Roast (kevs3d) | https://www.kevs3d.co.uk/dev/arena5/ |
| Master Archer | 3D archery action | PlayCanvas showcase | https://playcanv.as/p/JERg21J8/ |
| Orbital Survival | arcade wave shooter | PlayCanvas showcase | https://playcanv.as/p/3G3RnfUz/ |
| Galaxies: Combat | 3D space shooter | PlayCanvas showcase | https://playcanv.as/p/Ikq6Uk6A/ |
| TANX | online multiplayer tank battle | PlayCanvas | https://tanx.io/ |

All embeds are free-to-play public builds run as-is. If any author requests removal, drop the row from
`GAMES` in `src/web/components/ChapterMap.tsx`.

**Rejected in render-verify (do NOT re-add without re-testing):** SWOOOP and Ink Wars (`playcanv.as`) draw a
solid blank frame when embedded — confirmed blank on real GPU, not a software-renderer artifact. Jungle
Runner / kandi-runner (`tutsplus.github.io/kandi-runner`) freezes on its "Downloading:" preloader. Asteroids
(`kevs3d.co.uk/dev/asteroids`) shows a pure-black playfield (no attract/ship) on both software and real GPU.

---

**Removed (2026-06-26):** the previous lineup leaned on slow narrative/art games (A Dark Room, Passage,
Loneliness, Loved, Every Day the Same Dream, Today I Die, I Wish I Were the Moon, The House Abandon,
Snakisms, A Series of Gunshots, You Are Jeff Bezos, A Studio Above a Bookstore, It is as if you were
doing work, We Become What We Behold, WarGames) plus our bespoke eXit and four Flash-via-Ruffle titles.
Cut for being boring / requiring vendored code + a self-hosted Flash emulator. The old static files still
sit unused under `public/game*/`, `public/games/`, `public/_ruffle/`, and `public/swf/` — safe to delete
to slim the deploy (no longer referenced by the app).
