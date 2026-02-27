(function (global) {
  var ns = global.BlockIsland = global.BlockIsland || {};

  var time = ns.time;
  var needs = ns.needs;
  var jobs = ns.jobs;
  var reputation = ns.reputation;
  var lifestyle = ns.lifestyle;
  var housing = ns.housing;
  var content = ns.content;

  var MAX_LOG_ENTRIES = 80;
  var SEASONS = ["spring", "summer", "fall", "winter"];

  function ensurePath(obj, pathArray, defaultValue) {
    var current = obj;
    var i;
    var key;
    var lastKey;

    if (!obj || typeof obj !== "object") return undefined;
    if (!Array.isArray(pathArray) || pathArray.length <= 0) return undefined;

    for (i = 0; i < pathArray.length - 1; i += 1) {
      key = pathArray[i];
      if (typeof key !== "string" || key.length <= 0) return undefined;

      if (
        !Object.prototype.hasOwnProperty.call(current, key) ||
        typeof current[key] === "undefined"
      ) {
        current[key] = {};
      }

      if (!current[key] || typeof current[key] !== "object") {
        return undefined;
      }

      current = current[key];
    }

    lastKey = pathArray[pathArray.length - 1];
    if (typeof lastKey !== "string" || lastKey.length <= 0) return undefined;

    if (
      !Object.prototype.hasOwnProperty.call(current, lastKey) ||
      typeof current[lastKey] === "undefined"
    ) {
      current[lastKey] = defaultValue;
    }

    return current[lastKey];
  }

  function clampInteger(value, fallback, min, max) {
    if (typeof value !== "number" || Number.isNaN(value)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(value)));
  }

  function seasonFromIndex(seasonIndex) {
    var normalizedIndex = clampInteger(seasonIndex, 0, 0, SEASONS.length - 1);
    return SEASONS[normalizedIndex];
  }

  function getCurrentDayNumberFromTime(timeState) {
    var timeSource = timeState && typeof timeState === "object"
      ? timeState
      : time.createInitialTimeState();
    var seasonsPerYear = Array.isArray(time.SEASON_IDS) ? time.SEASON_IDS.length : 4;
    var daysPerSeason = typeof time.DAYS_PER_SEASON === "number" ? time.DAYS_PER_SEASON : 21;
    var year = clampInteger(timeSource.year, 1, 1, 9999);
    var seasonIndex = clampInteger(timeSource.seasonIndex, 0, 0, seasonsPerYear - 1);
    var day = clampInteger(timeSource.day, 1, 1, daysPerSeason);

    return ((year - 1) * seasonsPerYear * daysPerSeason) + (seasonIndex * daysPerSeason) + day;
  }

  function normalizeSeason(rawSeason, fallbackSeason) {
    var candidate = typeof rawSeason === "string" ? rawSeason.toLowerCase() : "";

    if (SEASONS.indexOf(candidate) >= 0) {
      return candidate;
    }

    if (SEASONS.indexOf(fallbackSeason) >= 0) {
      return fallbackSeason;
    }

    return "spring";
  }

  function createInitialWorldState() {
    var defaultSeason = content &&
      content.meta &&
      typeof content.meta.defaultSeason === "string"
      ? content.meta.defaultSeason
      : "spring";

    return {
      season: normalizeSeason(defaultSeason, "spring"),
      events: createInitialEventsState()
    };
  }

  function createInitialEventsState() {
    return {
      lastEventDayKey: "",
      lastEventRollDayKey: "",
      lastEventTitle: "None",
      modifiers: []
    };
  }

  function normalizeEventModifier(rawModifier, fallbackDayNumber) {
    var modifier = rawModifier && typeof rawModifier === "object" ? rawModifier : {};
    var remainingUses = typeof modifier.remainingUses === "number"
      ? Math.max(0, Math.floor(modifier.remainingUses))
      : null;

    return {
      id: typeof modifier.id === "string" ? modifier.id : "",
      type: typeof modifier.type === "string" ? modifier.type : "workPayMult",
      value: typeof modifier.value === "number" ? modifier.value : 0,
      expiresOnDayNumber: clampInteger(
        modifier.expiresOnDayNumber,
        fallbackDayNumber,
        1,
        999999999
      ),
      remainingUses: remainingUses,
      consumeOn: typeof modifier.consumeOn === "string" ? modifier.consumeOn : ""
    };
  }

  function normalizeEventsState(rawEvents, fallbackDayNumber) {
    var eventsState = createInitialEventsState();

    if (!rawEvents || typeof rawEvents !== "object") {
      return eventsState;
    }

    if (typeof rawEvents.lastEventDayKey === "string") {
      eventsState.lastEventDayKey = rawEvents.lastEventDayKey;
    }
    if (typeof rawEvents.lastEventRollDayKey === "string") {
      eventsState.lastEventRollDayKey = rawEvents.lastEventRollDayKey;
    }
    if (typeof rawEvents.lastEventTitle === "string") {
      eventsState.lastEventTitle = rawEvents.lastEventTitle;
    }
    if (Array.isArray(rawEvents.modifiers)) {
      eventsState.modifiers = rawEvents.modifiers
        .map(function (modifier) {
          return normalizeEventModifier(modifier, fallbackDayNumber);
        })
        .filter(function (modifier) {
          return typeof modifier.expiresOnDayNumber === "number" && modifier.expiresOnDayNumber >= 1;
        });
    }

    return eventsState;
  }

  function normalizeWorldState(rawWorld, fallbackSeason, fallbackDayNumber) {
    var world = createInitialWorldState();
    var nextFallbackSeason = normalizeSeason(fallbackSeason, world.season);
    var dayNumber = clampInteger(fallbackDayNumber, 1, 1, 999999999);

    if (!rawWorld || typeof rawWorld !== "object") {
      world.season = nextFallbackSeason;
      world.events = normalizeEventsState(null, dayNumber);
      return world;
    }

    world.season = normalizeSeason(rawWorld.season, nextFallbackSeason);
    world.events = normalizeEventsState(rawWorld.events, dayNumber);
    return world;
  }

  function createInitialRelationshipsState() {
    return {
      locals: 0,
      staff: 0,
      summerPeople: 0,
      tourists: 0
    };
  }

  function normalizeRelationshipGroupId(groupId) {
    if (groupId === "tourists") {
      return "summerPeople";
    }

    return groupId;
  }

  function syncRelationshipAliases(relationships) {
    if (!relationships || typeof relationships !== "object") {
      return;
    }

    relationships.summerPeople = clampInteger(relationships.summerPeople, 0, 0, 100);
    relationships.tourists = relationships.summerPeople;
  }

  function normalizeRelationshipsState(rawRelationships) {
    var relationships = createInitialRelationshipsState();

    if (!rawRelationships || typeof rawRelationships !== "object") {
      return relationships;
    }

    relationships.locals = clampInteger(rawRelationships.locals, relationships.locals, 0, 100);
    relationships.staff = clampInteger(rawRelationships.staff, relationships.staff, 0, 100);
    relationships.summerPeople = clampInteger(
      typeof rawRelationships.summerPeople === "number"
        ? rawRelationships.summerPeople
        : rawRelationships.tourists,
      relationships.summerPeople,
      0,
      100
    );
    syncRelationshipAliases(relationships);

    return relationships;
  }

  function ensureRelationshipsContainer(state) {
    var source;
    var relationships;

    if (!state || !state.player) {
      return createInitialRelationshipsState();
    }

    source = state.relationships;
    if (!source || typeof source !== "object") {
      source = state.player.social;
    }

    relationships = normalizeRelationshipsState(source);
    syncRelationshipAliases(relationships);
    state.relationships = relationships;
    state.player.social = relationships;

    return relationships;
  }

  function setRelationshipValue(state, groupId, value) {
    var relationships = ensureRelationshipsContainer(state);

    var normalizedGroupId = normalizeRelationshipGroupId(groupId);

    if (!Object.prototype.hasOwnProperty.call(relationships, normalizedGroupId)) {
      return {
        groupId: normalizedGroupId,
        delta: 0,
        value: 0
      };
    }

    relationships[normalizedGroupId] = clampInteger(
      value,
      relationships[normalizedGroupId],
      0,
      100
    );
    syncRelationshipAliases(relationships);

    return {
      groupId: normalizedGroupId,
      delta: 0,
      value: relationships[normalizedGroupId]
    };
  }

  function getRelationshipValue(state, groupId) {
    var relationships = ensureRelationshipsContainer(state);
    var normalizedGroupId = normalizeRelationshipGroupId(groupId);

    if (!Object.prototype.hasOwnProperty.call(relationships, normalizedGroupId)) {
      return 0;
    }

    return clampInteger(relationships[normalizedGroupId], 0, 0, 100);
  }

  function createInitialStatsState() {
    return {
      lifetimeEarningsBySource: {
        jobs: 0,
        tips: 0,
        other: 0
      }
    };
  }

  function normalizeStatsState(rawStats) {
    var stats = createInitialStatsState();
    var sources;

    if (!rawStats || typeof rawStats !== "object") {
      return stats;
    }

    sources = rawStats.lifetimeEarningsBySource;
    if (sources && typeof sources === "object") {
      stats.lifetimeEarningsBySource.jobs = clampInteger(
        sources.jobs,
        stats.lifetimeEarningsBySource.jobs,
        0,
        999999999
      );
      stats.lifetimeEarningsBySource.tips = clampInteger(
        sources.tips,
        stats.lifetimeEarningsBySource.tips,
        0,
        999999999
      );
      stats.lifetimeEarningsBySource.other = clampInteger(
        sources.other,
        stats.lifetimeEarningsBySource.other,
        0,
        999999999
      );
    }

    return stats;
  }

  function createInitialSocialState() {
    return createInitialRelationshipsState();
  }

  function normalizeSocialState(rawSocial) {
    return normalizeRelationshipsState(rawSocial);
  }

  function getLocalRelationship(state) {
    return getRelationshipValue(state, "locals");
  }

  function getStaffRelationship(state) {
    return getRelationshipValue(state, "staff");
  }

  function getTouristRelationship(state) {
    return getRelationshipValue(state, "summerPeople");
  }

  function getSummerPeopleRelationship(state) {
    return getRelationshipValue(state, "summerPeople");
  }

  function addSocialRelationship(state, groupId, amount) {
    var relationships = ensureRelationshipsContainer(state);
    var normalizedGroupId = normalizeRelationshipGroupId(groupId);
    var current;
    var next;

    if (!Object.prototype.hasOwnProperty.call(relationships, normalizedGroupId)) {
      return {
        groupId: normalizedGroupId,
        delta: 0,
        value: 0
      };
    }

    current = clampInteger(relationships[normalizedGroupId], 0, 0, 100);
    next = clampInteger(current + amount, current, 0, 100);
    relationships[normalizedGroupId] = next;
    syncRelationshipAliases(relationships);

    return {
      groupId: normalizedGroupId,
      delta: next - current,
      value: next
    };
  }

  function createInitialFlagsState() {
    return {
      announcedLocals60: false,
      announcedLocals85: false,
      announcedStaff60: false,
      announcedStaff85: false,
      announcedSummerPeople50: false,
      announcedSummerPeople80: false,
      announcedTourists50: false,
      announcedTourists80: false,
      seenUnlockedOpportunities: false
    };
  }

  function normalizeFlagsState(rawFlags) {
    var flags = createInitialFlagsState();

    if (!rawFlags || typeof rawFlags !== "object") {
      return flags;
    }

    Object.keys(flags).forEach(function (key) {
      if (typeof rawFlags[key] === "boolean") {
        flags[key] = rawFlags[key];
      }
    });

    if (flags.announcedSummerPeople50 === false && flags.announcedTourists50 === true) {
      flags.announcedSummerPeople50 = true;
    }
    if (flags.announcedSummerPeople80 === false && flags.announcedTourists80 === true) {
      flags.announcedSummerPeople80 = true;
    }

    return flags;
  }

  function createInitialState() {
    var initialJobs = jobs.createInitialJobsState();
    var relationships = createInitialRelationshipsState();
    var initialTime = time.createInitialTimeState();
    var initialWorld = createInitialWorldState();
    var initialTownRep = 10;
    var initialDayNumber = getCurrentDayNumberFromTime(initialTime);

    ensurePath(initialJobs, ["pendingJobId"], "");
    ensurePath(initialJobs, ["pendingJobStartDay"], 0);
    ensurePath(initialJobs, ["lastJobChangeDay"], 0);
    ensurePath(initialJobs, ["currentJobId"], "");
    ensurePath(initialWorld, ["day"], initialDayNumber);
    ensurePath(initialWorld, ["season"], seasonFromIndex(initialTime.seasonIndex));

    return {
      meta: {
        version: 1,
        prototype: "phase1"
      },
      time: initialTime,
      world: initialWorld,
      player: {
        money: 2000,
        reputation: initialTownRep,
        reputationTown: initialTownRep,
        reputationBar: 0,
        needs: needs.createInitialNeeds(),
        social: relationships,
        lifestyle: lifestyle && typeof lifestyle.normalizeLifestyle === "function"
          ? lifestyle.normalizeLifestyle()
          : "normal"
      },
      relationships: relationships,
      stats: createInitialStatsState(),
      jobs: initialJobs,
      housing: housing.createInitialHousingState(),
      flags: createInitialFlagsState(),
      log: [
        "Pick a job to start earning.",
        "Find work, earn your place, and build a life here.",
        "You arrive on Block Island with a small room and a fresh start."
      ]
    };
  }

  function createStateFromSave(raw) {
    var state = createInitialState();
    var fallbackSeason = state.world.season;
    var relationshipSource;
    var maxSeasonWeeks = Math.max(1, Math.ceil(time.DAYS_PER_SEASON / time.DAYS_PER_WEEK));
    var savedTownRep;
    var savedBarRep;
    var currentDayNumberFromTime;

    ensurePath(state, ["jobs", "pendingJobId"], "");
    ensurePath(state, ["jobs", "pendingJobStartDay"], 0);
    ensurePath(state, ["jobs", "lastJobChangeDay"], 0);
    ensurePath(state, ["jobs", "currentJobId"], "");
    ensurePath(state, ["player", "money"], 0);
    ensurePath(state, ["player", "energy"], 100);
    ensurePath(state, ["player", "mood"], 100);
    ensurePath(state, ["world", "day"], getCurrentDayNumberFromTime(state.time));
    ensurePath(state, ["world", "season"], "spring");

    if (!raw || typeof raw !== "object") {
      return state;
    }

    if (raw.time && typeof raw.time === "object") {
      state.time.day = clampInteger(raw.time.day, state.time.day, 1, time.DAYS_PER_SEASON);
      state.time.weekdayIndex = clampInteger(raw.time.weekdayIndex, state.time.weekdayIndex, 0, 6);
      state.time.week = clampInteger(raw.time.week, state.time.week, 1, maxSeasonWeeks);
      state.time.seasonIndex = clampInteger(raw.time.seasonIndex, state.time.seasonIndex, 0, 3);
      state.time.year = clampInteger(raw.time.year, state.time.year, 1, 9999);
      state.time.actionSlotsRemaining = clampInteger(
        raw.time.actionSlotsRemaining,
        state.time.actionSlotsRemaining,
        0,
        time.MAX_ACTION_SLOTS
      );
      fallbackSeason = seasonFromIndex(state.time.seasonIndex);
    }

    if (raw.player && typeof raw.player === "object") {
      state.player.money = clampInteger(raw.player.money, state.player.money, 0, 9999999);
      savedTownRep = clampInteger(
        typeof raw.player.reputationTown === "number"
        ? raw.player.reputationTown
        : raw.player.reputation,
        state.player.reputation,
        0,
        100
      );
      savedBarRep = clampInteger(
        typeof raw.player.reputationBar === "number"
        ? raw.player.reputationBar
        : 0,
        0,
        0,
        100
      );
      if (reputation && typeof reputation.setTownReputation === "function") {
        reputation.setTownReputation(state, savedTownRep);
      } else {
        state.player.reputation = reputation.clampReputation(savedTownRep);
        state.player.reputationTown = state.player.reputation;
      }
      if (reputation && typeof reputation.setBarReputation === "function") {
        reputation.setBarReputation(state, savedBarRep);
      } else {
        state.player.reputationBar = reputation.clampReputation(savedBarRep);
      }
      state.player.needs = needs.normalizeNeeds(raw.player.needs);
      if (lifestyle && typeof lifestyle.normalizeLifestyle === "function") {
        state.player.lifestyle = lifestyle.normalizeLifestyle(raw.player.lifestyle);
      } else if (
        raw.player.lifestyle === "frugal" ||
        raw.player.lifestyle === "normal" ||
        raw.player.lifestyle === "social"
      ) {
        state.player.lifestyle = raw.player.lifestyle;
      }
    }

    relationshipSource = raw.relationships;
    if (!relationshipSource && raw.player && typeof raw.player === "object") {
      relationshipSource = raw.player.social;
    }
    state.relationships = normalizeRelationshipsState(relationshipSource);
    syncRelationshipAliases(state.relationships);
    state.player.social = state.relationships;

    state.world = normalizeWorldState(
      raw.world,
      fallbackSeason,
      ((state.time.year - 1) * 4 * time.DAYS_PER_SEASON) +
        (state.time.seasonIndex * time.DAYS_PER_SEASON) +
        state.time.day
    );
    currentDayNumberFromTime = getCurrentDayNumberFromTime(state.time);
    ensurePath(state, ["world", "day"], currentDayNumberFromTime);
    if (raw.world && typeof raw.world === "object" && typeof raw.world.day === "number") {
      state.world.day = Math.max(1, Math.floor(raw.world.day));
    } else {
      state.world.day = currentDayNumberFromTime;
    }
    state.world.season = seasonFromIndex(state.time.seasonIndex);
    state.stats = normalizeStatsState(raw.stats);

    state.jobs = jobs.normalizeJobs(raw.jobs);
    ensurePath(state, ["jobs", "pendingJobId"], "");
    ensurePath(state, ["jobs", "pendingJobStartDay"], 0);
    ensurePath(state, ["jobs", "lastJobChangeDay"], 0);
    ensurePath(state, ["jobs", "currentJobId"], "");
    if (typeof state.jobs.pendingJobId !== "string") {
      state.jobs.pendingJobId = "";
    }
    if (typeof state.jobs.pendingJobStartDay !== "number" || Number.isNaN(state.jobs.pendingJobStartDay)) {
      state.jobs.pendingJobStartDay = 0;
    } else {
      state.jobs.pendingJobStartDay = Math.max(0, Math.floor(state.jobs.pendingJobStartDay));
    }
    if (typeof state.jobs.lastJobChangeDay !== "number" || Number.isNaN(state.jobs.lastJobChangeDay)) {
      state.jobs.lastJobChangeDay = 0;
    } else {
      state.jobs.lastJobChangeDay = Math.max(0, Math.floor(state.jobs.lastJobChangeDay));
    }
    if (
      raw.jobs &&
      typeof raw.jobs === "object" &&
      typeof raw.jobs.pendingJobId === "string" &&
      jobs.JOBS[raw.jobs.pendingJobId] &&
      jobs.isJobUnlocked(state, raw.jobs.pendingJobId) &&
      raw.jobs.pendingJobId !== state.jobs.activeJobId
    ) {
      state.jobs.pendingJobId = raw.jobs.pendingJobId;
      if (
        typeof raw.jobs.pendingJobStartDay === "number" &&
        !Number.isNaN(raw.jobs.pendingJobStartDay)
      ) {
        state.jobs.pendingJobStartDay = Math.max(0, Math.floor(raw.jobs.pendingJobStartDay));
      } else {
        state.jobs.pendingJobStartDay = 0;
      }
    } else if (!state.jobs.pendingJobId) {
      state.jobs.pendingJobStartDay = 0;
    }
    if (typeof state.jobs.activeJobId === "string") {
      state.jobs.currentJobId = state.jobs.activeJobId;
    } else if (typeof state.jobs.currentJobId !== "string") {
      state.jobs.currentJobId = "";
    }
    state.housing = housing.normalizeHousing(raw.housing);
    state.flags = normalizeFlagsState(raw.flags);

    ensurePath(state, ["player", "money"], 0);
    ensurePath(state, ["player", "energy"], 100);
    ensurePath(state, ["player", "mood"], 100);
    ensurePath(state, ["world", "season"], "spring");
    ensurePath(state, ["world", "day"], currentDayNumberFromTime);
    state.world.day = currentDayNumberFromTime;

    if (Array.isArray(raw.log)) {
      state.log = raw.log
        .map(function (entry) {
          return String(entry);
        })
        .slice(-MAX_LOG_ENTRIES);
    }

    ensureRelationshipsContainer(state);

    return state;
  }

  function addLogEntry(state, message) {
    state.log.push(message);
    if (state.log.length > MAX_LOG_ENTRIES) {
      state.log = state.log.slice(-MAX_LOG_ENTRIES);
    }
  }

  ns.state = {
    createInitialSocialState: createInitialSocialState,
    normalizeSocialState: normalizeSocialState,
    createInitialRelationshipsState: createInitialRelationshipsState,
    normalizeRelationshipsState: normalizeRelationshipsState,
    setRelationshipValue: setRelationshipValue,
    createInitialWorldState: createInitialWorldState,
    normalizeWorldState: normalizeWorldState,
    createInitialEventsState: createInitialEventsState,
    normalizeEventsState: normalizeEventsState,
    createInitialStatsState: createInitialStatsState,
    normalizeStatsState: normalizeStatsState,
    createInitialFlagsState: createInitialFlagsState,
    normalizeFlagsState: normalizeFlagsState,
    getLocalRelationship: getLocalRelationship,
    getStaffRelationship: getStaffRelationship,
    getSummerPeopleRelationship: getSummerPeopleRelationship,
    getTouristRelationship: getTouristRelationship,
    addSocialRelationship: addSocialRelationship,
    ensurePath: ensurePath,
    createInitialState: createInitialState,
    createStateFromSave: createStateFromSave,
    addLogEntry: addLogEntry
  };
})(window);
