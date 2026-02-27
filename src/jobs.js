(function (global) {
  var ns = global.BlockIsland = global.BlockIsland || {};
  var MIN_JOB_LEVEL = 1;
  var MAX_JOB_LEVEL = 5;
  var PROMOTION_THRESHOLD = 100;
  var LEVEL_PAY_BONUS = 0.15;
  var MAX_JOB_PERCENT_BONUS = 0.25;
  var SHIFT_WEIGHT_COMMON = 10;
  var SHIFT_WEIGHT_UNCOMMON = 5;
  var SHIFT_WEIGHT_RARE = 2;
  var SHIFT_PAY_MULT_MIN = 0.7;
  var SHIFT_PAY_MULT_MAX = 1.5;
  var SHIFT_TIP_CHANCE_BONUS_MIN = 0;
  var SHIFT_TIP_CHANCE_BONUS_MAX = 0.3;
  var SHIFT_TIP_AMOUNT_MULT_MIN = 0.8;
  var SHIFT_TIP_AMOUNT_MULT_MAX = 1.8;
  var SHIFT_ENERGY_MULT_MIN = 0.8;
  var SHIFT_ENERGY_MULT_MAX = 1.5;

  function random() {
    if (ns.rng && typeof ns.rng.next === "function") {
      return ns.rng.next();
    }

    return 0.5;
  }

  var DEFAULT_JOBS = {
    diamond_blue_surf_shop: {
      id: "diamond_blue_surf_shop",
      name: "DiamondBlue Surf Shop",
      basePay: 58,
      payPerLevel: 10,
      promotionGain: 12,
      tags: ["retail", "tourism", "entry"]
    },
    the_oar_busser: {
      id: "the_oar_busser",
      name: "The Oar Busser",
      basePay: 64,
      payPerLevel: 11,
      promotionGain: 11,
      tags: ["hospitality", "service", "entry"]
    },
    halls_mowing_crew: {
      id: "halls_mowing_crew",
      name: "Hall's Mowing Crew",
      basePay: 72,
      payPerLevel: 12,
      promotionGain: 13,
      tags: ["outdoors", "labor", "entry"]
    },
    island_landscaping_crew: {
      id: "island_landscaping_crew",
      name: "Island Landscaping Crew",
      basePay: 130,
      payPerLevel: 16,
      promotionGain: 10,
      unlockRequires: {
        jobId: "halls_mowing_crew",
        level: 5
      },
      tags: ["outdoors", "labor", "advanced"]
    },
    captain_nicks_bartender: {
      id: "captain_nicks_bartender",
      name: "Captain Nick's Bartending",
      basePay: 90,
      payPerLevel: 13,
      promotionGain: 11,
      unlockRequires: {
        reputationTown: 12
      },
      tags: ["service", "bar", "tips"]
    },
    ferry_worker: {
      id: "ferry_worker",
      name: "Ferry Worker",
      basePay: 120,
      payPerLevel: 15,
      promotionGain: 10,
      unlockRequires: {
        reputationTown: 18,
        locals: 15
      },
      tags: ["municipal", "steady"]
    },
    charter_fishing_crew: {
      id: "charter_fishing_crew",
      name: "Charter Fishing Crew",
      basePay: 110,
      payPerLevel: 14,
      promotionGain: 10,
      unlockRequires: {
        reputationTown: 20,
        summerPeople: 20
      },
      tags: ["outdoors", "tips", "tourism"]
    }
  };

  function normalizeUnlockRequirement(rawRequirement) {
    var requirement = {};

    if (!rawRequirement || typeof rawRequirement !== "object") {
      return null;
    }

    if (typeof rawRequirement.jobId === "string" && rawRequirement.jobId) {
      requirement.jobId = rawRequirement.jobId;
      requirement.level = Math.max(MIN_JOB_LEVEL, Math.floor(rawRequirement.level || MIN_JOB_LEVEL));
    }

    if (typeof rawRequirement.reputationTown === "number") {
      requirement.reputationTown = Math.max(0, Math.floor(rawRequirement.reputationTown));
    } else if (typeof rawRequirement.reputation === "number") {
      requirement.reputationTown = Math.max(0, Math.floor(rawRequirement.reputation));
    }

    if (typeof rawRequirement.reputationBar === "number") {
      requirement.reputationBar = Math.max(0, Math.floor(rawRequirement.reputationBar));
    }

    if (typeof rawRequirement.locals === "number") {
      requirement.locals = Math.max(0, Math.floor(rawRequirement.locals));
    }
    if (typeof rawRequirement.staff === "number") {
      requirement.staff = Math.max(0, Math.floor(rawRequirement.staff));
    }
    if (typeof rawRequirement.summerPeople === "number") {
      requirement.summerPeople = Math.max(0, Math.floor(rawRequirement.summerPeople));
    } else if (typeof rawRequirement.tourists === "number") {
      requirement.summerPeople = Math.max(0, Math.floor(rawRequirement.tourists));
    }

    if (Object.keys(requirement).length <= 0) {
      return null;
    }

    return requirement;
  }

  function getTownReputationValue(state) {
    var repApi = ns.reputation;

    if (repApi && typeof repApi.getTownReputation === "function") {
      return repApi.getTownReputation(state);
    }

    if (state && state.player && typeof state.player.reputationTown === "number") {
      return Math.max(0, Math.floor(state.player.reputationTown));
    }

    if (state && state.player && typeof state.player.reputation === "number") {
      return Math.max(0, Math.floor(state.player.reputation));
    }

    return 0;
  }

  function getBarReputationValue(state) {
    var repApi = ns.reputation;

    if (repApi && typeof repApi.getBarReputation === "function") {
      return repApi.getBarReputation(state);
    }

    if (state && state.player && typeof state.player.reputationBar === "number") {
      return Math.max(0, Math.floor(state.player.reputationBar));
    }

    return 0;
  }

  function getRelationshipValue(state, relationshipId) {
    var relationships = state && state.relationships ? state.relationships : null;
    var key = relationshipId === "tourists" ? "summerPeople" : relationshipId;
    var value;

    if (!relationships && state && state.player && state.player.social) {
      relationships = state.player.social;
    }
    if (!relationships) return 0;

    value = relationships[key];
    if (
      typeof value !== "number" &&
      key === "summerPeople" &&
      typeof relationships.tourists === "number"
    ) {
      value = relationships.tourists;
    }
    if (typeof value !== "number" || Number.isNaN(value)) return 0;

    return Math.max(0, Math.floor(value));
  }

  function normalizeJobTags(rawTags) {
    if (!Array.isArray(rawTags)) {
      return [];
    }

    return rawTags
      .map(function (tag) {
        return String(tag).trim();
      })
      .filter(function (tag) {
        return tag.length > 0;
      });
  }

  function clampPercentBonus(value, fallback) {
    var source = typeof value === "number" ? value : fallback;

    if (typeof source !== "number" || Number.isNaN(source)) {
      source = 0;
    }

    return Math.max(0, Math.min(MAX_JOB_PERCENT_BONUS, source));
  }

  function normalizeJobPerks(rawPerks) {
    var perks = rawPerks && typeof rawPerks === "object" ? rawPerks : {};

    return {
      tipBonus: clampPercentBonus(perks.tipBonus, 0),
      promotionSpeedBonus: clampPercentBonus(perks.promotionSpeedBonus, 0),
      repGainBonus: clampPercentBonus(perks.repGainBonus, 0),
      workPayMult: clampPercentBonus(perks.workPayMult, 0)
    };
  }

  function normalizeCareerLadder(rawCareerLadder) {
    var ladder = rawCareerLadder && typeof rawCareerLadder === "object" ? rawCareerLadder : null;
    var levelTitles;
    var levelLogNames;

    if (!ladder || !Array.isArray(ladder.levelTitles) || ladder.levelTitles.length !== MAX_JOB_LEVEL) {
      return undefined;
    }

    levelTitles = ladder.levelTitles.map(function (title, index) {
      var normalizedTitle = String(title || "").trim();

      if (!normalizedTitle) {
        return "Level " + (index + 1);
      }

      return normalizedTitle;
    });

    if (Array.isArray(ladder.levelLogNames) && ladder.levelLogNames.length === MAX_JOB_LEVEL) {
      levelLogNames = ladder.levelLogNames.map(function (title, index) {
        var normalizedTitle = String(title || "").trim();
        return normalizedTitle || levelTitles[index];
      });
    }

    return {
      levelTitles: levelTitles,
      levelLogNames: levelLogNames
    };
  }

  function clampJobLevel(level) {
    return Math.max(MIN_JOB_LEVEL, Math.min(MAX_JOB_LEVEL, Math.floor(level || MIN_JOB_LEVEL)));
  }

  function deriveRoleTitleFromDefinition(definition, level, useLogName) {
    var normalizedLevel = clampJobLevel(level);
    var fallbackTitle = "Level " + normalizedLevel;
    var ladder;
    var title;

    if (!definition || !definition.careerLadder || !Array.isArray(definition.careerLadder.levelTitles)) {
      return fallbackTitle;
    }

    ladder = definition.careerLadder;
    if (useLogName && Array.isArray(ladder.levelLogNames)) {
      title = ladder.levelLogNames[normalizedLevel - 1];
      if (typeof title === "string" && title.trim()) {
        return title.trim();
      }
    }

    title = ladder.levelTitles[normalizedLevel - 1];
    if (typeof title === "string" && title.trim()) {
      return title.trim();
    }

    return fallbackTitle;
  }

  function normalizeJobDefinition(jobId, rawDefinition) {
    var definition = rawDefinition && typeof rawDefinition === "object" ? rawDefinition : {};
    var unlockRequirement = normalizeUnlockRequirement(definition.unlockRequires);

    return {
      id: definition.id || jobId,
      name: definition.name || "Unknown Job",
      basePay: Math.max(0, Math.floor(definition.basePay || 0)),
      payPerLevel: Math.max(0, Math.floor(definition.payPerLevel || 10)),
      promotionGain: Math.max(1, Math.floor(definition.promotionGain || 10)),
      unlockRequires: unlockRequirement || undefined,
      tags: normalizeJobTags(definition.tags),
      careerLadder: normalizeCareerLadder(definition.careerLadder),
      perks: normalizeJobPerks(definition.perks)
    };
  }

  function buildJobsMap(rawJobs) {
    var source = rawJobs && typeof rawJobs === "object" && Object.keys(rawJobs).length > 0
      ? rawJobs
      : DEFAULT_JOBS;
    var normalized = {};

    Object.keys(source).forEach(function (jobId) {
      normalized[jobId] = normalizeJobDefinition(jobId, source[jobId]);
    });

    return normalized;
  }

  function getContentJobs() {
    if (ns.content && typeof ns.content === "object") {
      return ns.content.jobs;
    }

    return null;
  }

  var JOBS = buildJobsMap(getContentJobs());

  if (!ns.content || typeof ns.content !== "object") {
    ns.content = {};
  }
  ns.content.jobs = JOBS;

  function getAllJobIds() {
    return Object.keys(JOBS);
  }

  function createDefaultUnlockedJobs() {
    var unlocked = {};

    getAllJobIds().forEach(function (jobId) {
      unlocked[jobId] = !JOBS[jobId].unlockRequires;
    });

    return unlocked;
  }

  function ensureUnlockedJobsState(state) {
    var unlocked;

    if (!state || !state.jobs) {
      return createDefaultUnlockedJobs();
    }

    if (!state.jobs.unlocked || typeof state.jobs.unlocked !== "object") {
      state.jobs.unlocked = createDefaultUnlockedJobs();
      return state.jobs.unlocked;
    }

    unlocked = state.jobs.unlocked;

    getAllJobIds().forEach(function (jobId) {
      if (typeof unlocked[jobId] !== "boolean") {
        unlocked[jobId] = !JOBS[jobId].unlockRequires;
      }
    });

    return unlocked;
  }

  function meetsUnlockRequirement(state, jobId) {
    var definition = JOBS[jobId];
    var requirement;
    var requiredJobState;
    var requiredLevel;

    if (!definition) return false;

    requirement = definition.unlockRequires;
    if (!requirement) return true;

    if (requirement.jobId) {
      requiredJobState = state &&
        state.jobs &&
        state.jobs.list ?
        state.jobs.list[requirement.jobId] :
        null;
      requiredLevel = Math.max(MIN_JOB_LEVEL, Math.floor(requirement.level || MIN_JOB_LEVEL));
      if (!(requiredJobState && requiredJobState.level >= requiredLevel)) {
        return false;
      }
    }

    if (typeof requirement.reputationTown === "number") {
      if (getTownReputationValue(state) < requirement.reputationTown) {
        return false;
      }
    }

    if (typeof requirement.reputationBar === "number") {
      if (getBarReputationValue(state) < requirement.reputationBar) {
        return false;
      }
    }

    if (typeof requirement.locals === "number") {
      if (getRelationshipValue(state, "locals") < requirement.locals) {
        return false;
      }
    }

    if (typeof requirement.staff === "number") {
      if (getRelationshipValue(state, "staff") < requirement.staff) {
        return false;
      }
    }

    if (typeof requirement.summerPeople === "number") {
      if (getRelationshipValue(state, "summerPeople") < requirement.summerPeople) {
        return false;
      }
    }

    return true;
  }

  function isJobUnlocked(state, jobId) {
    var unlocked;

    if (!JOBS[jobId]) return false;

    unlocked = ensureUnlockedJobsState(state);
    if (unlocked[jobId]) return true;

    if (meetsUnlockRequirement(state, jobId)) {
      unlocked[jobId] = true;
      return true;
    }

    return false;
  }

  function getAvailableJobIds(state) {
    ensureUnlockedJobsState(state);

    return getAllJobIds().filter(function (jobId) {
      return isJobUnlocked(state, jobId);
    });
  }

  function syncUnlockedJobs(state) {
    var unlocked = ensureUnlockedJobsState(state);
    var newlyUnlocked = [];

    getAllJobIds().forEach(function (jobId) {
      if (unlocked[jobId]) return;
      if (!meetsUnlockRequirement(state, jobId)) return;

      unlocked[jobId] = true;
      newlyUnlocked.push(jobId);
    });

    return newlyUnlocked;
  }

  function getJobDefinition(jobId) {
    return JOBS[jobId] || null;
  }

  function getJobName(jobId) {
    return JOBS[jobId] ? JOBS[jobId].name : "Unknown Job";
  }

  function getJobIdByName(jobName) {
    var normalizedName = String(jobName || "").trim();
    var allJobIds = getAllJobIds();
    var i;

    if (!normalizedName) return "";

    for (i = 0; i < allJobIds.length; i += 1) {
      if (JOBS[allJobIds[i]].name === normalizedName) {
        return allJobIds[i];
      }
    }

    return "";
  }

  function getJobRoleTitle(jobId, level) {
    return deriveRoleTitleFromDefinition(JOBS[jobId], level, false);
  }

  function getJobRoleLogTitle(jobId, level) {
    return deriveRoleTitleFromDefinition(JOBS[jobId], level, true);
  }

  function getEntryRoleTitle(jobId) {
    return getJobRoleTitle(jobId, MIN_JOB_LEVEL);
  }

  function getJobTags(jobId) {
    if (!JOBS[jobId] || !Array.isArray(JOBS[jobId].tags)) {
      return [];
    }

    return JOBS[jobId].tags.slice();
  }

  function getJobPerks(jobId) {
    if (!JOBS[jobId] || !JOBS[jobId].perks) {
      return normalizeJobPerks(null);
    }

    return normalizeJobPerks(JOBS[jobId].perks);
  }

  function getActiveJobPerks(state) {
    var activeJobId = state && state.jobs ? state.jobs.activeJobId : "";
    return getJobPerks(activeJobId);
  }

  function getPayForLevel(jobId, level) {
    var definition = JOBS[jobId];
    var normalizedLevel;
    var multiplier;

    if (!definition) return 0;

    normalizedLevel = Math.max(MIN_JOB_LEVEL, Math.min(MAX_JOB_LEVEL, Math.floor(level)));
    multiplier = 1 + (normalizedLevel - 1) * LEVEL_PAY_BONUS;

    return Math.round(definition.basePay * multiplier);
  }

  function createInitialJobsState() {
    var list = {};

    getAllJobIds().forEach(function (jobId) {
      list[jobId] = {
        level: 1,
        promotionProgress: 0,
        shiftsWorked: 0
      };
    });

    return {
      activeJobId: "",
      currentJobId: "",
      pendingJobId: "",
      pendingJobStartDay: 0,
      lastJobChangeDay: 0,
      workedToday: false,
      unlocked: createDefaultUnlockedJobs(),
      list: list
    };
  }

  function setActiveJob(state, jobId) {
    if (!state || !state.jobs || typeof state.jobs !== "object") {
      return "";
    }

    if (JOBS[jobId] && isJobUnlocked(state, jobId)) {
      state.jobs.activeJobId = jobId;
    } else if (jobId === null) {
      state.jobs.activeJobId = null;
    } else if (jobId === "") {
      state.jobs.activeJobId = "";
    }

    if (typeof state.jobs.activeJobId === "string") {
      state.jobs.currentJobId = state.jobs.activeJobId;
    } else if (state.jobs.activeJobId === null) {
      state.jobs.currentJobId = "";
    }

    return state.jobs.activeJobId;
  }

  function canWorkToday(state) {
    return Boolean(state && state.jobs && !state.jobs.workedToday);
  }

  function resetDailyWorkFlag(state) {
    if (!state || !state.jobs) return;
    state.jobs.workedToday = false;
  }

  function getPromotionStatusForJob(state, jobId) {
    var resolvedJobId = jobId || (state && state.jobs ? state.jobs.activeJobId : "");
    var jobState = state && state.jobs && state.jobs.list ? state.jobs.list[resolvedJobId] : null;

    if (!jobState) {
      return {
        progress: 0,
        threshold: PROMOTION_THRESHOLD,
        isMaxLevel: false,
        level: MIN_JOB_LEVEL,
        roleTitle: getJobRoleTitle(resolvedJobId, MIN_JOB_LEVEL)
      };
    }

    return {
      progress: jobState.level >= MAX_JOB_LEVEL ? PROMOTION_THRESHOLD : jobState.promotionProgress,
      threshold: PROMOTION_THRESHOLD,
      isMaxLevel: jobState.level >= MAX_JOB_LEVEL,
      level: jobState.level,
      roleTitle: getJobRoleTitle(resolvedJobId, jobState.level)
    };
  }

  function getCurrentDayNumber(state) {
    var eventsApi = ns.events;
    var timeApi = ns.time;
    var seasonsPerYear;
    var daysPerSeason;
    var year;
    var seasonIndex;
    var day;

    if (eventsApi && typeof eventsApi.getCurrentDayNumber === "function") {
      return eventsApi.getCurrentDayNumber(state);
    }

    seasonsPerYear = timeApi && Array.isArray(timeApi.SEASON_IDS) ? timeApi.SEASON_IDS.length : 4;
    daysPerSeason = timeApi && typeof timeApi.DAYS_PER_SEASON === "number" ? timeApi.DAYS_PER_SEASON : 21;
    year = state && state.time && typeof state.time.year === "number" ? state.time.year : 1;
    seasonIndex = state && state.time && typeof state.time.seasonIndex === "number" ? state.time.seasonIndex : 0;
    day = state && state.time && typeof state.time.day === "number" ? state.time.day : 1;

    return ((year - 1) * seasonsPerYear * daysPerSeason) + (seasonIndex * daysPerSeason) + day;
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

  function removeModifierById(state, modifierId) {
    var eventsState = ensureEventsStateShape(state);

    if (!eventsState) return;

    eventsState.modifiers = eventsState.modifiers.filter(function (modifier) {
      return !(modifier && modifier.id === modifierId);
    });
  }

  function upsertOneUseModifier(state, modifierId, type, value, consumeOnAction) {
    var eventsState = ensureEventsStateShape(state);
    var currentDayNumber;

    if (!eventsState) return;

    currentDayNumber = getCurrentDayNumber(state);

    removeModifierById(state, modifierId);
    eventsState.modifiers.push({
      id: modifierId,
      type: type,
      value: value,
      expiresOnDayNumber: currentDayNumber,
      remainingUses: 1,
      consumeOn: consumeOnAction
    });
  }

  function applyJobWorkPerkModifiers(state, jobId, perks) {
    if (perks.tipBonus > 0) {
      upsertOneUseModifier(
        state,
        "job_perk_tip_bonus",
        "tipAmountMult",
        1 + perks.tipBonus,
        "work"
      );
    } else {
      removeModifierById(state, "job_perk_tip_bonus");
    }
  }

  function applyJobRepPerkBonus(state, jobId, perks) {
    var repApi = ns.reputation;
    var tags = getJobTags(jobId);
    var repBonusRaw;
    var repBonusWhole;
    var repBonus;

    if (!repApi || perks.repGainBonus <= 0) {
      return 0;
    }

    repBonusRaw = 2 * perks.repGainBonus;
    repBonusWhole = Math.floor(repBonusRaw);
    repBonus = repBonusWhole;

    if (random() < (repBonusRaw - repBonusWhole)) {
      repBonus += 1;
    }
    if (repBonus <= 0) {
      return 0;
    }

    if (tags.indexOf("bar") >= 0 && typeof repApi.addBarReputation === "function") {
      return repApi.addBarReputation(state, repBonus).delta;
    }
    if (typeof repApi.addTownReputation === "function") {
      return repApi.addTownReputation(state, repBonus).delta;
    }
    if (typeof repApi.addReputation === "function") {
      return repApi.addReputation(state, repBonus).delta;
    }

    return 0;
  }

  function normalizeShiftWeight(weight) {
    if (weight === SHIFT_WEIGHT_RARE || weight === SHIFT_WEIGHT_UNCOMMON || weight === SHIFT_WEIGHT_COMMON) {
      return weight;
    }

    if (typeof weight !== "number" || Number.isNaN(weight)) {
      return SHIFT_WEIGHT_COMMON;
    }

    if (weight <= 3) return SHIFT_WEIGHT_RARE;
    if (weight <= 7) return SHIFT_WEIGHT_UNCOMMON;
    return SHIFT_WEIGHT_COMMON;
  }

  function clampShiftMultiplier(value, min, max, fallback) {
    var source = typeof value === "number" && !Number.isNaN(value) ? value : fallback;
    return Math.max(min, Math.min(max, source));
  }

  function clampShiftTipChanceBonus(value) {
    return clampShiftMultiplier(
      value,
      SHIFT_TIP_CHANCE_BONUS_MIN,
      SHIFT_TIP_CHANCE_BONUS_MAX,
      0
    );
  }

  function getSeasonId(state) {
    var timeApi = ns.time;

    if (timeApi && typeof timeApi.getSeasonIdFromState === "function") {
      return String(timeApi.getSeasonIdFromState(state) || "spring").toLowerCase();
    }

    if (state && state.world && typeof state.world.season === "string") {
      return String(state.world.season).toLowerCase();
    }

    return "spring";
  }

  function isWeekend(state) {
    var weekdayIndex = state && state.time && typeof state.time.weekdayIndex === "number"
      ? state.time.weekdayIndex
      : 0;

    return weekdayIndex >= 4;
  }

  function isSummerHolidayWindow(state) {
    var seasonId = getSeasonId(state);
    var day = state && state.time && typeof state.time.day === "number" ? state.time.day : 1;

    if (seasonId !== "summer") return false;

    return day <= 4 || day >= 18;
  }

  function isRaceWeek(state) {
    var seasonId = getSeasonId(state);
    var day = state && state.time && typeof state.time.day === "number" ? state.time.day : 1;

    if (seasonId !== "summer") return false;
    return day >= 8 && day <= 14;
  }

  function normalizeShiftLogTemplates(rawTemplates) {
    var templates = Array.isArray(rawTemplates) ? rawTemplates : [];
    var normalizedTemplates = templates
      .map(function (template) {
        return String(template || "").trim();
      })
      .filter(function (template) {
        return template.length > 0;
      });

    if (normalizedTemplates.length <= 0) {
      return [
        "You worked a steady shift at {job}."
      ];
    }

    return normalizedTemplates;
  }

  function normalizeShiftDefinition(rawShift) {
    var shift = rawShift && typeof rawShift === "object" ? rawShift : {};

    return {
      id: String(shift.id || "unknown_shift"),
      name: String(shift.name || "Shift"),
      weight: normalizeShiftWeight(shift.weight),
      when: typeof shift.when === "function" ? shift.when : function () {
        return true;
      },
      payMultiplier: clampShiftMultiplier(
        shift.payMultiplier,
        SHIFT_PAY_MULT_MIN,
        SHIFT_PAY_MULT_MAX,
        1
      ),
      tipChanceBonus: clampShiftTipChanceBonus(shift.tipChanceBonus),
      tipAmountMultiplier: clampShiftMultiplier(
        shift.tipAmountMultiplier,
        SHIFT_TIP_AMOUNT_MULT_MIN,
        SHIFT_TIP_AMOUNT_MULT_MAX,
        1
      ),
      energyCostMultiplier: clampShiftMultiplier(
        shift.energyCostMultiplier,
        SHIFT_ENERGY_MULT_MIN,
        SHIFT_ENERGY_MULT_MAX,
        1
      ),
      logTemplates: normalizeShiftLogTemplates(shift.logTemplates)
    };
  }

  function createShiftTypeDefinitions() {
    var definitions = [
      {
        id: "quiet_morning_shift",
        name: "Quiet Morning Shift",
        weight: SHIFT_WEIGHT_COMMON,
        when: function (state) {
          return !isWeekend(state) && getSeasonId(state) !== "winter";
        },
        payMultiplier: 0.9,
        tipChanceBonus: 0.02,
        tipAmountMultiplier: 0.9,
        energyCostMultiplier: 0.8,
        logTemplates: [
          "You worked a quiet morning shift at {job}.",
          "You opened with a calm morning shift at {job}."
        ]
      },
      {
        id: "lunch_rush_shift",
        name: "Lunch Rush Shift",
        weight: SHIFT_WEIGHT_COMMON,
        when: function () {
          return true;
        },
        payMultiplier: 1.02,
        tipChanceBonus: 0.04,
        tipAmountMultiplier: 1.06,
        energyCostMultiplier: 1.0,
        logTemplates: [
          "You worked a lunch rush shift at {job}.",
          "You handled a crowded midday shift at {job}."
        ]
      },
      {
        id: "dinner_shift",
        name: "Dinner Shift",
        weight: SHIFT_WEIGHT_COMMON,
        when: function () {
          return true;
        },
        payMultiplier: 1.12,
        tipChanceBonus: 0.08,
        tipAmountMultiplier: 1.14,
        energyCostMultiplier: 1.1,
        logTemplates: [
          "You worked a packed dinner shift at {job}.",
          "You pushed through a busy evening shift at {job}."
        ]
      },
      {
        id: "weekend_surge_shift",
        name: "Weekend Surge Shift",
        weight: SHIFT_WEIGHT_COMMON,
        when: function (state) {
          return isWeekend(state);
        },
        payMultiplier: 1.22,
        tipChanceBonus: 0.12,
        tipAmountMultiplier: 1.24,
        energyCostMultiplier: 1.22,
        logTemplates: [
          "You worked a weekend surge shift at {job}.",
          "Saturday crowds packed your shift at {job}."
        ]
      },
      {
        id: "double_shift",
        name: "Double Shift",
        weight: SHIFT_WEIGHT_RARE,
        when: function (state) {
          return isWeekend(state) || getSeasonId(state) === "summer";
        },
        payMultiplier: 1.45,
        tipChanceBonus: 0.2,
        tipAmountMultiplier: 1.35,
        energyCostMultiplier: 1.45,
        logTemplates: [
          "You pulled a full double shift at {job}.",
          "You covered a double shift at {job} and felt every hour."
        ]
      },
      {
        id: "slow_shift",
        name: "Slow Shift",
        weight: SHIFT_WEIGHT_COMMON,
        when: function (state) {
          return getSeasonId(state) !== "summer";
        },
        payMultiplier: 0.82,
        tipChanceBonus: 0,
        tipAmountMultiplier: 0.86,
        energyCostMultiplier: 0.85,
        logTemplates: [
          "You worked a slow shift at {job}.",
          "Traffic stayed light all shift at {job}."
        ]
      },
      {
        id: "disrupted_shift",
        name: "Disrupted Shift",
        weight: SHIFT_WEIGHT_UNCOMMON,
        when: function () {
          return true;
        },
        payMultiplier: 0.88,
        tipChanceBonus: 0,
        tipAmountMultiplier: 0.9,
        energyCostMultiplier: 1.2,
        logTemplates: [
          "You worked a disrupted shift at {job} after ferry delays.",
          "A rough day disrupted your shift flow at {job}."
        ]
      },
      {
        id: "ferry_surge_shift",
        name: "Ferry Surge Shift",
        weight: SHIFT_WEIGHT_UNCOMMON,
        when: function (state, context) {
          var seasonId = getSeasonId(state);
          var tags = context && Array.isArray(context.jobTags) ? context.jobTags : [];

          if (seasonId !== "summer") return false;
          return isWeekend(state) || tags.indexOf("tourism") >= 0 || tags.indexOf("municipal") >= 0;
        },
        payMultiplier: 1.26,
        tipChanceBonus: 0.14,
        tipAmountMultiplier: 1.28,
        energyCostMultiplier: 1.24,
        logTemplates: [
          "You worked a ferry surge shift at {job} as day-trippers poured in.",
          "Ferry arrivals flooded town during your shift at {job}."
        ]
      },
      {
        id: "tuna_tournament_shift",
        name: "Tuna Tournament Shift",
        weight: SHIFT_WEIGHT_RARE,
        when: function (state, context) {
          var seasonId = getSeasonId(state);
          var tags = context && Array.isArray(context.jobTags) ? context.jobTags : [];

          if (seasonId !== "summer") return false;
          return tags.indexOf("tips") >= 0 || tags.indexOf("tourism") >= 0 || tags.indexOf("outdoors") >= 0;
        },
        payMultiplier: 1.35,
        tipChanceBonus: 0.2,
        tipAmountMultiplier: 1.5,
        energyCostMultiplier: 1.3,
        logTemplates: [
          "You worked a tuna tournament shift at {job} with the docks buzzing.",
          "Tournament traffic turned your shift at {job} into a sprint."
        ]
      },
      {
        id: "race_week_shift",
        name: "Race Week Shift",
        weight: SHIFT_WEIGHT_RARE,
        when: function (state) {
          return isRaceWeek(state);
        },
        payMultiplier: 1.5,
        tipChanceBonus: 0.25,
        tipAmountMultiplier: 1.6,
        energyCostMultiplier: 1.35,
        logTemplates: [
          "You worked a race week surge shift at {job} with the harbor packed.",
          "Race week crowds made your shift at {job} one of the biggest yet."
        ]
      },
      {
        id: "holiday_weekend_shift",
        name: "Holiday Weekend Shift",
        weight: SHIFT_WEIGHT_UNCOMMON,
        when: function (state) {
          return isSummerHolidayWindow(state) && isWeekend(state);
        },
        payMultiplier: 1.38,
        tipChanceBonus: 0.22,
        tipAmountMultiplier: 1.48,
        energyCostMultiplier: 1.3,
        logTemplates: [
          "You worked a holiday weekend shift at {job} with nonstop crowds.",
          "The holiday rush at {job} barely slowed all shift."
        ]
      },
      {
        id: "shoulder_season_shift",
        name: "Shoulder Season Shift",
        weight: SHIFT_WEIGHT_COMMON,
        when: function (state) {
          var seasonId = getSeasonId(state);
          return seasonId === "spring" || seasonId === "fall";
        },
        payMultiplier: 0.98,
        tipChanceBonus: 0.04,
        tipAmountMultiplier: 1.0,
        energyCostMultiplier: 0.9,
        logTemplates: [
          "You worked a shoulder-season shift at {job} and town felt steadier.",
          "Shoulder-season traffic gave your shift at {job} a calmer rhythm."
        ]
      },
      {
        id: "winter_isolation_shift",
        name: "Winter Isolation Shift",
        weight: SHIFT_WEIGHT_COMMON,
        when: function (state) {
          return getSeasonId(state) === "winter";
        },
        payMultiplier: 0.78,
        tipChanceBonus: 0,
        tipAmountMultiplier: 0.82,
        energyCostMultiplier: 1.05,
        logTemplates: [
          "You worked a winter isolation shift at {job} in the cold quiet.",
          "Winter silence settled in during your shift at {job}."
        ]
      }
    ];

    return definitions.map(normalizeShiftDefinition);
  }

  var SHIFT_TYPES = createShiftTypeDefinitions();

  function getShiftTypeById(shiftId) {
    var i;

    for (i = 0; i < SHIFT_TYPES.length; i += 1) {
      if (SHIFT_TYPES[i].id === shiftId) {
        return SHIFT_TYPES[i];
      }
    }

    return null;
  }

  function getShiftTypeDefinitions() {
    return SHIFT_TYPES.map(function (shift) {
      return {
        id: shift.id,
        name: shift.name,
        weight: shift.weight,
        payMultiplier: shift.payMultiplier,
        tipChanceBonus: shift.tipChanceBonus,
        tipAmountMultiplier: shift.tipAmountMultiplier,
        energyCostMultiplier: shift.energyCostMultiplier,
        logTemplates: Array.isArray(shift.logTemplates)
          ? shift.logTemplates.slice()
          : []
      };
    });
  }

  function weightedPickShift(definitions) {
    var totalWeight = 0;
    var roll;
    var running = 0;
    var i;

    if (!Array.isArray(definitions) || definitions.length <= 0) {
      return null;
    }

    definitions.forEach(function (definition) {
      totalWeight += Math.max(0, definition.weight || SHIFT_WEIGHT_COMMON);
    });

    if (totalWeight <= 0) {
      return definitions[0];
    }

    roll = random() * totalWeight;

    for (i = 0; i < definitions.length; i += 1) {
      running += Math.max(0, definitions[i].weight || SHIFT_WEIGHT_COMMON);
      if (roll <= running) {
        return definitions[i];
      }
    }

    return definitions[definitions.length - 1];
  }

  function pickShiftTypeForState(state, jobId) {
    var tags = getJobTags(jobId || (state && state.jobs ? state.jobs.activeJobId : ""));
    var context = {
      jobId: jobId,
      jobTags: tags
    };
    var eligible = SHIFT_TYPES.filter(function (shift) {
      try {
        return Boolean(shift.when(state, context));
      } catch (error) {
        return false;
      }
    });

    if (eligible.length <= 0) {
      return getShiftTypeById("lunch_rush_shift") || SHIFT_TYPES[0] || null;
    }

    return weightedPickShift(eligible);
  }

  function applyShiftTipModifiers(state, shiftType) {
    var tipChanceBonus = shiftType ? shiftType.tipChanceBonus : 0;
    var tipAmountMultiplier = shiftType ? shiftType.tipAmountMultiplier : 1;

    if (tipChanceBonus > 0) {
      upsertOneUseModifier(
        state,
        "shift_identity_tip_chance_bonus",
        "tipChanceBonus",
        tipChanceBonus,
        "work"
      );
    } else {
      removeModifierById(state, "shift_identity_tip_chance_bonus");
    }

    if (tipAmountMultiplier !== 1) {
      upsertOneUseModifier(
        state,
        "shift_identity_tip_amount_multiplier",
        "tipAmountMult",
        tipAmountMultiplier,
        "work"
      );
    } else {
      removeModifierById(state, "shift_identity_tip_amount_multiplier");
    }
  }

  function clampNeedValue(value) {
    var needsApi = ns.needs;

    if (needsApi && typeof needsApi.clampNeed === "function") {
      return needsApi.clampNeed(value);
    }

    return Math.max(0, Math.min(100, Math.round(value)));
  }

  function applyShiftEnergyAdjustment(state, shiftType) {
    var needsApi = ns.needs;
    var baseWorkEnergyDelta = needsApi &&
      needsApi.NEED_EFFECTS &&
      needsApi.NEED_EFFECTS.work &&
      typeof needsApi.NEED_EFFECTS.work.energy === "number"
      ? needsApi.NEED_EFFECTS.work.energy
      : -24;
    var energyCostMultiplier = shiftType ? shiftType.energyCostMultiplier : 1;
    var targetWorkEnergyDelta;
    var extraEnergyDelta;
    var beforeEnergy;

    if (!state || !state.player || !state.player.needs || typeof state.player.needs.energy !== "number") {
      return 0;
    }

    if (baseWorkEnergyDelta > 0) {
      baseWorkEnergyDelta = -baseWorkEnergyDelta;
    }

    targetWorkEnergyDelta = Math.round(baseWorkEnergyDelta * energyCostMultiplier);
    extraEnergyDelta = targetWorkEnergyDelta - baseWorkEnergyDelta;
    if (extraEnergyDelta === 0) return 0;

    beforeEnergy = state.player.needs.energy;
    state.player.needs.energy = clampNeedValue(beforeEnergy + extraEnergyDelta);

    return state.player.needs.energy - beforeEnergy;
  }

  function renderShiftLogLine(shiftType, jobName) {
    var templates;
    var template;
    var chosenTemplateIndex;

    if (!shiftType) return "";

    templates = Array.isArray(shiftType.logTemplates) && shiftType.logTemplates.length > 0
      ? shiftType.logTemplates
      : ["You worked a " + shiftType.name.toLowerCase() + " at {job}."];
    chosenTemplateIndex = Math.floor(random() * templates.length);
    template = templates[chosenTemplateIndex] || templates[0];

    return template
      .replace(/\{job\}/g, String(jobName || "your job"))
      .replace(/\{shift\}/g, String(shiftType.name || "shift"));
  }

  function addLogEntry(state, message) {
    if (!message) return;

    if (ns.state && typeof ns.state.addLogEntry === "function") {
      ns.state.addLogEntry(state, message);
      return;
    }

    if (!Array.isArray(state.log)) {
      state.log = [];
    }
    state.log.push(String(message));
  }

  function applyShiftIdentityForWork(state, shiftType, jobName) {
    var logLine;
    var energyDelta;

    if (!shiftType) {
      removeModifierById(state, "shift_identity_tip_chance_bonus");
      removeModifierById(state, "shift_identity_tip_amount_multiplier");

      return {
        energyDelta: 0,
        logLine: ""
      };
    }

    applyShiftTipModifiers(state, shiftType);
    energyDelta = applyShiftEnergyAdjustment(state, shiftType);
    logLine = renderShiftLogLine(shiftType, jobName);
    addLogEntry(state, logLine);

    return {
      energyDelta: energyDelta,
      logLine: logLine
    };
  }

  function performWorkShift(state) {
    if (
      !state ||
      !state.jobs ||
      !state.jobs.list ||
      !state.player ||
      typeof state.player.money !== "number"
    ) {
      return null;
    }

    var jobId = state.jobs.activeJobId;
    var definition = JOBS[jobId];
    var perks = getJobPerks(jobId);
    var jobState = state.jobs.list[jobId];
    var basePay;
    var pay;
    var payBonus = 0;
    var shiftType;
    var shiftPayDelta = 0;
    var shiftResult;
    var promotionProgress;
    var promotionGain;
    var promotions = [];
    var unlockedJobIds;
    var repPerkDelta = 0;

    if (!definition || !jobState) {
      return null;
    }

    basePay = getPayForLevel(jobId, jobState.level);
    pay = basePay;
    if (perks.workPayMult > 0) {
      payBonus = Math.round(pay * perks.workPayMult);
      pay += payBonus;
    }

    shiftType = pickShiftTypeForState(state, jobId);
    if (shiftType && shiftType.payMultiplier !== 1) {
      shiftPayDelta = Math.round(pay * shiftType.payMultiplier) - pay;
      pay += shiftPayDelta;
    }

    state.player.money += pay;
    applyJobWorkPerkModifiers(state, jobId, perks);
    shiftResult = applyShiftIdentityForWork(state, shiftType, definition.name);

    jobState.shiftsWorked += 1;
    state.jobs.workedToday = true;

    promotionGain = definition.promotionGain;
    if (perks.promotionSpeedBonus > 0) {
      promotionGain = Math.max(1, Math.round(promotionGain * (1 + perks.promotionSpeedBonus)));
    }
    promotionProgress = jobState.promotionProgress + promotionGain;
    while (promotionProgress >= PROMOTION_THRESHOLD && jobState.level < MAX_JOB_LEVEL) {
      promotionProgress -= PROMOTION_THRESHOLD;
      jobState.level += 1;
      promotions.push({
        level: jobState.level,
        roleTitle: getJobRoleTitle(jobId, jobState.level),
        roleLogTitle: getJobRoleLogTitle(jobId, jobState.level),
        pay: getPayForLevel(jobId, jobState.level)
      });
    }

    if (jobState.level >= MAX_JOB_LEVEL) {
      jobState.level = MAX_JOB_LEVEL;
      jobState.promotionProgress = PROMOTION_THRESHOLD;
    } else {
      jobState.promotionProgress = Math.max(
        0,
        Math.min(PROMOTION_THRESHOLD, Math.floor(promotionProgress))
      );
    }

    repPerkDelta = applyJobRepPerkBonus(state, jobId, perks);
    unlockedJobIds = syncUnlockedJobs(state);

    return {
      jobId: jobId,
      jobName: definition.name,
      pay: pay,
      basePay: basePay,
      perkPayBonus: payBonus,
      shiftTypeId: shiftType ? shiftType.id : "",
      shiftTypeName: shiftType ? shiftType.name : "",
      shiftPayMultiplier: shiftType ? shiftType.payMultiplier : 1,
      shiftPayDelta: shiftPayDelta,
      shiftTipChanceBonus: shiftType ? shiftType.tipChanceBonus : 0,
      shiftTipAmountMultiplier: shiftType ? shiftType.tipAmountMultiplier : 1,
      shiftEnergyCostMultiplier: shiftType ? shiftType.energyCostMultiplier : 1,
      shiftEnergyDelta: shiftResult ? shiftResult.energyDelta : 0,
      shiftLogLine: shiftResult ? shiftResult.logLine : "",
      repPerkDelta: repPerkDelta,
      level: jobState.level,
      roleTitle: getJobRoleTitle(jobId, jobState.level),
      roleLogTitle: getJobRoleLogTitle(jobId, jobState.level),
      promotions: promotions,
      promotionProgress: jobState.promotionProgress,
      promotionThreshold: PROMOTION_THRESHOLD,
      isMaxLevel: jobState.level >= MAX_JOB_LEVEL,
      nextShiftPay: getPayForLevel(jobId, jobState.level),
      unlockedJobIds: unlockedJobIds
    };
  }

  function normalizeJobs(rawJobs) {
    var base = createInitialJobsState();

    if (!rawJobs || typeof rawJobs !== "object") {
      return base;
    }

    if (typeof rawJobs.workedToday === "boolean") {
      base.workedToday = rawJobs.workedToday;
    }

    if (typeof rawJobs.pendingJobId === "string") {
      base.pendingJobId = rawJobs.pendingJobId;
    }

    if (typeof rawJobs.pendingJobStartDay === "number") {
      base.pendingJobStartDay = Math.max(0, Math.floor(rawJobs.pendingJobStartDay));
    }

    if (typeof rawJobs.lastJobChangeDay === "number") {
      base.lastJobChangeDay = Math.max(0, Math.floor(rawJobs.lastJobChangeDay));
    }

    if (rawJobs.unlocked && typeof rawJobs.unlocked === "object") {
      getAllJobIds().forEach(function (jobId) {
        if (typeof rawJobs.unlocked[jobId] === "boolean") {
          base.unlocked[jobId] = rawJobs.unlocked[jobId];
        }
      });
    }

    getAllJobIds().forEach(function (jobId) {
      var target = base.list[jobId];
      var source = rawJobs.list && rawJobs.list[jobId];

      if (!source) return;

      if (typeof source.level === "number") {
        target.level = Math.max(MIN_JOB_LEVEL, Math.min(MAX_JOB_LEVEL, Math.floor(source.level)));
      }

      if (typeof source.promotionProgress === "number") {
        target.promotionProgress = Math.max(
          0,
          Math.min(PROMOTION_THRESHOLD, Math.floor(source.promotionProgress))
        );
      }

      if (typeof source.shiftsWorked === "number") {
        target.shiftsWorked = Math.max(0, Math.floor(source.shiftsWorked));
      }

      if (target.level >= MAX_JOB_LEVEL) {
        target.promotionProgress = PROMOTION_THRESHOLD;
      }
    });

    syncUnlockedJobs({ jobs: base });

    if (JOBS[rawJobs.activeJobId] && isJobUnlocked({ jobs: base }, rawJobs.activeJobId)) {
      base.activeJobId = rawJobs.activeJobId;
    } else if (rawJobs.activeJobId === null) {
      base.activeJobId = null;
    } else if (rawJobs.activeJobId === "") {
      base.activeJobId = "";
    }

    if (typeof rawJobs.currentJobId === "string" && !base.activeJobId) {
      if (JOBS[rawJobs.currentJobId] && isJobUnlocked({ jobs: base }, rawJobs.currentJobId)) {
        base.activeJobId = rawJobs.currentJobId;
      }
    }

    if (typeof base.activeJobId === "string") {
      base.currentJobId = base.activeJobId;
    } else {
      base.currentJobId = "";
    }

    return base;
  }

  ns.jobs = {
    JOBS: JOBS,
    MIN_JOB_LEVEL: MIN_JOB_LEVEL,
    MAX_JOB_LEVEL: MAX_JOB_LEVEL,
    PROMOTION_THRESHOLD: PROMOTION_THRESHOLD,
    LEVEL_PAY_BONUS: LEVEL_PAY_BONUS,
    getAllJobIds: getAllJobIds,
    getAvailableJobIds: getAvailableJobIds,
    getJobDefinition: getJobDefinition,
    getJobName: getJobName,
    getJobIdByName: getJobIdByName,
    getJobRoleTitle: getJobRoleTitle,
    getJobRoleLogTitle: getJobRoleLogTitle,
    getEntryRoleTitle: getEntryRoleTitle,
    getJobTags: getJobTags,
    getJobPerks: getJobPerks,
    getActiveJobPerks: getActiveJobPerks,
    getPayForLevel: getPayForLevel,
    getShiftTypeDefinitions: getShiftTypeDefinitions,
    pickShiftTypeForState: pickShiftTypeForState,
    isJobUnlocked: isJobUnlocked,
    syncUnlockedJobs: syncUnlockedJobs,
    createInitialJobsState: createInitialJobsState,
    setActiveJob: setActiveJob,
    canWorkToday: canWorkToday,
    resetDailyWorkFlag: resetDailyWorkFlag,
    getPromotionStatusForJob: getPromotionStatusForJob,
    performWorkShift: performWorkShift,
    normalizeJobs: normalizeJobs
  };
})(window);
