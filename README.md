# ROM Build Simulator

A build simulator for **Ragnarok M: Eternal Love**, for every class in the game client: stats, skills, equipment (refine, upgrade, cards, enchants), the Astrolabe (runes), attribute runes (gems), the Adventure Handbook, titles and collections. It shows your final attributes and where each one comes from.

**Live site:** https://daikonfuji.github.io/ROMSim2/

## What it covers

| Part | What you can do |
|---|---|
| Classes | All 115 classes of client 1.0.0.8: every job line to the 4th jobs, the expanded classes (Super Novice, Ninja, Gunslinger, Doram, Taekwon …) and the heroes |
| Stats | Base Level to 170, the job level of the class, stat points with their real costs, the class's job bonus |
| Skills | Every skill tab of the job line, with job-level and skill requirements, tab unlock points, breakthrough and limit-break levels, and descriptions at each level |
| Equipment | 17 slots; refine, upgrade levels, cards that fit, enchants (Primary / Medium / Advanced) with their bonus effects, sets and set refine bonuses |
| Runes | The Astrolabe board for your class: click a star and the path to it lights up; special stars and what they do |
| Gems | 10 attribute runes at their level |
| More | Adventure Handbook level, titles, collections, other classes reached, extra bonuses, and assumptions (HP / SP share, party size, PvP) |

Share a build with the **Share** button (the build is packed into the link), or keep builds in your browser with **Builds**.

## How the numbers are worked out

The numbers come from the game client itself, not from guesses:

- The final attributes come from the client's own formulas (`CommonFun.calcUserAttrValue`, `calAttrPoint`, `calcBuffValue` in `lua/CommonFun.lua`), run in the browser by [fengari](https://fengari.io/) (Lua 5.3 in JavaScript).
- Bonuses are added up the same way as the [ROM Solo](#data) server does it: equipment, refine, upgrades, sets, cards, enchants, passive skills, Astrolabe stars and their special runes, gems, the Handbook, titles and collections. Conditional effects ("when HP is above 50%", "with a bow equipped") count only when they hold.
- `tests/compare.js` checks random builds against the ROM Solo server's own code. They match on every attribute. The one known exception: the server works out the hero passive *Masochistic Constitution* as 0; the simulator uses the client's formula.

Some things depend on a fight and aren't shown: buffs from active skills, food, pets, and skill runes (the rolled kind).

## Files

| Path | What it is |
|---|---|
| `index.html`, `css/`, `js/app.js` | The page |
| `js/engine.js` | Adds up a build's bonuses and calls the client formulas |
| `js/lua.js` | The bridge to the Lua formulas |
| `lua/` | The client's `GameConfig.lua` and `CommonFun.lua`, and the stand-ins they read (`mock.lua`, `sim.lua`) |
| `data/` | The game data, made by `tools/export.py` |
| `tools/export.py` | Makes `data/` and `lua/` from a ROM Solo folder |
| `tests/` | Checks the simulator against the ROM Solo server |
| `vendor/fengari-web.js` | Lua in the browser (MIT licence) |

## Data

The data comes from the decrypted tables of the frozen Windows client (1.0.0.8, resources 1653371) in a ROM Solo folder. To make it again:

```
python tools/export.py "C:/path/to/ROM Solo"
node tests/compare.js "C:/path/to/ROM Solo" 100
```

Ragnarok M: Eternal Love and its data belong to Gravity and XD. This is a fan-made tool and not affiliated with them.
