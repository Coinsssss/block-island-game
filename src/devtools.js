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
