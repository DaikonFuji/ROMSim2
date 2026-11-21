const E = require('./load.js')();
const b = {cls: 14, base: 100, job: 50, pts: {Str: 60, Agi: 50, Vit: 40, Int: 1, Dex: 40, Luk: 1}};
console.time('c'); const r = E.compute(b); console.timeEnd('c');
console.log(JSON.stringify(Object.fromEntries(Object.entries(r.named).filter(([k,v])=>v))));
