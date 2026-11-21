"""Export the game data the simulator reads (data/*.json) from a ROM Solo folder.

Usage:  python tools/export.py "C:/Users/<you>/Desktop/ROM Solo"

It reads ROM Solo's decrypted client tables (data/tables), its English text (data/lang) and uses ROM Solo's own
server code (server/*.py) for the rules it already has (skill chains, formula classes, equip sites ...), so the
simulator follows the same rules as the server. Writes:
  data/core.json      classes, stat point costs, attribute names, equip sites
  data/skills.json    every class's skill families, level by level
  data/items.json     equipment, cards, sets, upgrade levels, enchant pools
  data/buffs.json     every buff the above refer to (effects, conditions, names)
  data/runes.json     the Astrolabe (rune board): plates, stars, what each class's stars give
  data/gems.json      attribute runes (Gems) by level
  lua/*.lua           the client's GameConfig.lua and CommonFun.lua (the formulas)
"""
import json, os, re, shutil, sys

ROM = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.environ.get('ROMSOLO', '.'))
OUT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROM, 'server'))
os.environ.setdefault('ROMSOLO_DATA', os.path.join(ROM, 'data'))

import world, stats, skills, items  # noqa: E402  (ROM Solo's server modules)

T = world.TABLES
E = world.english


def tab(*parts):
    with open(os.path.join(T, *parts), encoding='utf-8') as f:
        return json.load(f)


def clean(text):
    """English text without the client's colour tags."""
    t = E(text) if text else ''
    t = re.sub(r'\[[0-9a-fA-F]{6}\]|\[-\]|\[/?[a-z]\]|\[c\]|\[/c\]', '', str(t or ''))
    return t.replace('\\n', '\n').strip()


def named(t):
    """A real English name (not a missing text id: the client shows those items to no one)."""
    t = (t or '').strip()
    return t if t and not t.startswith('#') and not t.isdigit() and not re.fullmatch(r'##?\d+', t) else ''


def num(v):
    if isinstance(v, float) and v.is_integer():
        return int(v)
    return v


def compact(d):
    if isinstance(d, dict):
        return {k: compact(v) for k, v in d.items() if v not in ({}, [], '', None)}
    if isinstance(d, list):
        return [compact(v) for v in d]
    return num(d)


def dump(name, obj):
    path = os.path.join(OUT, 'data', name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))
    print('%-14s %8.0f KB' % (name, os.path.getsize(path) / 1024))


L = stats.lua()


def lua_py(x, depth=0):
    if depth > 8:
        return None
    try:
        keys = list(x.keys())
    except Exception:
        return x
    out = {}
    for k in keys:
        out[str(k)] = lua_py(x[k], depth + 1)
    return out


BUFFS = set()   # every buff referenced, exported at the end

# ---- core --------------------------------------------------------------------------------------------------------
roledata = {}
for k, v in stats._table('Table_RoleData').items():
    if v.get('VarName'):
        roledata[v['VarName']] = [int(k), clean(v.get('PropName')) or v['VarName'],
                                  1 if v.get('IsPercent') == 1 else 0, 1 if k in stats.float_ids() else 0]
RD = {k: int(L.eval('CommonFun.RoleData')[k]) for k in L.eval('CommonFun.RoleData')}

cost = {int(k): int(v['NeedPoint']) for k, v in stats._table('Table_AttributePoint').items()}
base = stats._table('Table_BaseLevel')
add_point, total = [0], 0
for lv in range(1, max(base) + 1):
    total += int((base.get(lv) or {}).get('AddPoint') or 0)
    add_point.append(total)

