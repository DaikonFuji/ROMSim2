-- Stand-ins for the creatures the client formulas read (ROM Solo server/combat.py, server/equipfx.py)

function RomSoloMock(props, fields)
  local u = {props = props}
  for k, v in pairs(fields) do u[k] = v end
  return setmetatable(u, {__index = function(t, k)
    if k == "GetProperty" then return function(self, n) return self.props[n] or 0 end end
    if k == "HasBuffID" or k == "HasBuffLayer" then  -- a monster's marks (1017cf: Heavy Arrow's, Hell Gate's...)
      return function(self, b) local m = rawget(self, "marks"); return m ~= nil and m[b] == true end
    end
    if k == "GetBuffLayer" then  -- its layers of a mark (Ultimate Despair's 143040: 1017je, A1005), 1 for a plain one
      return function(self, b)
        local l = rawget(self, "layers"); if l ~= nil and l[b] ~= nil then return l[b] end
        local m = rawget(self, "marks"); if m ~= nil and m[b] == true then return 1 end
        return 0
      end
    end
    if k == "GetRandom" then return function(self) return math.random(0, 99) end end
    if k == "GetLernedSkillLevel" and rawget(t, "skilllv") ~= nil then  -- learned levels, where given (Blitz Beat)
      return function(self, id) return rawget(self, "skilllv")[id] or 0 end
    end
    if k == "GetMapInfo" then return function(self) return rawget(self, "mapid") or 0, rawget(self, "maptype") or 0 end end
    if k == "GetPrestigeLevel" then return function(self) return rawget(self, "prestige") or 0 end end
    if k == "GetFromSkill" then return function(self) return rawget(self, "fromskill") or 0 end end  -- Minefield's traps
    if k == "GetNpcID" then return function(self) return self.npcid or 0 end end
    if k == "GetGuid" then return function(self) return self.guid or 0 end end
    if k == "getEquip" then return function() return {id = 0, refinelv = 0} end end
    if k == "GetCartNums" then return function() return 0, 0 end end  -- (items, slots): two numbers
    if k:match("Entry$") or k:match("BySite$") then return function() return nil end end  -- objects (Betray, enchants)
    if k:match("User$") or k:match("Master") or k:match("Owner") or k:match("Target$") then
      return function() return nil end
    end
    if k == "IsAttackSkill" then  -- the client's CreatureData:IsAttackSkill: its normal attack or a "serial" normal
      return function(self, id)    -- skill. Every stand-in has one (10001, or a class line's own: A872); without it
        return id == 10001 or id == rawget(self, "normalatk") or RomSoloExtraAttack()[id] == 1  -- nothing ever crit
      end                          -- (review CBT-02)
    end
    if k == "IsExtraNormalSkill" then return function(self, id) return RomSoloExtraNormal()[id] == true end end
    if k == "GetBuffActive" then  -- the client's answers false for a buff it doesn't have; the old fallback 0 is TRUE
      return function(self, b)    -- in Lua, which threw away every Ignore Def / Ignore MDef (review CBT-01)
        local h = rawget(self, "HasBuffID"); if h ~= nil then return h(self, b) == true end
        local m = rawget(self, "marks"); return m ~= nil and m[b] == true
      end
    end
    if k == "GetBuffEffectByType" or k == "GetBuffEffectActiveByType" or k == "GetTrapSurvivalTime"
       or k == "GetEnsemblePartner" then
      return function() return nil end  -- the client's nil for "none" (a 0 reads as "has one": CBT-01)
    end
    if k == "GetDamReduceType" then  -- the monster's Table_Monster row (review CBT-11)
      return function(self) local r = Table_Monster[rawget(self, "npcid") or 0]; return r and r.DamReduceType or 0 end
    end
    if k == "InGvgZone" and rawget(t, "ingvg") ~= nil then return function() return true end end
    if k:match("^Has") or k:match("^Is") or k:match("^In") or k:match("^Can") or k:match("^Check")
       or k == "DamageAlways1" or k == "NoAttackMetal" or k == "OpenStormBossLucky" then
      return function() return false end
    end
    return function() return 0 end
  end})
end
RomSoloLogger = {error = function() end, log = function() end, warn = function() end}
local _extraAttack, _extraNormal
function RomSoloExtraAttack()  -- CreatureData's ExtraAttackSkill: GameConfig.NormalSerialSkills
  if _extraAttack == nil then
    _extraAttack = {}
    for _, v in pairs((GameConfig.NormalSerialSkills or {}).skills or {}) do
      for i = 1, #v do _extraAttack[v[i]] = 1 end
    end
  end
  return _extraAttack
end
function RomSoloExtraNormal()  -- CreatureData.ExtraNormalSkills: GameConfig.ExtraNormalSkills
  if _extraNormal == nil then
    _extraNormal = {}
    for _, v in pairs((GameConfig.ExtraNormalSkills or {}).skills or {}) do _extraNormal[v] = true end
  end
  return _extraNormal
end
function RomSoloWith(base, extra)
  local t = {}
  if base then for k, v in pairs(base) do t[k] = v end end
  for k, v in pairs(extra) do t[k] = v end
  return t
end


function RomSoloEquipFields(equips, shadow, buffs, info)
  local f = {equips = equips, shadow = shadow, buffs = buffs, info = info, cur = nil}
  local none = function(pos) return {id = 0, refinelv = 0, lv = 0, quench_per = 0, pos = pos or 0, isAtShadow = false} end
  f.GetEquipedRefineLv = function(self, pos) local e = self.equips[pos]; return e and e.refinelv or 0 end
  f.GetEquipedID = function(self, pos) local e = self.equips[pos]; return e and e.id or 0 end
  f.getEquipLv = function(self, pos) local e = self.equips[pos]; return e and e.lv or 0 end
  f.GetEquipedStrengthLv = function(self, pos) local e = self.equips[pos]; return e and e.strength or 0 end
  f.getEquip = function(self, pack, pos)
    local src = (pack == 20) and self.shadow or self.equips
    return src[pos] or none(pos)
  end
  f.getCurOperEquip = function(self) return self.cur or none(0) end
  f.HasBuffID = function(self, b) return self.buffs[b] == true end
  f.HasBuffLayer = function(self, b, layer)
    if layer == EBUFFERLAYER_SHADOW then return self.info.shadowbuffs[b] == true end
    return self.buffs[b] == true
  end
  f.GetProfressionID = function(self) return self.info.profession or 0 end
  f.GetJobLv = function(self) return self.info.joblv or 0 end
  f.GetBaseLv = function(self) return self.info.baselv or 0 end
  f.GetLernedSkillLevel = function(self, id)  -- MyselfData: by the skill's family (sort id)
    if id == nil then return 0 end  -- a damage row without skill1_id (Guillotine Cross, Nameless: 1017cf)
    local v = self.info.skills[id]
    if v == nil and id > 100000 then v = self.info.skills[math.floor(id / 1000)] end
    return v or 0
  end
  f.IsBeingPresent = function(self, id) return self.info.being ~= 0 and (id == nil or id == 0 or id == self.info.being) end
  f.GetPetCount = function(self) return 0 end
  f.GetCartNums = function(self) return self.info.cart or 0, self.info.cartmax or 0 end  -- the cart's items, slots
  f.GetEnsemblePartner = function(self) return nil end  -- played solo with the Ensemble Puppet (1017cb, A340)
  f.GetGemValue = function(self, id) return self.info.gems[id] or 0 end  -- the working skill runes' numbers (A320)
  f.GetTimeDiskGrid = function(self)  -- the Star Emperor's Time Plate area (sunmoon.py, A994)
    if RomSoloDiskGrid then return RomSoloDiskGrid(self.info.cid) end
    return 1
  end
  f.GetSunMark = function(self, tar)  -- Hatred of the Sun / Moon (A995)
    if RomSoloSunMoon == nil or tar == nil then return false end
    return RomSoloSunMoon(self.info.cid, 1, tar:GetNpcID() or 0, tar:GetProfressionID() or 0)
  end
  f.GetMoonMark = function(self, tar)
    if RomSoloSunMoon == nil or tar == nil then return false end
    return RomSoloSunMoon(self.info.cid, 2, tar:GetNpcID() or 0, tar:GetProfressionID() or 0)
  end
  f.GetZenyNum = function(self) return self.info.zeny or 0 end  -- Midgard Madman Card (A322)
  f.GetEquipCardNum = function(self, id) return self.info.cardnum[id] or 0 end
  f.GetRunePoint = function(self, id) return self.info.runes[id] or 0 end  -- the Astrolabe's lit special stars (A334)
  f.GetActiveAstrolabePoints = function(self) return self.info.stars or 0 end
  f.GetSnowStoreRefineLv = function(self, slot) return self.info.snowrefine[slot] or 0 end  -- the crown's stored piece
  f.GetEquipSnowStoneLv = function(self, id) return self.info.snowstones[id] or 0 end  -- a set stone's advance (A1041)
  f.GetElementDefUpLevel = function(self, e) return self.info.elemdef[e] or 0 end  -- "Neutral Armor Level +1"
  f.GetElementAtkUpLevel = function(self, e, roll) local r = self.info.elematk[roll]; return r and r[e] or 0 end
  return f
end
