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
