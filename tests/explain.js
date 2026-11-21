// The simulator's bonus for build #i of tests/compare.js's random builds, source by source.
const E = require('./load.js')();
const i = +process.argv[2]; const N = +(process.argv[3] || 40); const seedArg = process.argv[4] || '1';
process.argv = [process.argv[0], 'x', '', String(N), seedArg];
const src = require('fs').readFileSync(__dirname + '/compare.js', 'utf8');
const genSrc = src.slice(src.indexOf('let seed'), src.indexOf('const builds'));
const fn = new Function('E', 'process', genSrc.replace('let seed = +(process.argv[4] || 1);', 'let seed = +' + seedArg + ';') + '; return Array.from({length:' + N + '}, build);');
const builds = fn(E, process);
const b = builds[i];
if (process.argv.includes('--json') || process.env.JSON) { console.log(JSON.stringify(b)); process.exit(0); }
const r = E.compute(b);
console.log(JSON.stringify({ parts: r.parts, learned: E.learned(b), wtype: r.wtype }, null, 0));
