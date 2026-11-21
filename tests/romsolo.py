"""ROM Solo's server code set up as the simulator's reference (tests/oracle.py, tests/explain.py)."""
import json, os, sys
ROM = os.path.abspath(os.environ.get("ROMSOLO") or sys.argv[1])
sys.path.insert(0, os.path.join(ROM, 'server'))
os.environ.setdefault('ROMSOLO_DATA', os.path.join(ROM, 'data'))
import stats, enchant, menus, json as _j  # noqa: E402

# the simulator assumes every menu (feature) is open, as for a character far into the game
ALL_MENUS = frozenset(int(k) for k in _j.load(open(os.path.join(os.environ['ROMSOLO_DATA'], 'tables', 'Script',
                      'Config_Hint_TiShiZhiYin', 'Table_Menu.json'), encoding='utf-8')) if str(k).isdigit())
menus.unlocked = lambda c: ALL_MENUS
# ... and that every piece has been worn long enough for its "after wearing for 30 seconds" effects
import equipfx  # noqa: E402
equipfx.aged = lambda c, bid, pos=None: True
# ... and that the collections the build lists are complete
import manual  # noqa: E402
COLLS = set()
manual.group_complete = lambda st, gid: int(gid) in COLLS

PCT = None


def record(b, n):
    COLLS.clear()
    COLLS.update(int(x) for x in b.get('colls') or [])
    ids = stats.var_ids()
    fl = stats.float_ids()
    bag = []
    for site, e in (b.get('eq') or {}).items():
        if not e or not e.get('id'):
            continue
        it = {'guid': 'g%d' % len(bag), 'index': int(site), 'id': int(e['id']), 'count': 1,
              'refinelv': int(e.get('rf') or 0), 'upgradelv': int(e.get('up') or 0),
              'cards': [{'id': int(x)} for x in e.get('cards') or [] if x]}
        at = []
        for k, v in e.get('en') or []:
            if k in ids:
                at.append([ids[k], int(round(float(v) * 10)) if ids[k] in fl else int(v)])
        if at:
            it['enchant'] = {'type': 3, 'attrs': at}
        bag.append(it)
    return {'id': 900000 + n, 'name': 'sim', 'profession': int(b['cls']), 'baselv': int(b['base']),
            'joblv': int(b['job']), 'gender': int(b.get('gender') or 1),
            'points': {k.lower(): int(v) for k, v in (b.get('pts') or {}).items()},
            'skills': {str(k): int(v) for k, v in (b.get('sk') or {}).items() if int(v) > 0},
            'bags': {'2': bag, '14': [{'guid': 'r%d' % i, 'id': int(g['id']), 'count': 1,
                                       'gem': {'lv': int(g.get('lv') or 1), 'exp': 0, 'pos': i + 1}}
                                      for i, g in enumerate(b.get('gems') or []) if g]}, 'astrolabe': [int(x) for x in b.get('stars') or []],
            'quests_done': [stats.REBIRTH_QUEST], 'hp': 10 ** 9, 'sp': 10 ** 9,
            'manual': {'level': int(b.get('handbook') or 1)}, 'titles': [int(x) for x in b.get('titles') or []]}




def settle(c, times=3):
    """stats._attrs(c) worked out again until the formulas that read your own attributes settle (the server does this
    over its first few syncs: procs.remember keeps the last numbers for the next)."""
    import equipfx, procs
    a = None
    for _ in range(times):
        stats._static.clear(); stats._final.clear(); procs._plans.clear()
        for k in [k for k in equipfx._cache if isinstance(k, tuple) and k and k[0] in ('wearer', 'memo')]:
            del equipfx._cache[k]
        a = stats._attrs(c)
    return a
