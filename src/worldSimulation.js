(function (global) {
  var ns = global.BlockIsland = global.BlockIsland || {};
  var time = ns.time;

  var HUNGER_DECAY_PER_MINUTE = 0.065;
  var ENERGY_DECAY_PER_MINUTE = 0.055;
  var STAND_HUNGER_EXTRA_PER_MINUTE = 0.03;
  var STAND_ENERGY_EXTRA_PER_MINUTE = 0.04;
  var MOOD_LOW_NEEDS_PENALTY_PER_MINUTE = 0.05;
  var MOOD_RECOVERY_PER_MINUTE = 0.015;
  var STAND_SALE_BASE_CHANCE = 0.22;
  var STAND_BASE_PRICE = 6;

  function random() {
    if (ns.rng && typeof ns.rng.next === "function") {
      return ns.rng.next();
    }

    return Math.random();
  }

  function clampNeedFloat(value) {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return 0;
    }

    return Math.max(0, Math.min(100, value));
  }

  function ensureNeedsState(state) {
    if (!state || !state.player || !state.player.needs) {
      return null;
    }

    if (typeof state.player.needs.energy !== "number") state.player.needs.energy = 80;
    if (typeof state.player.needs.hunger !== "number") state.player.needs.hunger = 70;
    if (typeof state.player.needs.social !== "number") state.player.needs.social = 50;

    return state.player.needs;
  }

  function createInitialStandState() {
    return {
      isOpen: false,
      cupsSoldToday: 0,
      earningsToday: 0
    };
  }

  function ensureStandState(state) {
    if (!state || !state.world) {
      return createInitialStandState();
    }

    if (!state.world.stand || typeof state.world.stand !== "object") {
      state.world.stand = createInitialStandState();
    }

    if (typeof state.world.stand.isOpen !== "boolean") {
      state.world.stand.isOpen = false;
    }
    if (typeof state.world.stand.cupsSoldToday !== "number" || Number.isNaN(state.world.stand.cupsSoldToday)) {
      state.world.stand.cupsSoldToday = 0;
    }
    if (typeof state.world.stand.earningsToday !== "number" || Number.isNaN(state.world.stand.earningsToday)) {
      state.world.stand.earningsToday = 0;
    }

    state.world.stand.cupsSoldToday = Math.max(0, Math.floor(state.world.stand.cupsSoldToday));
    state.world.stand.earningsToday = Math.max(0, Math.floor(state.world.stand.earningsToday));
    return state.world.stand;
  }

  function resetDailyWorldState(state) {
    var stand = ensureStandState(state);
    stand.isOpen = false;
    stand.cupsSoldToday = 0;
    stand.earningsToday = 0;
  }

  function getStandStatusLabel(state) {
    var stand = ensureStandState(state);
    var status = stand.isOpen ? "Open" : "Closed";
    return status + " | $" + stand.earningsToday + " | " + stand.cupsSoldToday + " cups";
  }

  function applyNeedDeltas(needsState, deltas) {
    var nextHunger = needsState.hunger + (deltas.hunger || 0);
    var nextEnergy = needsState.energy + (deltas.energy || 0);
    var nextMood = needsState.social + (deltas.mood || 0);

    needsState.hunger = clampNeedFloat(nextHunger);
    needsState.energy = clampNeedFloat(nextEnergy);
    needsState.social = clampNeedFloat(nextMood);
  }

  function isStandServiceWindow(minuteOfDay) {
    return minuteOfDay >= 9 * 60 && minuteOfDay <= 19 * 60;
  }

  function rollStandSales(state, minuteOfDay) {
    var stand = ensureStandState(state);
    var needsState = ensureNeedsState(state);
    var moodFactor;
    var chance;
    var sold = 0;
    var revenue = 0;

    if (!stand.isOpen || !isStandServiceWindow(minuteOfDay) || !needsState) {
      return { sold: 0, revenue: 0 };
    }

    moodFactor = Math.max(0.75, Math.min(1.25, needsState.social / 60));
    chance = Math.max(0.05, Math.min(0.75, STAND_SALE_BASE_CHANCE * moodFactor));
    if (random() < chance) {
      sold = random() < 0.18 ? 2 : 1;
      revenue = sold * STAND_BASE_PRICE;
      state.player.money += revenue;
      stand.cupsSoldToday += sold;
      stand.earningsToday += revenue;
    }

    return {
      sold: sold,
      revenue: revenue
    };
  }

  function applyPassiveNeedsForMinute(state, minuteOfDay) {
    var needsState = ensureNeedsState(state);
    var stand = ensureStandState(state);
    var hungerDelta = -HUNGER_DECAY_PER_MINUTE;
    var energyDelta = -ENERGY_DECAY_PER_MINUTE;
    var moodDelta = 0;

    if (!needsState) {
      return;
    }

    if (stand.isOpen && isStandServiceWindow(minuteOfDay)) {
      hungerDelta -= STAND_HUNGER_EXTRA_PER_MINUTE;
      energyDelta -= STAND_ENERGY_EXTRA_PER_MINUTE;
    }

    if (needsState.hunger < 25 || needsState.energy < 25) {
      moodDelta -= MOOD_LOW_NEEDS_PENALTY_PER_MINUTE;
    } else if (needsState.hunger > 55 && needsState.energy > 45) {
      moodDelta += MOOD_RECOVERY_PER_MINUTE;
    }

    applyNeedDeltas(needsState, {
      hunger: hungerDelta,
      energy: energyDelta,
      mood: moodDelta
    });
  }

  function stepRealtimeSimulation(state, minutesAdvanced, minuteStart) {
    var i;
    var safeMinutes = typeof minutesAdvanced === "number" && !Number.isNaN(minutesAdvanced)
      ? Math.max(0, Math.floor(minutesAdvanced))
      : 0;
    var startMinute = typeof minuteStart === "number" && !Number.isNaN(minuteStart)
      ? Math.max(time.DAY_START_MINUTE, Math.floor(minuteStart))
      : time.DAY_START_MINUTE;
    var totalRevenue = 0;
    var totalSold = 0;

    ensureNeedsState(state);
    ensureStandState(state);

    for (i = 0; i < safeMinutes; i += 1) {
      var minuteOfDay = Math.min(time.DAY_END_MINUTE, startMinute + i);
      var standResult;

      applyPassiveNeedsForMinute(state, minuteOfDay);
      standResult = rollStandSales(state, minuteOfDay);
      totalRevenue += standResult.revenue;
      totalSold += standResult.sold;
    }

    return {
      revenue: totalRevenue,
      cupsSold: totalSold
    };
  }

  function getMovementSpeedMultiplier(state) {
    var needsState = ensureNeedsState(state);

    if (!needsState) {
      return 1;
    }

    if (needsState.energy < 15) {
      return 0.58;
    }
    if (needsState.energy < 30) {
      return 0.72;
    }
    if (needsState.energy < 45) {
      return 0.86;
    }

    return 1;
  }

  function toggleStandOpen(state) {
    var stand = ensureStandState(state);
    stand.isOpen = !stand.isOpen;
    return stand.isOpen;
  }

  ns.worldSimulation = {
    HUNGER_DECAY_PER_MINUTE: HUNGER_DECAY_PER_MINUTE,
    ENERGY_DECAY_PER_MINUTE: ENERGY_DECAY_PER_MINUTE,
    createInitialStandState: createInitialStandState,
    ensureStandState: ensureStandState,
    resetDailyWorldState: resetDailyWorldState,
    getStandStatusLabel: getStandStatusLabel,
    stepRealtimeSimulation: stepRealtimeSimulation,
    getMovementSpeedMultiplier: getMovementSpeedMultiplier,
    toggleStandOpen: toggleStandOpen
  };
})(window);
