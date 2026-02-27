(function (global) {
  var ns = global.BlockIsland = global.BlockIsland || {};
  var reputation = ns.reputation;
  var socialUnlocks = ns.socialUnlocks;
  var needs = ns.needs;
  var time = ns.time;
  var pendingMoveTargetId = "";

  var MAX_HOUSING_PERCENT_BONUS = 0.2;

  var DEFAULT_HOUSING = {
    employee_housing: {
      id: "employee_housing",
      name: "Employee Housing",
      description: "Starter bunk provided by your employer.",
      weeklyRent: 200,
      perks: {
        energyRecoveryBonus: 0,
        moodBonus: 0,
        socializeGainMult: 0,
        rentDiscount: 0,
        tipBonus: 0
      }
    },
    shared_house_room: {
      id: "shared_house_room",
      name: "Shared House Room",
      description: "A personal room in a shared house.",
      weeklyRent: 500,
      unlockRequires: {
        money: 3000,
        reputation: 20
      },
      perks: {
        energyRecoveryBonus: 0,
        moodBonus: 0,
        socializeGainMult: 0.15,
        rentDiscount: 0,
        tipBonus: 0
      }
    }
  };

  function clampPercent(value, fallback) {
    var source = typeof value === "number" ? value : fallback;

    if (typeof source !== "number" || Number.isNaN(source)) {
      source = 0;
    }

    return Math.max(0, Math.min(MAX_HOUSING_PERCENT_BONUS, source));
  }

  function normalizeHousingPerks(rawPerks) {
    var perks = rawPerks && typeof rawPerks === "object" ? rawPerks : {};

    return {
      energyRecoveryBonus: Math.max(0, Math.floor(perks.energyRecoveryBonus || 0)),
      moodBonus: Math.max(0, Math.floor(perks.moodBonus || 0)),
      socializeGainMult: Math.max(
        -MAX_HOUSING_PERCENT_BONUS,
        Math.min(MAX_HOUSING_PERCENT_BONUS, Number(perks.socializeGainMult || 0))
      ),
      rentDiscount: clampPercent(perks.rentDiscount, 0),
      tipBonus: clampPercent(perks.tipBonus, 0)
    };
  }

  function normalizeHousingDefinition(housingId, rawDefinition) {
    var definition = rawDefinition && typeof rawDefinition === "object" ? rawDefinition : {};
    var unlockRequires = definition.unlockRequires && typeof definition.unlockRequires === "object"
      ? {
          money: Math.max(0, Math.floor(definition.unlockRequires.money || 0)),
          reputation: Math.max(0, Math.floor(definition.unlockRequires.reputation || 0))
        }
      : undefined;

    return {
      id: definition.id || housingId,
      name: definition.name || "Unknown Housing",
      description: definition.description || "",
      vibe: typeof definition.vibe === "string" ? definition.vibe.trim() : "",
      tier: Math.max(0, Math.floor(definition.tier || 0)),
      weeklyRent: Math.max(0, Math.floor(definition.weeklyRent || 0)),
      unlockRequires: unlockRequires,
      perks: normalizeHousingPerks(definition.perks)
    };
  }

  function buildHousingMap(rawHousing) {
    var source = rawHousing && typeof rawHousing === "object" && Object.keys(rawHousing).length > 0
      ? rawHousing
      : DEFAULT_HOUSING;
    var normalized = {};

    Object.keys(source).forEach(function (housingId) {
      normalized[housingId] = normalizeHousingDefinition(housingId, source[housingId]);
    });

    return normalized;
  }

  function getContentHousing() {
    if (ns.content && typeof ns.content === "object") {
      return ns.content.housing;
    }

    return null;
  }

  var HOUSING = buildHousingMap(getContentHousing());

  if (!ns.content || typeof ns.content !== "object") {
    ns.content = {};
  }
  ns.content.housing = HOUSING;

  var SHARED_HOUSE_REQUIREMENTS = HOUSING.shared_house_room && HOUSING.shared_house_room.unlockRequires
    ? {
        money: HOUSING.shared_house_room.unlockRequires.money,
        reputation: HOUSING.shared_house_room.unlockRequires.reputation
      }
    : {
        money: 3000,
        reputation: 20
      };

  function createDefaultUnlockedHousing() {
    var unlocked = {};

    Object.keys(HOUSING).forEach(function (housingId) {
      unlocked[housingId] = !HOUSING[housingId].unlockRequires;
    });

    if (Object.prototype.hasOwnProperty.call(HOUSING, "employee_housing")) {
      unlocked.employee_housing = true;
    }

    return unlocked;
  }

  function createInitialHousingState() {
    return {
      current: Object.prototype.hasOwnProperty.call(HOUSING, "employee_housing")
        ? "employee_housing"
        : Object.keys(HOUSING)[0] || "",
      unlocked: createDefaultUnlockedHousing()
    };
  }

  function getHousingLabel(housingId) {
    return HOUSING[housingId] ? HOUSING[housingId].name : "Unknown Housing";
  }

  function getHousingVibe(housingId) {
    return HOUSING[housingId] ? HOUSING[housingId].vibe : "";
  }

  function getHousingTier(housingId) {
    return HOUSING[housingId] ? HOUSING[housingId].tier : 0;
  }

  function getAllHousingIds() {
    return Object.keys(HOUSING);
  }

  function getHousingDefinition(housingId) {
    return HOUSING[housingId] || null;
  }

  function getWeeklyRent(housingId) {
    return HOUSING[housingId] ? HOUSING[housingId].weeklyRent : 0;
  }

  function getHousingPerks(housingId) {
    if (!HOUSING[housingId] || !HOUSING[housingId].perks) {
      return normalizeHousingPerks(null);
    }

    return normalizeHousingPerks(HOUSING[housingId].perks);
  }

  function getActiveHousingPerks(state) {
    var currentId = state && state.housing ? state.housing.current : "";
    return getHousingPerks(currentId);
  }

  function clampNeedValue(value) {
    if (needs && typeof needs.clampNeed === "function") {
      return needs.clampNeed(value);
    }

    return Math.max(0, Math.min(100, Math.round(value)));
  }

  function ensureEventsStateShape(state) {
    if (!state || typeof state !== "object") return null;

    if (!state.world || typeof state.world !== "object") {
      state.world = {};
    }
    if (!state.world.events || typeof state.world.events !== "object") {
      state.world.events = {
        lastEventDayKey: "",
        lastEventRollDayKey: "",
        lastEventTitle: "None",
        modifiers: []
      };
    }
    if (!Array.isArray(state.world.events.modifiers)) {
      state.world.events.modifiers = [];
    }

    return state.world.events;
  }

  function getCurrentDayNumber(state) {
    var eventsApi = ns.events;
    var seasonsPerYear;
    var daysPerSeason;
    var year;
    var seasonIndex;
    var day;

    if (eventsApi && typeof eventsApi.getCurrentDayNumber === "function") {
      return eventsApi.getCurrentDayNumber(state);
    }

    seasonsPerYear = time && Array.isArray(time.SEASON_IDS) ? time.SEASON_IDS.length : 4;
    daysPerSeason = time && typeof time.DAYS_PER_SEASON === "number" ? time.DAYS_PER_SEASON : 21;
    year = state && state.time && typeof state.time.year === "number" ? state.time.year : 1;
    seasonIndex = state && state.time && typeof state.time.seasonIndex === "number" ? state.time.seasonIndex : 0;
    day = state && state.time && typeof state.time.day === "number" ? state.time.day : 1;

    return ((year - 1) * seasonsPerYear * daysPerSeason) + (seasonIndex * daysPerSeason) + day;
  }

  function removePersistentModifier(state, modifierId) {
    var eventsState = ensureEventsStateShape(state);

    if (!eventsState) return;

    eventsState.modifiers = eventsState.modifiers.filter(function (modifier) {
      return !(modifier && modifier.id === modifierId);
    });
  }

  function upsertPersistentModifier(state, modifierId, type, value) {
    var eventsState = ensureEventsStateShape(state);

    if (!eventsState) return;

    removePersistentModifier(state, modifierId);

    eventsState.modifiers.push({
      id: modifierId,
      type: type,
      value: value,
      expiresOnDayNumber: getCurrentDayNumber(state) + 99999,
      remainingUses: null,
      consumeOn: ""
    });
  }

  function syncHousingPerkModifiers(state) {
    var perks = getActiveHousingPerks(state);
    var socializeBonus = perks.socializeGainMult;
    var tipBonus = perks.tipBonus;

    if (socializeBonus !== 0) {
      upsertPersistentModifier(
        state,
        "housing_perk_socialize_gain",
        "socializeGainMult",
        Math.max(0.5, 1 + socializeBonus)
      );
    } else {
      removePersistentModifier(state, "housing_perk_socialize_gain");
    }

    if (tipBonus > 0) {
      upsertPersistentModifier(
        state,
        "housing_perk_tip_bonus",
        "tipAmountMult",
        1 + tipBonus
      );
    } else {
      removePersistentModifier(state, "housing_perk_tip_bonus");
    }
  }

  function applySleepHousingPerks(state) {
    var perks = getActiveHousingPerks(state);
    var energyBefore;
    var moodBefore;

    if (!state || !state.player || !state.player.needs) {
      return {
        energyDelta: 0,
        moodDelta: 0
      };
    }

    energyBefore = state.player.needs.energy;
    moodBefore = state.player.needs.social;

    if (perks.energyRecoveryBonus !== 0) {
      state.player.needs.energy = clampNeedValue(
        state.player.needs.energy + perks.energyRecoveryBonus
      );
    }
    if (perks.moodBonus !== 0) {
      state.player.needs.social = clampNeedValue(
        state.player.needs.social + perks.moodBonus
      );
    }

    return {
      energyDelta: state.player.needs.energy - energyBefore,
      moodDelta: state.player.needs.social - moodBefore
    };
  }

  function getEffectiveWeeklyRent(state) {
    var baseRent;
    var discountPercent = 0;
    var housingDiscountPercent;
    var activePerks;

    if (!state || !state.housing) return 0;

    syncHousingPerkModifiers(state);

    baseRent = getWeeklyRent(state.housing.current);
    activePerks = getActiveHousingPerks(state);
    housingDiscountPercent = Math.round(activePerks.rentDiscount * 100);

    if (
      socialUnlocks &&
      typeof socialUnlocks.getLocalsDiscountPercent === "function"
    ) {
      discountPercent = socialUnlocks.getLocalsDiscountPercent(state);
    }

    discountPercent += housingDiscountPercent;
    discountPercent = Math.max(0, Math.min(80, discountPercent));

    if (discountPercent <= 0) {
      return baseRent;
    }

    return Math.max(0, Math.round(baseRent * (100 - discountPercent) / 100));
  }

  function getTownReputationValue(state) {
    if (reputation && typeof reputation.getTownReputation === "function") {
      return reputation.getTownReputation(state);
    }

    if (state && state.player) {
      if (typeof state.player.reputationTown === "number") {
        return Math.max(0, Math.floor(state.player.reputationTown));
      }
      if (typeof state.player.reputation === "number") {
        return Math.max(0, Math.floor(state.player.reputation));
      }
    }

    return 0;
  }

  function ensureHousingUnlockStateShape(state) {
    if (!state || !state.housing) {
      return createDefaultUnlockedHousing();
    }

    if (!state.housing.unlocked || typeof state.housing.unlocked !== "object") {
      state.housing.unlocked = createDefaultUnlockedHousing();
    }

    getAllHousingIds().forEach(function (housingId) {
      if (typeof state.housing.unlocked[housingId] !== "boolean") {
        state.housing.unlocked[housingId] = !HOUSING[housingId].unlockRequires;
      }
    });

    if (Object.prototype.hasOwnProperty.call(state.housing.unlocked, "employee_housing")) {
      state.housing.unlocked.employee_housing = true;
    }

    return state.housing.unlocked;
  }

  function meetsHousingUnlockRequirements(state, housingId) {
    var definition = HOUSING[housingId];
    var unlockRequires;

    if (!definition) return false;
    unlockRequires = definition.unlockRequires;
    if (!unlockRequires) return true;

    if (!state || !state.player) return false;
    if (state.player.money < unlockRequires.money) return false;
    if (getTownReputationValue(state) < unlockRequires.reputation) return false;

    return true;
  }

  function syncUnlockedHousing(state) {
    var unlocked;
    var newlyUnlocked = [];

    if (!state || !state.housing) return newlyUnlocked;

    unlocked = ensureHousingUnlockStateShape(state);

    getAllHousingIds().forEach(function (housingId) {
      if (unlocked[housingId]) return;
      if (!meetsHousingUnlockRequirements(state, housingId)) return;

      unlocked[housingId] = true;
      newlyUnlocked.push(housingId);
    });

    return newlyUnlocked;
  }

  function getAvailableHousingOptionIds(state) {
    var unlocked;

    if (!state || !state.housing) return [];

    syncUnlockedHousing(state);
    unlocked = ensureHousingUnlockStateShape(state);

    return getAllHousingIds()
      .filter(function (housingId) {
        return housingId !== state.housing.current && unlocked[housingId];
      })
      .sort(function (leftId, rightId) {
        var leftTier = getHousingTier(leftId);
        var rightTier = getHousingTier(rightId);
        var leftRent = getWeeklyRent(leftId);
        var rightRent = getWeeklyRent(rightId);

        if (leftTier !== rightTier) return leftTier - rightTier;
        if (leftRent !== rightRent) return leftRent - rightRent;
        return leftId.localeCompare(rightId);
      });
  }

  function setPendingMoveTarget(housingId) {
    if (!housingId || !HOUSING[housingId]) {
      pendingMoveTargetId = "";
      return pendingMoveTargetId;
    }

    pendingMoveTargetId = housingId;
    return pendingMoveTargetId;
  }

  function getPendingMoveTarget(state) {
    var available;

    if (pendingMoveTargetId && HOUSING[pendingMoveTargetId]) {
      return pendingMoveTargetId;
    }

    available = getAvailableHousingOptionIds(state);
    if (available.length > 0) {
      return available[0];
    }

    if (HOUSING.shared_house_room) {
      return "shared_house_room";
    }

    return "";
  }

  function canMoveToHousing(state, housingId) {
    if (!state || !state.housing || !HOUSING[housingId]) return false;
    if (state.housing.current === housingId) return false;

    syncUnlockedHousing(state);
    return meetsHousingUnlockRequirements(state, housingId);
  }

  function moveToHousing(state, housingId) {
    if (!canMoveToHousing(state, housingId)) return false;

    ensureHousingUnlockStateShape(state);
    state.housing.unlocked[housingId] = true;
    state.housing.current = housingId;
    syncHousingPerkModifiers(state);

    return true;
  }

  function getMoveInLogLine(housingId) {
    if (housingId === "shared_house_room") {
      return "You move into a shared room near Old Harbor. It's loud, but you feel closer to the action.";
    }
    if (housingId === "staff_bunkhouse") {
      return "You settle into the staff bunkhouse. It's crowded, but the social energy is constant.";
    }
    if (housingId === "off_island_road_room") {
      return "You move into a room off Off-Island Road. It's quieter, and nights finally slow down.";
    }
    if (housingId === "above_the_shop_room") {
      return "You move into a room above the shops. You're right in the middle of the daily rush.";
    }
    if (housingId === "quiet_apartment") {
      return "You move into a quiet apartment. It feels calmer, and recovery comes easier.";
    }
    if (housingId === "town_walk_up") {
      return "You move into a town walk-up. Everything feels close, and nights out are easier.";
    }
    if (housingId === "harborview_studio") {
      return "You move into a harborview studio. Visitors are everywhere, and opportunities come with the crowd.";
    }
    if (housingId === "small_cottage") {
      return "You move into a small cottage. It feels like your own corner of the island.";
    }
    if (housingId === "renovated_place") {
      return "You move into a renovated place. It feels steady, comfortable, and built for the long haul.";
    }
    if (housingId === "year_round_rental") {
      return "You move into a year-round rental. It's practical, stable, and rooted in local rhythm.";
    }

    return "You moved into " + getHousingLabel(housingId) + ".";
  }

  function canMoveToSharedHouse(state) {
    return canMoveToHousing(state, getPendingMoveTarget(state));
  }

  function moveToSharedHouse(state) {
    var targetHousingId = getPendingMoveTarget(state);
    var moved = moveToHousing(state, targetHousingId);

    if (moved) {
      pendingMoveTargetId = "";
    }

    return moved;
  }

  function applyReputationPenalty(state, amount) {
    var penalty = Math.abs(amount);

    if (reputation && typeof reputation.addReputation === "function") {
      reputation.addReputation(state, -penalty);
      return;
    }

    state.player.reputation = Math.max(
      0,
      Math.min(100, state.player.reputation - penalty)
    );
  }

  function chargeWeeklyRentIfDue(state, logFn) {
    var rent;

    syncHousingPerkModifiers(state);
    applySleepHousingPerks(state);

    if (!state || !state.time || state.time.weekdayIndex !== 0) {
      return {
        due: false,
        charged: false,
        missed: false,
        rent: 0
      };
    }

    rent = getEffectiveWeeklyRent(state);
    if (rent <= 0) {
      return {
        due: true,
        charged: false,
        missed: false,
        rent: 0
      };
    }

    if (state.player.money >= rent) {
      state.player.money -= rent;

      if (typeof logFn === "function") {
        logFn("You paid $" + rent + " in rent.");
      }

      return {
        due: true,
        charged: true,
        missed: false,
        rent: rent
      };
    }

    state.player.money = 0;
    applyReputationPenalty(state, 5);

    if (typeof logFn === "function") {
      logFn("You couldn't afford rent. Word gets around.");
    }

    return {
      due: true,
      charged: false,
      missed: true,
      rent: rent
    };
  }

  function normalizeHousing(rawHousing) {
    var base = createInitialHousingState();

    if (!rawHousing || typeof rawHousing !== "object") {
      return base;
    }

    if (rawHousing.unlocked && typeof rawHousing.unlocked === "object") {
      Object.keys(base.unlocked).forEach(function (housingId) {
        if (housingId === "employee_housing") {
          base.unlocked[housingId] = true;
          return;
        }

        if (typeof rawHousing.unlocked[housingId] === "boolean") {
          base.unlocked[housingId] = rawHousing.unlocked[housingId];
        }
      });
    }

    if (
      typeof rawHousing.current === "string" &&
      Object.prototype.hasOwnProperty.call(HOUSING, rawHousing.current)
    ) {
      base.current = rawHousing.current;
    }

    if (typeof base.current === "string" && Object.prototype.hasOwnProperty.call(base.unlocked, base.current)) {
      base.unlocked[base.current] = true;
    }

    return base;
  }

  ns.housing = {
    HOUSING: HOUSING,
    SHARED_HOUSE_REQUIREMENTS: SHARED_HOUSE_REQUIREMENTS,
    createInitialHousingState: createInitialHousingState,
    getAllHousingIds: getAllHousingIds,
    getHousingDefinition: getHousingDefinition,
    getHousingLabel: getHousingLabel,
    getHousingVibe: getHousingVibe,
    getHousingTier: getHousingTier,
    getWeeklyRent: getWeeklyRent,
    getHousingPerks: getHousingPerks,
    getActiveHousingPerks: getActiveHousingPerks,
    getMoveInLogLine: getMoveInLogLine,
    setPendingMoveTarget: setPendingMoveTarget,
    getPendingMoveTarget: getPendingMoveTarget,
    getAvailableHousingOptionIds: getAvailableHousingOptionIds,
    canMoveToHousing: canMoveToHousing,
    moveToHousing: moveToHousing,
    syncUnlockedHousing: syncUnlockedHousing,
    syncHousingPerkModifiers: syncHousingPerkModifiers,
    applySleepHousingPerks: applySleepHousingPerks,
    getEffectiveWeeklyRent: getEffectiveWeeklyRent,
    canMoveToSharedHouse: canMoveToSharedHouse,
    moveToSharedHouse: moveToSharedHouse,
    chargeWeeklyRentIfDue: chargeWeeklyRentIfDue,
    normalizeHousing: normalizeHousing
  };
})(window);
