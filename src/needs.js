(function (global) {
  var ns = global.BlockIsland = global.BlockIsland || {};

  var NEED_KEYS = ["energy", "hunger", "social"];

  var NEED_EFFECTS = {
    work: { energy: -24, hunger: -12, social: -8 },
    eat: { energy: 8, hunger: 34, social: 0 },
    socialize: { energy: -8, hunger: -6, social: 28 },
    rest: { energy: 24, hunger: -4, social: -5 },
    sleep: { energy: 30, hunger: -14, social: -8 }
  };

  function createInitialNeeds() {
    return {
      energy: 80,
      hunger: 70,
      social: 50
    };
  }

  function clampNeed(value) {
    return Math.max(0, Math.min(100, Math.round(value)));
  }

  function applyNeedsDelta(state, delta) {
    NEED_KEYS.forEach(function (key) {
      var change = delta && typeof delta[key] === "number" ? delta[key] : 0;
      state.player.needs[key] = clampNeed(state.player.needs[key] + change);
    });
  }

  function applyActionNeeds(state, actionName) {
    var delta = NEED_EFFECTS[actionName];
    if (!delta) return;
    applyNeedsDelta(state, delta);
  }

  function getPoorNeedsPenalty(needs) {
    var penalty = 0;
    var reasons = [];

    NEED_KEYS.forEach(function (key) {
      var value = typeof needs[key] === "number" ? needs[key] : 0;

      if (value < 25) {
        penalty += 2;
        reasons.push(key);
      }

      if (value < 10) {
        penalty += 1;
      }
    });

    return {
      penalty: penalty,
      reasons: reasons
    };
  }

  function normalizeNeeds(rawNeeds) {
    var base = createInitialNeeds();

    NEED_KEYS.forEach(function (key) {
      if (rawNeeds && typeof rawNeeds[key] === "number") {
        base[key] = clampNeed(rawNeeds[key]);
      }
    });

    return base;
  }

  ns.needs = {
    NEED_EFFECTS: NEED_EFFECTS,
    createInitialNeeds: createInitialNeeds,
    clampNeed: clampNeed,
    applyNeedsDelta: applyNeedsDelta,
    applyActionNeeds: applyActionNeeds,
    getPoorNeedsPenalty: getPoorNeedsPenalty,
    normalizeNeeds: normalizeNeeds
  };
})(window);
