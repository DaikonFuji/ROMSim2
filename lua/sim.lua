-- The simulator's calls into the client's own formulas (GameConfig.lua, CommonFun.lua), the way ROM Solo's server
-- makes them (server/stats.py, server/equipfx.py).
Table_Monster = Table_Monster or {}
Table_MonsterLevel = Table_MonsterLevel or {}
Table_BuffStateOdds = Table_BuffStateOdds or {}
Sim = {}

-- Table_RoleData by id, so CommonFun.GetAttrName works (per-stat card formulas)
function Sim.roledata(rows)
  Table_RoleData = rows
end

-- the stat with the job bonus (CommonFun.calAttrPoint / calHeroAttrPoint)
function Sim.stat(points, joblv, branch, name, hero)
  if hero then
    return points + (CommonFun.calHeroAttrPoint(joblv, branch, name) or 0)
  end
  return CommonFun.calAttrPoint(points, joblv, branch, name)
end

-- the wearer the buff formulas read: equipment, buffs, levels, skills, attributes
function Sim.wearer(props, equips, buffs, info)
  info.shadowbuffs = info.shadowbuffs or {}
  info.gems = info.gems or {}
  info.cardnum = info.cardnum or {}
  info.runes = info.runes or {}
  info.snowrefine = info.snowrefine or {}
  info.snowstones = info.snowstones or {}
  info.elemdef = info.elemdef or {}
  info.elematk = info.elematk or {}
  info.skills = info.skills or {}
  local fields = RomSoloEquipFields(equips, {}, buffs, info)
  fields.BaseLv = info.baselv or 1
  Sim.me = RomSoloMock(props, fields)
end

function Sim.props(props)
  Sim.me.props = props
end

-- a BuffEffect number (CommonFun.calcBuffValue) for the piece at a slot (cur: {id, pos, refinelv, lv})
function Sim.value(t, a, b, c, d, lv, cur, param)
  Sim.me.cur = cur
  local ok, v = pcall(CommonFun.calcBuffValue, Sim.me, Sim.me, t, a, b, c, d, lv, 0, param or {})
  Sim.me.cur = nil
  if ok and type(v) == "number" then return v end
  return 0
end

-- the final attributes (CommonFun.calcUserAttrValue). fc: the class whose formula numbers are used (A152);
-- prof: the class itself, whose SP rate is used when it has one (ITM-06)
function Sim.attrs(attr, lv, fc, prof, wtype, map)
  local a = {}
  for k, v in pairs(CommonFun.RoleData) do a[v] = 0 end
  for k, v in pairs(attr) do a[k] = v end
  local rec = GameConfig.NewRole.recover
  local own, sub = rec[prof], rec[fc]
  local swap = fc ~= prof and own ~= nil and sub ~= nil
  if swap then rec[fc] = {hp = sub.hp, sp = own.sp} end
  local ok, res = pcall(CommonFun.calcUserAttrValue, a, lv, fc, wtype, map)
  if swap then rec[fc] = sub end
  if not ok then error(res) end
  return res
end
