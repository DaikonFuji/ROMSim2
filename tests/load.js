// Loads the data, the client formulas and the engine in Node (for the tests).
const fs = require('fs'), path = require('path');
const Lua = require('../js/lua.js'), Engine = require('../js/engine.js');
const ROOT = path.join(__dirname, '..');
module.exports = function load() {
  const D = {};
  for (const n of ['core', 'skills', 'items', 'buffs', 'runes', 'gems', 'extras']) D[n] = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', n + '.json'), 'utf8'));
  const lua = new Lua();
  lua.run('_EmptyTable = {}', 'init');
  for (const f of ['GameConfig.lua', 'CommonFun.lua', 'mock.lua', 'sim.lua']) lua.run(fs.readFileSync(path.join(ROOT, 'lua', f), 'utf8'), f);
  return new Engine(D, lua);
};
