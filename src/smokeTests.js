(function (global) {
  var ns = global.BlockIsland = global.BlockIsland || {};

  var stateApi = ns.state;
  var time = ns.time;
  var jobs = ns.jobs;
  var housing = ns.housing;
  var content = ns.content;
  var reputation = ns.reputation;
  var events = ns.events;
  var VALID_SEASONS = ["spring", "summer", "fall", "winter"];
  var SMOKE_TEST_DAYS = 21;
  var SMOKE_TEST_SLEEP_DAYS = 30;
  var SMOKE_TEST_WORK_SHIFTS = 10;
  var SMOKE_TEST_SOCIALIZES = 10;

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function toStableComparableValue(value) {
    var normalized = value;

    if (normalized === null) return null;

    if (Array.isArray(normalized)) {
      return normalized.map(function (entry) {
        return toStableComparableValue(entry);
      });
    }

    if (typeof normalized === "object") {
      var sorted = {};

      Object.keys(normalized).sort().forEach(function (key) {
        var entry = normalized[key];

        if (typeof entry === "function" || typeof entry === "undefined") {
          return;
        }

        sorted[key] = toStableComparableValue(entry);
      });

      return sorted;
    }

    if (typeof normalized === "function" || typeof normalized === "undefined") {
      return null;
    }

    return normalized;
  }

  function stableStringify(obj) {
    return JSON.stringify(toStableComparableValue(obj));
  }

  function replaceStateInPlace(target, sourceSnapshot) {
    var restored = deepClone(sourceSnapshot);

    Object.keys(target).forEach(function (key) {
      delete target[key];
    });

    Object.keys(restored).forEach(function (key) {
      target[key] = restored[key];
    });
  }

  function createSeededRandom(seed) {
    var value = seed >>> 0;

    return function () {
      value = (value * 1664525 + 1013904223) >>> 0;
      return value / 4294967296;
    };
  }

  function isNumber(value) {
    return typeof value === "number" && !Number.isNaN(value);
  }

  function clamp100(value) {
    return Math.max(0, Math.min(100, Math.round(value)));
  }

  function addResult(results, name, ok, details) {
    results.push({
      name: name,
      ok: Boolean(ok),
      details: details || ""
    });
  }

  function getDayNumberForState(state) {
    if (events && typeof events.getCurrentDayNumber === "function") {
      return events.getCurrentDayNumber(state);
    }

    return (
      ((state.time.year - 1) * 4 * time.DAYS_PER_SEASON) +
      (state.time.seasonIndex * time.DAYS_PER_SEASON) +
      state.time.day
    );
  }

  function syncSeasonFromTime(targetState, syncHook) {
    if (typeof syncHook === "function") {
      syncHook();
      return;
    }

    if (!targetState.world || typeof targetState.world !== "object") {
      targetState.world = {};
    }

    if (time && typeof time.getSeasonId === "function") {
      targetState.world.season = time.getSeasonId(targetState.time.seasonIndex);
      return;
    }

    targetState.world.season = targetState.time.seasonIndex === 1 ? "summer" : "spring";
  }

  function setTownRep(targetState, value) {
    if (reputation && typeof reputation.setTownReputation === "function") {
      reputation.setTownReputation(targetState, value);
      return;
    }

    targetState.player.reputationTown = clamp100(value);
    targetState.player.reputation = targetState.player.reputationTown;
  }

  function getTownRep(targetState) {
    if (reputation && typeof reputation.getTownReputation === "function") {
      return reputation.getTownReputation(targetState);
    }

    return clamp100(
      isNumber(targetState.player.reputationTown)
        ? targetState.player.reputationTown
        : targetState.player.reputation
    );
  }

  function setBarRep(targetState, value) {
    if (reputation && typeof reputation.setBarReputation === "function") {
      reputation.setBarReputation(targetState, value);
      return;
    }

    targetState.player.reputationBar = clamp100(value);
  }

  function getBarRep(targetState) {
    if (reputation && typeof reputation.getBarReputation === "function") {
      return reputation.getBarReputation(targetState);
    }

    return clamp100(targetState.player.reputationBar);
  }

  function setRelationshipValue(targetState, relationshipId, value) {
    var key = relationshipId === "tourists" ? "summerPeople" : relationshipId;

    if (stateApi && typeof stateApi.setRelationshipValue === "function") {
      stateApi.setRelationshipValue(targetState, key, value);
      return;
    }

    if (!targetState.relationships || typeof targetState.relationships !== "object") {
      targetState.relationships = {
        locals: 0,
        staff: 0,
        summerPeople: 0,
        tourists: 0
      };
    }

    targetState.relationships[key] = clamp100(value);
    if (key === "summerPeople") {
      targetState.relationships.tourists = targetState.relationships.summerPeople;
    }
  }

  function getRelationshipValue(targetState, relationshipId) {
    var key = relationshipId === "tourists" ? "summerPeople" : relationshipId;
    var relationships = targetState.relationships;
    var value;

    if (!relationships || typeof relationships !== "object") {
      relationships = targetState.player && targetState.player.social
        ? targetState.player.social
        : null;
    }
    if (!relationships) return 0;

    value = relationships[key];
    if (!isNumber(value) && key === "summerPeople" && isNumber(relationships.tourists)) {
      value = relationships.tourists;
    }

    return clamp100(value || 0);
  }

  function ensureStatsBuckets(targetState) {
    if (!targetState.stats || typeof targetState.stats !== "object") {
      targetState.stats = {};
    }
    if (
      !targetState.stats.lifetimeEarningsBySource ||
      typeof targetState.stats.lifetimeEarningsBySource !== "object"
    ) {
      targetState.stats.lifetimeEarningsBySource = {};
    }

    if (!isNumber(targetState.stats.lifetimeEarningsBySource.jobs)) {
      targetState.stats.lifetimeEarningsBySource.jobs = 0;
    }
    if (!isNumber(targetState.stats.lifetimeEarningsBySource.tips)) {
      targetState.stats.lifetimeEarningsBySource.tips = 0;
    }
    if (!isNumber(targetState.stats.lifetimeEarningsBySource.other)) {
      targetState.stats.lifetimeEarningsBySource.other = 0;
    }
  }

  function createScenarioState(snapshot) {
    if (stateApi && typeof stateApi.createStateFromSave === "function") {
      return stateApi.createStateFromSave(deepClone(snapshot));
    }

    return deepClone(snapshot);
  }

  function runSmokeTests(liveState, hooks) {
    var originalSnapshot = deepClone(liveState);
    var results = [];
    var beforeStateFingerprint = stableStringify(deepClone(liveState));
    var afterStateFingerprint = "";
    var runWorkAction = hooks && typeof hooks.runWorkAction === "function"
      ? hooks.runWorkAction
      : null;
    var runSocializeAction = hooks && typeof hooks.runSocializeAction === "function"
      ? hooks.runSocializeAction
      : null;
    var runSleepAction = hooks && typeof hooks.runSleepAction === "function"
      ? hooks.runSleepAction
      : null;
    var syncHook = hooks && typeof hooks.syncWorldSeasonFromTime === "function"
      ? hooks.syncWorldSeasonFromTime
      : null;

    if (ns.rng && typeof ns.rng.setSeed === "function") {
      ns.rng.setSeed(12345);
    }

    try {
      (function testStateShape() {
        var missing = [];
        var stats = liveState.stats && liveState.stats.lifetimeEarningsBySource;

        if (!liveState.world || typeof liveState.world.season !== "string") {
          missing.push("world.season");
        }
        if (!liveState.world || !liveState.world.events || typeof liveState.world.events !== "object") {
          missing.push("world.events");
        }
        if (!liveState.relationships || !isNumber(liveState.relationships.locals)) {
          missing.push("relationships.locals");
        }
        if (!liveState.relationships || !isNumber(liveState.relationships.staff)) {
          missing.push("relationships.staff");
        }
        if (!liveState.relationships || !isNumber(liveState.relationships.summerPeople)) {
          missing.push("relationships.summerPeople");
        }
        if (!liveState.player || !isNumber(liveState.player.reputationTown)) {
          missing.push("player.reputationTown");
        }
        if (!liveState.player || !isNumber(liveState.player.reputationBar)) {
          missing.push("player.reputationBar");
        }
        if (!stats || !isNumber(stats.jobs)) {
          missing.push("stats.lifetimeEarningsBySource.jobs");
        }
        if (!stats || !isNumber(stats.tips)) {
          missing.push("stats.lifetimeEarningsBySource.tips");
        }
        if (!stats || !isNumber(stats.other)) {
          missing.push("stats.lifetimeEarningsBySource.other");
        }

        addResult(
          results,
          "State shape + defaults",
          missing.length === 0,
          missing.length === 0 ? "required keys present" : ("missing: " + missing.join(", "))
        );
      })();

      (function testStateNormalizationIntegrity() {
        var normalized = stateApi && typeof stateApi.createStateFromSave === "function"
          ? stateApi.createStateFromSave({})
          : null;
        var missing = [];

        if (!normalized || typeof normalized !== "object") {
          addResult(
            results,
            "state normalization integrity",
            false,
            "createStateFromSave({}) did not return an object"
          );
          return;
        }

        if (!normalized.jobs || typeof normalized.jobs.pendingJobId !== "string") {
          missing.push("jobs.pendingJobId<string>");
        }
        if (!normalized.jobs || typeof normalized.jobs.currentJobId === "undefined") {
          missing.push("jobs.currentJobId");
        }
        if (!normalized.player || typeof normalized.player.money === "undefined") {
          missing.push("player.money");
        }
        if (!normalized.world || typeof normalized.world.day === "undefined") {
          missing.push("world.day");
        }

        addResult(
          results,
          "state normalization integrity",
          missing.length === 0,
          missing.length === 0 ? "empty save normalized safely" : ("missing: " + missing.join(", "))
        );
      })();

      (function testContentIntegrity() {
        var failures = [];
        var duplicateJobIds = [];
        var duplicateHousingIds = [];
        var invalidJobIds = [];
        var invalidHousingIds = [];
        var seenJobIds = {};
        var seenHousingIds = {};
        var jobDefinitions = content && content.jobs && typeof content.jobs === "object"
          ? content.jobs
          : null;
        var housingDefinitions = content && content.housing && typeof content.housing === "object"
          ? content.housing
          : null;

        if (!jobDefinitions) {
          failures.push("missing content.jobs registry");
        } else {
          Object.keys(jobDefinitions).forEach(function (registryKey) {
            var definition = jobDefinitions[registryKey];
            var id = definition && typeof definition.id === "string" ? definition.id : "";
            var name = definition && typeof definition.name === "string" ? definition.name : "";

            if (!id || !name) {
              invalidJobIds.push(registryKey);
            }
            if (id) {
              if (seenJobIds[id]) {
                duplicateJobIds.push(id);
              } else {
                seenJobIds[id] = true;
              }
            }
          });
        }

        if (!housingDefinitions) {
          failures.push("missing content.housing registry");
        } else {
          Object.keys(housingDefinitions).forEach(function (registryKey) {
            var definition = housingDefinitions[registryKey];
            var id = definition && typeof definition.id === "string" ? definition.id : "";
            var name = definition && typeof definition.name === "string" ? definition.name : "";

            if (!id || !name) {
              invalidHousingIds.push(registryKey);
            }
            if (id) {
              if (seenHousingIds[id]) {
                duplicateHousingIds.push(id);
              } else {
                seenHousingIds[id] = true;
              }
            }
          });
        }

        if (invalidJobIds.length > 0) {
          failures.push("jobs missing id/name: " + invalidJobIds.join(", "));
        }
        if (invalidHousingIds.length > 0) {
          failures.push("housing missing id/name: " + invalidHousingIds.join(", "));
        }
        if (duplicateJobIds.length > 0) {
          failures.push("duplicate job ids: " + duplicateJobIds.join(", "));
        }
        if (duplicateHousingIds.length > 0) {
          failures.push("duplicate housing ids: " + duplicateHousingIds.join(", "));
        }

        addResult(
          results,
          "content integrity",
          failures.length === 0,
          failures.length === 0 ? "jobs/housing ids and names valid" : failures.join(" | ")
        );
      })();

      (function testCompatibilityAliases() {
        var issues = [];

        if (liveState.player && isNumber(liveState.player.reputation)) {
          if (clamp100(liveState.player.reputation) !== clamp100(getTownRep(liveState))) {
            issues.push("player.reputation != player.reputationTown");
          }
        }
        if (liveState.relationships && isNumber(liveState.relationships.tourists)) {
          if (
            clamp100(liveState.relationships.tourists) !==
            clamp100(getRelationshipValue(liveState, "summerPeople"))
          ) {
            issues.push("relationships.tourists != relationships.summerPeople");
          }
        }

        addResult(
          results,
          "Backward-compat aliases",
          issues.length === 0,
          issues.length === 0 ? "aliases compatible" : issues.join("; ")
        );
      })();

      (function testEventsRegistry() {
        var registry = events && typeof events.getDailyEventDefinitions === "function"
          ? events.getDailyEventDefinitions()
          : null;
        var count = Array.isArray(registry) ? registry.length : 0;

        addResult(
          results,
          "Events module + registry size",
          Boolean(events && typeof events.runDailyEvent === "function" && count >= 12),
          "eventCount=" + count
        );
      })();

      (function testSeasonProgression() {
        var before = liveState.world && liveState.world.season
          ? String(liveState.world.season).toLowerCase()
          : "";
        var after;
        var valid;
        var changed;
        var i;

        for (i = 0; i < SMOKE_TEST_DAYS; i += 1) {
          time.advanceDay(liveState.time);
        }
        syncSeasonFromTime(liveState, syncHook);

        after = liveState.world && liveState.world.season
          ? String(liveState.world.season).toLowerCase()
          : "";
        valid = VALID_SEASONS.indexOf(after) >= 0;
        changed = before !== after;

        addResult(
          results,
          "Season progression (21 days)",
          valid && changed,
          "before=" + before + ", after=" + after
        );
      })();

      (function testSleepLoopStability() {
        var startDayNumber = getDayNumberForState(liveState);
        var endDayNumber;
        var success = true;
        var i;
        var hasEventsState;

        if (!runSleepAction) {
          addResult(results, "Sleep loop stability (30 days)", false, "sleep action hook unavailable");
          return;
        }

        try {
          for (i = 0; i < SMOKE_TEST_SLEEP_DAYS; i += 1) {
            liveState.time.actionSlotsRemaining = 0;
            runSleepAction();
          }
        } catch (error) {
          success = false;
          addResult(
            results,
            "Sleep loop stability (30 days)",
            false,
            error && error.message ? error.message : String(error)
          );
          return;
        }

        endDayNumber = getDayNumberForState(liveState);
        hasEventsState = Boolean(
          liveState.world &&
          liveState.world.events &&
          typeof liveState.world.events === "object"
        );

        addResult(
          results,
          "Sleep loop stability (30 days)",
          success && endDayNumber > startDayNumber && hasEventsState,
          "dayDelta=" + (endDayNumber - startDayNumber) + ", eventsState=" + hasEventsState
        );
      })();

      (function testDailyEventDayKeyGating() {
        var scenario;
        var firstResult;
        var secondResult;
        var dayKey;
        var eventsState;
        var rolledOnce;

        if (!events || typeof events.runDailyEvent !== "function") {
          addResult(results, "Daily event day-key gating", false, "events module unavailable");
          return;
        }

        scenario = createScenarioState(originalSnapshot);
        if (typeof events.ensureEventsState === "function") {
          events.ensureEventsState(scenario);
        }

        dayKey = typeof events.getCurrentDayKey === "function"
          ? events.getCurrentDayKey(scenario)
          : "";

        firstResult = events.runDailyEvent(scenario, { on: "smoke" });
        secondResult = events.runDailyEvent(scenario, { on: "smoke" });
        eventsState = scenario.world && scenario.world.events ? scenario.world.events : {};
        rolledOnce = eventsState.lastEventRollDayKey === dayKey;

        addResult(
          results,
          "Daily event day-key gating",
          rolledOnce && secondResult === null,
          "firstTriggered=" + Boolean(firstResult) + ", secondTriggered=" + Boolean(secondResult)
        );
      })();

      (function testJobUnlockGating() {
        function check(name, jobId, setupFn, shouldBeAvailable) {
          var scenario = createScenarioState(originalSnapshot);
          var available;

          setupFn(scenario);
          available = jobs.getAvailableJobIds(scenario).indexOf(jobId) >= 0;

          addResult(
            results,
            name,
            available === shouldBeAvailable,
            "expected " + (shouldBeAvailable ? "available" : "locked") +
              ", got " + (available ? "available" : "locked")
          );
        }

        check(
          "Unlock gate: captain_nicks_bartender @ Town Rep 11",
          "captain_nicks_bartender",
          function (scenario) {
            setTownRep(scenario, 11);
          },
          false
        );

        check(
          "Unlock gate: captain_nicks_bartender @ Town Rep 12",
          "captain_nicks_bartender",
          function (scenario) {
            setTownRep(scenario, 12);
          },
          true
        );

        check(
          "Unlock gate: ferry_worker @ Town 18 + Locals 14",
          "ferry_worker",
          function (scenario) {
            setTownRep(scenario, 18);
            setRelationshipValue(scenario, "locals", 14);
          },
          false
        );

        check(
          "Unlock gate: ferry_worker @ Town 18 + Locals 15",
          "ferry_worker",
          function (scenario) {
            setTownRep(scenario, 18);
            setRelationshipValue(scenario, "locals", 15);
          },
          true
        );

        check(
          "Unlock gate: charter_fishing_crew @ Town 20 + Summer People 19",
          "charter_fishing_crew",
          function (scenario) {
            setTownRep(scenario, 20);
            setRelationshipValue(scenario, "summerPeople", 19);
          },
          false
        );

        check(
          "Unlock gate: charter_fishing_crew @ Town 20 + Summer People 20",
          "charter_fishing_crew",
          function (scenario) {
            setTownRep(scenario, 20);
            setRelationshipValue(scenario, "summerPeople", 20);
          },
          true
        );
      })();

      (function testHousingDefinitionCount() {
        var housingCount = housing && housing.HOUSING ? Object.keys(housing.HOUSING).length : 0;

        addResult(
          results,
          "Housing definitions count",
          housingCount >= 8,
          "housingCount=" + housingCount
        );
      })();

      (function testHousingChoicePerTier() {
        var scenario = createScenarioState(originalSnapshot);
        var availableIds;
        var tierOneCount = 0;

        if (
          !housing ||
          typeof housing.syncUnlockedHousing !== "function" ||
          typeof housing.getAvailableHousingOptionIds !== "function"
        ) {
          addResult(results, "Housing choice availability", false, "housing option helpers unavailable");
          return;
        }

        scenario.player.money = Math.max(scenario.player.money, 3200);
        setTownRep(scenario, Math.max(getTownRep(scenario), 22));
        scenario.housing.current = "employee_housing";

        housing.syncUnlockedHousing(scenario);
        availableIds = housing.getAvailableHousingOptionIds(scenario);
        tierOneCount = availableIds.filter(function (housingId) {
          return typeof housing.getHousingTier === "function"
            ? housing.getHousingTier(housingId) === 1
            : false;
        }).length;

        addResult(
          results,
          "Housing choice availability",
          tierOneCount >= 2,
          "tierOneAvailable=" + tierOneCount
        );
      })();

      (function testHousingMoveRentAndPerksRegression() {
        var scenario = createScenarioState(originalSnapshot);
        var moveTargets = ["harborview_studio", "above_the_shop_room", "shared_house_room"];
        var targetHousingId = "";
        var moved;
        var moneyBefore;
        var moneyAfter;
        var energyBefore;
        var energyAfter;
        var rentResult;
        var hasHousingModifier;
        var i;

        if (
          !housing ||
          typeof housing.canMoveToHousing !== "function" ||
          typeof housing.setPendingMoveTarget !== "function" ||
          typeof housing.moveToSharedHouse !== "function" ||
          typeof housing.chargeWeeklyRentIfDue !== "function"
        ) {
          addResult(results, "Housing move + rent + perks regression", false, "housing movement helpers unavailable");
          return;
        }

        scenario.player.money = Math.max(scenario.player.money, 12000);
        setTownRep(scenario, Math.max(getTownRep(scenario), 70));
        scenario.housing.current = "employee_housing";
        scenario.time.weekdayIndex = 0;
        scenario.player.needs.energy = 50;

        if (typeof housing.syncUnlockedHousing === "function") {
          housing.syncUnlockedHousing(scenario);
        }

        for (i = 0; i < moveTargets.length; i += 1) {
          if (housing.canMoveToHousing(scenario, moveTargets[i])) {
            targetHousingId = moveTargets[i];
            break;
          }
        }

        if (!targetHousingId) {
          addResult(results, "Housing move + rent + perks regression", false, "no valid target housing found");
          return;
        }

        housing.setPendingMoveTarget(targetHousingId);
        moved = housing.moveToSharedHouse(scenario);
        moneyBefore = scenario.player.money;
        energyBefore = scenario.player.needs.energy;

        rentResult = housing.chargeWeeklyRentIfDue(scenario);
        moneyAfter = scenario.player.money;
        energyAfter = scenario.player.needs.energy;
        hasHousingModifier = Boolean(
          scenario.world &&
          scenario.world.events &&
          Array.isArray(scenario.world.events.modifiers) &&
          scenario.world.events.modifiers.some(function (modifier) {
            return modifier &&
              (
                modifier.id === "housing_perk_tip_bonus" ||
                modifier.id === "housing_perk_socialize_gain"
              );
          })
        );

        addResult(
          results,
          "Housing move + rent + perks regression",
          moved &&
            scenario.housing.current === targetHousingId &&
            rentResult &&
            rentResult.due === true &&
            rentResult.charged === true &&
            moneyAfter < moneyBefore &&
            (energyAfter !== energyBefore || hasHousingModifier),
          "target=" + targetHousingId +
            ", due=" + Boolean(rentResult && rentResult.due) +
            ", charged=" + Boolean(rentResult && rentResult.charged) +
            ", energyDelta=" + (energyAfter - energyBefore)
        );
      })();

      (function testShiftDefinitionsAndSchema() {
        var definitions = jobs && typeof jobs.getShiftTypeDefinitions === "function"
          ? jobs.getShiftTypeDefinitions()
          : [];
        var requiredShiftIds = [
          "quiet_morning_shift",
          "lunch_rush_shift",
          "dinner_shift",
          "weekend_surge_shift",
          "double_shift",
          "slow_shift",
          "disrupted_shift",
          "ferry_surge_shift",
          "tuna_tournament_shift",
          "race_week_shift",
          "holiday_weekend_shift",
          "shoulder_season_shift",
          "winter_isolation_shift"
        ];
        var missing = requiredShiftIds.filter(function (shiftId) {
          return !definitions.some(function (definition) {
            return definition.id === shiftId;
          });
        });
        var schemaOk = definitions.every(function (definition) {
          return Boolean(
            definition &&
            typeof definition.id === "string" &&
            typeof definition.name === "string" &&
            typeof definition.weight === "number" &&
            typeof definition.payMultiplier === "number" &&
            typeof definition.tipChanceBonus === "number" &&
            typeof definition.tipAmountMultiplier === "number" &&
            typeof definition.energyCostMultiplier === "number" &&
            Array.isArray(definition.logTemplates)
          );
        });

        addResult(
          results,
          "Shift definitions + schema",
          definitions.length >= 10 && missing.length === 0 && schemaOk,
          "count=" + definitions.length + ", missing=" + missing.join(", ")
        );
      })();

      (function testRareShiftSelectionAppears() {
        var scenario = createScenarioState(originalSnapshot);
        var jobId = "captain_nicks_bartender";
        var seenRare = {};
        var rareIds = {
          double_shift: true,
          tuna_tournament_shift: true,
          race_week_shift: true
        };
        var iterationCount = 400;
        var picked;
        var i;

        if (
          !jobs ||
          typeof jobs.pickShiftTypeForState !== "function" ||
          !jobs.JOBS[jobId]
        ) {
          addResult(results, "Rare shift selection appears", false, "shift pick helper unavailable");
          return;
        }

        scenario.time.seasonIndex = 1;
        scenario.time.day = 10;
        scenario.time.weekdayIndex = 5;
        if (!scenario.world || typeof scenario.world !== "object") {
          scenario.world = {};
        }
        scenario.world.season = "summer";
        if (!scenario.jobs.unlocked || typeof scenario.jobs.unlocked !== "object") {
          scenario.jobs.unlocked = {};
        }
        scenario.jobs.unlocked[jobId] = true;
        jobs.setActiveJob(scenario, jobId);

        for (i = 0; i < iterationCount; i += 1) {
          picked = jobs.pickShiftTypeForState(scenario, jobId);
          if (picked && rareIds[picked.id]) {
            seenRare[picked.id] = true;
          }
        }

        addResult(
          results,
          "Rare shift selection appears",
          Object.keys(seenRare).length >= 1,
          "seenRare=" + Object.keys(seenRare).join(", ")
        );
      })();

      (function testWorkPayVariesAcrossShifts() {
        var scenario = createScenarioState(originalSnapshot);
        var jobId = "captain_nicks_bartender";
        var payValues = {};
        var i;
        var result;

        if (!jobs || typeof jobs.performWorkShift !== "function" || !jobs.JOBS[jobId]) {
          addResult(results, "Shift multipliers affect work pay", false, "performWorkShift unavailable");
          return;
        }

        scenario.player.money = Math.max(scenario.player.money, 10000);
        scenario.time.seasonIndex = 1;
        scenario.time.day = 10;
        scenario.time.weekdayIndex = 5;
        if (!scenario.world || typeof scenario.world !== "object") {
          scenario.world = {};
        }
        scenario.world.season = "summer";
        if (!scenario.jobs.unlocked || typeof scenario.jobs.unlocked !== "object") {
          scenario.jobs.unlocked = {};
        }
        scenario.jobs.unlocked[jobId] = true;
        jobs.setActiveJob(scenario, jobId);
        scenario.jobs.list[jobId].level = jobs.MAX_JOB_LEVEL;
        scenario.jobs.list[jobId].promotionProgress = jobs.PROMOTION_THRESHOLD;

        for (i = 0; i < 40; i += 1) {
          scenario.jobs.workedToday = false;
          result = jobs.performWorkShift(scenario);
          if (result && typeof result.pay === "number") {
            payValues[result.pay] = true;
          }
        }

        addResult(
          results,
          "Shift multipliers affect work pay",
          Object.keys(payValues).length >= 2,
          "distinctPays=" + Object.keys(payValues).length
        );
      })();

      (function testWorkActionLogsShiftIdentityLine() {
        var scenarioLogLength;
        var logsSince;
        var hasShiftLine;
        var hasBaseWorkLine;

        if (!runWorkAction) {
          addResult(results, "Work action shift identity log", false, "work action hook unavailable");
          return;
        }

        liveState.player.money = Math.max(liveState.player.money, 5000);
        liveState.time.seasonIndex = 1;
        liveState.time.day = 10;
        liveState.time.weekdayIndex = 5;
        liveState.world.season = "summer";
        liveState.jobs.unlocked.captain_nicks_bartender = true;
        jobs.setActiveJob(liveState, "captain_nicks_bartender");
        liveState.jobs.workedToday = false;
        liveState.time.actionSlotsRemaining = time.MAX_ACTION_SLOTS;
        liveState.log = [];
        scenarioLogLength = Array.isArray(liveState.log) ? liveState.log.length : 0;

        runWorkAction();

        logsSince = Array.isArray(liveState.log) ? liveState.log.slice(scenarioLogLength) : [];
        hasShiftLine = logsSince.some(function (entry) {
          return /shift at/i.test(String(entry));
        });
        hasBaseWorkLine = logsSince.some(function (entry) {
          return /worked your shift and earned/i.test(String(entry));
        });

        addResult(
          results,
          "Work action shift identity log",
          hasShiftLine && hasBaseWorkLine,
          "shiftLine=" + hasShiftLine + ", baseLine=" + hasBaseWorkLine
        );
      })();

      (function testCareerLadderTitleDerivation() {
        var jobId = "captain_nicks_bartender";
        var levelOneTitle;
        var levelFiveTitle;
        var ok;

        if (!jobs.JOBS[jobId] || typeof jobs.getJobRoleTitle !== "function") {
          addResult(results, "Career ladder title derivation", false, "career ladder helpers unavailable");
          return;
        }

        levelOneTitle = jobs.getJobRoleTitle(jobId, 1);
        levelFiveTitle = jobs.getJobRoleTitle(jobId, 5);
        ok = levelOneTitle === "Host" && levelFiveTitle === "Bar Manager";

        addResult(
          results,
          "Career ladder title derivation",
          ok,
          "L1=" + levelOneTitle + ", L5=" + levelFiveTitle
        );
      })();

      (function testPromotionLogUsesRoleTitle() {
        var uiApi = ns.ui;
        var jobId = "captain_nicks_bartender";
        var promotionTitle;
        var legacyLogLine;
        var displayLogLine;
        var ok;

        if (
          !jobs.JOBS[jobId] ||
          typeof jobs.getJobRoleLogTitle !== "function" ||
          !uiApi ||
          typeof uiApi.formatLogEntryForDisplay !== "function"
        ) {
          addResult(results, "Promotion log includes role title", false, "UI formatter or role helpers unavailable");
          return;
        }

        promotionTitle = jobs.getJobRoleLogTitle(jobId, 2);
        legacyLogLine = "You were promoted to Level 2 at " + jobs.getJobName(jobId) + "!";
        displayLogLine = uiApi.formatLogEntryForDisplay(legacyLogLine);
        ok = String(displayLogLine).indexOf(promotionTitle) >= 0;

        addResult(
          results,
          "Promotion log includes role title",
          ok,
          displayLogLine
        );
      })();

      (function testCareerLadderFallbackWithoutDefinition() {
        var tempJobId = "__smoke_no_ladder_job__";
        var existingDefinition = jobs.JOBS[tempJobId];
        var fallbackTitle;
        var ok;

        jobs.JOBS[tempJobId] = {
          id: tempJobId,
          name: "Smoke Test Job",
          basePay: 1,
          payPerLevel: 1,
          promotionGain: 1,
          tags: [],
          perks: {}
        };

        try {
          fallbackTitle = jobs.getJobRoleTitle(tempJobId, 3);
          ok = fallbackTitle === "Level 3";
        } finally {
          if (existingDefinition) {
            jobs.JOBS[tempJobId] = existingDefinition;
          } else {
            delete jobs.JOBS[tempJobId];
          }
        }

        addResult(
          results,
          "Career ladder fallback without definition",
          ok,
          "title=" + fallbackTitle
        );
      })();

      (function testTipsAndStats() {
        var tipsJobId = "captain_nicks_bartender";
        var tipsBefore;
        var jobsBefore;
        var tipsAfter;
        var jobsAfter;
        var logStart;
        var logsSince;
        var sawTipLog;
        var i;

        if (!runWorkAction) {
          addResult(results, "Tips + stats via work flow", false, "work action hook unavailable");
          return;
        }
        if (!jobs.JOBS[tipsJobId]) {
          addResult(results, "Tips + stats via work flow", false, "tips-tagged job missing");
          return;
        }

        ensureStatsBuckets(liveState);
        setTownRep(liveState, 60);
        setBarRep(liveState, 20);
        setRelationshipValue(liveState, "locals", 80);
        setRelationshipValue(liveState, "summerPeople", 80);
        liveState.player.money = Math.max(liveState.player.money, 10000);

        liveState.time.seasonIndex = 1;
        liveState.time.day = 1;
        syncSeasonFromTime(liveState, syncHook);

        if (!liveState.jobs.unlocked || typeof liveState.jobs.unlocked !== "object") {
          liveState.jobs.unlocked = {};
        }
        liveState.jobs.unlocked[tipsJobId] = true;
        jobs.setActiveJob(liveState, tipsJobId);
        liveState.log = [];

        tipsBefore = liveState.stats.lifetimeEarningsBySource.tips;
        jobsBefore = liveState.stats.lifetimeEarningsBySource.jobs;
        logStart = Array.isArray(liveState.log) ? liveState.log.length : 0;

        for (i = 0; i < SMOKE_TEST_WORK_SHIFTS; i += 1) {
          liveState.jobs.workedToday = false;
          liveState.time.actionSlotsRemaining = time.MAX_ACTION_SLOTS;
          runWorkAction();
        }

        tipsAfter = liveState.stats.lifetimeEarningsBySource.tips;
        jobsAfter = liveState.stats.lifetimeEarningsBySource.jobs;
        logsSince = Array.isArray(liveState.log) ? liveState.log.slice(logStart) : [];
        sawTipLog = logsSince.some(function (entry) {
          return String(entry).indexOf("You received $") >= 0;
        });

        addResult(
          results,
          "Tips + earnings stats (10 work shifts)",
          (time.isBusySeason(liveState) === true) &&
            tipsAfter > tipsBefore &&
            jobsAfter > jobsBefore &&
            sawTipLog,
          "busy=" + time.isBusySeason(liveState) +
            ", tipsDelta=" + (tipsAfter - tipsBefore) +
            ", jobsDelta=" + (jobsAfter - jobsBefore) +
            ", tipLog=" + sawTipLog
        );
      })();

      (function testOneUseModifierConsumption() {
        var jobId = "diamond_blue_surf_shop";
        var dayNumber;
        var moneyBefore;
        var moneyAfterFirst;
        var moneyAfterSecond;
        var firstShiftDelta;
        var secondShiftDelta;
        var modifierStillExistsAfterFirst;
        var modifierStillExistsAfterSecond;

        if (!runWorkAction) {
          addResult(results, "Next-work modifier consumed once", false, "work action hook unavailable");
          return;
        }
        if (!events || typeof events.addModifier !== "function") {
          addResult(results, "Next-work modifier consumed once", false, "events modifier helpers unavailable");
          return;
        }
        if (!jobs.JOBS[jobId]) {
          addResult(results, "Next-work modifier consumed once", false, "baseline job missing");
          return;
        }

        ensureStatsBuckets(liveState);
        setRelationshipValue(liveState, "staff", 0);
        setRelationshipValue(liveState, "locals", 0);
        setRelationshipValue(liveState, "summerPeople", 0);
        liveState.player.money = Math.max(liveState.player.money, 5000);
        liveState.jobs.unlocked[jobId] = true;
        jobs.setActiveJob(liveState, jobId);
        if (liveState.world && liveState.world.events) {
          liveState.world.events.modifiers = [];
        }

        dayNumber = typeof events.getCurrentDayNumber === "function"
          ? events.getCurrentDayNumber(liveState)
          : 1;

        events.addModifier(liveState, {
          id: "smoke_next_work_bonus",
          type: "workPayMult",
          value: 1.5,
          consumeOn: "work",
          remainingUses: 1,
          expiresOnDayNumber: dayNumber + 1
        });

        moneyBefore = liveState.player.money;
        liveState.jobs.workedToday = false;
        liveState.time.actionSlotsRemaining = time.MAX_ACTION_SLOTS;
        runWorkAction();
        moneyAfterFirst = liveState.player.money;
        firstShiftDelta = moneyAfterFirst - moneyBefore;
        modifierStillExistsAfterFirst = Boolean(
          liveState.world &&
          liveState.world.events &&
          Array.isArray(liveState.world.events.modifiers) &&
          liveState.world.events.modifiers.some(function (modifier) {
            return modifier && modifier.id === "smoke_next_work_bonus";
          })
        );

        liveState.jobs.workedToday = false;
        liveState.time.actionSlotsRemaining = time.MAX_ACTION_SLOTS;
        runWorkAction();
        moneyAfterSecond = liveState.player.money;
        secondShiftDelta = moneyAfterSecond - moneyAfterFirst;
        modifierStillExistsAfterSecond = Boolean(
          liveState.world &&
          liveState.world.events &&
          Array.isArray(liveState.world.events.modifiers) &&
          liveState.world.events.modifiers.some(function (modifier) {
            return modifier && modifier.id === "smoke_next_work_bonus";
          })
        );

        addResult(
          results,
          "Next-work modifier consumed once",
          !modifierStillExistsAfterFirst &&
            !modifierStillExistsAfterSecond &&
            firstShiftDelta > secondShiftDelta,
          "firstDelta=" + firstShiftDelta + ", secondDelta=" + secondShiftDelta
        );
      })();

      (function testDualReputationFromSocialize() {
        var townBefore;
        var townAfter;
        var barBefore;
        var barAfter;
        var gained;
        var valid;
        var i;

        if (!runSocializeAction) {
          addResult(results, "Dual reputation increments (socialize)", false, "socialize action hook unavailable");
          return;
        }

        liveState.player.money = Math.max(liveState.player.money, 4000);
        townBefore = getTownRep(liveState);
        barBefore = getBarRep(liveState);

        for (i = 0; i < SMOKE_TEST_SOCIALIZES; i += 1) {
          liveState.time.actionSlotsRemaining = time.MAX_ACTION_SLOTS;
          runSocializeAction();
        }

        townAfter = getTownRep(liveState);
        barAfter = getBarRep(liveState);
        gained = townAfter > townBefore || barAfter > barBefore;
        valid = townAfter >= 0 && townAfter <= 100 && barAfter >= 0 && barAfter <= 100;

        addResult(
          results,
          "Dual reputation increments (10 socialize actions)",
          gained && valid,
          "town: " + townBefore + "->" + townAfter + ", bar: " + barBefore + "->" + barAfter
        );
      })();
    } catch (error) {
      addResult(
        results,
        "Smoke test runner execution",
        false,
        error && error.message ? error.message : String(error)
      );
    } finally {
      if (ns.rng && typeof ns.rng.reset === "function") {
        ns.rng.reset();
      }
      replaceStateInPlace(liveState, originalSnapshot);
      afterStateFingerprint = stableStringify(deepClone(liveState));
      addResult(
        results,
        "Snapshot restore integrity",
        beforeStateFingerprint === afterStateFingerprint,
        beforeStateFingerprint === afterStateFingerprint
          ? "state restored exactly"
          : "State mismatch after restore (snapshot/restore incomplete)"
      );
    }

    return {
      passed: results.filter(function (entry) {
        return entry.ok;
      }).length,
      failed: results.filter(function (entry) {
        return !entry.ok;
      }).length,
      results: results
    };
  }

  function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  function clampNumber(value, fallback, min, max) {
    var normalized = isFiniteNumber(value) ? value : fallback;
    return Math.max(min, Math.min(max, normalized));
  }

  function normalizeAutoplayOptions(options) {
    var raw = options && typeof options === "object" ? options : {};
    var strategy = typeof raw.strategy === "string" ? raw.strategy : "balanced";
    var allowedStrategies = {
      balanced: true,
      work_focus: true,
      social_focus: true,
      speedrun_shared_house: true
    };

    if (!allowedStrategies[strategy]) {
      strategy = "balanced";
    }

    return {
      days: Math.floor(clampNumber(raw.days, 30, 1, 365)),
      strategy: strategy,
      seed: Math.floor(clampNumber(raw.seed, 12345, 1, 999999999)),
      verbose: Boolean(raw.verbose)
    };
  }

  function getActionCostsForState(state) {
    var balanceApi = ns.balance;
    var lifestyleApi = ns.lifestyle;
    var lifestyleId = lifestyleApi && typeof lifestyleApi.getLifestyle === "function"
      ? lifestyleApi.getLifestyle(state)
      : "normal";
    var baseEat = balanceApi && typeof balanceApi.BASE_EAT_COST === "number"
      ? balanceApi.BASE_EAT_COST
      : 18;
    var baseSocialize = balanceApi && typeof balanceApi.BASE_SOCIALIZE_COST === "number"
      ? balanceApi.BASE_SOCIALIZE_COST
      : 8;
    var eat = lifestyleApi && typeof lifestyleApi.applyLifestyleToCost === "function"
      ? lifestyleApi.applyLifestyleToCost(baseEat, lifestyleId, "eat")
      : baseEat;
    var socializeCost = lifestyleApi && typeof lifestyleApi.applyLifestyleToCost === "function"
      ? lifestyleApi.applyLifestyleToCost(baseSocialize, lifestyleId, "socialize")
      : baseSocialize;

    return {
      eat: Math.max(0, Math.floor(eat)),
      socialize: Math.max(0, Math.floor(socializeCost))
    };
  }

  function getRelationshipSnapshot(state) {
    return {
      locals: getRelationshipValue(state, "locals"),
      staff: getRelationshipValue(state, "staff"),
      summerPeople: getRelationshipValue(state, "summerPeople")
    };
  }

  function getAutoplaySnapshot(state) {
    return {
      day: getDayNumberForState(state),
      slots: state && state.time ? state.time.actionSlotsRemaining : 0,
      money: state && state.player ? state.player.money : 0,
      townRep: getTownRep(state),
      barRep: getBarRep(state),
      energy: state && state.player && state.player.needs ? state.player.needs.energy : 0,
      hunger: state && state.player && state.player.needs ? state.player.needs.hunger : 0,
      mood: state && state.player && state.player.needs ? state.player.needs.social : 0,
      relationships: getRelationshipSnapshot(state),
      workedToday: Boolean(state && state.jobs && state.jobs.workedToday),
      logLen: Array.isArray(state && state.log) ? state.log.length : 0
    };
  }

  function addOrIncrementFlag(redFlags, id, message) {
    var existing = redFlags.find(function (entry) {
      return entry.id === id;
    });

    if (existing) {
      existing.count += 1;
      return;
    }

    redFlags.push({
      id: id,
      message: message,
      count: 1
    });
  }

  function chooseAutoplayJobId(state) {
    var available = jobs && typeof jobs.getAvailableJobIds === "function"
      ? jobs.getAvailableJobIds(state)
      : [];

    if (!Array.isArray(available) || available.length <= 0) {
      return "";
    }
    if (available.indexOf("halls_mowing_crew") >= 0) {
      return "halls_mowing_crew";
    }

    return available[0];
  }

  function ensureAutoplayJobQueued(state, hooks, metrics, redFlags) {
    var activeJobId = state && state.jobs ? state.jobs.activeJobId : "";
    var pendingJobId = state && state.jobs ? state.jobs.pendingJobId : "";
    var targetJobId;
    var queued;

    if (activeJobId || pendingJobId) {
      return;
    }

    targetJobId = chooseAutoplayJobId(state);
    if (!targetJobId) {
      addOrIncrementFlag(redFlags, "no_available_jobs", "No unlocked jobs available for autoplay.");
      return;
    }

    if (hooks && typeof hooks.applyJobAction === "function") {
      queued = hooks.applyJobAction(targetJobId);
    } else {
      queued = jobs && typeof jobs.setActiveJob === "function"
        ? jobs.setActiveJob(state, targetJobId)
        : false;
      addOrIncrementFlag(
        redFlags,
        "missing_apply_hook",
        "Autoplay missing applyJobAction hook; fallback direct assignment was used."
      );
    }

    if (!queued) {
      addOrIncrementFlag(redFlags, "apply_job_failed", "Autoplay could not queue a starting job.");
      return;
    }

    metrics.jobApplications += 1;
  }

  function canAttemptAction(state, actionId, costs) {
    var slots = state && state.time ? state.time.actionSlotsRemaining : 0;
    var minWorkEnergy = jobs && typeof jobs.MIN_WORK_ENERGY === "number"
      ? jobs.MIN_WORK_ENERGY
      : 0;
    var hasJob = Boolean(state && state.jobs && state.jobs.activeJobId);

    if (slots <= 0) return false;

    if (actionId === "work") {
      return Boolean(
        hasJob &&
        state.jobs.workedToday !== true &&
        state.player &&
        state.player.needs &&
        state.player.needs.energy >= minWorkEnergy
      );
    }

    if (actionId === "eat") {
      return Boolean(state && state.player && state.player.money >= costs.eat);
    }

    if (actionId === "socialize") {
      return Boolean(state && state.player && state.player.money >= costs.socialize);
    }

    if (actionId === "rest") {
      return true;
    }

    return false;
  }

  function pickAutoplayAction(state, strategy, costs) {
    var energy = state && state.player && state.player.needs ? state.player.needs.energy : 0;
    var hunger = state && state.player && state.player.needs ? state.player.needs.hunger : 0;
    var mood = state && state.player && state.player.needs ? state.player.needs.social : 0;
    var dynamicOrder = [];
    var fixedOrder = [];
    var i;

    if (strategy === "work_focus") {
      fixedOrder = ["work", "rest", "eat", "socialize"];
    } else if (strategy === "social_focus") {
      fixedOrder = ["socialize", "eat", "rest", "work"];
    } else if (strategy === "speedrun_shared_house") {
      fixedOrder = ["work", "rest", "eat", "socialize"];
    } else {
      if (energy < 35) {
        dynamicOrder.push("rest");
      }
      if (hunger > 75) {
        dynamicOrder.push("eat");
      }
      if (mood < 35) {
        dynamicOrder.push("socialize");
      }
      dynamicOrder = dynamicOrder.concat(["work", "socialize", "eat", "rest"]);
      fixedOrder = dynamicOrder;
    }

    for (i = 0; i < fixedOrder.length; i += 1) {
      if (canAttemptAction(state, fixedOrder[i], costs)) {
        return fixedOrder[i];
      }
    }

    return "";
  }

  function didActionChangeState(beforeSnapshot, afterSnapshot) {
    return Boolean(
      beforeSnapshot.money !== afterSnapshot.money ||
      beforeSnapshot.townRep !== afterSnapshot.townRep ||
      beforeSnapshot.barRep !== afterSnapshot.barRep ||
      beforeSnapshot.energy !== afterSnapshot.energy ||
      beforeSnapshot.hunger !== afterSnapshot.hunger ||
      beforeSnapshot.mood !== afterSnapshot.mood ||
      beforeSnapshot.relationships.locals !== afterSnapshot.relationships.locals ||
      beforeSnapshot.relationships.staff !== afterSnapshot.relationships.staff ||
      beforeSnapshot.relationships.summerPeople !== afterSnapshot.relationships.summerPeople ||
      beforeSnapshot.workedToday !== afterSnapshot.workedToday ||
      beforeSnapshot.day !== afterSnapshot.day ||
      beforeSnapshot.logLen !== afterSnapshot.logLen
    );
  }

  function runAutoplayAction(actionId, actionFn, state, costs, metrics, redFlags) {
    var before = getAutoplaySnapshot(state);
    var after;
    var consumedSlot;
    var dayAdvanced;
    var changedState;
    var expectedBlocked = false;
    var minWorkEnergy = jobs && typeof jobs.MIN_WORK_ENERGY === "number"
      ? jobs.MIN_WORK_ENERGY
      : 0;

    metrics.actionAttempts[actionId] += 1;

    if (typeof actionFn !== "function") {
      addOrIncrementFlag(redFlags, "missing_hook_" + actionId, "Missing autoplay hook for action: " + actionId + ".");
      metrics.noOpActions += 1;
      return {
        consumedSlot: false,
        dayAdvanced: false
      };
    }

    if (actionId === "work") {
      expectedBlocked = Boolean(
        !state.jobs.activeJobId ||
        state.jobs.workedToday === true ||
        before.slots <= 0 ||
        before.energy < minWorkEnergy
      );
    } else if (actionId === "eat") {
      expectedBlocked = Boolean(before.slots <= 0 || before.money < costs.eat);
    } else if (actionId === "socialize") {
      expectedBlocked = Boolean(before.slots <= 0 || before.money < costs.socialize);
    } else if (actionId === "rest") {
      expectedBlocked = Boolean(before.slots <= 0);
    }

    try {
      actionFn();
    } catch (error) {
      addOrIncrementFlag(
        redFlags,
        "action_error_" + actionId,
        "Action '" + actionId + "' threw an error: " + (error && error.message ? error.message : String(error))
      );
      return {
        consumedSlot: false,
        dayAdvanced: false
      };
    }

    after = getAutoplaySnapshot(state);
    consumedSlot = after.slots < before.slots;
    dayAdvanced = after.day > before.day;
    changedState = didActionChangeState(before, after);

    if (actionId === "sleep") {
      if (dayAdvanced) {
        metrics.actionCounts.sleep += 1;
      } else {
        metrics.noOpActions += 1;
      }
      return {
        consumedSlot: false,
        dayAdvanced: dayAdvanced
      };
    }

    if (consumedSlot) {
      metrics.actionCounts[actionId] += 1;
      if (actionId === "work") {
        metrics.work.executed += 1;
        metrics.work.totalMoneyDelta += (after.money - before.money);
        if (after.money > before.money) {
          metrics.work.positiveMoneyShifts += 1;
        }
      }
      if (actionId === "socialize") {
        metrics.socialize.executed += 1;
        if (
          after.relationships.locals > before.relationships.locals ||
          after.relationships.staff > before.relationships.staff ||
          after.relationships.summerPeople > before.relationships.summerPeople
        ) {
          metrics.socialize.positiveRelationshipShifts += 1;
        }
      }
    } else {
      metrics.noOpActions += 1;
      if (!changedState) {
        addOrIncrementFlag(
          redFlags,
          "noop_action_" + actionId,
          "Action '" + actionId + "' produced no state change."
        );
      }
    }

    if (expectedBlocked && consumedSlot) {
      metrics.blockedBypassCount += 1;
      addOrIncrementFlag(
        redFlags,
        "blocked_action_executed",
        "An action consumed a slot even though it should have been blocked."
      );
    }

    return {
      consumedSlot: consumedSlot,
      dayAdvanced: dayAdvanced
    };
  }

  function collectRentLogSignal(newLogEntries) {
    return newLogEntries.some(function (entry) {
      var text = String(entry || "").toLowerCase();

      if (text.indexOf("rent") < 0) {
        return false;
      }

      return (
        text.indexOf("paid") >= 0 ||
        text.indexOf("couldn") >= 0
      );
    });
  }

  function buildAutoplayRecommendations(redFlags) {
    var recommendations = [];

    function hasFlag(flagId) {
      return redFlags.some(function (entry) {
        return entry.id === flagId;
      });
    }

    if (hasFlag("invalid_money")) {
      recommendations.push("Audit money writes after actions/events; guard against NaN and Infinity at mutation points.");
    }
    if (hasFlag("reputation_out_of_bounds")) {
      recommendations.push("Clamp Town/Bar reputation on every mutation path to keep values in 0-100.");
    }
    if (hasFlag("action_slots_invalid")) {
      recommendations.push("Verify action slot consumption/reset order around day advance and sleep transitions.");
    }
    if (hasFlag("rent_missing_monday")) {
      recommendations.push("Review rent trigger cadence on Monday sleeps and ensure exactly one weekly rent check.");
    }
    if (hasFlag("rent_off_cycle")) {
      recommendations.push("Investigate rent log emissions outside Monday to avoid double charges.");
    }
    if (hasFlag("soft_lock_day")) {
      recommendations.push("Ensure at least one low-cost viable action remains when player resources are low.");
    }
    if (hasFlag("work_no_income")) {
      recommendations.push("Check work payout flow and post-shift modifiers to guarantee positive expected earnings.");
    }
    if (hasFlag("social_no_relationship_gain")) {
      recommendations.push("Recheck socialize gain paths so relationship gains happen regularly enough.");
    }
    if (hasFlag("blocked_action_executed")) {
      recommendations.push("Align backend action guards with UI disabled-state rules to prevent blocked actions executing.");
    }
    if (hasFlag("missing_hook_sleep")) {
      recommendations.push("Wire missing autoplay hooks from devtools/main so action simulation can execute safely.");
    }

    if (recommendations.length <= 0) {
      recommendations.push("No critical autoplay red flags detected in this run.");
    }

    return recommendations.slice(0, 5);
  }

  function runAutoplay(liveState, hooks, options) {
    var normalizedOptions = normalizeAutoplayOptions(options);
    var originalSnapshot = deepClone(liveState);
    var beforeStateFingerprint = stableStringify(deepClone(liveState));
    var afterStateFingerprint = "";
    var runWorkAction = hooks && typeof hooks.runWorkAction === "function" ? hooks.runWorkAction : null;
    var runEatAction = hooks && typeof hooks.runEatAction === "function" ? hooks.runEatAction : null;
    var runSocializeAction = hooks && typeof hooks.runSocializeAction === "function" ? hooks.runSocializeAction : null;
    var runRestAction = hooks && typeof hooks.runRestAction === "function" ? hooks.runRestAction : null;
    var runSleepAction = hooks && typeof hooks.runSleepAction === "function" ? hooks.runSleepAction : null;
    var applyJobAction = hooks && typeof hooks.applyJobAction === "function" ? hooks.applyJobAction : null;
    var syncHook = hooks && typeof hooks.syncWorldSeasonFromTime === "function"
      ? hooks.syncWorldSeasonFromTime
      : null;
    var redFlags = [];
    var checks = [];
    var metrics = {
      daysRequested: normalizedOptions.days,
      daysPlayed: 0,
      strategy: normalizedOptions.strategy,
      seed: normalizedOptions.seed,
      actionAttempts: {
        work: 0,
        eat: 0,
        socialize: 0,
        rest: 0,
        sleep: 0
      },
      actionCounts: {
        work: 0,
        eat: 0,
        socialize: 0,
        rest: 0,
        sleep: 0
      },
      noOpActions: 0,
      blockedBypassCount: 0,
      softLockDays: 0,
      jobApplications: 0,
      rent: {
        expectedMondays: 0,
        observedSignals: 0,
        offCycleSignals: 0
      },
      work: {
        executed: 0,
        totalMoneyDelta: 0,
        positiveMoneyShifts: 0
      },
      socialize: {
        executed: 0,
        positiveRelationshipShifts: 0
      },
      money: {
        start: liveState && liveState.player ? liveState.player.money : 0,
        end: 0,
        min: liveState && liveState.player ? liveState.player.money : 0,
        max: liveState && liveState.player ? liveState.player.money : 0
      },
      reputationTown: {
        start: getTownRep(liveState),
        end: 0,
        min: getTownRep(liveState),
        max: getTownRep(liveState)
      },
      reputationBar: {
        start: getBarRep(liveState),
        end: 0,
        min: getBarRep(liveState),
        max: getBarRep(liveState)
      },
      relationships: {
        start: getRelationshipSnapshot(liveState),
        end: null
      },
      daily: []
    };
    var report = {
      passed: 0,
      failed: 0,
      checks: [],
      redFlags: [],
      recommendations: [],
      metrics: metrics
    };
    var dayIndex;

    if (ns.rng && typeof ns.rng.setSeed === "function") {
      ns.rng.setSeed(normalizedOptions.seed);
    }

    try {
      if (!runSleepAction) {
        addOrIncrementFlag(redFlags, "missing_hook_sleep", "Missing required runSleepAction hook.");
      }
      if (!runWorkAction) {
        addOrIncrementFlag(redFlags, "missing_hook_work", "Missing runWorkAction hook; autoplay cannot validate work flow.");
      }
      if (!runSocializeAction) {
        addOrIncrementFlag(redFlags, "missing_hook_socialize", "Missing runSocializeAction hook.");
      }

      for (dayIndex = 0; dayIndex < normalizedOptions.days; dayIndex += 1) {
        var actionsConsumedToday = 0;
        var noProgressStreak = 0;
        var beforeSleepDay;
        var beforeSleepLogLen;
        var sleepResult;
        var afterSleepLogs;
        var rentSignal;
        var costs;
        var safetyCounter = 0;

        if (syncHook) {
          syncSeasonFromTime(liveState, syncHook);
        }

        ensureAutoplayJobQueued(
          liveState,
          { applyJobAction: applyJobAction },
          metrics,
          redFlags
        );

        while (liveState.time.actionSlotsRemaining > 0 && safetyCounter < 10) {
          var actionId;
          var actionResult;
          safetyCounter += 1;
          costs = getActionCostsForState(liveState);
          actionId = pickAutoplayAction(liveState, normalizedOptions.strategy, costs);
          if (!actionId) {
            break;
          }

          actionResult = runAutoplayAction(
            actionId,
            actionId === "work" ? runWorkAction :
              actionId === "eat" ? runEatAction :
              actionId === "socialize" ? runSocializeAction :
              runRestAction,
            liveState,
            costs,
            metrics,
            redFlags
          );

          if (actionResult.consumedSlot) {
            actionsConsumedToday += 1;
            noProgressStreak = 0;
          } else {
            noProgressStreak += 1;
          }

          if (noProgressStreak >= 3) {
            break;
          }
        }

        if (liveState.time.actionSlotsRemaining > 0 && actionsConsumedToday <= 0) {
          metrics.softLockDays += 1;
          addOrIncrementFlag(
            redFlags,
            "soft_lock_day",
            "Autoplay encountered a day without any viable slot-consuming actions."
          );
        }

        beforeSleepDay = getDayNumberForState(liveState);
        beforeSleepLogLen = Array.isArray(liveState.log) ? liveState.log.length : 0;
        sleepResult = runAutoplayAction(
          "sleep",
          runSleepAction,
          liveState,
          getActionCostsForState(liveState),
          metrics,
          redFlags
        );

        if (!sleepResult.dayAdvanced) {
          addOrIncrementFlag(redFlags, "sleep_no_day_advance", "Sleep did not advance day progression.");
        }

        afterSleepLogs = Array.isArray(liveState.log)
          ? liveState.log.slice(beforeSleepLogLen)
          : [];
        rentSignal = collectRentLogSignal(afterSleepLogs);
        if (liveState.time && liveState.time.weekdayIndex === 0) {
          metrics.rent.expectedMondays += 1;
          if (rentSignal) {
            metrics.rent.observedSignals += 1;
          } else {
            addOrIncrementFlag(
              redFlags,
              "rent_missing_monday",
              "No rent log signal found on expected Monday charge."
            );
          }
        } else if (rentSignal) {
          metrics.rent.offCycleSignals += 1;
          addOrIncrementFlag(redFlags, "rent_off_cycle", "Rent signal appeared outside Monday.");
        }

        if (!isFiniteNumber(liveState.player.money)) {
          addOrIncrementFlag(redFlags, "invalid_money", "Money became non-finite during autoplay.");
        }
        if (getTownRep(liveState) < 0 || getTownRep(liveState) > 100 || getBarRep(liveState) < 0 || getBarRep(liveState) > 100) {
          addOrIncrementFlag(redFlags, "reputation_out_of_bounds", "Town/Bar reputation moved out of bounds.");
        }
        if (!liveState.time || liveState.time.actionSlotsRemaining < 0 || liveState.time.actionSlotsRemaining > time.MAX_ACTION_SLOTS) {
          addOrIncrementFlag(redFlags, "action_slots_invalid", "Action slots moved outside valid range.");
        }

        metrics.money.min = Math.min(metrics.money.min, liveState.player.money);
        metrics.money.max = Math.max(metrics.money.max, liveState.player.money);
        metrics.reputationTown.min = Math.min(metrics.reputationTown.min, getTownRep(liveState));
        metrics.reputationTown.max = Math.max(metrics.reputationTown.max, getTownRep(liveState));
        metrics.reputationBar.min = Math.min(metrics.reputationBar.min, getBarRep(liveState));
        metrics.reputationBar.max = Math.max(metrics.reputationBar.max, getBarRep(liveState));
        metrics.daysPlayed += 1;

        if (normalizedOptions.verbose) {
          metrics.daily.push({
            dayIndex: dayIndex + 1,
            dayNumberBeforeSleep: beforeSleepDay,
            dayNumberAfterSleep: getDayNumberForState(liveState),
            money: liveState.player.money,
            townRep: getTownRep(liveState),
            barRep: getBarRep(liveState),
            slotsRemaining: liveState.time.actionSlotsRemaining
          });
        }
      }

      metrics.money.end = liveState.player.money;
      metrics.reputationTown.end = getTownRep(liveState);
      metrics.reputationBar.end = getBarRep(liveState);
      metrics.relationships.end = getRelationshipSnapshot(liveState);

      if (metrics.work.executed >= 5 && metrics.work.positiveMoneyShifts <= 0) {
        addOrIncrementFlag(
          redFlags,
          "work_no_income",
          "Work never produced positive money across multiple executed shifts."
        );
      }

      if (metrics.socialize.executed >= 5 && metrics.socialize.positiveRelationshipShifts <= 0) {
        addOrIncrementFlag(
          redFlags,
          "social_no_relationship_gain",
          "Socialize never produced relationship gains across multiple attempts."
        );
      }

      addResult(
        checks,
        "Autoplay hooks availability",
        !redFlags.some(function (entry) { return entry.id.indexOf("missing_hook_") === 0; }),
        "missingHooks=" + redFlags
          .filter(function (entry) { return entry.id.indexOf("missing_hook_") === 0; })
          .map(function (entry) { return entry.id; })
          .join(", ")
      );
      addResult(
        checks,
        "Money remained finite",
        !redFlags.some(function (entry) { return entry.id === "invalid_money"; }),
        "range=$" + metrics.money.min + " to $" + metrics.money.max
      );
      addResult(
        checks,
        "Reputation bounds respected",
        !redFlags.some(function (entry) { return entry.id === "reputation_out_of_bounds"; }),
        "Town " + metrics.reputationTown.min + "-" + metrics.reputationTown.max +
          ", Bar " + metrics.reputationBar.min + "-" + metrics.reputationBar.max
      );
      addResult(
        checks,
        "Action slots stayed valid",
        !redFlags.some(function (entry) { return entry.id === "action_slots_invalid"; }),
        "no invalid slot values detected"
      );
      addResult(
        checks,
        "Weekly rent cadence",
        !redFlags.some(function (entry) {
          return entry.id === "rent_missing_monday" || entry.id === "rent_off_cycle";
        }),
        "expectedMondays=" + metrics.rent.expectedMondays +
          ", observedSignals=" + metrics.rent.observedSignals +
          ", offCycleSignals=" + metrics.rent.offCycleSignals
      );
      addResult(
        checks,
        "No blocked action bypass",
        metrics.blockedBypassCount === 0,
        "blockedBypassCount=" + metrics.blockedBypassCount
      );
      addResult(
        checks,
        "No soft-lock days",
        metrics.softLockDays === 0,
        "softLockDays=" + metrics.softLockDays
      );
      addResult(
        checks,
        "Work produced positive earnings",
        metrics.work.executed <= 0 || metrics.work.positiveMoneyShifts > 0,
        "executed=" + metrics.work.executed + ", positiveShifts=" + metrics.work.positiveMoneyShifts
      );
      addResult(
        checks,
        "Socialize produced relationship gains",
        metrics.socialize.executed <= 0 || metrics.socialize.positiveRelationshipShifts > 0,
        "executed=" + metrics.socialize.executed +
          ", positiveShifts=" + metrics.socialize.positiveRelationshipShifts
      );
    } catch (error) {
      addResult(
        checks,
        "Autoplay runner execution",
        false,
        error && error.message ? error.message : String(error)
      );
      addOrIncrementFlag(redFlags, "autoplay_runtime_error", "Autoplay runner encountered an exception.");
    } finally {
      if (ns.rng && typeof ns.rng.reset === "function") {
        ns.rng.reset();
      }
      replaceStateInPlace(liveState, originalSnapshot);
      afterStateFingerprint = stableStringify(deepClone(liveState));
      addResult(
        checks,
        "State restore integrity",
        beforeStateFingerprint === afterStateFingerprint,
        beforeStateFingerprint === afterStateFingerprint
          ? "state restored exactly"
          : "State mismatch after restore (snapshot/restore incomplete)"
      );
    }

    report.checks = checks;
    report.redFlags = redFlags;
    report.recommendations = buildAutoplayRecommendations(redFlags);
    report.passed = checks.filter(function (entry) {
      return entry.ok;
    }).length;
    report.failed = checks.filter(function (entry) {
      return !entry.ok;
    }).length;

    return report;
  }

  ns.smokeTests = {
    runSmokeTests: runSmokeTests
  };
  ns.playtest = {
    runAutoplay: runAutoplay
  };
})(window);
