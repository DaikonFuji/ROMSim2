// Random builds worked out by the simulator and by ROM Solo's own server code (tests/oracle.py); prints every
// attribute that differs.  Usage: node tests/compare.js "<ROM Solo folder>" [count] [seed]
const { spawnSync } = require('child_process');
const path = require('path');
const E = require('./load.js')();
const ROM = process.argv[2] || process.env.ROMSOLO;
const N = +(process.argv[3] || 40);
let seed = +(process.argv[4] || 1);
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = a => a[Math.floor(rnd() * a.length)];
const D = E.D;

function cardFits(cardId, itemId) {
  const c = D.items.cards[cardId], it = D.items.equip[itemId];
  return c && it && (D.core.cardTypes[c.p] || []).includes(it.it);
}
const cardsByType = {};
for (const [id, c] of Object.entries(D.items.cards)) for (const t of D.core.cardTypes[c.p] || []) (cardsByType[t] = cardsByType[t] || []).push(+id);

function build() {
  const ids = Object.keys(D.core.classes).map(Number).filter(i => i !== 1 && i !== 150);
  const cls = pick(ids);
  const c = D.core.classes[cls];
  const base = 1 + Math.floor(rnd() * D.core.maxBase);
  const job = Math.max(1, Math.floor(rnd() * E.jobTop(cls)) + 1);
  const pts = {};
  for (const s of ['Str', 'Int', 'Agi', 'Dex', 'Vit', 'Luk']) pts[s] = 1 + Math.floor(rnd() * 120);
  const sk = {};
  for (const p of c.chain) for (const s of (D.core.classes[p] || { sk: [] }).sk) {
    const f = D.skills.fam[s]; if (!f) continue;
    if (rnd() < 0.7) sk[s] = Math.floor(rnd() * (f.lv.length + 1));
  }
  const eq = {};
  const bySite = {};
  for (const [id, it] of Object.entries(D.items.equip)) {
    if (it.ce && it.ce.length && !it.ce.includes(0) && !it.ce.includes(cls)) continue;
    for (const s of it.s) (bySite[s] = bySite[s] || []).push(+id);
  }
  for (const [site, list] of Object.entries(bySite)) {
    if (rnd() < 0.15) continue;
    const id = pick(list); const it = D.items.equip[id];
    const cards = [];
    for (let i = 0; i < (it.sl || 0); i++) if (rnd() < 0.8 && cardsByType[it.it]) cards.push(pick(cardsByType[it.it]));
    const en = [];
    if (it.ek && rnd() < 0.5) {
      const pool = D.items.enchant.filter(r => r.t === 3 && !(r.no || []).includes(it.ek));
      for (let i = 0; i < 3 && pool.length; i++) {
        const r = pick(pool); const bd = (r.b || [[1, 1]])[0];
        const pct = (D.core.roledata[r.a] || [])[3];
        const lo = pct ? Math.round(bd[0] * 100) : bd[0], hi = pct ? Math.round(bd[1] * 100) : bd[1];
        en.push([r.a, lo + Math.floor(rnd() * (hi - lo + 1))]);
      }
    }
    eq[site] = { id, rf: Math.floor(rnd() * 16), up: Math.floor(rnd() * ((it.up || []).length + 1)), cards, en };
  }
  const ra = D.runes.attrs[c.tb] || {};
  const stars = Object.keys(ra).filter(() => rnd() < 0.3).map(Number);
  const gemIds = Object.keys(D.gems).map(Number).filter(() => rnd() < 0.3).slice(0, 10);
  const gems = gemIds.map(id => ({ id, lv: 1 + Math.floor(rnd() * Object.keys(D.gems[id].lv).length) }));
  const colls = D.extras.collections.filter(() => rnd() < 0.3).map(c => c.id);
  const titles = Object.keys(D.extras.titles).filter(() => rnd() < 0.05).map(Number);
  return { cls, base, job, pts, sk, eq, stars, gems, colls, handbook: 1 + Math.floor(rnd() * 50), titles, gender: 1 };
}

const builds = Array.from({ length: N }, build);
const py = spawnSync('python3', [path.join(__dirname, 'oracle.py'), ROM], { input: builds.map(b => JSON.stringify(b)).join('\n'), maxBuffer: 1 << 28 });
if (py.status !== 0) { console.log(String(py.stderr).slice(-3000)); process.exit(1); }
const ref = String(py.stdout).trim().split('\n').map(l => JSON.parse(l));
const SKIP = new Set(['Hp', 'Sp', 'SaveHp', 'SaveSp']);
let bad = 0;
const diffCount = {};
builds.forEach((b, i) => {
  const r = ref[i];
  if (r.error) { console.log('#' + i, 'oracle error', r.error); bad++; return; }
  let mine;
  try { mine = E.compute(b).named; } catch (e) { console.log('#' + i, 'engine error', e.message); bad++; return; }
  const diffs = [];
  for (const k of new Set([...Object.keys(r), ...Object.keys(mine)])) {
    if (SKIP.has(k) || /^\d+$/.test(k)) continue;
    const a = +(mine[k] || 0), o = +(r[k] || 0);
    if (Math.abs(a - o) > 0.0015 + Math.abs(o) * 1e-9) { diffs.push(k + ' sim ' + a + ' / server ' + o); diffCount[k] = (diffCount[k] || 0) + 1; }
  }
  if (diffs.length) { bad++; console.log('#' + i, 'class', b.cls, D.core.classes[b.cls].n, '|', diffs.slice(0, 12).join('; ')); }
});
console.log(`${N - bad} of ${N} builds match the server`);
console.log(JSON.stringify(diffCount));
