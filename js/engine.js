// The simulator's engine: sums a build's bonuses the way ROM Solo's server does (server/stats.py _static_bonus and
// the modules it calls), then works out the final attributes with the client's own CommonFun.calcUserAttrValue.
// Works in the browser (window.RomEngine) and in Node (tests/compare.js).
(function (root) {
  'use strict';

  const STATS = ['Str', 'Int', 'Agi', 'Dex', 'Vit', 'Luk'];
  const FLAGS = new Set(['type', 'NoEffectMove', 'NoStiff', 'effect', 'value', 'calc_once', 'IgnoreAttrControl',
    'limit_layer', 'equip_effect_time']);
  const SERVER_TYPES = new Set([8, 14]);
  const NORMAL_SORT = 10;
  const SET_BUFF = [91000000, 92000000];
  const NOVICES = new Set([1, 150]);
  const UNLOCK_PRO_POINTS = 40;
  // conditions a worn piece / card / skill buff can hold on (procs.PASSIVE) and what the simulator assumes for the
  // ones that depend on the fight (HP full, out of battle, solo)
  const PASSIVE = new Set(['HpPerLess', 'HpPerMore', 'HpPerFull', 'SpPerLess', 'SpPerFull', 'Profession', 'Equip',
    'Attr', 'HasBuff', 'Gender', 'RefineLv', 'TeamNum', 'AtkAttr', 'Abnormal', 'ProfessionTeammates', 'TeamProfCount',
    'MapType', 'ChantStatus', 'Concert', 'CheckAbsorbDamage', 'BattleStatus', 'MoveLimit', 'NoDamaged', 'OnAddStatus',
    'ZenyChange']);

  const list = v => Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.values(v) : (v == null ? [] : [v]));
  const add = (o, k, v) => { if (v) o[k] = (o[k] || 0) + v; };

  class Engine {
    constructor(D, lua) {
      this.D = D;
      this.lua = lua;
      this.C = D.core;
      this.classes = D.core.classes;
      this.fam = D.skills.fam;
      this.equip = D.items.equip;
      this.cards = D.items.cards;
      this.buffs = D.buffs;
      this.idOf = {};      // VarName -> attribute id
      this.isFloat = {};   // attribute id -> divided by 1000 in the client
      for (const [v, r] of Object.entries(D.core.roledata)) { this.idOf[v] = r[0]; if (r[3]) this.isFloat[r[0]] = 1; }
      this.nameOf = {};
      for (const [v, r] of Object.entries(D.core.roledata)) this.nameOf[r[0]] = v;
      const rows = {};
      for (const [v, r] of Object.entries(D.core.roledata)) rows[r[0]] = { VarName: v, id: r[0] };
      lua.call('Sim.roledata', rows);
      this.setIds = new Set();
      for (const s of Object.values(D.items.suits)) {
        for (const b of Object.values(s.a || {})) b.forEach(x => this.setIds.add(x));
        for (const r of s.rb || []) r[2].forEach(x => this.setIds.add(x));
      }
      this.upFrom = {};   // an upgraded piece -> the pieces it was made from (all the way back)
    }

    // ---- classes and points ----------------------------------------------------------------------------------------
    cls(id) { return this.classes[id]; }

    // the job level the class's tab shows, from the character's job level (cumulative, as the server keeps it)
    jobTop(id) { const c = this.cls(id); return Math.max(c.max || 10, c.peak || 0); }
    jobBase(id) {
      const c = this.cls(id);
      if (c.hero) return 0;
      const ch = c.chain; const i = ch.indexOf(+id);
      return i > 0 ? this.jobTop(ch[i - 1]) : 0;
    }

    statPointsEarned(base) { return this.C.addPoint[Math.min(base, this.C.addPoint.length - 1)] || 0; }
    statCost(v) { return this.C.cost[v]; }
    statPointsUsed(pts) {
      let t = 0;
      for (const s of STATS) for (let v = 2; v <= (pts[s] || 1); v++) t += this.C.cost[v] || 0;
      return t;
    }
    statMax() { return Math.max(...Object.keys(this.C.cost).map(Number)); }

    skillCost(sort, lv) { let t = 0; const f = this.fam[sort]; for (let i = 0; i < lv && f && i < f.lv.length; i++) t += f.lv[i].c || 0; return t; }
    pointsIn(b, prof) { return (this.cls(prof) ? this.cls(prof).sk : []).reduce((t, s) => t + this.skillCost(s, (b.sk || {})[s] || 0), 0); }

    // skill points: stats.points_left (a Novice's points stay in the Novice tab; heroes count from job level 1)
    skillPoints(b) {
      const c = this.cls(b.cls);
      const jl = b.job;
      const ch = c.chain;
      const used = ch.reduce((t, p) => t + this.pointsIn(b, p), 0);
      if (c.hero || !NOVICES.has(ch[0])) return { total: jl - 1, used, left: jl - 1 - used, novice: null };
      const nov = ch.filter(p => NOVICES.has(p));
      const cap = this.cls(nov[nov.length - 1]).max;
      const novUsed = nov.reduce((t, p) => t + this.pointsIn(b, p), 0);
      if (NOVICES.has(+b.cls)) return { total: Math.min(jl, cap) - 1, used, left: Math.min(jl, cap) - 1 - novUsed, novice: null };
      const total = Math.max(0, jl - cap);
      return { total, used: used - novUsed, left: total - (used - novUsed),
        novice: { total: cap - 1, used: novUsed, left: cap - 1 - novUsed } };
    }

    // points to spend in the jobs before prof before its skills open (skills.tier_need, the client's
    // SimulateSkillProxy.RefreshProfessPoints)
    tierNeed(b, prof) {
      const tabs = this.cls(b.cls).chain.slice(1);
      const i = tabs.indexOf(+prof) + 1;
      if (i <= 1 || prof % 10 >= 5) return 0;
      const prev = tabs[i - 2];
      const extraIndex = this.C.peak.special.includes(prev) ? (i - 1) + 2 : (i - 1);
      return (i - 1) * UNLOCK_PRO_POINTS + ((this.C.peak.unlockExtra || {})[extraIndex] || 0);
    }
    pointsBefore(b, prof) {
      const ch = this.cls(b.cls).chain; const i = ch.indexOf(+prof);
      return i < 0 ? 0 : ch.slice(0, i).reduce((t, p) => t + this.pointsIn(b, p), 0);
    }

    // can a skill go to level lv (the next one)? returns '' or the reason it can't
    skillBlock(b, prof, sort, lv, opts) {
      const f = this.fam[sort];
      if (!f || lv > f.lv.length) return 'max level';
      const r = f.lv[lv - 1];
      opts = opts || {};
      if (r.jl && b.job < r.jl) return 'needs Job Level ' + this.jobShown(b.cls, r.jl);
      if (r.rq) {
        const have = this.learned(b)[r.rq[0]] || 0;
        if (have < r.rq[1]) return 'needs ' + ((this.fam[r.rq[0]] || {}).n || r.rq[0]) + ' Lv ' + r.rq[1];
      }
      if (r.pk && !opts.breakthrough) return 'breakthrough level (turn on Breakthrough)';
      if (r.xm && !opts.limitBreak) return 'needs a limit break (turn on Limit breaks)';
      const need = this.tierNeed(b, prof);
      if (need && this.pointsBefore(b, prof) < need) return 'opens after ' + need + ' points in the jobs before it';
      return '';
    }
    jobShown(clsId, jl) {
      const ch = this.cls(clsId).chain;
      for (const p of ch) { if (jl <= this.jobTop(p)) return (jl - this.jobBase(p)) + ' (' + this.cls(p).n + ')'; }
      return String(jl);
    }

    // every skill the character has: bought, and free ones whose condition is met (skills._learned_now)
    learned(b) {
      const have = {};
      for (const [k, v] of Object.entries(b.sk || {})) if (v > 0) have[k] = v;
      const c = this.cls(b.cls);
      for (const p of c.chain) {
        for (const sort of (this.cls(p) || { sk: [] }).sk) {
          const f = this.fam[sort];
          if (!f || have[sort]) continue;
          const r = f.lv[0];
          if (r.c) continue;
          if (r.mn && b.menusClosed) continue;
          if (r.jl && b.job < r.jl) continue;
          if (r.rq && (have[r.rq[0]] || 0) < r.rq[1]) continue;
          have[sort] = 1;
        }
      }
      if (!have[NORMAL_SORT]) have[NORMAL_SORT] = 1;
      if (c.hero && c.feature) have[c.feature] = Math.max(have[c.feature] || 0, 1);
      for (const [sort, lv] of Object.entries(this.runeSkills(b))) have[sort] = Math.max(have[sort] || 0, lv);
      for (const [sort, lv] of Object.entries(this.grants(b))) have[sort] = Math.max(have[sort] || 0, lv);
      return have;
    }

    // skills the lit Astrolabe stars give (skills.rune_skills), up to each skill's top level
    runeSkills(b) {
      if (!(b.stars || []).length) return {};
      const out = {};
      const R = this.D.runes;
      for (const [sp, n] of Object.entries(this.specials(b))) {
        for (const sort of (R.runeSkills || {})[sp] || []) out[sort] = (out[sort] || 0) + n;
        const lv = (R.runeSkillLevels || {})[sp];
        if (lv) out[lv[0]] = (out[lv[0]] || 0) + n * lv[1];
      }
      for (const k of Object.keys(out)) out[k] = Math.min(out[k], ((this.fam[k] || {}).lv || []).length);
      return out;
    }

    // skills the worn pieces, cards and lit special stars give (equipfx.skill_grants: GetSkill, GM addskill,
    // AddMultiSkill), when their condition holds
    grants(b) {
      const worn = this.worn(b);
      const wornAt = {}; worn.forEach(w => wornAt[w.pos] = w);
      const wtype = wornAt[7] ? (wornAt[7].row.it || 0) : 0;
      const src = this.gearBuffs(b, worn).map(x => x[0]);
      worn.forEach(w => w.cards.forEach(cd => src.push(...((this.cards[cd] || {}).b || []))));
      src.push(...this.runeBuffs(b));
      const ctx = { b, worn, wornAt, wtype, props: {}, buffIds: new Set(src), totals: {}, learned: {} };
      const out = {};
      const put = (sid) => { const s = Math.floor(sid / 1000), l = (sid % 1000) || 1; out[s] = Math.max(out[s] || 0, l); };
      for (const bid of src) {
        const e = (this.buffs[bid] || {}).e;
        if (!e || !['GetSkill', 'GM', 'AddMultiSkill'].includes(e.type) || e.FeatureLevel) continue;
        const cd = this.cond(bid);
        if (cd.type && (!PASSIVE.has(cd.type) || !this.condOk(cd, ctx))) continue;
        if (e.type === 'AddMultiSkill') { (e.skillIDs || []).forEach(put); continue; }
        if (e.type === 'GM') { if (e.cmd && e.cmd.type === 'addskill' && e.cmd.id) put(+e.cmd.id); continue; }
        if (e.SkillID) put(+e.SkillID);
      }
      return out;
    }

    // ---- equipment ---------------------------------------------------------------------------------------------
    sources(id) {
      if (this.upFrom[id]) return this.upFrom[id];
      const out = [];
      const todo = [...((this.equip[id] || {}).from || [])];
      while (todo.length && out.length < 20) {
        const x = todo.pop();
        if (!out.includes(x)) { out.push(x); todo.push(...((this.equip[x] || {}).from || [])); }
      }
      return (this.upFrom[id] = out);
    }

    worn(b) {
      const out = [];
      for (const [site, e] of Object.entries(b.eq || {})) {
        if (!e || !e.id || !this.equip[e.id]) continue;
        out.push({ pos: +site, id: +e.id, row: this.equip[e.id], rf: +e.rf || 0, up: +e.up || 0,
          cards: (e.cards || []).filter(x => x && this.cards[x]), en: e.en || [], ex: e.ex || [] });
      }
      out.sort((a, b2) => a.pos - b2.pos);
      this.refineUps(out);
      return out;
    }

    // the refine levels the UpgradeRefineLv buffs add (worn pieces' upgrade levels, cards): equipfx.refine_of.
    // w.rf stays the piece's own refine (a RefineLv condition reads that); w.rfx is the one its effects use
    refineUps(worn) {
      const ups = {};
      const ids = [];
      for (const w of worn) {
        const steps = w.row.up || [];
        for (let i = 0; i < Math.min(w.up, steps.length); i++) ids.push(...steps[i]);
      }
      worn.forEach(w => w.cards.forEach(cd => ids.push(...((this.cards[cd] || {}).b || []))));
      for (const bid of ids) {
        const e = (this.buffs[bid] || {}).e;
        if (!e || e.type !== 'UpgradeRefineLv') continue;
        const up = e.upLevel;
        const n = Math.trunc(typeof up === 'object' && up ? ((+up.a || 0) * 1 + (+up.b || 0)) : +(up || 0));
        const key = ({ 0: 1, 1: 0, 2: 2 })[+(e.limit || 0)] ?? 0;
        for (const pos of e.equipPos || []) {
          const v = ups[+pos] = ups[+pos] || [0, 0, 0, 0];
          v[key] += n;
          if (e.toLevel) v[3] = +e.toLevel;
        }
      }
      for (const w of worn) {
        const u = ups[w.pos];
        if (!u) { w.rfx = w.rf; continue; }
        const [withL, without, extra0, cap] = u;
        let mx = (w.row.rm || 0) + without;
        const extra = Math.min(extra0, 18);
        const total = w.rf + withL + without + extra;
        if (extra > 0) mx = Math.min(total, 18);
        const res = cap > 0 ? Math.min(total, cap) : total;
        w.rfx = Math.max(w.rf, Math.min(res, mx));
      }
    }

    // equipfx.sources + the sets: [buff, slot, origin]
    gearBuffs(b, worn) {
      const out = []; const seen = new Set();
      const isSet = x => (x >= SET_BUFF[0] && x < SET_BUFF[1]) || this.setIds.has(x);
      for (const w of worn) {
        for (const x of w.row.u || []) {
          if (isSet(x)) { if (seen.has(x)) continue; seen.add(x); }
          out.push([x, w.pos, 'unique']);
        }
      }
      for (const [x, pos] of this.suitBuffs(worn)) if (!seen.has(x)) { seen.add(x); out.push([x, pos, 'suit']); }
      for (const w of worn) {
        const steps = w.row.up || [];
        for (let i = 0; i < Math.min(w.up, steps.length); i++) for (const x of steps[i]) out.push([x, w.pos, 'upgrade']);
      }
      // the enchant combination buffs of pieces refined far enough (enchant.extra_buffs)
      for (const w of worn) {
        for (const [uid, bid] of (w.ex || []).filter(Boolean)) {
          const r = this.D.items.enchant.find(x => x.u === +uid);
          const need = +(((r || {}).cond || {}).refinelv || 0);
          if (bid && w.rfx >= need) out.push([+bid, w.pos, 'enchant']);
        }
      }
      return out;
    }

    // {special star id: stars lit} (astrolabe.specials; the client's GetRunePoint)
    specials(b) {
      const c = this.cls(b.cls);
      const br = c.tb || (this.D.runes.defaultBranch || {})[c.type];
      const ra = (this.D.runes.attrs || {})[br] || {};
      const count = {};
      for (const g of b.stars || []) { const sp = (ra[g] || [])[1]; if (sp) count[sp] = (count[sp] || 0) + 1; }
      return count;
    }

    // the lit special stars' rune buffs (astrorunes.rune_buffs): once per lit star
    runeBuffs(b) {
      const count = this.specials(b);
      const R = this.D.runes, noStack = new Set(R.noStack || []), perStar = new Set(R.perStar || []);
      const out = [];
      for (const sp of Object.keys(count).map(Number).sort((x, y) => x - y)) {
        const stars = (R.runeBuffs || {})[sp];
        if (!stars) continue;
        const n = count[sp];
        const more = perStar.has(sp) ? n - stars.length : 0;
        const m = more > 0 ? n : Math.min(n, stars.length);
        for (let i = 0; i < m; i++) for (const x of stars[Math.min(i, stars.length - 1)]) if (!noStack.has(x) || !out.includes(x)) out.push(x);
      }
      return out;
    }

    suitBuffs(worn) {
      const have = {};
      for (const w of worn) {
        if (!(w.id in have)) have[w.id] = w;
        for (const s of this.sources(w.id)) if (!(s in have)) have[s] = w;
      }
      const out = []; const teams = new Set();
      const ids = Object.keys(this.D.items.suits).map(Number).sort((a, c) => a - c);
      for (const sid of ids) {
        const s = this.D.items.suits[sid];
        const got = s.p.filter(p => p in have);
        if (!got.length || (s.team && teams.has(s.team) && got.length === s.p.length)) continue;
        const pos = have[got[0]].pos;
        for (const [n, bl] of Object.entries(s.a || {})) if (got.length >= +n) bl.forEach(x => out.push([x, pos]));
        if (got.length === s.p.length) {
          for (const [pid, lv, bl] of s.rb || []) {
            const w = have[pid];
            if (w && w.rfx >= lv) bl.forEach(x => out.push([x, w.pos]));
          }
          if (s.team) teams.add(s.team);
        }
      }
      return out;
    }

    suitRefineBonus(worn) {
      const ids = new Set();
      for (const w of worn) { ids.add(w.id); this.sources(w.id).forEach(x => ids.add(x)); }
      const out = {};
      for (const w of worn) {
        const sra = w.row.sra;
        if (!sra) continue;
        const ok = (sra.suitid || []).some(sid => ((this.D.items.suits[sid] || {}).p || [0]).every(p => ids.has(p)));
        if (!ok) continue;
        for (const [k, v] of Object.entries(sra)) {
          if (k === 'suitid' || typeof v !== 'object') continue;
          const n = Math.floor(w.rfx / Math.max(1, +v.lv || 1));
          add(out, k, Math.min(+v.max || 1e9, (+v.base || 0) * n));
        }
      }
      return out;
    }

    // ---- buff numbers ------------------------------------------------------------------------------------------
    cond(bid) { const c = (this.buffs[bid] || {}).c; return c && typeof c === 'object' ? c : {}; }
    isAttrChange(bid) { const e = (this.buffs[bid] || {}).e; return e && e.type === 'AttrChange'; }

    value(spec, pos, level, ctx) {
      if (typeof spec === 'number') return spec;
      if (!spec || typeof spec !== 'object') return 0;
      const t = +(spec.type || 1);
      const a = +spec.a || 0, b = +spec.b || 0, c = +spec.c || 0, d = +spec.d || 0;
      if (t === 1) return a * level + b;
      if (t === 15) return (ctx.props.MaxSp || 0) * b + a;
      if (t === 16) return 0;
      if (t === 8) return b * (ctx.learned[Math.trunc(a)] || 0) + c;
      if (t === 14) return a * Math.floor((ctx.totals.Vit || 0) / 5) * 5 + b;
      const param = {};
      for (const [k, v] of Object.entries(spec)) if (!'abcd'.includes(k) && k !== 'type' && typeof v === 'number') param[k] = v;
      const w = pos != null ? ctx.wornAt[pos] : null;
      const cur = w ? { id: w.id, pos: w.pos, refinelv: w.rfx, lv: w.up, quench_per: 0 } : null;
      const v = this.lua.call('Sim.value', t, a, b, c, d, level, cur, param);
      return typeof v === 'number' && isFinite(v) ? v : 0;
    }

    // a buff's AttrChange for the piece at slot pos. A calc_once buff ("Def -50%" as -Def / 2: Tao Gunka Card) is
    // worked out on your numbers before its own change (equipfx.Wearer.attr_change, A353)
    attrChange(bid, pos, level, ctx) {
      const e = (this.buffs[bid] || {}).e;
      const out = {};
      if (!e || e.type !== 'AttrChange') return out;
      const key = bid + ':' + pos;
      const last = e.calc_once ? (ctx.once[key] || {}) : null;
      if (last && Object.keys(last).length) {
        const p = Object.assign({}, ctx.props);
        for (const [k, v] of Object.entries(last)) if (p[k] != null) p[k] -= v;
        this.lua.call('Sim.props', p);
      }
      for (const [k, spec] of Object.entries(e)) if (!FLAGS.has(k)) add(out, k, this.value(spec, pos, level, ctx));
      if (last && Object.keys(last).length) this.lua.call('Sim.props', ctx.props);
      if (e.calc_once) {
        const mine = {};
        for (const [k, spec] of Object.entries(e)) if (typeof spec === 'object' && k in out) mine[k] = out[k];
        ctx.onceNext[key] = mine;
      }
      return out;
    }

    // procs.passive_ok for the conditions that don't depend on the fight; the fight ones take the simulator's
    // assumptions (b.assume): full HP and SP, out of battle, no status, solo
    condOk(cond, ctx) {
      const b = ctx.b; const t = cond.type;
      const A = b.assume || {};
      const mapType = +(A.mapType || 0);
      if (t !== 'MapType') {
        if (cond.needMapType && !list(cond.needMapType).map(Number).includes(mapType)) return false;
        if (cond.noMapType && list(cond.noMapType).map(Number).includes(mapType)) return false;
      }
      const hp = A.hpPct == null ? 100 : +A.hpPct, sp = A.spPct == null ? 100 : +A.spPct;
      switch (t) {
        case 'OnAddStatus': case 'ZenyChange': return true;
        case 'HpPerLess': return hp < +(cond.value || 0);
        case 'HpPerMore': return hp > +(cond.value || 0);
        case 'HpPerFull': return hp >= 100;
        case 'SpPerLess': return sp < +(cond.value || 0);
        case 'SpPerFull': return sp >= 100;
        case 'Profession': return list(cond.value).map(Number).includes(+b.cls);
        case 'RefineLv': {
          const refs = {}; ctx.worn.forEach(w => refs[w.pos] = w.rf);
          return list(cond.pos).every(p => (refs[+p] || 0) >= +(cond.lv_more || 0));
        }
        case 'TeamNum': return (+A.party || 1) >= +(cond.value || 0);
        case 'AtkAttr': return Math.trunc(+(ctx.props.AtkAttr || 5)) === +(cond.atk_attr || 0);
        case 'Gender': return (+b.gender || 1) === +(cond.gender || 0);
        case 'Equip': {
          if (cond.itemID || cond.no_items) {
            const ids = new Set(ctx.worn.map(w => w.id));
            ctx.worn.forEach(w => w.cards.forEach(x => ids.add(+x)));
            if (cond.itemID && !list(cond.itemID).some(x => ids.has(+x))) return false;
            if (cond.no_items && list(cond.no_items).some(x => ids.has(+x))) return false;
          }
          const types = ctx.worn.map(w => w.row.it);
          if (cond.itemTypes && !list(cond.itemTypes).some(x => types.includes(+x))) return false;
          if (cond.noWeaponTypes && list(cond.noWeaponTypes).map(Number).includes(ctx.wtype)) return false;
          if (cond.typeID && !list(cond.typeID).map(Number).includes(ctx.wtype)) return false;
          return true;
        }
        case 'Attr': {
          for (const [k, v] of Object.entries(cond)) {
            if (k === 'type') continue;
            if (k === 'profession') { if (!list(v).map(Number).includes(+b.cls)) return false; continue; }
            if (k === 'Hiding') { if (!!+v) return false; continue; }
            if (typeof v === 'object') continue;
            if (+(ctx.props[k] || 0) < +v) return false;
          }
          return true;
        }
        case 'HasBuff': {
          const want = list(cond.buffid).map(Number), nope = list(cond.nobuffid).map(Number);
          if (!want.length && !nope.length) return false;
          return want.every(x => ctx.buffIds.has(x)) && !nope.some(x => ctx.buffIds.has(x));
        }
        case 'MapType': {
          if (cond.needMapID) return false;
          if (cond.needMapType && !list(cond.needMapType).map(Number).includes(mapType)) return false;
          if (cond.noMapType && list(cond.noMapType).map(Number).includes(mapType)) return false;
          return !!(cond.needMapType || cond.noMapType);
        }
        default: return false;
      }
    }

    elements(ctx, gear, runeBuffs) {
      const SKIP = new Set(['type', 'atk_def_priority', 'AtkAttr', 'DefAttr', 'AttrEffect', 'StateEffect', 'force_status', 'extra_attr']);
      const cardIds = new Set();
      ctx.worn.forEach(w => w.cards.forEach(cd => ((this.cards[cd] || {}).b || []).forEach(x => cardIds.add(x))));
      const ok = bid => { const cd = this.cond(bid); return !cd.type || (PASSIVE.has(cd.type) && this.condOk(cd, ctx)); };
      const effs = [];
      for (const [bid] of gear) if (!cardIds.has(bid) && ok(bid)) effs.push(bid);
      for (const bid of runeBuffs) if (!cardIds.has(bid) && ok(bid)) effs.push(bid);
      for (const w of ctx.worn) for (const cd of w.cards) for (const bid of (this.cards[cd] || {}).b || []) if (ok(bid)) effs.push(bid);
      const best = { AtkAttr: null, DefAttr: null };
      const bonus = {};
      effs.forEach((bid, i) => {
        const e = (this.buffs[bid] || {}).e;
        if (!e || e.type !== 'BattleAttr') return;
        const pri = [+(e.atk_def_priority || 0), 0, i];
        for (const k of ['AtkAttr', 'DefAttr']) {
          if (!e[k]) continue;
          const bp = best[k] && best[k][0];
          if (!bp || pri[0] > bp[0] || (pri[0] === bp[0] && pri[2] > bp[2])) best[k] = [pri, +e[k]];
        }
        for (const [k, spec] of Object.entries(e)) if (!SKIP.has(k) && !FLAGS.has(k)) add(bonus, k, this.value(spec, null, 1, ctx));
      });
      return { atk: best.AtkAttr && best.AtkAttr[1], def: best.DefAttr && best.DefAttr[1], bonus };
    }

    // ---- the whole sum ---------------------------------------------------------------------------------------
    compute(b) {
      const c = this.cls(b.cls);
      if (!c) throw new Error('no class ' + b.cls);
      const hero = !!c.hero;
      const totals = {};
      for (const s of STATS) {
        const p = (b.pts || {})[s] || 1;
        totals[s] = c.tb ? Math.trunc(this.lua.call('Sim.stat', p, b.job, c.tb, s, hero)) : p;
      }
      const learned = this.learned(b);
      const worn = this.worn(b);
      const wornAt = {}; worn.forEach(w => wornAt[w.pos] = w);
      const weapon = wornAt[7];
      const wtype = weapon ? (weapon.row.it || 0) : 0;
      const gear = this.gearBuffs(b, worn);
      const runeBuffs = this.runeBuffs(b);

      // the passive skills' always-on self buffs (skills.passive_buff_ids) and every worn buff: what HasBuff sees
      const passiveIds = [];
      for (const [sort, lv] of Object.entries(learned)) {
        const f = this.fam[sort]; const r = f && f.lv[lv - 1];
        if (!r || !r.b) continue;
        for (const x of r.b) passiveIds.push([x, +sort, lv]);
      }
      const buffIds = new Set();
      gear.forEach(([x]) => buffIds.add(x));
      worn.forEach(w => w.cards.forEach(cd => ((this.cards[cd] || {}).b || []).forEach(x => buffIds.add(x))));
      passiveIds.forEach(([x]) => { if (!Object.keys(this.cond(x)).length) buffIds.add(x); });
      runeBuffs.forEach(x => buffIds.add(x));

      const equips = {};
      for (const w of worn) equips[w.pos] = { id: w.id, refinelv: w.rfx, lv: w.up, pos: w.pos, quench_per: 0, strength: 0, isAtShadow: false };
      const cardnum = {};
      worn.forEach(w => w.cards.forEach(x => cardnum[x] = (cardnum[x] || 0) + 1));
      const bset = {}; buffIds.forEach(x => bset[x] = true);
      const info = { cid: 1, profession: +b.cls, joblv: b.job, baselv: b.base, being: 0, skills: learned, zeny: 0,
        cart: 0, cartmax: 0, cardnum, stars: (b.stars || []).length, runes: this.specials(b) };

      let last = null, result = null, once = {};
      for (let pass = 0; pass < 4; pass++) {
        const props = {};
        for (const s of STATS) props[s] = totals[s];
        if (last) Object.assign(props, last);
        this.lua.call('Sim.wearer', props, equips, bset, info);
        const ctx = { b, totals, learned, worn, wornAt, wtype, props, buffIds, once, onceNext: {} };
        result = this.sum(b, ctx, gear, passiveIds, runeBuffs);
        once = ctx.onceNext;
        const named = result.named;
        if (last && Object.keys(named).every(k => Math.abs((last[k] || 0) - named[k]) < 1e-6)) break;
        last = named;
      }
      return result;
    }

    sum(b, ctx, gear, passiveIds, runeBuffs) {
      const c = this.cls(b.cls);
      const parts = {};   // where each bonus comes from: {source: {VarName: value}}
      const part = name => (parts[name] = parts[name] || {});
      const { worn, wtype } = ctx;

      // worn equipment: its Effect, RefineEffect per refine level
      for (const w of worn) {
        const p = part('Equipment');
        for (const [k, v] of Object.entries(w.row.e || {})) add(p, k, v);
        if (w.rfx) { const r = part('Refine'); for (const [k, v] of Object.entries(w.row.r || {})) add(r, k, v * w.rfx); }
        for (const [lo, hi, at] of w.row.lot || []) {   // a Saint piece's stats by Base Level band (items.lottery_attrs)
          if (b.base >= lo && b.base <= hi) { for (const [k, v] of Object.entries(at)) add(p, k, v); break; }
        }
      }
      // the pieces' own buffs, sets and upgrade levels (unconditional AttrChange)
      for (const [bid, pos, origin] of gear) {
        if (Object.keys(this.cond(bid)).length) continue;
        const p = part(origin === 'upgrade' ? 'Upgrade' : origin === 'suit' ? 'Sets' : origin === 'enchant' ? 'Enchants' : 'Equipment effects');
        for (const [k, v] of Object.entries(this.attrChange(bid, pos, 1, ctx))) add(p, k, v);
      }
      for (const [k, v] of Object.entries(this.suitRefineBonus(worn))) add(part('Sets'), k, v);
      // passive skills (skills.passive_bonus: their AttrChange, a weapon condition checked)
      for (const [bid, sort, lv] of passiveIds) {
        const e = (this.buffs[bid] || {}).e;
        if (!e || e.type !== 'AttrChange') continue;
        const cd = this.cond(bid);
        if (cd.type === 'Equip' && +(cd.typeID || 0) !== +wtype) continue;  // other conditions count as the server's do
        const p = part('Passive skills');
        for (const [k, spec] of Object.entries(e)) if (!FLAGS.has(k)) add(p, k, this.value(spec, null, lv, ctx));
      }
      // cards (cards.bonus: unconditional AttrChange at level 1)
      for (const w of worn) {
        for (const cd of w.cards) {
          for (const bid of (this.cards[cd] || {}).b || []) {
            if (Object.keys(this.cond(bid)).length) continue;
            for (const [k, v] of Object.entries(this.attrChange(bid, w.pos, 1, ctx))) add(part('Cards'), k, v);
          }
        }
      }
      // enchants (per cent attributes are entered as per cent)
      for (const w of worn) {
        for (const x of w.en || []) {
          if (!x) continue;
          const [k, v] = x;
          if (!k || !v) continue;
          const id = this.idOf[k];
          add(part('Enchants'), k, id != null && this.isFloat[id] ? v / 100 : +v);
        }
      }
      // the Astrolabe's stars that are on
      const br = c.tb || (this.D.runes.defaultBranch || {})[c.type];
      const ra = (this.D.runes.attrs || {})[br] || {};
      for (const g of b.stars || []) for (const [k, v] of Object.entries((ra[g] || [{}])[0] || {})) add(part('Runes (Astrolabe)'), k, v);
      // the special stars that always count, or by a skill's level (astrospecials.bonus)
      for (const [sp, n] of Object.entries(this.specials(b))) {
        const spec = (this.D.runes.always || {})[sp];
        if (!spec) continue;
        const mult = spec[0] === 'passive' ? n : n * (spec[2] || []).reduce((t, f) => t + (ctx.learned[f] || 0), 0);
        for (const [k, v] of Object.entries(spec[1])) add(part('Runes (Astrolabe)'), k, v * mult);
      }
      for (const bid of runeBuffs) {
        if (Object.keys(this.cond(bid)).length) continue;
        for (const [k, v] of Object.entries(this.attrChange(bid, null, 1, ctx))) add(part('Runes (Astrolabe)'), k, v);
      }
      // embedded attribute runes (Gems)
      for (const g of b.gems || []) {
        if (!g) continue;
        const row = ((this.D.gems[g.id] || {}).lv || {})[g.lv || 1] || {};
        for (const [k, v] of Object.entries(row)) add(part('Gems'), k, v);
      }
      // the classes reached: each branch's highest class's UnlockAttr (multijob.unlock_bonus)
      const reached = new Set([+b.cls, ...(b.reached || []).map(Number)]);
      const byBranch = {};
      for (const p of reached) {
        const r = this.cls(p); if (!r) continue;
        const key = r.tb || p;
        if (!byBranch[key] || p > byBranch[key]) byBranch[key] = p;
      }
      for (const p of Object.values(byBranch)) for (const [k, v] of Object.entries(this.cls(p).unlock || {})) add(part('Classes reached'), k, v);
      // conditional buffs whose condition holds now (procs.passive_bonus): cards, the pieces' own, sets, upgrades
      const condSrc = [];
      const seenSets = new Set();
      for (const w of worn) for (const cd of w.cards) for (const bid of (this.cards[cd] || {}).b || []) {
        if (bid >= SET_BUFF[0]) { if (seenSets.has(bid)) continue; seenSets.add(bid); }
        condSrc.push([bid, w.pos]);
      }
      for (const [bid, pos] of gear) condSrc.push([bid, pos]);
      for (const bid of runeBuffs) condSrc.push([bid, null]);
      for (const [bid, pos] of condSrc) {
        const cd = this.cond(bid);
        if (!cd.type || !PASSIVE.has(cd.type) || !this.isAttrChange(bid)) continue;
        if (!this.condOk(cd, ctx)) continue;
        for (const [k, v] of Object.entries(this.attrChange(bid, pos, 1, ctx))) add(part('Conditional effects'), k, v);
      }
      // the Adventure Handbook's levels and ranks, titles and complete collections (manual.bonus)
      const X = this.D.extras;
      if (X) {
        const hl = Math.max(0, +b.handbook || 0);
        for (let n = 1; n <= hl; n++) for (const [k, v] of Object.entries(X.handbook[n] || {})) add(part('Adventure Handbook'), k, v);
        const mine = new Set((b.titles || []).map(Number));
        for (const [id, t] of Object.entries(X.titles)) {
          if (t.hb && t.hb <= hl) for (const [k, v] of Object.entries(t.a)) add(part('Adventure Handbook'), k, v);
          if (mine.has(+id)) for (const [k, v] of Object.entries(t.a)) add(part('Titles'), k, v);
        }
        const done = new Set((b.colls || []).map(Number));
        for (const co of X.collections) if (done.has(co.id)) for (const [k, v] of Object.entries(co.a)) add(part('Collections'), k, v);
      }
      // the armour's and attack's element from cards and gear (battleattr.battle), and the other numbers they carry
      const el = this.elements(ctx, gear, runeBuffs);
      for (const [k, v] of Object.entries(el.bonus)) add(part('Cards'), k, v);
      // the user's own extra numbers (Adventure Handbook, food, guild ...)
      for (const [k, v] of Object.entries(b.extra || {})) {
        const id = this.idOf[k];
        add(part('Extra'), k, id != null && this.isFloat[id] ? +v / 100 : +v);
      }

      const bonus = {};
      for (const p of Object.values(parts)) for (const [k, v] of Object.entries(p)) add(bonus, k, v);
      const attr = {};
      for (const [k, v] of Object.entries(bonus)) if (k in this.idOf && !STATS.includes(k)) attr[this.idOf[k]] = (attr[this.idOf[k]] || 0) + v;
      const RD = this.C.RD;
      const stat = {};
      for (const s of STATS) { stat[s] = ctx.totals[s] + Math.trunc(bonus[s] || 0); attr[RD['EATTRTYPE_' + s.toUpperCase()]] = stat[s]; }
      const res = this.lua.call('Sim.attrs', attr, b.base, c.fc, +b.cls, wtype, +(b.mapKind || 0)) || {};
      const out = {};
      for (const [k, v] of Object.entries(res)) out[+k] = v;
      for (const [k, v] of Object.entries(bonus)) {
        const id = this.idOf[k];
        if (id != null && !STATS.includes(k) && !(id in out)) out[id] = v;
      }
      for (const s of STATS) out[RD['EATTRTYPE_' + s.toUpperCase()]] = stat[s];
      const named = {};
      for (const [id, v] of Object.entries(out)) {
        const n = this.nameOf[id]; if (!n) continue;
        named[n] = this.isFloat[id] ? Math.round(v * 1000) / 1000 : Math.floor(v + 1e-9);
      }
      if (el.atk) named.AtkAttr = el.atk;
      if (el.def) named.DefAttr = el.def;
      if (!named.AtkAttr) named.AtkAttr = 5;
      if (!named.DefAttr) named.DefAttr = 5;
      return { named, parts, totals: ctx.totals, bonus, wtype };
    }
  }

  Engine.STATS = STATS;
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine; else root.RomEngine = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
