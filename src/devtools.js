(function (global) {
  var ns = global.BlockIsland = global.BlockIsland || {};
  var DEV_MODE_KEY = "blockIsland.devMode";
  var stateApi = ns.state;
  var jobs = ns.jobs;
  var reputation = ns.reputation;
  var housing = ns.housing;
  var storage = ns.storage;
  var smokeTests = ns.smokeTests;
  var playtest = ns.playtest;
  var time = ns.time;

  function isDevModeEnabled() {
    try {
      return localStorage.getItem(DEV_MODE_KEY) === "1";
    } catch (error) {
      console.warn("[Block Island] Failed to read dev mode setting.", error);
      return false;
    }
  }

  function setDevModeEnabled(enabled) {
    try {
      localStorage.setItem(DEV_MODE_KEY, enabled ? "1" : "0");
      return true;
    } catch (error) {
      console.warn("[Block Island] Failed to persist dev mode setting.", error);
      return false;
    }
  }

  function clampSocialValue(value) {
    return Math.max(0, Math.min(100, Math.floor(value)));
  }

  function setSocialValue(state, key, value) {
    if (stateApi && typeof stateApi.setRelationshipValue === "function") {
      stateApi.setRelationshipValue(state, key, value);
      return;
    }

    if (!state.relationships || typeof state.relationships !== "object") {
      state.relationships = stateApi.createInitialSocialState();
    }

    state.relationships[key] = clampSocialValue(value);
    if (!state.player.social || state.player.social !== state.relationships) {
      state.player.social = state.relationships;
    }
  }

  function ensureFlags(state) {
    if (!state.flags || typeof state.flags !== "object") {
      state.flags = stateApi.createInitialFlagsState();
    }
  }

  function runNonResetAction(state, actionId) {
    var requirements;
    var unlockedIds;
    var unlockedNames;
    var entry;

    switch (actionId) {
      case "add_money_100":
        state.player.money += 100;
        return "[DEV] Added $100.";
      case "add_money_1000":
        state.player.money += 1000;
        return "[DEV] Added $1000.";
      case "set_rep_100":
        if (reputation && typeof reputation.setTownReputation === "function") {
          reputation.setTownReputation(state, 100);
        } else {
          state.player.reputation = reputation.clampReputation(100);
          state.player.reputationTown = state.player.reputation;
        }
        return "[DEV] Town Rep set to 100.";
      case "set_locals_60":
        setSocialValue(state, "locals", 60);
        return "[DEV] Locals relationship set to 60.";
      case "set_locals_85":
        setSocialValue(state, "locals", 85);
        return "[DEV] Locals relationship set to 85.";
      case "set_staff_60":
        setSocialValue(state, "staff", 60);
        return "[DEV] Seasonal Staff relationship set to 60.";
      case "set_staff_85":
        setSocialValue(state, "staff", 85);
        return "[DEV] Seasonal Staff relationship set to 85.";
      case "set_tourists_50":
        setSocialValue(state, "tourists", 50);
        return "[DEV] Summer People relationship set to 50.";
      case "set_tourists_80":
        setSocialValue(state, "tourists", 80);
        return "[DEV] Summer People relationship set to 80.";
      case "jump_job_l5_unlock":
        entry = state.jobs.list.halls_mowing_crew;
        if (!entry) return "[DEV] Could not find Hall's Mowing Crew in jobs list.";

        entry.level = jobs.MAX_JOB_LEVEL;
        entry.promotionProgress = jobs.PROMOTION_THRESHOLD;
        jobs.setActiveJob(state, "halls_mowing_crew");
        unlockedIds = jobs.syncUnlockedJobs(state);
        ensureFlags(state);
        if (unlockedIds.length > 0) {
          state.flags.seenUnlockedOpportunities = false;
        }
        unlockedNames = unlockedIds.map(function (jobId) {
          return jobs.getJobName(jobId);
        });
        if (unlockedNames.length > 0) {
          return "[DEV] Hall's Mowing Crew set to Level 5. Unlocked: " + unlockedNames.join(", ") + ".";
        }
        return "[DEV] Hall's Mowing Crew set to Level 5.";
      case "jump_shared_house_ready":
        requirements = housing.SHARED_HOUSE_REQUIREMENTS || { money: 3000, reputation: 20 };
        state.player.money = Math.max(state.player.money, requirements.money);
        if (reputation && typeof reputation.setTownReputation === "function") {
          reputation.setTownReputation(
            state,
            Math.max(reputation.getTownReputation(state), requirements.reputation)
          );
        } else {
          state.player.reputation = Math.max(state.player.reputation, requirements.reputation);
          state.player.reputationTown = state.player.reputation;
        }
        return "[DEV] Set money and reputation to Shared House requirements.";
      case "jump_sunday_night":
        state.time.weekdayIndex = 6;
        state.time.actionSlotsRemaining = 0;
        return "[DEV] Time set to Sunday night. Next sleep will charge rent.";
      case "jump_set_season_summer":
        state.time.seasonIndex = 1;
        if (time && typeof time.DAYS_PER_SEASON === "number") {
          state.time.day = Math.max(1, Math.min(state.time.day, time.DAYS_PER_SEASON));
        }
        if (!state.world || typeof state.world !== "object") {
          state.world = {};
        }
        state.world.season = "summer";
        return "[DEV] Season set to Summer.";
      default:
        return "";
    }
  }

  function clearGameSave() {
    if (storage && typeof storage.clearSavedState === "function") {
      storage.clearSavedState();
      return;
    }

    if (storage && storage.STORAGE_KEY) {
      localStorage.removeItem(storage.STORAGE_KEY);
    }
  }

  function initDevTools(stateOrGetter, hooks) {
    var getState = typeof stateOrGetter === "function" ?
      stateOrGetter :
      function () {
        return stateOrGetter;
      };
    var onStateChanged = hooks && typeof hooks.onStateChanged === "function" ?
      hooks.onStateChanged :
      function () {};
    var onLog = hooks && typeof hooks.onLog === "function" ?
      hooks.onLog :
      function () {};
    var runWorkAction = hooks && typeof hooks.runWorkAction === "function" ?
      hooks.runWorkAction :
      null;
    var runSocializeAction = hooks && typeof hooks.runSocializeAction === "function" ?
      hooks.runSocializeAction :
      null;
    var runEatAction = hooks && typeof hooks.runEatAction === "function" ?
      hooks.runEatAction :
      null;
    var runRestAction = hooks && typeof hooks.runRestAction === "function" ?
      hooks.runRestAction :
      null;
    var runSleepAction = hooks && typeof hooks.runSleepAction === "function" ?
      hooks.runSleepAction :
      null;
    var applyJobAction = hooks && typeof hooks.applyJobAction === "function" ?
      hooks.applyJobAction :
      null;
    var syncWorldSeasonFromTime = hooks && typeof hooks.syncWorldSeasonFromTime === "function" ?
      hooks.syncWorldSeasonFromTime :
      null;

    function deepClone(value) {
      return JSON.parse(JSON.stringify(value));
    }

    function restoreState(target, snapshot) {
      Object.keys(target).forEach(function (key) {
        delete target[key];
      });
      Object.keys(snapshot).forEach(function (key) {
        target[key] = deepClone(snapshot[key]);
      });
    }

    function collectNewLogLines(state, beforeLength) {
      if (!Array.isArray(state.log)) return [];
      return state.log.slice(beforeLength).map(function (entry) {
        return String(entry || "").trim();
      }).filter(function (entry) {
        return Boolean(entry);
      });
    }

    function runSmokeTestsAction(state) {
      var report;

      if (!smokeTests || typeof smokeTests.runSmokeTests !== "function") {
        onLog("[DEV] Smoke tests module is unavailable.");
        return true;
      }

      report = smokeTests.runSmokeTests(state, {
        runWorkAction: runWorkAction,
        runSocializeAction: runSocializeAction,
        runSleepAction: runSleepAction,
        syncWorldSeasonFromTime: syncWorldSeasonFromTime
      });

      report.results.forEach(function (entry) {
        if (entry.ok) {
          onLog("\u2705 PASS: " + entry.name + (entry.details ? " - " + entry.details : ""));
        } else {
          onLog("\u274C FAIL: " + entry.name + (entry.details ? " - " + entry.details : ""));
        }
      });
      onLog("SMOKE TESTS: " + report.passed + " passed, " + report.failed + " failed");

      if (global.console && typeof global.console.groupCollapsed === "function") {
        global.console.groupCollapsed("[DEV] Smoke Tests: " + report.passed + " passed, " + report.failed + " failed");
        report.results.forEach(function (entry) {
          if (entry.ok) {
            global.console.info("PASS", entry.name, entry.details || "");
          } else {
            global.console.error("FAIL", entry.name, entry.details || "");
          }
        });
        global.console.groupEnd();
      }

      return true;
    }

    function runAutoplayAction(state, options) {
      var report;
      var summaryLine;
      var logPrefix = "[DEV][AUTOPLAY] ";

      if (!playtest || typeof playtest.runAutoplay !== "function") {
        onLog("[DEV] Autoplay module is unavailable.");
        return false;
      }

      report = playtest.runAutoplay(state, {
        runWorkAction: runWorkAction,
        runEatAction: runEatAction,
        runSocializeAction: runSocializeAction,
        runRestAction: runRestAction,
        runSleepAction: runSleepAction,
        applyJobAction: applyJobAction,
        syncWorldSeasonFromTime: syncWorldSeasonFromTime
      }, options || { days: 30, strategy: "balanced", seed: 12345, verbose: false });

      report.checks.forEach(function (entry) {
        if (entry.ok) {
          onLog(logPrefix + "\u2705 PASS: " + entry.name + (entry.details ? " - " + entry.details : ""));
        } else {
          onLog(logPrefix + "\u274C FAIL: " + entry.name + (entry.details ? " - " + entry.details : ""));
        }
      });
      summaryLine =
        "AUTOPLAY: " +
        report.passed + " passed, " +
        report.failed + " failed" +
        " (" + (report.metrics && report.metrics.daysPlayed ? report.metrics.daysPlayed : 0) +
        " days, " + ((report.metrics && report.metrics.strategy) || "balanced") + ")";
      onLog(logPrefix + summaryLine);

      if (Array.isArray(report.recommendations) && report.recommendations.length > 0) {
        onLog(logPrefix + "Top recommendations:");
        report.recommendations.slice(0, 5).forEach(function (line, index) {
          onLog(logPrefix + (index + 1) + ". " + line);
        });
      }

      if (global.console && typeof global.console.groupCollapsed === "function") {
        global.console.groupCollapsed("[DEV] " + summaryLine);
        global.console.table(report.checks);
        global.console.info("Red Flags:", report.redFlags);
        global.console.info("Recommendations:", report.recommendations);
        global.console.info("Metrics:", report.metrics);
        global.console.groupEnd();
      }

      return true;
    }

    function runMessageAuditAction(state, options) {
      var auditApi = ns.devMessageAudit;
      var jobsApi = ns.jobs;
      var housingApi = ns.housing;
      var timeApi = ns.time;
      var defaultOptions = auditApi && auditApi.DEFAULT_OPTIONS ? auditApi.DEFAULT_OPTIONS : {};
      var settings = {
        iterationsPerJob: options && typeof options.iterationsPerJob === "number"
          ? Math.max(1, Math.floor(options.iterationsPerJob))
          : (typeof defaultOptions.iterationsPerJob === "number" ? defaultOptions.iterationsPerJob : 50),
        includeSeasonSweep: options && typeof options.includeSeasonSweep === "boolean"
          ? options.includeSeasonSweep
          : (typeof defaultOptions.includeSeasonSweep === "boolean" ? defaultOptions.includeSeasonSweep : true),
        includeNeedsSweep: options && typeof options.includeNeedsSweep === "boolean"
          ? options.includeNeedsSweep
          : (typeof defaultOptions.includeNeedsSweep === "boolean" ? defaultOptions.includeNeedsSweep : true),
        seasonSweepIterations: options && typeof options.seasonSweepIterations === "number"
          ? Math.max(1, Math.floor(options.seasonSweepIterations))
          : (typeof defaultOptions.seasonSweepIterations === "number" ? defaultOptions.seasonSweepIterations : 10),
        needsSweepIterations: options && typeof options.needsSweepIterations === "number"
          ? Math.max(1, Math.floor(options.needsSweepIterations))
          : (typeof defaultOptions.needsSweepIterations === "number" ? defaultOptions.needsSweepIterations : 5)
      };
      var originalSnapshot = deepClone(state);
      var restoreFingerprint = JSON.stringify(originalSnapshot);
      var catalog = auditApi && typeof auditApi.createMessageCatalog === "function"
        ? auditApi.createMessageCatalog({ jobs: jobsApi, events: ns.events })
        : [];
      var jobIds;
      var findings = [];
      var messageCounts = {};
      var summaryByJob = {};

      function seasonIdFromIndex(index) {
        if (timeApi && typeof timeApi.getSeasonId === "function") {
          return timeApi.getSeasonId(index);
        }
        return ["spring", "summer", "fall", "winter"][index] || "spring";
      }

      function pushFinding(jobId, jobName, finding, message, context) {
        var key = jobId || "none";

        findings.push({
          jobId: key,
          jobName: jobName || "No Job",
          severity: finding.severity,
          ruleId: finding.ruleId,
          details: finding.details,
          message: message,
          context: {
            jobId: context.jobId || "",
            venueType: context.venueType || "",
            season: context.season || "",
            needs: context.needs || { energy: 0, hunger: 0, social: 0 },
            moneyDelta: context.moneyDelta || 0,
            repDeltaTown: context.repDeltaTown || 0,
            repDeltaBar: context.repDeltaBar || 0,
            actionType: context.actionType || "",
            rentDue: Boolean(context.rentDue)
          }
        });

        if (!summaryByJob[key]) {
          summaryByJob[key] = { jobName: jobName || "No Job", FAIL: 0, WARN: 0 };
        }
        summaryByJob[key][finding.severity] += 1;
      }

      function captureActionLogs(jobId, actionType, beforeState, beforeLogLength) {
        var lines = collectNewLogLines(state, beforeLogLength);
        var profile = auditApi && typeof auditApi.getJobProfile === "function"
          ? auditApi.getJobProfile(jobsApi, jobId)
          : { isTipped: false, tipModel: "none", venueType: "service" };
        var context = {
          jobId: jobId,
          venueType: profile.venueType,
          season: state.world && state.world.season ? String(state.world.season).toLowerCase() : "spring",
          profile: profile,
          needs: {
            energy: state.player.needs.energy,
            hunger: state.player.needs.hunger,
            social: state.player.needs.social
          },
          moneyDelta: Math.floor((state.player.money || 0) - (beforeState.player.money || 0)),
          repDeltaTown: Math.floor((state.player.reputationTown || 0) - (beforeState.player.reputationTown || 0)),
          repDeltaBar: Math.floor((state.player.reputationBar || 0) - (beforeState.player.reputationBar || 0)),
          actionType: actionType,
          rentDue: actionType === "sleep" && state.time && state.time.weekdayIndex === 0
        };

        lines.forEach(function (line) {
          var rules = auditApi && typeof auditApi.evaluateMessageAgainstRules === "function"
            ? auditApi.evaluateMessageAgainstRules({ message: line, context: context, catalog: catalog })
            : [];

          messageCounts[line] = (messageCounts[line] || 0) + 1;

          rules.forEach(function (rule) {
            pushFinding(jobId, jobsApi.getJobName(jobId), rule, line, context);
          });
        });
      }

      function runWithContext(jobId, actionType, beforeActionMutator, actionRunner) {
        var beforeLogLength;
        var beforeState;
        if (typeof beforeActionMutator === "function") {
          beforeActionMutator();
        }
        beforeState = deepClone(state);
        beforeLogLength = Array.isArray(state.log) ? state.log.length : 0;
        actionRunner();
        captureActionLogs(jobId, actionType, beforeState, beforeLogLength);
      }

      function setupJob(jobId) {
        restoreState(state, originalSnapshot);
        state.player.money = Math.max(20000, state.player.money || 0);
        if (state.jobs && state.jobs.list && state.jobs.list[jobId]) {
          state.jobs.list[jobId].level = 3;
          state.jobs.list[jobId].promotionProgress = 0;
        }
        if (jobsApi && typeof jobsApi.setActiveJob === "function") {
          jobsApi.setActiveJob(state, jobId);
        }
      }

      if (!auditApi || !jobsApi || typeof jobsApi.getAllJobIds !== "function") {
        onLog("[DEV][AUDIT] Message audit dependencies unavailable.");
        return false;
      }

      jobIds = jobsApi.getAllJobIds();

      jobIds.forEach(function (jobId) {
        var i;
        setupJob(jobId);

        for (i = 0; i < settings.iterationsPerJob; i += 1) {
          runWithContext(jobId, "work", null, function () {
            if (typeof runWorkAction === "function") runWorkAction();
          });
          runWithContext(jobId, "socialize", null, function () {
            if (typeof runSocializeAction === "function") runSocializeAction();
          });
          runWithContext(jobId, "eat", null, function () {
            if (typeof runEatAction === "function") runEatAction();
          });
          runWithContext(jobId, "rest", null, function () {
            if (typeof runRestAction === "function") runRestAction();
          });
          runWithContext(jobId, "sleep", null, function () {
            if (typeof runSleepAction === "function") runSleepAction();
          });
        }

        if (settings.includeSeasonSweep) {
          [0, 1, 2, 3].forEach(function (seasonIndex) {
            for (i = 0; i < settings.seasonSweepIterations; i += 1) {
              runWithContext(jobId, "work", function () {
                state.time.seasonIndex = seasonIndex;
                if (syncWorldSeasonFromTime) syncWorldSeasonFromTime();
                if (!state.world || typeof state.world !== "object") state.world = {};
                state.world.season = seasonIdFromIndex(seasonIndex);
              }, function () {
                if (typeof runWorkAction === "function") runWorkAction();
              });
            }
          });
        }

        if (settings.includeNeedsSweep) {
          for (i = 0; i < settings.needsSweepIterations; i += 1) {
            runWithContext(jobId, "work", function () {
              state.player.needs.energy = 5;
              state.player.needs.hunger = 5;
            }, function () {
              if (typeof runWorkAction === "function") runWorkAction();
            });
            runWithContext(jobId, "rest", function () {
              state.player.needs.energy = 95;
              state.player.needs.hunger = 95;
            }, function () {
              if (typeof runRestAction === "function") runRestAction();
            });
          }
        }
      });

      restoreState(state, originalSnapshot);

      var postRestoreFingerprint = JSON.stringify(state);
      if (postRestoreFingerprint !== restoreFingerprint) {
        onLog("[DEV][AUDIT] WARN: state restore fingerprint mismatch after audit.");
      } else {
        onLog("[DEV][AUDIT] State restore integrity confirmed.");
      }

      onLog("[DEV][AUDIT] Catalog entries: " + catalog.length + ".");
      onLog("[DEV][AUDIT] Completed matrix run: " + jobIds.length + " jobs.");

      jobIds.forEach(function (jobId) {
        var bucket = summaryByJob[jobId] || { FAIL: 0, WARN: 0 };
        onLog("[DEV][AUDIT] Job " + jobsApi.getJobName(jobId) + " — FAIL: " + bucket.FAIL + ", WARN: " + bucket.WARN);
      });

      if (global.console && typeof global.console.groupCollapsed === "function") {
        var grouped = {};
        findings.forEach(function (item) {
          var groupKey = item.jobName + " :: " + item.ruleId;
          if (!grouped[groupKey]) grouped[groupKey] = [];
          grouped[groupKey].push(item);
        });

        global.console.groupCollapsed("[DEV] Message Audit Catalog");
        global.console.table(catalog);
        global.console.groupEnd();

        global.console.groupCollapsed("[DEV] Message Audit Findings");
        Object.keys(grouped).forEach(function (groupKey) {
          var sample = grouped[groupKey][0];
          global.console.log(groupKey, {
            severity: sample.severity,
            count: grouped[groupKey].length,
            exampleMessage: sample.message,
            context: sample.context
          });
        });
        global.console.groupEnd();

        global.console.groupCollapsed("[DEV] Message Audit Top 10 Issues");
        var top = Object.keys(grouped)
          .map(function (k) { return { key: k, count: grouped[k].length, sample: grouped[k][0] }; })
          .sort(function (a, b) { return b.count - a.count; })
          .slice(0, 10);
        global.console.table(top.map(function (entry) {
          return {
            Group: entry.key,
            Count: entry.count,
            Severity: entry.sample.severity,
            Example: entry.sample.message
          };
        }));
        global.console.groupEnd();
      }

      return true;
    }

    function runEconomySimulationAuditAction(state, options) {
      var simulationRuns = options && typeof options.runs === "number"
        ? Math.max(1, Math.floor(options.runs))
        : 500;
      var simulationDays = options && typeof options.days === "number"
        ? Math.max(90, Math.floor(options.days))
        : 90;
      var originalSnapshot = deepClone(state);
      var restoreFingerprint = JSON.stringify(originalSnapshot);
      var runs = [];
      var passFailFlags = [];
      var warnFlags = [];
      var summary;

      function chooseBestAffordableHousingId(currentState) {
        var optionsIds;
        var bestId = "";

        if (!housing || typeof housing.getAvailableHousingOptionIds !== "function") {
          return "";
        }

        optionsIds = housing.getAvailableHousingOptionIds(currentState);
        optionsIds.sort(function (a, b) {
          var tierA = housing.getHousingTier(a);
          var tierB = housing.getHousingTier(b);
          var rentA = housing.getWeeklyRent(a);
          var rentB = housing.getWeeklyRent(b);

          if (tierA !== tierB) return tierB - tierA;
          return rentA - rentB;
        });

        if (optionsIds.length > 0) {
          bestId = optionsIds[0];
        }

        return bestId;
      }

      function chooseBestUnlockedJobId(currentState) {
        var jobIds;
        var bestJobId = "";
        var bestPay = -1;

        if (!jobs || typeof jobs.getAllJobIds !== "function") {
          return "";
        }

        jobIds = jobs.getAllJobIds();
        jobIds.forEach(function (jobId) {
          var definition;

          if (!jobs.isJobUnlocked(currentState, jobId)) return;
          definition = jobs.JOBS[jobId];
          if (!definition) return;

          if (definition.basePay > bestPay) {
            bestPay = definition.basePay;
            bestJobId = jobId;
          }
        });

        return bestJobId;
      }

      function summarizeRun(run) {
        var moneyFirst30 = run.moneyOverTime.slice(0, 30);
        var moneyLast30 = run.moneyOverTime.slice(-30);
        var first30Slope = moneyFirst30.length > 1
          ? (moneyFirst30[moneyFirst30.length - 1] - moneyFirst30[0]) / moneyFirst30.length
          : 0;
        var last30Slope = moneyLast30.length > 1
          ? (moneyLast30[moneyLast30.length - 1] - moneyLast30[0]) / moneyLast30.length
          : 0;
        var finalRent = run.dailyRentEquivalent.length > 0
          ? run.dailyRentEquivalent[run.dailyRentEquivalent.length - 1]
          : 0;
        var avgNetAfter60 = run.dailyNetByDay.length > 60
          ? run.dailyNetByDay.slice(60).reduce(function (sum, value) { return sum + value; }, 0) /
              run.dailyNetByDay.slice(60).length
          : run.averageDailySurplus;
        var minMoneyAfter60 = run.moneyOverTime.length > 60
          ? Math.min.apply(null, run.moneyOverTime.slice(60))
          : Math.min.apply(null, run.moneyOverTime);
        var permanentlyWealthy = minMoneyAfter60 > finalRent * 14 && avgNetAfter60 > 0;
        var povertyLoop = run.missedRentCount >= 3 && minMoneyAfter60 <= finalRent * 7 && avgNetAfter60 <= 0;
        var rentIrrelevantLateGame = run.rentBurdenPercentLateGame < 5;
        var possibleInfiniteGrowth = run.maxMoneyReached >= 50000 && last30Slope > 150 && last30Slope > first30Slope * 1.5;
        var stableIncomeAfter60 = avgNetAfter60 > finalRent;

        if (possibleInfiniteGrowth) {
          passFailFlags.push("FAIL: Run " + run.run + " shows unconstrained late-game money growth.");
        }
        if (run.daysToFirstHousingUpgrade > 0 && run.daysToFirstHousingUpgrade < 30) {
          passFailFlags.push("FAIL: Run " + run.run + " reaches first housing upgrade in " + run.daysToFirstHousingUpgrade + " days (<30).");
        }
        if (!stableIncomeAfter60) {
          passFailFlags.push("FAIL: Run " + run.run + " does not achieve stable income above rent-equivalent after day 60.");
        }
        if (run.daysToFirstHousingUpgrade > 60 || run.daysToFirstHousingUpgrade === -1) {
          warnFlags.push("WARN: Run " + run.run + " housing progression is slow (" + (run.daysToFirstHousingUpgrade === -1 ? "no upgrade" : run.daysToFirstHousingUpgrade + " days") + ").");
        }
        if (run.housingProgression.length > 1 && run.rentBurdenPercentLateGame < 8) {
          warnFlags.push("WARN: Run " + run.run + " rent becomes comparatively trivial after upgrade.");
        }

        run.permanentlyWealthy = permanentlyWealthy;
        run.povertyLoop = povertyLoop;
        run.rentIrrelevantLateGame = rentIrrelevantLateGame;
      }

      function runSingleSimulation(runIndex) {
        var dayIndex;
        var run = {
          run: runIndex + 1,
          moneyOverTime: [],
          reputationProgression: [],
          dailyRentEquivalent: [],
          dailyNetByDay: [],
          jobProgression: [],
          housingProgression: [],
          rentBurdenPercent: 0,
          rentBurdenPercentLateGame: 0,
          averageDailySurplus: 0,
          averageDailySurplusLateGame: 0,
          totalRentPaid: 0,
          totalGrossIncome: 0,
          missedRentCount: 0,
          maxMoneyReached: 0,
          daysToFirstHousingUpgrade: -1
        };

        restoreState(state, originalSnapshot);
        if (ns.rng && typeof ns.rng.setSeed === "function") {
          ns.rng.setSeed(1000 + runIndex);
        }

        for (dayIndex = 1; dayIndex <= simulationDays; dayIndex += 1) {
          var dayStartMoney = state.player.money;
          var rentDueTonight = state.time.weekdayIndex === 6;
          var rentTonight = rentDueTonight && housing && typeof housing.getEffectiveWeeklyRent === "function"
            ? housing.getEffectiveWeeklyRent(state)
            : 0;
          var housingBefore = state.housing.current;
          var currentJob = state.jobs.activeJobId;
          var currentJobLevel = currentJob && state.jobs.list[currentJob]
            ? state.jobs.list[currentJob].level
            : 0;
          var housingId;
          var bestJobId;

          if (!currentJob && !state.jobs.pendingJobId && typeof applyJobAction === "function") {
            bestJobId = chooseBestUnlockedJobId(state);
            if (bestJobId) {
              applyJobAction(bestJobId);
            }
          }

          housingId = chooseBestAffordableHousingId(state);
          if (housingId && housing && typeof housing.setPendingMoveTarget === "function") {
            housing.setPendingMoveTarget(housingId);
            if (housing.canMoveToSharedHouse(state)) {
              housing.moveToSharedHouse(state);
            }
          }

          if (typeof runWorkAction === "function") runWorkAction();
          if (state.player.needs.hunger < 45 || state.player.needs.energy < 35) {
            if (typeof runEatAction === "function") runEatAction();
          } else if (typeof runSocializeAction === "function") {
            runSocializeAction();
          }
          if (state.player.needs.energy < 25) {
            if (typeof runRestAction === "function") runRestAction();
          } else if (typeof runWorkAction === "function") {
            runWorkAction();
          }
          if (typeof runSleepAction === "function") runSleepAction();

          if (state.jobs.activeJobId && state.jobs.activeJobId !== currentJob) {
            run.jobProgression.push("Day " + dayIndex + ": " + jobs.getJobName(state.jobs.activeJobId) + " (L" + state.jobs.list[state.jobs.activeJobId].level + ")");
          } else if (state.jobs.activeJobId && state.jobs.list[state.jobs.activeJobId].level !== currentJobLevel) {
            run.jobProgression.push("Day " + dayIndex + ": " + jobs.getJobName(state.jobs.activeJobId) + " promoted to L" + state.jobs.list[state.jobs.activeJobId].level);
          }

          if (state.housing.current !== housingBefore) {
            run.housingProgression.push("Day " + dayIndex + ": " + housing.getHousingLabel(state.housing.current));
            if (run.daysToFirstHousingUpgrade < 0) {
              run.daysToFirstHousingUpgrade = dayIndex;
            }
          }

          if (rentDueTonight && rentTonight > 0) {
            if (dayStartMoney + 1 <= state.player.money || dayStartMoney >= rentTonight) {
              if (state.player.money <= Math.max(0, dayStartMoney - rentTonight + 1)) {
                run.totalRentPaid += rentTonight;
              }
            }
            if (state.player.money === 0 && dayStartMoney < rentTonight) {
              run.missedRentCount += 1;
            }
          }

          run.moneyOverTime.push(state.player.money);
          run.maxMoneyReached = Math.max(run.maxMoneyReached, state.player.money);
          run.reputationProgression.push(reputation && typeof reputation.getTownReputation === "function"
            ? reputation.getTownReputation(state)
            : Math.max(0, Math.floor(state.player.reputationTown || state.player.reputation || 0)));
          run.dailyRentEquivalent.push((housing && typeof housing.getEffectiveWeeklyRent === "function"
            ? housing.getEffectiveWeeklyRent(state)
            : 0) / 7);
          run.dailyNetByDay.push(state.player.money - dayStartMoney);

          bestJobId = chooseBestUnlockedJobId(state);
          if (
            bestJobId &&
            bestJobId !== state.jobs.activeJobId &&
            !state.jobs.pendingJobId &&
            typeof applyJobAction === "function"
          ) {
            applyJobAction(bestJobId);
          }
        }

        run.totalGrossIncome = run.dailyNetByDay.reduce(function (sum, value) {
          return sum + Math.max(0, value);
        }, 0);
        run.averageDailySurplus = run.dailyNetByDay.reduce(function (sum, value) {
          return sum + value;
        }, 0) / run.dailyNetByDay.length;
        run.averageDailySurplusLateGame = run.dailyNetByDay.slice(60).reduce(function (sum, value) {
          return sum + value;
        }, 0) / Math.max(1, run.dailyNetByDay.slice(60).length);
        run.rentBurdenPercent = run.totalGrossIncome > 0
          ? (run.totalRentPaid / run.totalGrossIncome) * 100
          : 0;
        run.rentBurdenPercentLateGame = run.dailyNetByDay.length > 60
          ? (run.totalRentPaid / Math.max(1, run.dailyNetByDay.slice(60).reduce(function (sum, value) {
              return sum + Math.max(0, value);
            }, 0))) * 100
          : run.rentBurdenPercent;

        if (run.jobProgression.length === 0 && state.jobs.activeJobId) {
          run.jobProgression.push("Day 1: " + jobs.getJobName(state.jobs.activeJobId) + " (L" + state.jobs.list[state.jobs.activeJobId].level + ")");
        }
        if (run.housingProgression.length === 0) {
          run.housingProgression.push("Day 1: " + housing.getHousingLabel(state.housing.current));
        }

        summarizeRun(run);
        runs.push(run);
      }

      function formatRunLogLine(run) {
        return "[DEV][ECON-AUDIT][Run " + run.run + "]" +
          " money(start/end/max): $" + originalSnapshot.player.money + "/$" +
          run.moneyOverTime[run.moneyOverTime.length - 1] + "/$" + run.maxMoneyReached +
          " | first housing upgrade day: " + (run.daysToFirstHousingUpgrade > 0 ? run.daysToFirstHousingUpgrade : "none") +
          " | rent burden: " + run.rentBurdenPercent.toFixed(1) + "%" +
          " | avg daily surplus: " + run.averageDailySurplus.toFixed(1) +
          " | wealthy=" + (run.permanentlyWealthy ? "yes" : "no") +
          " | povertyLoop=" + (run.povertyLoop ? "yes" : "no");
      }

      function calculateSummary() {
        var runsWithUpgrade = runs.filter(function (run) {
          return run.daysToFirstHousingUpgrade > 0;
        });
        var wealthyRuns = runs.filter(function (run) { return run.permanentlyWealthy; }).length;
        var povertyRuns = runs.filter(function (run) { return run.povertyLoop; }).length;
        var rentIrrelevantRuns = runs.filter(function (run) { return run.rentIrrelevantLateGame; }).length;

        return {
          averageTimeToFirstHousingUpgrade: runsWithUpgrade.length > 0
            ? runsWithUpgrade.reduce(function (sum, run) { return sum + run.daysToFirstHousingUpgrade; }, 0) / runsWithUpgrade.length
            : -1,
          averageMaxMoneyReached: runs.reduce(function (sum, run) {
            return sum + run.maxMoneyReached;
          }, 0) / Math.max(1, runs.length),
          canBecomePermanentlyWealthy: wealthyRuns > (runs.length * 0.5),
          everStuckInPovertyLoop: povertyRuns > 0,
          rentBecomesIrrelevantLateGame: rentIrrelevantRuns > (runs.length * 0.5),
          runCount: runs.length,
          failCount: passFailFlags.length,
          warnCount: warnFlags.length
        };
      }

      onLog("[DEV][ECON-AUDIT] Starting economy simulation audit: " + simulationRuns + " runs, " + simulationDays + " days each.");

      for (var runIndex = 0; runIndex < simulationRuns; runIndex += 1) {
        runSingleSimulation(runIndex);
      }

      summary = calculateSummary();

      runs.forEach(function (run) {
        onLog(formatRunLogLine(run));
      });

      onLog("[DEV][ECON-AUDIT] Summary:");
      onLog("[DEV][ECON-AUDIT] Avg time to first housing upgrade: " +
        (summary.averageTimeToFirstHousingUpgrade < 0 ? "No upgrades" : summary.averageTimeToFirstHousingUpgrade.toFixed(1) + " days"));
      onLog("[DEV][ECON-AUDIT] Avg max money reached: $" + summary.averageMaxMoneyReached.toFixed(0));
      onLog("[DEV][ECON-AUDIT] Can become permanently wealthy: " + (summary.canBecomePermanentlyWealthy ? "YES" : "NO"));
      onLog("[DEV][ECON-AUDIT] Poverty loop observed: " + (summary.everStuckInPovertyLoop ? "YES" : "NO"));
      onLog("[DEV][ECON-AUDIT] Rent irrelevant late game: " + (summary.rentBecomesIrrelevantLateGame ? "YES" : "NO"));

      passFailFlags.forEach(function (line) {
        onLog("[DEV][ECON-AUDIT] " + line);
      });
      warnFlags.forEach(function (line) {
        onLog("[DEV][ECON-AUDIT] " + line);
      });

      if (global.console && typeof global.console.groupCollapsed === "function") {
        global.console.groupCollapsed("[DEV] Economy Simulation Audit");
        global.console.info("Summary", summary);
        global.console.info("Fail flags", passFailFlags);
        global.console.info("Warn flags", warnFlags);
        global.console.table(runs.map(function (run) {
          return {
            Run: run.run,
            MoneyStart: originalSnapshot.player.money,
            MoneyEnd: run.moneyOverTime[run.moneyOverTime.length - 1],
            MaxMoney: run.maxMoneyReached,
            FirstHousingUpgradeDay: run.daysToFirstHousingUpgrade,
            RentBurdenPct: Number(run.rentBurdenPercent.toFixed(2)),
            AvgDailySurplus: Number(run.averageDailySurplus.toFixed(2)),
            PermanentlyWealthy: run.permanentlyWealthy,
            PovertyLoop: run.povertyLoop,
            RentIrrelevantLateGame: run.rentIrrelevantLateGame
          };
        }));
        runs.forEach(function (run) {
          global.console.groupCollapsed("[DEV] Economy Run " + run.run + " detail");
          global.console.log("moneyOverTime", run.moneyOverTime);
          global.console.log("jobProgression", run.jobProgression);
          global.console.log("housingProgression", run.housingProgression);
          global.console.log("reputationProgression", run.reputationProgression);
          global.console.log("rentBurdenPercent", run.rentBurdenPercent);
          global.console.log("averageDailySurplus", run.averageDailySurplus);
          global.console.groupEnd();
        });
        global.console.groupEnd();
      }

      restoreState(state, originalSnapshot);
      if (ns.rng && typeof ns.rng.reset === "function") {
        ns.rng.reset();
      }

      if (JSON.stringify(state) !== restoreFingerprint) {
        onLog("[DEV][ECON-AUDIT] WARN: state restore fingerprint mismatch after economy audit.");
      } else {
        onLog("[DEV][ECON-AUDIT] State restore integrity confirmed.");
      }

      return true;
    }


    function runAction(actionId) {
      var state;
      var message;

      if (!isDevModeEnabled()) {
        return false;
      }

      if (actionId === "reset_save") {
        onLog("[DEV] Resetting save and reloading.");
        clearGameSave();
        global.location.reload();
        return true;
      }

      state = getState();
      if (!state) return false;

      if (actionId === "run_smoke_tests") {
        var previousDisableSaveFlag = global.__DEV_DISABLE_SAVE;
        var smokeOk;

        global.__DEV_DISABLE_SAVE = true;
        try {
          smokeOk = runSmokeTestsAction(state);
          if (smokeOk && typeof onStateChanged === "function") {
            onStateChanged();
          }
        } finally {
          global.__DEV_DISABLE_SAVE = previousDisableSaveFlag;
        }
        return smokeOk;
      }

      if (actionId === "run_autoplay_30") {
        var previousAutoplayDisableSaveFlag = global.__DEV_DISABLE_SAVE;
        var autoplayOk;

        global.__DEV_DISABLE_SAVE = true;
        try {
          autoplayOk = runAutoplayAction(state, {
            days: 30,
            strategy: "balanced",
            seed: 12345,
            verbose: false
          });
          if (autoplayOk && typeof onStateChanged === "function") {
            onStateChanged();
          }
        } finally {
          global.__DEV_DISABLE_SAVE = previousAutoplayDisableSaveFlag;
        }
        return autoplayOk;
      }

      if (actionId === "run_message_audit") {
        var previousAuditDisableSaveFlag = global.__DEV_DISABLE_SAVE;
        var auditOk;

        global.__DEV_DISABLE_SAVE = true;
        try {
          auditOk = runMessageAuditAction(state, {
            iterationsPerJob: 50,
            includeSeasonSweep: true,
            includeNeedsSweep: true
          });
          if (auditOk && typeof onStateChanged === "function") {
            onStateChanged();
          }
        } finally {
          global.__DEV_DISABLE_SAVE = previousAuditDisableSaveFlag;
        }
        return auditOk;
      }

      if (actionId === "run_economy_simulation_audit") {
        var previousEconomyAuditDisableSaveFlag = global.__DEV_DISABLE_SAVE;
        var economyAuditOk;

        global.__DEV_DISABLE_SAVE = true;
        try {
          economyAuditOk = runEconomySimulationAuditAction(state, {
            runs: 500,
            days: 90
          });
          if (economyAuditOk && typeof onStateChanged === "function") {
            onStateChanged();
          }
        } finally {
          global.__DEV_DISABLE_SAVE = previousEconomyAuditDisableSaveFlag;
        }
        return economyAuditOk;
      }

      message = runNonResetAction(state, actionId);
      if (!message) return false;

      if (typeof onLog === "function") {
        onLog(message);
      }
      if (typeof onStateChanged === "function") {
        onStateChanged();
      }
      return true;
    }

    return {
      runAction: runAction
    };
  }

  ns.devtools = {
    DEV_MODE_KEY: DEV_MODE_KEY,
    isDevModeEnabled: isDevModeEnabled,
    setDevModeEnabled: setDevModeEnabled,
    initDevTools: initDevTools
  };
})(window);
