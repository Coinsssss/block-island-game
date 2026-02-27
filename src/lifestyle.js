(function (global) {
  var ns = global.BlockIsland = global.BlockIsland || {};
  var DEFAULT_LIFESTYLE = "normal";

  var LIFESTYLES = {
    frugal: {
      id: "frugal",
      name: "Frugal",
      eatCostMult: 0.7,
      eatRestoreMult: 0.85,
      socializeCostMult: 0.6,
      socializeGainMult: 0.85,
      touristTipChanceMult: 0.9
    },
    normal: {
      id: "normal",
      name: "Normal",
      eatCostMult: 1.0,
      eatRestoreMult: 1.0,
      socializeCostMult: 1.0,
      socializeGainMult: 1.0,
      touristTipChanceMult: 1.0
    },
    social: {
      id: "social",
      name: "Social",
      eatCostMult: 1.25,
      eatRestoreMult: 1.1,
      socializeCostMult: 1.35,
      socializeGainMult: 1.15,
      touristTipChanceMult: 1.15
    }
  };

  function clampMinZeroInteger(value) {
    return Math.max(0, Math.round(value));
  }

  function normalizeLifestyle(lifestyleId) {
    if (typeof lifestyleId === "string" && LIFESTYLES[lifestyleId]) {
      return lifestyleId;
    }

    return DEFAULT_LIFESTYLE;
  }

  function getLifestyleConfig(lifestyleId) {
    return LIFESTYLES[normalizeLifestyle(lifestyleId)];
  }

  function getLifestyle(state) {
    return normalizeLifestyle(
      state &&
      state.player ?
      state.player.lifestyle :
      ""
    );
  }

  function setLifestyle(state, lifestyleId) {
    var normalized = normalizeLifestyle(lifestyleId);

    if (!state || !state.player) return normalized;
    state.player.lifestyle = normalized;
    return normalized;
  }

  function getCostMultiplier(lifestyleId, type) {
    var config = getLifestyleConfig(lifestyleId);

    if (type === "eat") return config.eatCostMult;
    if (type === "socialize") return config.socializeCostMult;
    return 1;
  }

  function getGainMultiplier(lifestyleId, type) {
    var config = getLifestyleConfig(lifestyleId);

    if (type === "eatRestore") return config.eatRestoreMult;
    if (type === "socializeGain") return config.socializeGainMult;
    return 1;
  }

  function applyLifestyleToCost(baseCost, lifestyleId, type) {
    var value = typeof baseCost === "number" ? baseCost : 0;

    return clampMinZeroInteger(value * getCostMultiplier(lifestyleId, type));
  }

  function applyLifestyleToGain(baseGain, lifestyleId, type) {
    var value = typeof baseGain === "number" ? baseGain : 0;

    return clampMinZeroInteger(value * getGainMultiplier(lifestyleId, type));
  }

  function getTouristTipChanceMultiplier(lifestyleId) {
    return getLifestyleConfig(lifestyleId).touristTipChanceMult;
  }

  ns.lifestyle = {
    DEFAULT_LIFESTYLE: DEFAULT_LIFESTYLE,
    LIFESTYLES: LIFESTYLES,
    normalizeLifestyle: normalizeLifestyle,
    getLifestyleConfig: getLifestyleConfig,
    getLifestyle: getLifestyle,
    setLifestyle: setLifestyle,
    applyLifestyleToCost: applyLifestyleToCost,
    applyLifestyleToGain: applyLifestyleToGain,
    getTouristTipChanceMultiplier: getTouristTipChanceMultiplier
  };
})(window);
