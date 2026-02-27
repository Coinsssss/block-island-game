(function (global) {
  var ns = global.BlockIsland = global.BlockIsland || {};

  var TIERS = [
    { min: 0, name: "Unknown" },
    { min: 20, name: "Known Local" },
    { min: 40, name: "Trusted" },
    { min: 60, name: "Respected Islander" },
    { min: 80, name: "Block Island Legend" }
  ];

  function clampReputation(value) {
    return Math.max(0, Math.min(100, Math.round(value)));
  }

  function getTownReputation(state) {
    if (!state || !state.player) return 0;

    if (typeof state.player.reputationTown === "number") {
      return clampReputation(state.player.reputationTown);
    }

    return clampReputation(state.player.reputation);
  }

  function getBarReputation(state) {
    if (!state || !state.player) return 0;
    return clampReputation(state.player.reputationBar);
  }

  function setTownReputation(state, value) {
    var clamped = clampReputation(value);
    if (!state || !state.player) return clamped;

    state.player.reputationTown = clamped;
    state.player.reputation = clamped;

    return clamped;
  }

  function setBarReputation(state, value) {
    var clamped = clampReputation(value);
    if (!state || !state.player) return clamped;

    state.player.reputationBar = clamped;
    return clamped;
  }

  function getReputationTier(value) {
    var rep = clampReputation(value);
    var tier = TIERS[0].name;

    TIERS.forEach(function (entry) {
      if (rep >= entry.min) {
        tier = entry.name;
      }
    });

    return tier;
  }

  function addReputation(state, amount) {
    var before = getTownReputation(state);
    var beforeTier = getReputationTier(before);

    setTownReputation(state, before + amount);

    return {
      before: before,
      after: getTownReputation(state),
      delta: getTownReputation(state) - before,
      beforeTier: beforeTier,
      afterTier: getReputationTier(getTownReputation(state)),
      tierChanged: beforeTier !== getReputationTier(getTownReputation(state))
    };
  }

  function addTownReputation(state, amount) {
    return addReputation(state, amount);
  }

  function addBarReputation(state, amount) {
    var before = getBarReputation(state);

    setBarReputation(state, before + amount);

    return {
      before: before,
      after: getBarReputation(state),
      delta: getBarReputation(state) - before
    };
  }

  ns.reputation = {
    TIERS: TIERS,
    clampReputation: clampReputation,
    getTownReputation: getTownReputation,
    getBarReputation: getBarReputation,
    setTownReputation: setTownReputation,
    setBarReputation: setBarReputation,
    getReputationTier: getReputationTier,
    addReputation: addReputation,
    addTownReputation: addTownReputation,
    addBarReputation: addBarReputation
  };
})(window);
