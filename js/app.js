// ROM Build Simulator: the page. Data from data/*.json (tools/export.py), numbers from js/engine.js.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const STATS = ['Str', 'Agi', 'Vit', 'Int', 'Dex', 'Luk'];
  const ELEMENTS = { 1: 'Wind', 2: 'Earth', 3: 'Water', 4: 'Fire', 5: 'Neutral', 6: 'Holy', 7: 'Shadow', 8: 'Ghost', 9: 'Undead', 10: 'Poison' };
  const SLOT_ORDER = [7, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 15, 16, 17, 19];
  const ENCHANT_TYPES = { 1: 'Primary', 2: 'Medium', 3: 'Advanced' };
  const ITEMS = { 100: 'Zeny', 140: 'Contribution', 141: 'Contribution (locked)', 5261: 'Gold Medal', 5263: 'Gold Medal (locked)' };
  const MAIN = [['ShowAtk', 'Atk'], ['ShowMAtk', 'M.Atk'], ['ShowDef', 'Def'], ['ShowMDef', 'M.Def'], ['MaxHp', 'Max HP'],
    ['MaxSp', 'Max SP'], ['Hit', 'Hit'], ['Flee', 'Flee'], ['Cri', 'Crit'], ['CriRes', 'Crit Res'], ['AtkSpd', 'Atk Spd'],
    ['MoveSpd', 'Move Spd'], ['Refine', 'Refine Atk'], ['MRefine', 'Refine M.Atk']];
  const RAW = new Set(['Atk', 'MAtk', 'Def', 'MDef', 'CastSpd', 'RestoreSpd', 'SpRestoreSpd']);
  const HIDE = new Set(['Hp', 'Sp', 'NoShow', 'AttrEffect', 'AttrEffect2', 'AttrEffect3', 'StateEffect', 'Hiding', 'ShowAtk',
    'ShowMAtk', 'ShowDef', 'ShowMDef', 'ShowMaxHp', 'ShowMaxSp', 'ShowHit', 'ShowFlee', 'ShowCri', 'ShowCriRes', 'ShowAtkSpd',
    'ShowMoveSpd', 'ShowCastSpd', 'ShowRestoreSpd', 'Str', 'Agi', 'Vit', 'Int', 'Dex', 'Luk']);

  let D, E, B, R = null;
  const ui = { tab: 'stats', skillTab: null, sel: null, filter: '', view: null };

  // ---- text -----------------------------------------------------------------------------------------------------
  const rd = k => D.core.roledata[k];
  const NAMES = { MaxHp: 'Max HP', MaxSp: 'Max SP', MaxHpPer: 'Max HP%', MaxSpPer: 'Max SP%', BaseHp: 'Base HP' };
  const attrName = k => NAMES[k] || (rd(k) && rd(k)[1]) || k.replace(/([a-z])([A-Z])/g, '$1 $2');
  function fmt(k, v) {
    if (v == null || isNaN(v)) v = 0;
    if (k === 'AtkAttr' || k === 'DefAttr') return ELEMENTS[Math.round(v)] || v;
    const r = rd(k);
    if (r && r[2]) return trim((v * 100).toFixed(2)) + '%';
    if (r && r[3]) return trim((+v).toFixed(3));
    return Math.abs(v) >= 1000 ? Math.round(v).toLocaleString() : trim((+v).toFixed(2));
  }
  const trim = s => s.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  function fmtAdd(k, v) {
    const s = fmt(k, v);
    return (v > 0 && !String(s).startsWith('-') ? '+' : '') + s;
  }
  function effText(obj) {
    return Object.entries(obj || {}).filter(([k, v]) => typeof v === 'number' && v).map(([k, v]) => attrName(k) + ' ' + fmtAdd(k, v)).join(', ');
  }
  function buffText(bid) {
    const b = D.buffs[bid];
    if (!b) return '';
    if (b.d) return b.d;
    const e = b.e || {};
    if (e.type === 'AttrChange') {
      const plain = {};
      for (const [k, v] of Object.entries(e)) if (typeof v === 'number' && k !== 'equip_effect_time') plain[k] = v;
      const t = effText(plain);
      if (t) return t;
    }
    return b.n || '';
  }
  function skillDesc(sort, lv) {
    const f = D.skills.fam[sort];
    const r = f && f.lv[lv - 1];
    if (!r) return '';
    return (r.d || []).map(([id, ps]) => {
      let t = D.skills.desc[id] || '';
      const p = [...(ps || [])];
      t = t.replace(/%s/g, () => p.length ? p.shift() : '?');
      return t;
    }).join('\n');
  }

  // ---- the build ------------------------------------------------------------------------------------------------
  function defaultBuild(cls) {
    cls = cls || 14;
    const b = { v: 1, cls, base: D.core.maxBase, job: 1, gender: 1, pts: {}, sk: {}, eq: {}, stars: [], gems: [],
      handbook: 1, titles: [], colls: [], extra: {}, reached: [], assume: { hpPct: 100, spPct: 100, party: 1 },
      opts: { breakthrough: true, limitBreak: true } };
    STATS.forEach(s => b.pts[s] = 1);
    b.job = E.jobTop(cls);
    return b;
  }

  function normalize(b) {
    const c = E.cls(b.cls);
    if (!c) { Object.assign(b, defaultBuild()); return b; }
    b.base = Math.max(1, Math.min(D.core.maxBase, Math.round(+b.base || 1)));
    b.job = Math.max(1, Math.min(E.jobTop(b.cls), Math.round(+b.job || 1)));
    b.pts = b.pts || {}; STATS.forEach(s => b.pts[s] = Math.max(1, Math.min(E.statMax(), Math.round(+b.pts[s] || 1))));
    const allowed = new Set();
    c.chain.forEach(p => ((E.cls(p) || {}).sk || []).forEach(s => allowed.add(s)));
    for (const k of Object.keys(b.sk || {})) if (!allowed.has(+k) || !b.sk[k]) delete b.sk[k];
    b.eq = b.eq || {};
    for (const [site, e] of Object.entries(b.eq)) if (!e || !e.id || !D.items.equip[e.id] || !canEquip(e.id, b.cls)) delete b.eq[site];
    const ra = runeAttrs(b);
    b.stars = (b.stars || []).filter(g => exists(g));
    b.gems = (b.gems || []).slice(0, 10).map(g => g && D.gems[g.id] ? g : null);
    b.opts = Object.assign({ breakthrough: true, limitBreak: true }, b.opts || {});
    b.assume = Object.assign({ hpPct: 100, spPct: 100, party: 1 }, b.assume || {});
    return b;
  }

  function canEquip(id, cls) {
    const it = D.items.equip[id];
    if (!it) return false;
    const ce = it.ce || [];
    return !ce.length || ce.includes(0) || ce.includes(+cls);
  }

  let timer = null;
  function changed(redraw) {
    normalize(B);
    try { localStorage.setItem('romsim2.current', JSON.stringify(B)); } catch (e) { /* private mode */ }
    clearTimeout(timer);
    timer = setTimeout(() => {
      compute();
      renderHeader();
      if (redraw !== false) renderTab();
      renderResult();
    }, 10);
  }

  function compute() {
    try { R = E.compute(B); } catch (e) { console.error(e); toast('Could not work this build out: ' + e.message); }
  }

  // ---- header -------------------------------------------------------------------------------------------------
  function classGroups() {
    const groups = {};
    for (const [id, c] of Object.entries(D.core.classes)) {
      let g;
      if (c.hero) g = 'Heroes';
      else {
        const first = c.chain.find(p => p !== 1 && p !== 150);
        g = first ? E.cls(first).n + ' line' : 'Novice';
        if (c.chain.includes(150)) g = 'Doram · ' + g;
      }
      (groups[g] = groups[g] || []).push(+id);
    }
    return groups;
  }

  function renderClassSelect() {
    const sel = $('cls');
    sel.innerHTML = '';
    const groups = classGroups();
    const order = Object.keys(groups).sort((a, b) => (a === 'Heroes') - (b === 'Heroes') || (a === 'Novice' ? -1 : 0) || Math.min(...groups[a]) - Math.min(...groups[b]));
    for (const g of order) {
      const og = document.createElement('optgroup'); og.label = g;
      for (const id of groups[g].sort((a, b) => a - b)) {
        const o = document.createElement('option'); o.value = id;
        const c = E.cls(id);
        o.textContent = c.n + (c.hero ? '' : ' (' + tierName(id) + ')');
        og.appendChild(o);
      }
      sel.appendChild(og);
    }
  }
  function tierName(id) {
    if (id === 1 || id === 150) return 'Novice';
    return ({ 1: '1st job', 2: '2nd job', 3: 'Transcendent', 4: '3rd job', 5: '4th job' })[id % 10] || 'class';
  }

  function renderHeader() {
    $('cls').value = B.cls;
    $('base').value = B.base; $('base').max = D.core.maxBase;
    const jb = E.jobBase(B.cls), top = E.jobTop(B.cls);
    $('job').value = B.job - jb; $('job').max = top - jb; $('job').min = 1;
    $('jobmax').textContent = '(max ' + (top - jb) + ')';
    $('gender').value = B.gender || 1;
  }

  // ---- tabs ---------------------------------------------------------------------------------------------------
  function renderTab() {
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === ui.tab));
    document.querySelectorAll('.panel').forEach(p => p.hidden = p.id !== 'tab-' + ui.tab);
    ({ stats: renderStats, skills: renderSkills, equip: renderEquip, runes: renderRunes, gems: renderGems, more: renderMore })[ui.tab]();
  }

  // stats
  function renderStats() {
    const el = $('tab-stats');
    const earned = E.statPointsEarned(B.base), used = E.statPointsUsed(B.pts), left = earned - used;
    const max = E.statMax();
    let h = `<div class="card"><div class="points">
      <div>Points earned <b>${earned}</b></div><div>Used <b>${used}</b></div>
      <div>Left <b class="${left < 0 ? 'warn' : ''}">${left}</b></div>
      <div class="row" style="margin-left:auto"><button class="btn small" id="st-reset">Reset points</button></div></div>
      <div class="stat-grid">`;
    for (const s of STATS) {
      const p = B.pts[s];
      const job = R ? R.totals[s] - p : 0;
      const gear = R ? Math.trunc(R.bonus[s] || 0) : 0;
      const total = R ? R.named[s] : p;
      const next = E.statCost(p + 1);
      h += `<div class="stat"><span class="name">${s.toUpperCase()}</span>
        <div class="ctl"><button data-s="${s}" data-d="-1">−</button><input type="number" min="1" max="${max}" value="${p}" data-s="${s}">
        <button data-s="${s}" data-d="1">+</button><button data-s="${s}" data-d="10" title="+10">»</button></div>
        <span class="total">${total}</span>
        <span class="detail">bought ${p} · job bonus ${fmtAdd('Str', job)} · gear and more ${fmtAdd('Str', gear)} · next point costs ${next == null ? '—' : next}</span></div>`;
    }
    h += `</div></div><div class="card small muted">Stat points come from Base Level (Table_BaseLevel). The job bonus is the client's own
      CommonFun.calAttrPoint for this class at this job level. Raising a stat costs more the higher it is (Table_AttributePoint).</div>`;
    el.innerHTML = h;
    el.querySelectorAll('button[data-d]').forEach(b => b.onclick = () => {
      const s = b.dataset.s, d = +b.dataset.d;
      if (d > 0) { for (let i = 0; i < d; i++) { const c = E.statCost(B.pts[s] + 1); if (c == null) break; B.pts[s]++; } }
      else B.pts[s] = Math.max(1, B.pts[s] + d);
      changed();
    });
    el.querySelectorAll('input[data-s]').forEach(i => i.onchange = () => { B.pts[i.dataset.s] = +i.value || 1; changed(); });
    $('st-reset').onclick = () => { STATS.forEach(s => B.pts[s] = 1); changed(); };
  }

  // skills
  function poolFor(prof) {
    const sp = E.skillPoints(B);
    if (sp.novice && (prof === 1 || prof === 150)) return sp.novice;
    return sp;
  }
  function renderSkills() {
    const el = $('tab-skills');
    const c = E.cls(B.cls);
    const tabs = c.chain.filter(p => (E.cls(p) || {}).sk && E.cls(p).sk.length);
    if (!tabs.includes(ui.skillTab)) ui.skillTab = tabs[tabs.length - 1];
    const sp = E.skillPoints(B);
    const learned = E.learned(B);
    let h = `<div class="card"><div class="points">
      <div>Skill points <b>${sp.total}</b></div><div>Used <b>${sp.used}</b></div><div>Left <b class="${sp.left < 0 ? 'warn' : ''}">${sp.left}</b></div>
      ${sp.novice ? `<div class="muted">Novice tab: ${sp.novice.used} of ${sp.novice.total}</div>` : ''}
      <div class="row" style="margin-left:auto"><button class="btn small" id="sk-reset">Reset skills</button></div></div>
      <div class="toggles"><label><input type="checkbox" id="opt-break" ${B.opts.breakthrough ? 'checked' : ''}> Breakthrough levels open</label>
      <label><input type="checkbox" id="opt-limit" ${B.opts.limitBreak ? 'checked' : ''}> Limit breaks done (4th job)</label></div></div>`;
    h += '<div class="subtabs">' + tabs.map(p => {
      const used = E.pointsIn(B, p);
      return `<button data-p="${p}" class="${p === ui.skillTab ? 'on' : ''}">${esc(E.cls(p).n)} <span class="badge">${used}</span></button>`;
    }).join('') + '</div>';
    const prof = ui.skillTab;
    const need = E.tierNeed(B, prof), before = E.pointsBefore(B, prof);
    if (need) h += `<p class="small ${before < need ? 'warn' : 'muted'}">This tab opens after ${need} points in the jobs before it (${before} spent).</p>`;
    h += '<div class="skill-grid">';
    for (const sort of E.cls(prof).sk) {
      const f = D.skills.fam[sort];
      if (!f) continue;
      const bought = B.sk[sort] || 0;
      const have = learned[sort] || 0;
      const max = f.lv.length;
      const free = !(f.lv[0] || {}).c;
      const block = bought < max ? E.skillBlock(B, prof, sort, bought + 1, B.opts) : 'max level';
      const nextCost = bought < max ? (f.lv[bought].c || 0) : 0;
      const pool = poolFor(prof);
      const canAdd = !block && !free && pool.left >= nextCost;
      const canSub = bought > 0 && !dependents(sort, bought - 1).length;
      const cur = have ? skillDesc(sort, have) : '';
      const nxt = bought < max && !free ? skillDesc(sort, bought + 1) : '';
      const r = f.lv[Math.max(0, have - 1)] || {};
      const meta = [f.type || 'Passive', r.sp ? 'SP ' + r.sp : '', r.cd ? 'CD ' + r.cd + 's' : ''].filter(Boolean).join(' · ');
      h += `<div class="skill ${have ? 'has' : ''}"><div class="head"><span class="sname">${esc(f.n)}</span>
        <span class="lv">${have}/${max}</span>
        ${free ? '<span class="badge green">Free</span>' : `<span class="btns">
          <button data-sub="${sort}" ${canSub ? '' : 'disabled'} title="Lower">−</button>
          <button data-add="${sort}" ${canAdd ? '' : 'disabled'} title="Raise">+</button>
          <button data-max="${sort}" ${canAdd ? '' : 'disabled'} title="As high as it goes">⤒</button></span>`}</div>
        <div class="meta">${esc(meta)}${(f.lv[bought] || {}).pk ? ' · next level is a breakthrough' : ''}${(f.lv[bought] || {}).xm ? ' · next level needs a limit break' : ''}</div>
        ${cur ? `<div class="desc">${esc(cur)}</div>` : ''}
        ${nxt ? `<div class="next"><b>Next:</b> ${esc(nxt)}</div>` : ''}
        ${block && block !== 'max level' && !free ? `<div class="why">${esc(block)}</div>` : ''}
        ${!block && !free && !canAdd && bought < max ? '<div class="why">not enough skill points</div>' : ''}</div>`;
    }
    h += '</div>';
    const extra = Object.entries(learned).filter(([s]) => !c.chain.some(p => ((E.cls(p) || {}).sk || []).includes(+s)) && +s !== 10 && D.skills.fam[s]);
    if (extra.length) {
      h += '<div class="card" style="margin-top:12px"><h3>Skills from gear, runes and more</h3>' + extra.map(([s, l]) =>
        `<div class="small"><b>${esc(D.skills.fam[s].n)}</b> Lv ${l} <span class="muted">${esc(skillDesc(s, l))}</span></div>`).join('') + '</div>';
    }
    el.innerHTML = h;
    el.querySelectorAll('.subtabs button').forEach(b => b.onclick = () => { ui.skillTab = +b.dataset.p; renderSkills(); });
    el.querySelectorAll('[data-add]').forEach(b => b.onclick = () => { B.sk[b.dataset.add] = (B.sk[b.dataset.add] || 0) + 1; changed(); });
    el.querySelectorAll('[data-sub]').forEach(b => b.onclick = () => { B.sk[b.dataset.sub] = (B.sk[b.dataset.sub] || 0) - 1; changed(); });
    el.querySelectorAll('[data-max]').forEach(b => b.onclick = () => {
      const sort = +b.dataset.max, f = D.skills.fam[sort];
      while ((B.sk[sort] || 0) < f.lv.length) {
        const lv = (B.sk[sort] || 0) + 1;
        if (E.skillBlock(B, prof, sort, lv, B.opts) || poolFor(prof).left < (f.lv[lv - 1].c || 0)) break;
        B.sk[sort] = lv;
      }
      changed();
    });
    $('sk-reset').onclick = () => { B.sk = {}; changed(); };
    $('opt-break').onchange = e => { B.opts.breakthrough = e.target.checked; changed(); };
    $('opt-limit').onchange = e => { B.opts.limitBreak = e.target.checked; changed(); };
  }
  // learned skills that need sort above newLevel
  function dependents(sort, newLevel) {
    const out = [];
    for (const [s, l] of Object.entries(B.sk)) {
      const f = D.skills.fam[s];
      for (let i = 0; i < l && f && i < f.lv.length; i++) {
        const rq = f.lv[i].rq;
        if (rq && rq[0] === +sort && rq[1] > newLevel) { out.push(f.n); break; }
      }
    }
    return out;
  }

  // equipment
  function renderEquip() {
    const el = $('tab-equip');
    let h = `<div class="row" style="margin-bottom:10px"><span class="muted small">Pick a piece for each slot, then its refine, upgrade, cards and enchants.</span>
      <button class="btn small" id="eq-clear" style="margin-left:auto">Take everything off</button></div><div class="slot-grid">`;
    for (const site of SLOT_ORDER) {
      const e = B.eq[site];
      const it = e && D.items.equip[e.id];
      h += `<div class="slot" data-site="${site}"><div class="sh"><span>${esc(D.core.sites[site])}</span>${it ? `<button class="btn small ghost" data-off="${site}">Remove</button>` : ''}</div>
        <button class="pick ${it ? 'q' + (it.q || 1) : 'empty'}" data-pick="${site}">${it ? esc(it.n) : 'Choose…'}</button>`;
      if (it) {
        const rmax = it.rm || 15;
        h += `<div class="line"><label>Refine</label><select data-rf="${site}">${range(0, Math.max(rmax, e.rf || 0)).map(n => `<option ${n === (e.rf || 0) ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
        if ((it.up || []).length) h += `<label>Upgrade</label><select data-up="${site}">${range(0, it.up.length).map(n => `<option value="${n}" ${n === (e.up || 0) ? 'selected' : ''}>${n ? roman(n) : '—'}</option>`).join('')}</select>`;
        if (it.lv) h += `<span class="badge ${it.lv > B.base ? 'red' : ''}">Lv ${it.lv}</span>`;
        h += '</div>';
        if (it.sl) {
          h += '<div class="cards">';
          for (let i = 0; i < it.sl; i++) {
            const cd = (e.cards || [])[i];
            const c = cd && D.items.cards[cd];
            h += `<button class="cardbtn ${c ? 'q' + (c.q || 1) : 'faint'}" data-card="${site}:${i}">${c ? '🂠 ' + esc(c.n) : '＋ card slot ' + (i + 1)}</button>`;
          }
          h += '</div>';
        }
        if (it.ek) h += enchantHtml(site, e, it);
        h += `<details><summary>Effects</summary><div class="effects">${itemEffects(it, e)}</div></details>`;
      }
      h += '</div>';
    }
    h += '</div>';
    el.innerHTML = h;
    el.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => pickItem(+b.dataset.pick));
    el.querySelectorAll('[data-off]').forEach(b => b.onclick = () => { delete B.eq[b.dataset.off]; changed(); });
    el.querySelectorAll('[data-rf]').forEach(s => s.onchange = () => { B.eq[s.dataset.rf].rf = +s.value; changed(); });
    el.querySelectorAll('[data-up]').forEach(s => s.onchange = () => { B.eq[s.dataset.up].up = +s.value; changed(); });
    el.querySelectorAll('[data-card]').forEach(b => b.onclick = () => { const [s, i] = b.dataset.card.split(':'); pickCard(+s, +i); });
    el.querySelectorAll('[data-et]').forEach(s => s.onchange = () => { const e = B.eq[s.dataset.et]; e.et = +s.value; e.en = []; e.ex = []; changed(); });
    el.querySelectorAll('[data-ea]').forEach(s => s.onchange = () => {
      const [site, i] = s.dataset.ea.split(':'); const e = B.eq[site]; e.en = e.en || [];
      const row = enchantPool(e, D.items.equip[e.id]).find(r => r.a === s.value);
      e.en[i] = s.value ? [s.value, row ? enchantTop(row) : 0] : null;
      e.en = e.en.map(x => x || null); e.ex = (e.ex || []).filter(x => x && e.en.some(y => y && enchantRow(e, y[0]) && enchantRow(e, y[0]).u === x[0]));
      changed();
    });
    el.querySelectorAll('[data-ev]').forEach(s => s.onchange = () => { const [site, i] = s.dataset.ev.split(':'); const e = B.eq[site]; if (e.en[i]) e.en[i][1] = +s.value; changed(); });
    el.querySelectorAll('[data-ex]').forEach(s => s.onchange = () => {
      const [site, uid] = s.dataset.ex.split(':'); const e = B.eq[site];
      e.ex = (e.ex || []).filter(x => x && x[0] !== +uid);
      if (+s.value) e.ex.push([+uid, +s.value]);
      changed();
    });
    $('eq-clear').onclick = () => { B.eq = {}; changed(); };
  }
  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  const roman = n => ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n] || n;

  function enchantPool(e, it) {
    const t = e.et || 3;
    const out = {};
    for (const r of D.items.enchant) if (r.t === t && !(r.no || []).includes(it.ek)) out[r.a] = r;   // the last row that allows it
    return Object.values(out);
  }
  function enchantRow(e, a) { return enchantPool(e, D.items.equip[e.id]).find(r => r.a === a); }
  function isPct(a) { const r = rd(a); return r && r[3]; }
  function enchantTop(r) { const b = (r.b || [[0, 0]])[0]; return isPct(r.a) ? Math.round(b[1] * 100 * 100) / 100 : b[1]; }
  function enchantHtml(site, e, it) {
    const pool = enchantPool(e, it);
    let h = `<div class="line"><label>Enchant</label><select data-et="${site}">${Object.entries(ENCHANT_TYPES).map(([k, n]) => `<option value="${k}" ${+k === (e.et || 3) ? 'selected' : ''}>${n}</option>`).join('')}</select></div><div class="ench">`;
    for (let i = 0; i < 3; i++) {
      const cur = (e.en || [])[i];
      const row = cur && pool.find(r => r.a === cur[0]);
      h += `<select data-ea="${site}:${i}"><option value="">— attribute ${i + 1} —</option>${pool.map(r => `<option value="${r.a}" ${cur && cur[0] === r.a ? 'selected' : ''}>${esc(attrName(r.a))}</option>`).join('')}</select>`;
      h += `<input type="number" step="any" data-ev="${site}:${i}" value="${cur ? cur[1] : ''}" ${cur ? '' : 'disabled'} title="${row ? 'Range ' + (row.b || [[0, 0]])[0].map(x => isPct(row.a) ? trim((x * 100).toFixed(2)) + '%' : x).join(' – ') : ''}">`;
      if (row && row.add && row.add.length) {
        const have = (e.ex || []).find(x => x && x[0] === row.u);
        const need = (row.cond || {}).refinelv || 0;
        h += `<select data-ex="${site}:${row.u}" style="grid-column:1/-1"><option value="0">No ${esc(row.n || 'bonus')} effect</option>${row.add.map(x => `<option value="${x[0]}" ${have && have[1] === x[0] ? 'selected' : ''}>${esc((D.buffs[x[0]] || {}).n || x[0])}${need ? ' (works at +' + need + ')' : ''}</option>`).join('')}</select>`;
      }
    }
    return h + '</div><div class="faint small">Per cent attributes are entered as per cent (5 = 5%).</div>';
  }

  function itemEffects(it, e) {
    const out = [];
    if (it.e && effText(it.e)) out.push('<div class="eff">' + esc(effText(it.e)) + '</div>');
    if (it.r && effText(it.r)) out.push('<div class="eff">Each refine level: ' + esc(effText(it.r)) + '</div>');
    for (const [lo, hi, at] of it.lot || []) out.push(`<div class="eff">Base Lv ${lo}–${hi > 9999 ? '…' : hi}: ${esc(effText(at))}</div>`);
    for (const b of it.u || []) { const t = buffText(b); if (t) out.push('<div class="eff">' + esc(t) + '</div>'); }
    (it.up || []).forEach((bl, i) => { const t = bl.map(buffText).filter(Boolean).join('; '); if (t) out.push(`<div class="eff ${e && e.up > i ? '' : 'faint'}">Upgrade ${roman(i + 1)}: ${esc(t)}</div>`); });
    for (const sid of it.suit || []) {
      const s = D.items.suits[sid]; if (!s) continue;
      const names = s.p.map(p => (D.items.equip[p] || {}).n || p).join(' + ');
      const t = s.d || Object.values(s.a || {}).flat().map(buffText).join('; ');
      out.push(`<div class="eff"><b>Set</b> (${esc(names)}): ${esc(t)}</div>`);
    }
    if (it.d) out.push('<div class="eff faint">' + esc(it.d) + '</div>');
    return out.join('') || '<span class="faint">No effects.</span>';
  }

  function pickItem(site) {
    const list = Object.entries(D.items.equip).filter(([id, it]) => it.s.includes(site) && canEquip(+id, B.cls))
      .map(([id, it]) => ({ id: +id, it })).sort((a, b) => (b.it.lv || 0) - (a.it.lv || 0) || (b.it.q || 0) - (a.it.q || 0) || a.it.n.localeCompare(b.it.n));
    openPicker('Choose ' + D.core.sites[site], list, x => {
      const t = [effText(x.it.e), x.it.r && effText(x.it.r) ? 'per refine ' + effText(x.it.r) : '', ...(x.it.u || []).slice(0, 3).map(buffText)].filter(Boolean).join('\n');
      return { title: x.it.n, q: x.it.q, badge: x.it.lv ? 'Lv ' + x.it.lv : '', text: t, key: x.it.n + ' ' + t };
    }, x => {
      const old = B.eq[site] || {};
      B.eq[site] = { id: x.id, rf: Math.min(old.rf || 0, x.it.rm || 15), up: 0, cards: [], en: [], ex: [], et: 3 };
      changed();
    });
  }

  function pickCard(site, i) {
    const e = B.eq[site]; const it = D.items.equip[e.id];
    const list = Object.entries(D.items.cards).filter(([id, c]) => (D.core.cardTypes[c.p] || []).includes(it.it))
      .map(([id, c]) => ({ id: +id, c })).sort((a, b) => (b.c.q || 0) - (a.c.q || 0) || a.c.n.localeCompare(b.c.n));
    list.unshift({ id: 0, c: { n: '(empty slot)', q: 1, b: [] } });
    openPicker('Card for ' + it.n, list, x => {
      const t = x.c.d || (x.c.b || []).map(buffText).filter(Boolean).join('\n');
      return { title: x.c.n, q: x.c.q, text: t, key: x.c.n + ' ' + t };
    }, x => { e.cards = e.cards || []; e.cards[i] = x.id || null; changed(); });
  }

  function openPicker(title, list, show, done) {
    $('modal-title').textContent = title;
    const body = $('modal-body');
    body.innerHTML = '<input class="search" placeholder="Search names and effects…"><div class="small faint count"></div><div class="plist"></div>';
    const input = body.querySelector('input'), out = body.querySelector('.plist'), count = body.querySelector('.count');
    const shown = list.map(x => Object.assign({ x }, show(x)));
    function draw() {
      const words = input.value.toLowerCase().split(/\s+/).filter(Boolean);
      const hits = shown.filter(s => words.every(w => s.key.toLowerCase().includes(w)));
      count.textContent = hits.length + ' found' + (hits.length > 150 ? ' (first 150 shown; type to narrow)' : '');
      out.innerHTML = hits.slice(0, 150).map((s, i) => `<button class="pitem" data-i="${shown.indexOf(s)}"><span class="q${s.q || 1}">${esc(s.title)}</span>
        ${s.badge ? `<span class="badge">${esc(s.badge)}</span>` : ''}<div class="pd">${esc(s.text || '')}</div></button>`).join('');
      out.querySelectorAll('.pitem').forEach(b => b.onclick = () => { closeModal(); done(shown[+b.dataset.i].x); });
    }
    input.oninput = draw;
    draw();
    $('modal').hidden = false;
    setTimeout(() => input.focus(), 30);
  }
  function closeModal() { $('modal').hidden = true; }

  // ---- runes (the Astrolabe) ----------------------------------------------------------------------------------
  function branch(b) { const c = E.cls(b.cls); return c.tb || (D.runes.defaultBranch || {})[c.type]; }
  function runeAttrs(b) { return (D.runes.attrs || {})[branch(b)] || {}; }
  function exists(g) { const p = D.runes.plates[Math.floor(g / 10000)]; return !!p && (g % 10000) in p.stars; }
  function plateOpen(pid) {
    const p = D.runes.plates[pid]; if (!p) return false;
    const u = p.unlock || {};
    const tier = (B.cls === 1 || B.cls === 150) ? 0 : B.cls % 10;
    if (B.base < (u.lv || 0) && +pid !== 1) return false;
    if (tier < (u.evo || 0)) return false;
    return true;
  }
  function starPos(g) {
    const pid = Math.floor(g / 10000), s = g % 10000;
    const p = D.runes.plates[pid];
    const [px, py] = p.pos || [0, 0];
    if (!s) return [px, -py];
    const ring = Math.ceil(s / 6), d = (s - 1) % 6;
    const a = (d * 60 - 90) * Math.PI / 180;
    const r = ring * 62;
    return [px + r * Math.cos(a), -py + r * Math.sin(a)];
  }
  function lightPath(target) {
    const on = new Set(B.stars);
    const O = D.runes.origin;
    const start = on.size ? [...on] : [];
    if (!on.size) { if (target === O) { B.stars = [O]; return true; } start.push(O); }
    const prev = new Map(start.map(g => [g, null]));
    const q = [...start];
    while (q.length) {
      const g = q.shift();
      if (g === target) break;
      for (const n of D.runes.links[g] || []) {
        if (prev.has(n) || !exists(n) || !plateOpen(Math.floor(n / 10000))) continue;
        prev.set(n, g); q.push(n);
      }
    }
    if (!prev.has(target)) return false;
    const path = [];
    for (let g = target; g != null && !on.has(g); g = prev.get(g)) path.push(g);
    if (!on.size) path.push(O);
    B.stars = [...B.stars, ...path.reverse().filter(g => !on.has(g))];
    return true;
  }
  function unlight(target) {
    const keep = new Set(B.stars.filter(g => g !== target));
    const O = D.runes.origin;
    if (target === O) { B.stars = []; return; }
    const reach = new Set(); const todo = keep.has(O) ? [O] : [];
    while (todo.length) { const g = todo.pop(); if (reach.has(g)) continue; reach.add(g); for (const n of D.runes.links[g] || []) if (keep.has(n) && !reach.has(n)) todo.push(n); }
    B.stars = B.stars.filter(g => reach.has(g));
  }
  function starTip(g) {
    const ra = runeAttrs(B)[g];
    const lines = [];
    if (ra) {
      const t = effText(ra[0]); if (t) lines.push(t);
      if (ra[1]) { const sp = D.runes.specials[ra[1]]; lines.push('★ ' + ((sp && sp.n) || 'Special ' + ra[1])); const d = specialText(ra[1]); if (d) lines.push(d); }
    } else lines.push('Nothing for this class');
    const cost = (D.runes.cost[g] || []).filter(x => x[1]).map(([i, n]) => n.toLocaleString() + ' ' + (ITEMS[i] || 'item ' + i)).join(', ');
    if (cost) lines.push('Costs ' + cost);
    if (!plateOpen(Math.floor(g / 10000))) { const u = D.runes.plates[Math.floor(g / 10000)].unlock || {}; lines.push('Locked: needs Base ' + (u.lv || 0) + ' and ' + (['', '1st', '2nd', 'transcendent', '3rd', '4th'][u.evo || 0] || '') + ' job'); }
    return lines.join('\n');
  }
  function specialText(sp) {
    const s = D.runes.specials[sp]; if (!s) return '';
    let t = D.runes.specialDesc[s.tip] || '';
    const p = [...(s.par || [])];
    return t.replace(/%s/g, () => p.length ? p.shift() : '?').replace(/%%/g, '%');
  }

  function renderRunes() {
    const el = $('tab-runes');
    const ra = runeAttrs(B);
    const lit = new Set(B.stars);
    const tot = {}; const cost = {};
    for (const g of B.stars) {
      for (const [k, v] of Object.entries((ra[g] || [{}])[0] || {})) tot[k] = (tot[k] || 0) + v;
      for (const [i, n] of D.runes.cost[g] || []) if (n) cost[i] = (cost[i] || 0) + n;
    }
    const specials = E.specials(B);
    // board
    const P = D.runes.plates;
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    const pts = {};
    for (const [pid, p] of Object.entries(P)) for (const s of Object.keys(p.stars)) {
      const g = +pid * 10000 + +s; const [x, y] = starPos(g); pts[g] = [x, y];
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
    if (!ui.view) {   // start around the centre star, zoomed in
      const [ox, oy] = starPos(D.runes.origin);
      const w = Math.min(maxX - minX + 200, 2600), hh = w * 0.56;
      ui.view = { x: ox - w / 2, y: oy - hh / 2, w, h: hh };
    }
    let lines = '', dots = '';
    const seen = new Set();
    for (const [g, ns] of Object.entries(D.runes.links)) {
      if (!pts[g]) continue;
      for (const n of ns) {
        if (!pts[n]) continue;
        const key = Math.min(g, n) + ':' + Math.max(g, n);
        if (seen.has(key)) continue; seen.add(key);
        const on = lit.has(+g) && lit.has(n);
        lines += `<line x1="${pts[g][0].toFixed(0)}" y1="${pts[g][1].toFixed(0)}" x2="${pts[n][0].toFixed(0)}" y2="${pts[n][1].toFixed(0)}" stroke="${on ? '#f2c14e' : '#39415a'}" stroke-width="${on ? 9 : 5}"/>`;
      }
    }
    for (const [g, [x, y]] of Object.entries(pts)) {
      const a = ra[g]; const sp = a && a[1];
      const open = plateOpen(Math.floor(g / 10000));
      const fill = lit.has(+g) ? '#f2c14e' : !open ? '#262a36' : sp ? '#b48cff' : (a ? '#5a6788' : '#363c4f');
      const r = sp ? 24 : (+g % 10000 === 0 ? 22 : 16);
      dots += `<circle class="star" data-g="${g}" cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r}" fill="${fill}" stroke="${lit.has(+g) ? '#fff3c4' : '#11131a'}" stroke-width="4"/>`;
    }
    const v = ui.view;
    let h = `<div class="board-wrap"><svg id="board" viewBox="${v.x} ${v.y} ${v.w} ${v.h}">${lines}${dots}</svg>
      <div class="board-tools"><button class="btn small" id="rz-in">＋</button><button class="btn small" id="rz-out">−</button>
      <button class="btn small" id="rz-fit">Fit</button><button class="btn small" id="rz-clear">Switch all off</button>
      <button class="btn small" id="rz-all">Light every open star</button></div></div>
      <div class="legend"><span><i class="dot" style="background:#f2c14e"></i>on</span><span><i class="dot" style="background:#5a6788"></i>stats</span>
      <span><i class="dot" style="background:#b48cff"></i>special star</span><span><i class="dot" style="background:#262a36;border:1px solid #444"></i>locked plate</span>
      <span>Click a star to switch it on (the path to it comes on too); click a lit star to switch it off. Drag to move, scroll to zoom.</span></div>
      <div class="two"><div class="card"><h3>From ${B.stars.length} stars</h3><div class="kv">${Object.entries(tot).map(([k, v]) => `<div>${esc(attrName(k))}</div><div>${esc(fmtAdd(k, v))}</div>`).join('') || '<div class="faint">No stars on.</div><div></div>'}</div>
      <p class="small muted">Cost: ${Object.entries(cost).map(([i, n]) => n.toLocaleString() + ' ' + (ITEMS[i] || 'item ' + i)).join(', ') || '—'}</p></div>
      <div class="card"><h3>Special stars</h3>${Object.entries(specials).map(([sp, n]) => `<div class="small" style="margin-bottom:6px"><b>${esc((D.runes.specials[sp] || {}).n || sp)}</b>${n > 1 ? ' ×' + n : ''}<div class="muted">${esc(specialText(sp))}</div></div>`).join('') || '<div class="faint small">None on.</div>'}</div></div>`;
    el.innerHTML = h;
    const svg = $('board');
    svg.querySelectorAll('.star').forEach(c => {
      c.addEventListener('mouseenter', ev => showTip(ev, starTip(+c.dataset.g)));
      c.addEventListener('mousemove', moveTip);
      c.addEventListener('mouseleave', hideTip);
    });
    let drag = null, moved = false;
    svg.addEventListener('pointerdown', ev => { drag = { x: ev.clientX, y: ev.clientY, v: Object.assign({}, ui.view) }; moved = false; svg.setPointerCapture(ev.pointerId); svg.classList.add('drag'); });
    svg.addEventListener('pointermove', ev => {
      if (!drag) return;
      const k = ui.view.w / svg.clientWidth;
      const dx = (ev.clientX - drag.x) * k, dy = (ev.clientY - drag.y) * k;
      if (Math.abs(ev.clientX - drag.x) + Math.abs(ev.clientY - drag.y) > 4) moved = true;
      ui.view.x = drag.v.x - dx; ui.view.y = drag.v.y - dy; setView(svg);
    });
    svg.addEventListener('pointerup', ev => {
      svg.classList.remove('drag');
      const wasDrag = moved; drag = null;
      if (wasDrag) return;
      const t = document.elementFromPoint(ev.clientX, ev.clientY);
      if (!t || !t.classList.contains('star')) return;
      const g = +t.dataset.g;
      hideTip();
      if (B.stars.includes(g)) unlight(g);
      else if (!plateOpen(Math.floor(g / 10000))) { toast('That plate is still locked for this class and level'); return; }
      else if (!lightPath(g)) { toast('No open path to that star'); return; }
      changed();
    });
    svg.addEventListener('wheel', ev => { ev.preventDefault(); zoom(ev.deltaY > 0 ? 1.15 : 1 / 1.15, svg, ev); }, { passive: false });
    $('rz-in').onclick = () => zoom(1 / 1.3, svg); $('rz-out').onclick = () => zoom(1.3, svg);
    $('rz-fit').onclick = () => { ui.view = { x: minX - 100, y: minY - 100, w: maxX - minX + 200, h: maxY - minY + 200 }; setView(svg); };
    $('rz-clear').onclick = () => { B.stars = []; changed(); };
    $('rz-all').onclick = () => {
      const O = D.runes.origin; const on = new Set([O]); const todo = [O];
      while (todo.length) { const g = todo.pop(); for (const n of D.runes.links[g] || []) if (!on.has(n) && exists(n) && plateOpen(Math.floor(n / 10000))) { on.add(n); todo.push(n); } }
      B.stars = [...on]; changed();
    };
  }
  function setView(svg) { const v = ui.view; svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`); }
  function zoom(f, svg, ev) {
    const v = ui.view;
    let cx = v.x + v.w / 2, cy = v.y + v.h / 2;
    if (ev) { const r = svg.getBoundingClientRect(); cx = v.x + (ev.clientX - r.left) / r.width * v.w; cy = v.y + (ev.clientY - r.top) / r.height * v.h; }
    v.x = cx - (cx - v.x) * f; v.y = cy - (cy - v.y) * f; v.w *= f; v.h *= f; setView(svg);
  }

  // ---- gems (attribute runes) ---------------------------------------------------------------------------------
  function renderGems() {
    const el = $('tab-gems');
    const ids = Object.keys(D.gems).map(Number).sort((a, b) => D.gems[a].n.localeCompare(D.gems[b].n));
    let h = `<div class="card"><h3>Attribute runes</h3><p class="small muted">Up to 10 attribute runes, each a different one, at their level (Table_GemUpgrade).</p><div class="slot-grid">`;
    for (let i = 0; i < 10; i++) {
      const g = B.gems[i];
      const used = new Set(B.gems.filter((x, j) => x && j !== i).map(x => x.id));
      const lvls = g ? Object.keys(D.gems[g.id].lv).map(Number) : [];
      h += `<div class="slot"><div class="sh"><span>Cell ${i + 1}</span></div>
        <select data-gid="${i}"><option value="">— empty —</option>${ids.filter(id => !used.has(id)).map(id => `<option value="${id}" ${g && g.id === id ? 'selected' : ''}>${esc(D.gems[id].n)}</option>`).join('')}</select>
        ${g ? `<div class="line"><label>Level</label><select data-glv="${i}">${lvls.map(l => `<option ${l === g.lv ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <span class="muted">${esc(effText(D.gems[g.id].lv[g.lv]))}</span></div>` : ''}</div>`;
    }
    el.innerHTML = h + '</div></div>';
    el.querySelectorAll('[data-gid]').forEach(s => s.onchange = () => {
      const i = +s.dataset.gid; const arr = B.gems.slice(); while (arr.length < 10) arr.push(null);
      arr[i] = s.value ? { id: +s.value, lv: Math.max(...Object.keys(D.gems[s.value].lv).map(Number)) } : null;
      B.gems = arr; changed();
    });
    el.querySelectorAll('[data-glv]').forEach(s => s.onchange = () => { B.gems[+s.dataset.glv].lv = +s.value; changed(); });
  }

  // ---- more ---------------------------------------------------------------------------------------------------
  function renderMore() {
    const el = $('tab-more');
    const X = D.extras;
    const titles = Object.entries(X.titles).filter(([, t]) => !t.hb).sort((a, b) => a[1].n.localeCompare(b[1].n));
    const unlockers = Object.entries(D.core.classes).filter(([, c]) => c.unlock && Object.keys(c.unlock).length && !c.hero);
    const mine = new Set(E.cls(B.cls).chain);
    let h = `<div class="two"><div class="card"><h3>Adventure Handbook</h3>
      <div class="row"><label>Handbook level <input type="number" id="hb" min="0" max="${Object.keys(X.handbook).length}" value="${B.handbook}"></label></div>
      <p class="small muted">Each level's attributes and the ranks it reaches are added (Table_AdventureLevel, Table_Appellation).</p></div>
      <div class="card"><h3>Assumptions</h3>
      <div class="row small"><label>HP % <input type="number" id="as-hp" min="1" max="100" value="${B.assume.hpPct}"></label>
      <label>SP % <input type="number" id="as-sp" min="1" max="100" value="${B.assume.spPct}"></label>
      <label>Party size <input type="number" id="as-party" min="1" max="6" value="${B.assume.party}"></label></div>
      <div class="row small" style="margin-top:8px"><label><input type="checkbox" id="as-pvp" ${B.mapKind ? 'checked' : ''}> In PvP / GvG (Max HP ×4)</label></div>
      <p class="small muted">Effects that need HP or SP above or below a share, a party, or a map count only when these allow them.</p></div></div>
      <div class="card"><h3>Titles</h3><input class="filter" id="ti-f" placeholder="Search titles…"><div class="checks" id="ti">${titles.map(([id, t]) =>
        `<label data-k="${esc((t.n + ' ' + effText(t.a)).toLowerCase())}"><input type="checkbox" value="${id}" ${B.titles.includes(+id) ? 'checked' : ''}><span>${esc(t.n)} <span class="faint">${esc(effText(t.a))}</span></span></label>`).join('')}</div></div>
      <div class="card"><h3>Collections <button class="btn small" id="co-all">All</button> <button class="btn small" id="co-none">None</button></h3><div class="checks">${X.collections.map(co =>
        `<label><input type="checkbox" data-co value="${co.id}" ${B.colls.includes(co.id) ? 'checked' : ''}><span>${esc(co.n)} <span class="faint">${esc(effText(co.a))}</span></span></label>`).join('')}</div></div>
      <div class="card"><h3>Other classes reached</h3><p class="small muted">Each job line's highest class reached gives its bonus to every class you play (Table_Class UnlockAttr). Your own line counts already.</p><div class="checks">${unlockers.map(([id, c]) =>
        `<label><input type="checkbox" data-re value="${id}" ${B.reached.includes(+id) || +id === +B.cls ? 'checked' : ''} ${+id === +B.cls ? 'disabled' : ''}><span>${esc(c.n)} <span class="faint">${esc(effText(c.unlock))}</span></span></label>`).join('')}</div></div>
      <div class="card"><h3>Extra bonuses</h3><p class="small muted">Anything else (food, guild prayers, pets, buffs…). Per cent attributes as per cent.</p><div id="ex">${Object.entries(B.extra).map(([k, v]) => extraRow(k, v)).join('')}</div>
      <button class="btn small" id="ex-add">Add a bonus</button></div>`;
    el.innerHTML = h;
    $('hb').onchange = e => { B.handbook = Math.max(0, +e.target.value || 0); changed(false); };
    $('as-hp').onchange = e => { B.assume.hpPct = +e.target.value || 100; changed(false); };
    $('as-sp').onchange = e => { B.assume.spPct = +e.target.value || 100; changed(false); };
    $('as-party').onchange = e => { B.assume.party = +e.target.value || 1; changed(false); };
    $('as-pvp').onchange = e => { B.mapKind = e.target.checked ? 1 : 0; changed(false); };
    $('ti-f').oninput = e => { const w = e.target.value.toLowerCase(); $('ti').querySelectorAll('label').forEach(l => l.hidden = !l.dataset.k.includes(w)); };
    $('ti').querySelectorAll('input').forEach(i => i.onchange = () => { B.titles = [...$('ti').querySelectorAll('input:checked')].map(x => +x.value); changed(false); });
    el.querySelectorAll('[data-co]').forEach(i => i.onchange = () => { B.colls = [...el.querySelectorAll('[data-co]:checked')].map(x => +x.value); changed(false); });
    $('co-all').onclick = () => { B.colls = X.collections.map(c => c.id); changed(); };
    $('co-none').onclick = () => { B.colls = []; changed(); };
    el.querySelectorAll('[data-re]').forEach(i => i.onchange = () => { B.reached = [...el.querySelectorAll('[data-re]:checked')].map(x => +x.value).filter(x => x !== +B.cls); changed(false); });
    $('ex-add').onclick = () => { let k = 'Atk'; let n = 1; while (k in B.extra) k = ['MAtk', 'MaxHp', 'Def', 'MDef', 'Hit', 'Flee', 'Cri'][n++ - 1] || 'Str'; B.extra[k] = 0; changed(); };
    el.querySelectorAll('[data-exk]').forEach(s => s.onchange = () => { const old = s.dataset.exk; const v = B.extra[old]; delete B.extra[old]; B.extra[s.value] = v; changed(); });
    el.querySelectorAll('[data-exv]').forEach(i => i.onchange = () => { B.extra[i.dataset.exv] = +i.value || 0; changed(false); });
    el.querySelectorAll('[data-exd]').forEach(b => b.onclick = () => { delete B.extra[b.dataset.exd]; changed(); });
  }
  let attrOptions = null;
  function extraRow(k, v) {
    if (!attrOptions) attrOptions = Object.keys(D.core.roledata).filter(x => !HIDE.has(x) || STATS.includes(x)).sort((a, b) => attrName(a).localeCompare(attrName(b)));
    return `<div class="extra-row"><select data-exk="${k}">${attrOptions.map(x => `<option value="${x}" ${x === k ? 'selected' : ''}>${esc(attrName(x))}</option>`).join('')}</select>
      <input type="number" step="any" data-exv="${k}" value="${v}"><button class="btn small ghost" data-exd="${k}">×</button></div>`;
  }

  // ---- result -------------------------------------------------------------------------------------------------
  function renderResult() {
    const el = $('result');
    if (!R) { el.innerHTML = '<p class="muted">—</p>'; return; }
    const N = R.named;
    const c = E.cls(B.cls);
    let h = `<h2><span class="cls">${esc(c.n)}</span></h2><div class="small muted">Base ${B.base} · Job ${B.job - E.jobBase(B.cls)} · Atk element ${esc(fmt('AtkAttr', N.AtkAttr))} · Armor ${esc(fmt('DefAttr', N.DefAttr))}</div>
      <div class="main-attrs">${STATS.map(s => `<div class="ma ${ui.sel === s ? 'sel' : ''}" data-k="${s}"><div class="k">${s.toUpperCase()}</div><div class="v">${N[s]}</div></div>`).join('')}</div>
      <div class="main-attrs">${MAIN.map(([k, n]) => `<div class="ma ${ui.sel === k ? 'sel' : ''}" data-k="${k}"><div class="k">${n}</div><div class="v">${esc(fmt(k, N[k] || 0))}</div></div>`).join('')}</div>`;
    if (ui.sel) h += whyBox(ui.sel);
    const rest = Object.entries(N).filter(([k, v]) => v && !HIDE.has(k) && !(RAW.has(k) && k !== 'RestoreSpd' && k !== 'SpRestoreSpd') && !MAIN.some(m => m[0] === k) && rd(k) && k !== 'AtkAttr' && k !== 'DefAttr')
      .sort((a, b) => attrName(a[0]).localeCompare(attrName(b[0])));
    h += `<div class="sect">All other attributes (${rest.length})</div><input class="filter" id="af" placeholder="Filter…" value="${esc(ui.filter)}"><div class="attr-list" id="al">${rest.map(([k, v]) =>
      `<div class="ar ${ui.sel === k ? 'sel' : ''}" data-k="${k}" data-n="${esc(attrName(k).toLowerCase())}"><span>${esc(attrName(k))}</span><span>${esc(fmt(k, v))}</span></div>`).join('')}</div>
      <p class="small faint" style="margin-top:10px">Click an attribute to see where it comes from.</p>`;
    el.innerHTML = h;
    el.querySelectorAll('[data-k]').forEach(x => x.onclick = () => { ui.sel = ui.sel === x.dataset.k ? null : x.dataset.k; renderResult(); });
    const af = $('af');
    const filt = () => { ui.filter = af.value; const w = af.value.toLowerCase(); $('al').querySelectorAll('.ar').forEach(r => r.hidden = !r.dataset.n.includes(w)); };
    af.oninput = filt; filt();
  }
  function whyBox(k) {
    const base = k.replace(/^Show/, '');
    const rows = [];
    if (STATS.includes(k)) {
      rows.push(['Bought', B.pts[k]], ['Job bonus', R.totals[k] - B.pts[k]]);
    }
    for (const [src, p] of Object.entries(R.parts)) if (p[base]) rows.push([src, p[base]]);
    const fromParts = rows.reduce((t, r) => t + (STATS.includes(k) ? r[1] : r[1]), 0);
    let h = `<div class="why-box"><h4>${esc(attrName(base))}: ${esc(fmt(k, R.named[k] || 0))}</h4><div class="kv">`;
    h += rows.map(([s, v]) => `<div>${esc(s)}</div><div>${esc(STATS.includes(k) ? (v > 0 ? '+' : '') + Math.trunc(v) : fmtAdd(base, v))}</div>`).join('');
    if (!STATS.includes(k)) h += `<div class="faint">Class formula (stats, level, weapon)</div><div class="faint">${['ShowAtk', 'ShowMAtk', 'ShowDef', 'ShowMDef'].includes(k) ? 'with the % bonuses' : 'the rest'}</div>`;
    return h + '</div></div>';
  }

  // ---- tooltips, toast ----------------------------------------------------------------------------------------
  function showTip(ev, text) { const t = $('tip'); t.textContent = text; t.hidden = false; moveTip(ev); }
  function moveTip(ev) { const t = $('tip'); t.style.left = Math.min(ev.clientX + 14, innerWidth - 350) + 'px'; t.style.top = (ev.clientY + 14) + 'px'; }
  function hideTip() { $('tip').hidden = true; }
  let toastTimer;
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => t.hidden = true, 2600); }

  // ---- sharing and saving -------------------------------------------------------------------------------------
  async function encode(b) {
    const json = JSON.stringify(b);
    try {
      const s = new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'));
      const buf = new Uint8Array(await new Response(s).arrayBuffer());
      let bin = ''; buf.forEach(x => bin += String.fromCharCode(x));
      return 'z' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    } catch (e) { return 'j' + btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  }
  async function decode(code) {
    const kind = code[0]; const b64 = code.slice(1).replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
    if (kind === 'j') return JSON.parse(decodeURIComponent(escape(bin)));
    const bytes = Uint8Array.from(bin, ch => ch.charCodeAt(0));
    const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return JSON.parse(await new Response(s).text());
  }
  async function share() {
    const code = await encode(B);
    const url = location.href.split('#')[0] + '#b=' + code;
    history.replaceState(null, '', url);
    try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch (e) { prompt('Copy this link:', url); }
  }
  function savedList() { try { return JSON.parse(localStorage.getItem('romsim2.builds') || '[]'); } catch (e) { return []; } }
  function saveList(l) { try { localStorage.setItem('romsim2.builds', JSON.stringify(l)); } catch (e) { toast('This browser does not allow saving'); } }
  function openSaves() {
    $('modal-title').textContent = 'Builds saved in this browser';
    const draw = () => {
      const l = savedList();
      $('modal-body').innerHTML = `<div class="row" style="margin-bottom:10px"><input id="sv-name" placeholder="Name this build" value="${esc(E.cls(B.cls).n + ' ' + B.base)}" style="flex:1"><button class="btn gold" id="sv-save">Save</button></div>
        <div class="plist">${l.map((s, i) => `<div class="pitem row"><span style="flex:1"><b>${esc(s.name)}</b> <span class="faint small">${esc((E.cls(s.b.cls) || {}).n || '')} · ${new Date(s.t).toLocaleString()}</span></span>
        <button class="btn small" data-load="${i}">Load</button><button class="btn small ghost" data-del="${i}">Delete</button></div>`).join('') || '<p class="faint">Nothing saved yet.</p>'}</div>`;
      $('sv-save').onclick = () => { const l2 = savedList(); l2.unshift({ name: $('sv-name').value || 'Build', t: Date.now(), b: JSON.parse(JSON.stringify(B)) }); saveList(l2); draw(); toast('Saved'); };
      $('modal-body').querySelectorAll('[data-load]').forEach(b => b.onclick = () => { B = normalize(JSON.parse(JSON.stringify(savedList()[+b.dataset.load].b))); closeModal(); ui.view = null; changed(); });
      $('modal-body').querySelectorAll('[data-del]').forEach(b => b.onclick = () => { const l2 = savedList(); l2.splice(+b.dataset.del, 1); saveList(l2); draw(); });
    };
    draw();
    $('modal').hidden = false;
  }

  // ---- start --------------------------------------------------------------------------------------------------
  async function load() {
    const msg = $('loadmsg');
    const json = ['core', 'skills', 'items', 'buffs', 'runes', 'gems', 'extras'];
    const lua = ['GameConfig.lua', 'CommonFun.lua', 'mock.lua', 'sim.lua'];
    let done = 0; const total = json.length + lua.length;
    const tick = () => { done++; msg.textContent = `Loading the game data… ${done}/${total}`; };
    const got = await Promise.all([
      ...json.map(n => fetch('data/' + n + '.json').then(r => { if (!r.ok) throw new Error(n); return r.json(); }).then(x => { tick(); return x; })),
      ...lua.map(n => fetch('lua/' + n).then(r => { if (!r.ok) throw new Error(n); return r.text(); }).then(x => { tick(); return x; }))]);
    D = {}; json.forEach((n, i) => D[n] = got[i]);
    msg.textContent = 'Starting the client formulas…';
    await new Promise(r => setTimeout(r, 20));
    const L = new window.RomLua();
    L.run('_EmptyTable = {}', 'init');
    lua.forEach((n, i) => L.run(got[json.length + i], n));
    E = new window.RomEngine(D, L);
  }

  async function start() {
    try { await load(); } catch (e) { $('loadmsg').textContent = 'Could not load the data (' + e.message + '). Please reload the page.'; return; }
    renderClassSelect();
    B = null;
    const m = location.hash.match(/b=([\w-]+)/);
    if (m) { try { B = await decode(m[1]); } catch (e) { toast('That build link could not be read'); } }
    if (!B) { try { B = JSON.parse(localStorage.getItem('romsim2.current') || 'null'); } catch (e) { B = null; } }
    if (!B || !E.cls(B.cls)) B = defaultBuild();
    normalize(B);
    $('loading').hidden = true; $('app').hidden = false;
    document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => { ui.tab = b.dataset.tab; renderTab(); });
    $('cls').onchange = () => {
      const old = B.cls; B.cls = +$('cls').value;
      if (branch({ cls: old }) !== branch(B)) B.stars = [];
      B.job = E.jobTop(B.cls); ui.skillTab = null; ui.view = null; changed();
    };
    $('base').onchange = () => { B.base = +$('base').value; changed(); };
    $('job').onchange = () => { B.job = E.jobBase(B.cls) + (+$('job').value || 1); changed(); };
    $('gender').onchange = () => { B.gender = +$('gender').value; changed(); };
    $('share').onclick = share;
    $('saves').onclick = openSaves;
    $('reset').onclick = () => { if (confirm('Start this class again? Stats, skills, gear and runes are cleared.')) { B = defaultBuild(B.cls); ui.view = null; changed(); } };
    $('modal-close').onclick = closeModal;
    $('modal').onclick = e => { if (e.target === $('modal')) closeModal(); };
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
    changed();
  }
  start();
})();
