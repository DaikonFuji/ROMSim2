// A small bridge to the client's Lua formulas, run by fengari (Lua 5.3 in JavaScript).
// Works in the browser (window.fengari from vendor/fengari-web.js) and in Node (require('fengari')) for the tests.
(function (root) {
  'use strict';
  const F = (typeof module !== 'undefined' && module.exports) ? require('fengari') : root.fengari;
  const { lua, lauxlib, lualib, to_luastring } = F;

  class Lua {
    constructor() {
      this.L = lauxlib.luaL_newstate();
      lualib.luaL_openlibs(this.L);
    }

    run(src, name) {
      const L = this.L;
      if (lauxlib.luaL_loadbuffer(L, to_luastring(src), null, to_luastring(name || 'chunk')) !== 0) {
        const e = lua.lua_tojsstring(L, -1); lua.lua_pop(L, 1); throw new Error(name + ': ' + e);
      }
      if (lua.lua_pcall(L, 0, 0, 0) !== 0) {
        const e = lua.lua_tojsstring(L, -1); lua.lua_pop(L, 1); throw new Error(name + ': ' + e);
      }
    }

    // push a JS value: objects become tables (keys that look like integers become integer keys)
    push(v) {
      const L = this.L;
      if (v === null || v === undefined) { lua.lua_pushnil(L); return; }
      switch (typeof v) {
        case 'number':
          if (Number.isInteger(v) && Math.abs(v) < 2 ** 52) lua.lua_pushinteger(L, v); else lua.lua_pushnumber(L, v);
          return;
        case 'boolean': lua.lua_pushboolean(L, v); return;
        case 'string': lua.lua_pushstring(L, to_luastring(v)); return;
      }
      if (Array.isArray(v)) {
        lua.lua_createtable(L, v.length, 0);
        v.forEach((x, i) => { this.push(x); lua.lua_rawseti(L, -2, i + 1); });
        return;
      }
      lua.lua_createtable(L, 0, 0);
      for (const k of Object.keys(v)) {
        if (/^-?\d+$/.test(k)) lua.lua_pushinteger(L, parseInt(k, 10)); else lua.lua_pushstring(L, to_luastring(k));
        this.push(v[k]);
        lua.lua_rawset(L, -3);
      }
    }

    // read the value at idx as JS (tables as plain objects; depth-limited)
    get(idx, depth) {
      const L = this.L;
      depth = depth || 0;
      const t = lua.lua_type(L, idx);
      if (t === lua.LUA_TNUMBER) return lua.lua_tonumber(L, idx);
      if (t === lua.LUA_TBOOLEAN) return lua.lua_toboolean(L, idx);
      if (t === lua.LUA_TSTRING) return lua.lua_tojsstring(L, idx);
      if (t !== lua.LUA_TTABLE || depth > 6) return null;
      const out = {};
      const ai = lua.lua_absindex(L, idx);
      lua.lua_pushnil(L);
      while (lua.lua_next(L, ai) !== 0) {
        const kt = lua.lua_type(L, -2);
        const k = kt === lua.LUA_TNUMBER ? String(lua.lua_tonumber(L, -2)) : lua.lua_tojsstring(L, -2);
        out[k] = this.get(-1, depth + 1);
        lua.lua_pop(L, 1);
      }
      return out;
    }

    // call a global function by dotted name ("Sim.attrs") with JS arguments; returns the first result as JS
    call(name, ...args) {
      const L = this.L;
      const parts = name.split('.');
      lua.lua_getglobal(L, to_luastring(parts[0]));
      for (let i = 1; i < parts.length; i++) {
        lua.lua_getfield(L, -1, to_luastring(parts[i]));
        lua.lua_remove(L, -2);
      }
      args.forEach(a => this.push(a));
      if (lua.lua_pcall(L, args.length, 1, 0) !== 0) {
        const e = lua.lua_tojsstring(L, -1); lua.lua_pop(L, 1); throw new Error(name + ': ' + e);
      }
      const r = this.get(-1);
      lua.lua_pop(L, 1);
      return r;
    }

    // a global value (e.g. "CommonFun.RoleData") as JS
    value(name) {
      const L = this.L;
      const parts = name.split('.');
      lua.lua_getglobal(L, to_luastring(parts[0]));
      for (let i = 1; i < parts.length; i++) {
        if (lua.lua_type(L, -1) !== lua.LUA_TTABLE) { lua.lua_pop(L, 1); return null; }
        lua.lua_getfield(L, -1, to_luastring(parts[i]));
        lua.lua_remove(L, -2);
      }
      const r = this.get(-1);
      lua.lua_pop(L, 1);
      return r;
    }
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = Lua; else root.RomLua = Lua;
})(typeof window !== 'undefined' ? window : globalThis);