classes = {}
for k, r in sorted(stats._table('Table_Class').items()):
    if k in (500,) or not r.get('IsOpen', 1):
        continue
    ch = skills.chain(k)
    if not ch:
        continue
    classes[k] = compact({
        'n': clean(r.get('NameZh')) or r.get('NameEn') or str(k),
        'en': r.get('NameEn'),
        'chain': ch,
        'max': int(r.get('MaxJobLevel') or 10),
        'peak': int(r.get('MaxPeak') or 0),
        'tb': int(r.get('TypeBranch') or 0),
        'type': int(r.get('Type') or 0),
        'fc': stats.formula_class(k),
        'hero': 1 if stats.is_hero(k) else 0,
        'feature': skills.feature_sort(k) if stats.is_hero(k) else 0,
        'sk': [int(x) // 1000 for x in (r.get('Skill') or [])],
        'unlock': r.get('UnlockAttr') or {},
        'race': int(r.get('Race') or 1),
        'adv': r.get('HeroAdvanceClass') or {},
        'icon': r.get('icon'),
    })

# the client's weapon types (Table_Item Type) and their names
item_types = {}
for k, v in tab('Config_Item_DaoJu', 'Table_ItemType.json').items():
    if isinstance(v, dict):
        item_types[int(k)] = clean(v.get('Name')) or str(k)

SITES = {7: 'Weapon', 1: 'Off-hand', 2: 'Armor', 3: 'Garment', 4: 'Shoes', 5: 'Accessory 1', 6: 'Accessory 2',
         8: 'Headwear', 9: 'Face', 10: 'Mouth', 11: 'Back', 12: 'Tail', 13: 'Mount', 15: 'Artifact',
         16: 'Artifact Head', 17: 'Artifact Back', 19: 'Artifact Ring'}
peak = lua_py(L.eval('GameConfig.Peak'))
recover = {int(k): {'hp': num(v.get('hp')), 'sp': num(v.get('sp'))}
           for k, v in lua_py(L.eval('GameConfig.NewRole.recover')).items() if isinstance(v, dict)}

core = {
    'roledata': roledata, 'RD': RD, 'cost': cost, 'addPoint': add_point,
    'maxBase': stats.base_level_max(), 'preRebirthCap': stats.PRE_REBIRTH_CAP,
    'classes': classes, 'itemTypes': item_types, 'sites': SITES,
    'peak': {'unlockExtra': peak.get('UnlockExtraSkillPoints'), 'special': [int(x) for x in peak.get('UnlockSpecialClass')],
             'breakPoints': int(peak.get('SkillPointToBreak') or 120)},
    'formulaClasses': sorted(stats.formula_classes()),
    'recover': recover,
}

# ---- skills ------------------------------------------------------------------------------------------------------
desc_src = {}
with open(os.path.join(ROM, 'data', 'lua-source', 'Script', 'Config_Skill_JiNeng', 'Table_SkillDesc.lua'),
          encoding='utf-8', errors='replace') as f:
    for m in re.finditer(r"\[(\d+)\] = \"\{id=\d+,Desc='([^']*)'", f.read()):
        desc_src[int(m.group(1))] = m.group(2)
descs = {}


def desc_template(did):
    if did not in descs:
        t = clean(desc_src.get(did, ''))
        descs[did] = t.replace('%%', '%')
    return did


fams = {}
for k, c in classes.items():
    for sort in c['sk'] + ([c['feature']] if c.get('feature') else []):
        if sort in fams:
            continue
        lvls, lv = [], 1
        name = None
        while True:
            r = skills.row(sort * 1000 + lv)
            if not r:
                break
            name = name or clean(r.get('NameZh'))
            cond = skills.cond(r)
            d = []
            for x in r.get('Desc') or []:
                if isinstance(x, dict) and x.get('id'):
                    d.append([desc_template(int(x['id'])), [num(p) for p in (x.get('params') or [])]])
            selfb = [int(b) for b in ((r.get('Buff') or {}).get('self') or [])] if isinstance(r.get('Buff'), dict) else []
            if not r.get('Logic'):
                BUFFS.update(selfb)
            sc = r.get('SkillCost') or {}
            lvls.append(compact({
                'c': int(r.get('Cost') or 0),
                'jl': int(cond.get('joblv') or 0),
                'rq': [int(cond['skillid']) // 1000, int(cond['skillid']) % 1000] if cond.get('skillid') else None,
                'mn': int(cond['menu']) if cond.get('menu') else None,
                'pk': 1 if r.get('PeakLevel') else 0,
                'xm': int(r.get('ExtraMaxLevel') or 0),
                'ic': [[int(i['id']), int(i.get('count') or 0)] for i in (r.get('ItemCost') or []) if isinstance(i, dict)],
                'sp': num(sc.get('sp')) if isinstance(sc, dict) else None,
                'cd': num(r.get('CD')),
                'd': d,
                'b': selfb if not r.get('Logic') else None,
                'logic': r.get('Logic'),
            }))
            lv += 1
            if lv > 40:
                break
        if lvls:
            r1 = skills.row(sort * 1000 + 1) or {}
            fams[sort] = compact({'n': name or str(sort), 'icon': r1.get('Icon'), 'type': r1.get('SkillType'),
                                  'lv': lvls})

# ---- items -------------------------------------------------------------------------------------------------------
equip = tab('Config_Equip_ZhuangBei_KaPian', 'Table_Equip.json')
item_rows = tab('Config_Item_DaoJu', 'Table_Item.json')
upgrades = tab('Config_Equip_ZhuangBei_KaPian', 'Table_EquipUpgrade.json')
rate_map = {int(k): v for k, v in lua_py(L.eval('GameConfig.NewClassEquip.EnchantEquipTypeRateMap')).items()}

lottery = {}
for r in tab('Config_Event_ShiJian', 'Table_EquipLottery.json').values():
    if isinstance(r, dict) and r.get('ItemId'):
        lo, hi = (list(r.get('Level') or []) + [0, 0])[:2]
        lottery.setdefault(int(r['ItemId']), []).append([int(lo), int(hi or 10 ** 6),
                                                         compact({k: v for k, v in (r.get('Attr') or {}).items()
                                                                  if isinstance(v, (int, float))})])
upgrade_from = {}
for k, v in upgrades.items():
    if isinstance(v, dict) and v.get('Product') and k.isdigit():
        upgrade_from.setdefault(int(v['Product']), []).append(int(k))

eqs = {}
for k, r in equip.items():
    if not isinstance(r, dict) or not k.isdigit():
        continue
    iid = int(k)
    st = items.sites(iid)
    st = [s for s in st if s in SITES]
    if not st:
        continue
    useful = bool(r.get('Effect') or r.get('RefineEffect') or r.get('UniqueEffect') or r.get('CardSlot')
                  or iid in lottery)
    if not useful:
        continue
    ir = item_rows.get(k) or {}
    name = named(clean(ir.get('NameZh') or r.get('NameZh')))
    if not name:
        continue
    ue = [int(b) for b in ((r.get('UniqueEffect') or {}).get('buff') or [])] if isinstance(r.get('UniqueEffect'), dict) else []
    BUFFS.update(ue)
    up = []
    u = upgrades.get(k)
    if u:
        for i in range(1, 11):
            if not u.get('Material_%d' % i):
                break
            bl = [int(b) for b in (u.get('BuffID_%d' % i) or [])]
            BUFFS.update(bl)
            up.append(bl)
    sra = r.get('SuitRefineAttr') if isinstance(r.get('SuitRefineAttr'), dict) else {}
    itype = int(ir.get('Type') or 0)
    eqs[iid] = compact({
        'n': name, 'it': itype, 's': st, 'ce': [int(x) for x in (r.get('CanEquip') or [])],
        'lv': int(ir.get('Level') or 0), 'q': int(ir.get('Quality') or 0), 'sl': int(r.get('CardSlot') or 0),
        'e': {a: num(v) for a, v in (r.get('Effect') or {}).items() if isinstance(v, (int, float))},
        'r': {a: num(v) for a, v in (r.get('RefineEffect') or {}).items() if isinstance(v, (int, float))},
        'rm': int(r.get('RefineMaxlv') or 0),
        'u': ue, 'up': up, 'sex': int(r.get('SexEquip') or 0),
        'suit': [int(x) for x in (r.get('SuitID') or [])] if isinstance(r.get('SuitID'), list) else [],
        'ek': rate_map.get(itype),
        'sra': sra,
        'lot': lottery.get(iid),
        'from': [int(x) for x in upgrade_from.get(iid, [])],
        'prod': int(u['Product']) if u and u.get('Product') else 0,
        'd': clean(ir.get('Desc')),
        'icon': ir.get('Icon'),
    })

cards = {}
card_types = {int(k): sorted(int(x) for x in v['types'].values())
              for k, v in lua_py(L.eval('GameConfig.CardComposeType')).items()}
for k, r in tab('Config_Equip_ZhuangBei_KaPian', 'Table_Card.json').items():
    if not isinstance(r, dict) or not k.isdigit():
        continue
    ir = item_rows.get(k) or {}
    name = named(clean(ir.get('NameZh') or r.get('Name')))
    if not name:
        continue
    bl = [int(b) for b in ((r.get('BuffEffect') or {}).get('buff') or [])] if isinstance(r.get('BuffEffect'), dict) else []
    BUFFS.update(bl)
    cards[int(k)] = compact({'n': name, 'p': int(r.get('Position') or 0), 'b': bl, 'q': int(r.get('Quality') or 0),
                             'd': clean(ir.get('Desc')), 'sh': 1 if r.get('IsShadow') else 0})

suits = {}
for k, v in tab('Config_Equip_ZhuangBei_KaPian', 'Table_EquipSuit.json').items():
    if not isinstance(v, dict):
        continue
    adds = {}
    for n, key in enumerate(('SuitOneAdd', 'SuitTwoAdd', 'SuitThreeAdd', 'SuitFourAdd', 'SuitFiveAdd', 'SuitSixAdd'), 1):
        b = [int(x) for x in ((v.get(key) or {}).get('buff') or [])] if isinstance(v.get(key), dict) else []
        if b:
            adds[n] = b
            BUFFS.update(b)
    rb = []
    for x in ((v.get('RefineBuff') or {}).get('equips') or []) if isinstance(v.get('RefineBuff'), dict) else []:
        if isinstance(x, dict):
            b = [int(y) for y in (x.get('buff') or [])]
            BUFFS.update(b)
            rb.append([int(x.get('id') or 0), int(x.get('lv') or 0), b])
    suits[int(k)] = compact({'p': [int(x) for x in v.get('Suitid') or []], 'a': adds, 'rb': rb,
                             'd': clean(v.get('EffectDesc')), 'team': int(v.get('SameTeam') or 0)})

enchant = []
for r in sorted(tab('Config_Equip_ZhuangBei_KaPian', 'Table_EquipEnchant.json').values(), key=lambda r: int(r['id'])):
    for x in r.get('AddAttr') or []:
        if isinstance(x, list) and x:
            BUFFS.add(int(x[0]))
for r in sorted(tab('Config_Equip_ZhuangBei_KaPian', 'Table_EquipEnchant.json').values(), key=lambda r: int(r['id'])):
    enchant.append(compact({'id': int(r['id']), 'u': int(r.get('UniqID') or 0), 't': int(r.get('EnchantType') or 0),
                            'a': r.get('AttrType'), 'b': r.get('AttrBound'), 'm': int(r.get('MaxNum') or 0),
                            'no': [k for k, v in (r.get('CantEnchant') or {}).items() if v == 1],
                            'n': clean(r.get('Name')), 'd': clean(r.get('Dsc')),
                            'cond': r.get('Condition') or {}, 'add': r.get('AddAttr') or {}}))

# ---- Astrolabe (rune board) --------------------------------------------------------------------------------------
import astrolabe  # noqa: E402
plates = {}
for pid, v in tab('Refactory', 'Config', 'Astrolabe', 'Table_Astrolabe.json').items():
    plates[int(pid)] = {'pos': v.get('pos'), 'unlock': v.get('unlock') or {},
                        'stars': {int(s): [list(c[0]) if c and isinstance(c[0], list) else [],
                                           list(c[1]) if len(c) > 1 and isinstance(c[1], list) else []]
                                  for s, c in (v.get('stars') or {}).items()}}
links = {g: sorted(x) for g, x in astrolabe.links().items()}
branches = sorted({c['tb'] for c in classes.values() if c.get('tb')} | set(astrolabe.DEFAULT_BRANCH.values()))
rune_attrs = {}
for br in branches:
    a = astrolabe.attrs(br)
    if a:
        rune_attrs[br] = {g: [compact(s), sp] for g, (s, sp) in a.items()}
specials = {}
for k, v in tab('Config_Skill_JiNeng', 'Table_RuneSpecial.json').items():
    specials[int(k)] = compact({'n': clean(v.get('RuneName')), 'tip': v.get('Runetip'), 'par': v.get('SkillTipParm'),
                                'sk': v.get('SkillID'), 'type': v.get('Type')})
special_desc = {}
for k, v in tab('Config_Skill_JiNeng', 'Table_RuneSpecialDesc.json').items():
    special_desc[int(k)] = clean(v.get('Text') or v.get('Desc') or v.get('RuneDesc') or '')
rune_cost = {int(k): (v.get('Cost') if isinstance(v.get('Cost'), list) else []) for k, v in tab('Config_Skill_JiNeng', 'Table_Rune.json').items()}
import astrorunes  # noqa: E402
rune_buffs = {}
for sp, entries in astrorunes.RUNES.items():
    rune_buffs[int(sp)] = [[int(b) for b in e] for e in entries]
    for e in entries:
        BUFFS.update(int(b) for b in e)
per_star = [int(sp) for sp in astrorunes.RUNES if astrorunes.per_star(sp)]
import astrospecials  # noqa: E402
always = {}
for sp, spec in astrospecials.SPECS.items():
    if spec[0] in ('passive', 'per_level'):
        always[int(sp)] = [spec[0], compact(spec[1]), astrospecials.special_skills(sp)]
rune_skills = {int(sp): [int(x) for x in v] for sp, v in skills.RUNE_SKILLS.items()}
rune_skill_levels = {int(sp): [int(v[0]), int(v[1])] for sp, v in skills.RUNE_SKILL_LEVELS.items()}
runes = {'always': always, 'runeSkills': rune_skills, 'runeSkillLevels': rune_skill_levels, 'runeBuffs': rune_buffs, 'noStack': sorted(astrorunes.NO_STACK), 'perStar': per_star,
         'plates': plates, 'links': links, 'attrs': rune_attrs, 'specials': specials, 'specialDesc': special_desc,
         'cost': rune_cost, 'origin': astrolabe.ORIGIN, 'defaultBranch': astrolabe.DEFAULT_BRANCH}

# ---- Gems (attribute runes) --------------------------------------------------------------------------------------
gems = {}
for k, v in tab('Config_Skill_JiNeng', 'Table_GemUpgrade.json').items():
    iid, lv = divmod(int(k), 100)
    ir = item_rows.get(str(iid)) or {}
    g = gems.setdefault(iid, {'n': clean(ir.get('NameZh')) or str(iid), 'lv': {}})
    g['lv'][lv] = compact(v.get('Attr') or {})

# ---- Adventure Handbook, titles, collections --------------------------------------------------------------------
import manual  # noqa: E402
hb_levels = {int(k): compact(v.get('AdventureAttr') or {}) for k, v in manual.levels().items()}
appell = tab('Config_Adventure_ChengJiu_MaoXian', 'Table_Appellation.json')
rank_need = {int(a): int(n) for a, n in manual.rank_levels().items()}
titles = {}
for k, v in appell.items():
    if isinstance(v, dict) and isinstance(v.get('BaseProp'), dict) and v['BaseProp']:
        titles[int(k)] = compact({'n': clean(v.get('Name')), 'g': int(v.get('GroupID') or 0), 'a': v['BaseProp'],
                                  'hb': rank_need.get(int(k))})
colls = []
for k, v in tab('Config_Adventure_ChengJiu_MaoXian', 'Table_Collection.json').items():
    if isinstance(v, dict) and v.get('RewardProperty'):
        colls.append(compact({'id': int(k), 'n': clean(v.get('Name')), 'a': v['RewardProperty']}))
extras = {'handbook': hb_levels, 'titles': titles, 'collections': colls}

# ---- buffs -------------------------------------------------------------------------------------------------------
buffer = tab('Config_Skill_JiNeng', 'Table_Buffer.json')
buffs = {}
todo = list(BUFFS)
while todo:
    b = todo.pop()
    if b in buffs:
        continue
    r = buffer.get(str(b))
    if not r:
        continue
    eff = r.get('BuffEffect') or {}
    buffs[b] = compact({'n': clean(r.get('BuffName')), 'd': clean(r.get('BuffDesc') or r.get('Dsc')),
                        'e': eff, 'c': r.get('Condition') or {}})
    # buffs a buff adds (a set buff's own pieces, conditions naming another buff) are exported too
    for key in ('buff', 'buffid', 'buff_id'):
        for x in (eff.get(key) or []) if isinstance(eff, dict) and isinstance(eff.get(key), list) else []:
            if isinstance(x, int) and x not in buffs:
                todo.append(x)

# skills that worn pieces, cards and stars give (GetSkill, GM addskill, AddMultiSkill): their families too
granted = set()
for b in buffs.values():
    e = b.get('e') or {}
    if not isinstance(e, dict):
        continue
    if e.get('type') == 'GetSkill' and e.get('SkillID'):
        granted.add(int(e['SkillID']) // 1000)
    elif e.get('type') == 'GM' and isinstance(e.get('cmd'), dict) and e['cmd'].get('type') == 'addskill' and e['cmd'].get('id'):
        granted.add(int(e['cmd']['id']) // 1000)
    elif e.get('type') == 'AddMultiSkill':
        granted.update(int(x) // 1000 for x in e.get('skillIDs') or [])
for v in list(runes['runeSkills'].values()):
    granted.update(v)
granted.update(v[0] for v in runes['runeSkillLevels'].values())
for sort in sorted(granted - set(fams)):
    lvls, lv = [], 1
    r1 = skills.row(sort * 1000 + 1)
    if not r1:
        continue
    while lv <= 40:
        r = skills.row(sort * 1000 + lv)
        if not r:
            break
        d = [[desc_template(int(x['id'])), [num(p) for p in (x.get('params') or [])]] for x in r.get('Desc') or []
             if isinstance(x, dict) and x.get('id')]
        selfb = [int(b) for b in ((r.get('Buff') or {}).get('self') or [])] if isinstance(r.get('Buff'), dict) else []
        for b in selfb if not r.get('Logic') else []:
            rr = buffer.get(str(b))
            if rr and b not in buffs:
                buffs[b] = compact({'n': clean(rr.get('BuffName')), 'd': clean(rr.get('BuffDesc') or rr.get('Dsc')),
                                    'e': rr.get('BuffEffect') or {}, 'c': rr.get('Condition') or {}})
        lvls.append(compact({'c': int(r.get('Cost') or 0), 'd': d, 'b': selfb if not r.get('Logic') else None,
                             'logic': r.get('Logic'), 'sp': num((r.get('SkillCost') or {}).get('sp')) if isinstance(r.get('SkillCost'), dict) else None}))
        lv += 1
    fams[sort] = compact({'n': clean(r1.get('NameZh')) or str(sort), 'icon': r1.get('Icon'), 'type': r1.get('SkillType'),
                          'lv': lvls, 'granted': 1})

core['cardTypes'] = card_types
dump('core.json', core)
dump('skills.json', {'fam': fams, 'desc': {k: v for k, v in descs.items() if v}})
dump('items.json', {'equip': eqs, 'cards': cards, 'suits': suits, 'enchant': enchant})
dump('buffs.json', buffs)
dump('runes.json', runes)
dump('gems.json', gems)
dump('extras.json', extras)

# ---- the client's formulas ---------------------------------------------------------------------------------------
import combat, equipfx  # noqa: E402
with open(os.path.join(OUT, 'lua', 'mock.lua'), 'w', encoding='utf-8') as fh:
    fh.write('-- Stand-ins for the creatures the client formulas read (ROM Solo server/combat.py, server/equipfx.py)\n')
    fh.write(combat._MOCK + '\n' + equipfx._LUA)
os.makedirs(os.path.join(OUT, 'lua'), exist_ok=True)
src = os.path.join(ROM, 'data', 'lua-source', 'Script', 'MConfig')
for f in ('GameConfig.lua', 'CommonFun.lua'):
    with open(os.path.join(src, f), encoding='utf-8', errors='surrogateescape') as fh:
        text = fh.read()
    if f == 'CommonFun.lua':
        text = stats.pvp_clamp_fix(text)  # ROM Solo's fix of the decompiled PvP clamps (A375)
    with open(os.path.join(OUT, 'lua', f), 'w', encoding='utf-8', errors='surrogateescape') as fh:
        fh.write(text)
    print('lua/%s' % f)
