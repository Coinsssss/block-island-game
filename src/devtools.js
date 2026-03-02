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
    var onSetActionRunning = hooks && typeof hooks.onSetActionRunning === "function" ?
      hooks.onSetActionRunning :
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
    var reportViewerElements = null;

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

    function downloadJsonFile(filename, payload) {
      var blob;
      var href;
      var link;

      if (!global.document || !global.URL || typeof global.URL.createObjectURL !== "function") {
        return false;
      }

      blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      href = global.URL.createObjectURL(blob);
      link = global.document.createElement("a");
      link.href = href;
      link.download = filename;
      global.document.body.appendChild(link);
      link.click();
      global.document.body.removeChild(link);
      global.URL.revokeObjectURL(href);
      return true;
    }

    function destroyEconomyReportViewer() {
      if (!reportViewerElements || !reportViewerElements.modal) return;
      reportViewerElements.modal.style.display = "none";
      reportViewerElements.modal.style.pointerEvents = "none";
      if (reportViewerElements.modal.parentNode) {
        reportViewerElements.modal.parentNode.removeChild(reportViewerElements.modal);
      }
      reportViewerElements = null;
    }

    function ensureEconomyReportViewerElements() {
      var modal;
      var dialog;
      var heading;
      var textarea;
      var actions;
      var copyButton;
      var closeButton;

      if (!global.document || !global.document.body) return null;
      if (reportViewerElements && reportViewerElements.modal) {
        return reportViewerElements;
      }

      modal = global.document.createElement("div");
      modal.style.position = "fixed";
      modal.style.inset = "0";
      modal.style.zIndex = "9999";
      modal.style.background = "rgba(5, 8, 20, 0.84)";
      modal.style.display = "none";
      modal.style.pointerEvents = "none";
      modal.style.alignItems = "center";
      modal.style.justifyContent = "center";
      modal.style.padding = "16px";

      dialog = global.document.createElement("div");
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.setAttribute("aria-label", "Economy audit report viewer");
      dialog.style.width = "min(960px, 96vw)";
      dialog.style.maxHeight = "86vh";
      dialog.style.display = "flex";
      dialog.style.flexDirection = "column";
      dialog.style.gap = "12px";
      dialog.style.padding = "16px";
      dialog.style.borderRadius = "12px";
      dialog.style.border = "1px solid rgba(163, 191, 250, 0.35)";
      dialog.style.background = "rgba(10, 18, 36, 0.96)";

      heading = global.document.createElement("h3");
      heading.textContent = "Economy Audit Report";
      heading.style.margin = "0";

      textarea = global.document.createElement("textarea");
      textarea.readOnly = true;
      textarea.spellcheck = false;
      textarea.style.width = "100%";
      textarea.style.minHeight = "280px";
      textarea.style.maxHeight = "56vh";
      textarea.style.resize = "vertical";
      textarea.style.fontFamily = '"Fira Code", "Source Code Pro", monospace';

      actions = global.document.createElement("div");
      actions.style.display = "flex";
      actions.style.justifyContent = "flex-end";
      actions.style.gap = "8px";

      copyButton = global.document.createElement("button");
      copyButton.type = "button";
      copyButton.textContent = "Copy to Clipboard";

      closeButton = global.document.createElement("button");
      closeButton.type = "button";
      closeButton.textContent = "Close";

      actions.appendChild(copyButton);
      actions.appendChild(closeButton);
      dialog.appendChild(heading);
      dialog.appendChild(textarea);
      dialog.appendChild(actions);
      modal.appendChild(dialog);
      global.document.body.appendChild(modal);

      closeButton.addEventListener("click", destroyEconomyReportViewer);
      modal.addEventListener("click", function (event) {
        if (event.target === modal) {
          destroyEconomyReportViewer();
        }
      });

      reportViewerElements = {
        modal: modal,
        textarea: textarea,
        copyButton: copyButton
      };

      return reportViewerElements;
    }

    function copyTextToClipboard(value) {
      if (global.navigator && global.navigator.clipboard && typeof global.navigator.clipboard.writeText === "function") {
        return global.navigator.clipboard.writeText(value);
      }

      return new Promise(function (resolve, reject) {
        var elements = reportViewerElements;
        if (!elements || !elements.textarea) {
          reject(new Error("Viewer textarea unavailable for fallback copy."));
          return;
        }
        elements.textarea.focus();
        elements.textarea.select();
        try {
          if (global.document && typeof global.document.execCommand === "function" && global.document.execCommand("copy")) {
            resolve();
            return;
          }
        } catch (error) {
          reject(error);
          return;
        }
        reject(new Error("Clipboard copy command failed."));
      });
    }

    function openEconomyReportViewer() {
      var report = global.__lastEconomyAuditReport;
      var elements = ensureEconomyReportViewerElements();

      if (!report) {
        onLog("[DEV][ECON-AUDIT] No economy report available yet. Run the audit first.");
        return false;
      }
      if (!elements || !elements.modal || !elements.textarea) {
        onLog("[DEV][ECON-AUDIT] Report viewer UI is unavailable.");
        return false;
      }

      elements.textarea.value = JSON.stringify(report, null, 2);
      elements.modal.style.display = "flex";
      elements.modal.style.pointerEvents = "auto";
      elements.copyButton.textContent = "Copy to Clipboard";

      if (!elements.copyButton.getAttribute("data-initialized")) {
        elements.copyButton.addEventListener("click", function () {
          copyTextToClipboard(elements.textarea.value).then(function () {
            elements.copyButton.textContent = "Copied!";
          }).catch(function (error) {
            onLog("[DEV][ECON-AUDIT] Copy failed: " + (error && error.message ? error.message : String(error)));
          });
        });
        elements.copyButton.setAttribute("data-initialized", "true");
      }

      elements.textarea.focus();
      elements.textarea.select();
      onLog("[DEV][ECON-AUDIT] Opened economy report viewer.");
      return true;
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
        ? Math.max(1, Math.floor(options.days))
        : 90;
      var originalSnapshot = deepClone(state);
      var restoreFingerprint = JSON.stringify(originalSnapshot);
      var runs = [];
      var failFlags = [];
      var warnFlags = [];
      var summary = null;
      var firstError = null;

      function auditLog(line) {
        onLog("[DEV][ECON] " + line);
      }

      function mean(values) {
        if (!values.length) return 0;
        return values.reduce(function (sum, value) { return sum + value; }, 0) / values.length;
      }

      function median(values) {
        var sorted;
        var mid;
        if (!values.length) return 0;
        sorted = values.slice().sort(function (a, b) { return a - b; });
        mid = Math.floor(sorted.length / 2);
        if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
        return sorted[mid];
      }

      function chooseBestUnlockedJobId(currentState) {
        var jobIds = jobs && typeof jobs.getAllJobIds === "function" ? jobs.getAllJobIds() : [];
        var bestJobId = "";
        var bestPay = -1;

        jobIds.forEach(function (jobId) {
          var definition = jobs.JOBS[jobId];
          if (!definition || !jobs.isJobUnlocked(currentState, jobId)) return;
          if (definition.basePay > bestPay) {
            bestPay = definition.basePay;
            bestJobId = jobId;
          }
        });

        return bestJobId;
      }

      function chooseBestAffordableHousingId(currentState) {
        var optionIds = housing && typeof housing.getAvailableHousingOptionIds === "function"
          ? housing.getAvailableHousingOptionIds(currentState)
          : [];
        var bestId = "";

        optionIds.sort(function (a, b) {
          var tierA = housing.getHousingTier(a);
          var tierB = housing.getHousingTier(b);
          var rentA = housing.getWeeklyRent(a);
          var rentB = housing.getWeeklyRent(b);
          if (tierA !== tierB) return tierB - tierA;
          return rentA - rentB;
        });

        if (optionIds.length > 0) bestId = optionIds[0];
        return bestId;
      }

      function runSingleSimulation(runIndex) {
        var dayIndex;
        var run = {
          run: runIndex + 1,
          moneyOverTime: [],
          dailyNetByDay: [],
          dailyRentEquivalent: [],
          totalRentPaid: 0,
          totalGrossIncome: 0,
          totalHousingUpgrades: 0,
          missedRentCount: 0,
          maxMoneyReached: 0,
          daysToFirstHousingUpgrade: -1
        };

        restoreState(state, originalSnapshot);
        if (ns.rng && typeof ns.rng.setSeed === "function") ns.rng.setSeed(1000 + runIndex);

        for (dayIndex = 1; dayIndex <= simulationDays; dayIndex += 1) {
          var startMoney = state.player.money;
          var rentDueTonight = state.time.weekdayIndex === 6;
          var rentTonight = rentDueTonight && housing && typeof housing.getEffectiveWeeklyRent === "function"
            ? housing.getEffectiveWeeklyRent(state)
            : 0;
          var housingBefore = state.housing.current;
          var jobBefore = state.jobs.activeJobId;
          var housingId;
          var bestJobId;

          if (!jobBefore && !state.jobs.pendingJobId && typeof applyJobAction === "function") {
            bestJobId = chooseBestUnlockedJobId(state);
            if (bestJobId) applyJobAction(bestJobId);
          }

          housingId = chooseBestAffordableHousingId(state);
          if (housingId && housing && typeof housing.setPendingMoveTarget === "function") {
            housing.setPendingMoveTarget(housingId);
            if (housing.canMoveToSharedHouse(state)) housing.moveToSharedHouse(state);
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

          if (housingBefore !== state.housing.current) {
            run.totalHousingUpgrades += 1;
            if (run.daysToFirstHousingUpgrade < 0) run.daysToFirstHousingUpgrade = dayIndex;
          }

          if (rentDueTonight && state.player.money < startMoney && rentTonight > 0) {
            run.totalRentPaid += Math.min(rentTonight, Math.max(0, startMoney));
            if (state.player.money === 0) run.missedRentCount += 1;
          }

          run.totalGrossIncome += Math.max(0, state.player.money - startMoney + rentTonight);
          run.moneyOverTime.push(state.player.money);
          run.dailyNetByDay.push(state.player.money - startMoney);
          run.dailyRentEquivalent.push(rentTonight / 7);
          run.maxMoneyReached = Math.max(run.maxMoneyReached, state.player.money);
        }

        run.finalMoney = run.moneyOverTime.length ? run.moneyOverTime[run.moneyOverTime.length - 1] : state.player.money;
        run.averageDailySurplus = mean(run.dailyNetByDay);
        run.rentBurdenPercent = run.totalGrossIncome > 0 ? (run.totalRentPaid / run.totalGrossIncome) * 100 : 0;
        run.rentBurdenPercentLateGame = run.dailyNetByDay.length > 60
          ? (run.totalRentPaid / Math.max(1, run.dailyNetByDay.slice(60).reduce(function (sum, value) {
              return sum + Math.max(0, value);
            }, 0))) * 100
          : run.rentBurdenPercent;
        run.povertyLoop = run.missedRentCount >= 3 && run.averageDailySurplus <= 0;

        if (run.daysToFirstHousingUpgrade > 0 && run.daysToFirstHousingUpgrade < 30) {
          failFlags.push("upgrade-too-fast");
        }
        if (run.averageDailySurplus <= 0) failFlags.push("non-positive-surplus");
        if (run.daysToFirstHousingUpgrade === -1 || run.daysToFirstHousingUpgrade > 60) warnFlags.push("slow-upgrade");
        if (run.rentBurdenPercentLateGame < 8 && run.daysToFirstHousingUpgrade > 0) warnFlags.push("rent-trivial-late-game");

        runs.push(run);
      }

      function calculateSummary() {
        var finalMoneyValues = runs.map(function (run) { return run.finalMoney; });
        var avgUpgrade = mean(runs.filter(function (run) {
          return run.daysToFirstHousingUpgrade > 0;
        }).map(function (run) { return run.daysToFirstHousingUpgrade; }));
        var upgradedCount = runs.filter(function (run) { return run.daysToFirstHousingUpgrade > 0; }).length;
        var povertyCount = runs.filter(function (run) { return run.povertyLoop; }).length;
        var negativeCount = runs.filter(function (run) { return run.finalMoney < 0; }).length;

        return {
          runCount: runs.length,
          daysPerRun: simulationDays,
          averageFinalMoney: mean(finalMoneyValues),
          medianFinalMoney: median(finalMoneyValues),
          averageDailySurplus: mean(runs.map(function (run) { return run.averageDailySurplus; })),
          negativeMoneyRatePct: (negativeCount / Math.max(1, runs.length)) * 100,
          povertyLoopRatePct: (povertyCount / Math.max(1, runs.length)) * 100,
          averageTimeToFirstHousingUpgrade: upgradedCount > 0 ? avgUpgrade : -1,
          upgradedWithin90DaysPct: (upgradedCount / Math.max(1, runs.length)) * 100,
          averageRentBurdenPct: mean(runs.map(function (run) { return run.rentBurdenPercent; })),
          failCount: failFlags.length,
          warnCount: warnFlags.length,
          failRuleLabels: failFlags,
          warnRuleLabels: warnFlags
        };
      }

      onSetActionRunning("run_economy_simulation_audit", true);
      auditLog("Starting economy audit (" + simulationRuns + " runs x " + simulationDays + " days)...");
      if (typeof onStateChanged === "function") onStateChanged();

      try {
        for (var runIndex = 0; runIndex < simulationRuns; runIndex += 1) {
          runSingleSimulation(runIndex);
          if ((runIndex + 1) % 25 === 0 || runIndex + 1 === simulationRuns) {
            auditLog("Progress: " + (runIndex + 1) + "/" + simulationRuns + " ...");
            if (global.console) {
              global.console.info("[DEV][ECON] Progress", { completedRuns: runIndex + 1, totalRuns: simulationRuns });
            }
            if (typeof onStateChanged === "function") onStateChanged();
          }
        }

        summary = calculateSummary();
        global.__lastEconomyAuditReport = {
          generatedAt: new Date().toISOString(),
          config: { runs: simulationRuns, days: simulationDays, povertyLoopDefinition: "missed rent >= 3 and average daily surplus <= 0" },
          aggregate: summary,
          runs: runs
        };

        auditLog("Summary: runs=" + summary.runCount + ", days/run=" + summary.daysPerRun + ", avg final money=$" + summary.averageFinalMoney.toFixed(2) + ", median final money=$" + summary.medianFinalMoney.toFixed(2) + ".");
        auditLog("Avg daily surplus=" + summary.averageDailySurplus.toFixed(2) + ", negative money runs=" + summary.negativeMoneyRatePct.toFixed(1) + "%, poverty loop runs=" + summary.povertyLoopRatePct.toFixed(1) + "%.");
        auditLog("Avg first housing upgrade=" + (summary.averageTimeToFirstHousingUpgrade < 0 ? "none" : summary.averageTimeToFirstHousingUpgrade.toFixed(1) + " days") + ", upgraded within 90 days=" + summary.upgradedWithin90DaysPct.toFixed(1) + "%.");
        auditLog("Avg rent burden=" + summary.averageRentBurdenPct.toFixed(2) + "%, FAIL=" + summary.failCount + ", WARN=" + summary.warnCount + ".");

        if (global.console && typeof global.console.groupCollapsed === "function") {
          global.console.groupCollapsed("[DEV][ECON] Economy audit report");
          global.console.info("Aggregate", summary);
          global.console.table(runs.map(function (run) {
            return {
              run: run.run,
              finalMoney: run.finalMoney,
              avgDailySurplus: Number(run.averageDailySurplus.toFixed(2)),
              firstUpgradeDay: run.daysToFirstHousingUpgrade,
              povertyLoop: run.povertyLoop,
              rentBurdenPct: Number(run.rentBurdenPercent.toFixed(2))
            };
          }));
          global.console.groupEnd();
        }
      } catch (error) {
        firstError = error;
        auditLog("ERROR: " + (error && error.message ? error.message : String(error)));
        if (global.console && typeof global.console.error === "function") {
          global.console.error("[DEV][ECON] Audit failed", error, { partialRuns: runs });
        }
      } finally {
        restoreState(state, originalSnapshot);
        if (ns.rng && typeof ns.rng.reset === "function") ns.rng.reset();

        if (JSON.stringify(state) !== restoreFingerprint) {
          auditLog("WARN: state restore fingerprint mismatch after economy audit.");
        } else {
          auditLog("State restore integrity confirmed.");
        }

        onSetActionRunning("run_economy_simulation_audit", false);
        if (typeof onStateChanged === "function") onStateChanged();
      }

      return firstError === null;
    }



    function runAction(actionId) {
      var state;
      var message;

      if (!isDevModeEnabled()) {
        destroyEconomyReportViewer();
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

      if (actionId === "view_economy_report") {
        return openEconomyReportViewer();
      }

      if (actionId === "export_message_log") {
        downloadJsonFile("block-island-message-log-archive.json", stateApi.getLogArchive(state));
        onLog("[DEV] Exported message log archive JSON.");
        return true;
      }

      if (actionId === "clear_rendered_log") {
        stateApi.clearRenderedLog(state);
        onLog("[DEV] Cleared rendered message log (archive preserved).");
        if (typeof onStateChanged === "function") onStateChanged();
        return true;
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
