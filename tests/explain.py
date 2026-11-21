"""The server's bonus for one build, source by source (for chasing a difference). stdin: one build (JSON)."""
import json, os, sys, importlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from romsolo import stats, record, settle  # noqa: E402
import items, skills  # noqa: E402
b = json.loads(sys.stdin.read())
c = record(b, 0)
settle(c, 2)
out = {}
bonus, wt = items.equip_bonus(c)
out['items.equip_bonus'] = bonus
out['skills.passive_bonus'] = skills.passive_bonus(c, wt)
for m, f in [('cards', 'bonus'), ('upgrade', 'bonus'), ('manual', 'bonus'), ('enchant', 'bonus'), ('astrolabe', 'bonus'),
             ('strengthen', 'bonus'), ('anvil', 'bonus'), ('multijob', 'unlock_bonus'), ('gems', 'bonus'),
             ('gems', 'rune_bonus'), ('astrorunes', 'bonus'), ('astrospecials', 'bonus'), ('cardfx', 'static_bonus'),
             ('shadow', 'bonus'), ('achieve', 'bonus'), ('procs', 'passive_bonus'), ('skills', 'active_bonus'),
             ('cardfx', 'party_bonus'), ('battleattr', 'battle')]:
    try:
        v = getattr(importlib.import_module(m), f)(c)
    except Exception as e:
        v = repr(e)[:200]
    if v:
        out[m + '.' + f] = v
out['learned'] = skills.learned(c)
print(json.dumps(out, indent=0, default=str))
