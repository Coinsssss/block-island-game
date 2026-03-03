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
      if (!enabled && global.document && typeof global.document.getElementById === "function") {
        var modal = global.document.getElementById("economy-report-modal");
        if (modal) {
          modal.hidden = true;
        }
      }
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

  function formatMoney(value) {
    return "$" + Math.floor(Number(value) || 0);
  }

  function getTownReputationValue(state) {
    if (reputation && typeof reputation.getTownReputation === "function") {
      return reputation.getTownReputation(state);
    }

    return Math.max(0, Math.min(100, Math.floor(state.player.reputation || 0)));
  }

  function setTownReputationValue(state, value) {
    if (reputation && typeof reputation.setTownReputation === "function") {
      reputation.setTownReputation(state, value);
      return;
    }

    state.player.reputation = reputation.clampReputation(value);
    state.player.reputationTown = state.player.reputation;
  }

  function getSocialValue(state, key) {
    if (stateApi && typeof stateApi.getRelationshipValue === "function") {
      return stateApi.getRelationshipValue(state, key);
    }

    if (!state.relationships || typeof state.relationships !== "object") {
      state.relationships = stateApi.createInitialSocialState();
    }

    return clampSocialValue(state.relationships[key]);
  }

  function promptIntegerInput(message, fallbackValue, min, max) {
    var promptFn = global && typeof global.prompt === "function"
      ? global.prompt
      : null;
    var rawValue;
    var normalized;
    var parsed;

    if (!promptFn) {
      return {
        ok: false,
        canceled: true,
        reason: "Prompt unavailable in this browser context."
      };
    }

    rawValue = promptFn(message, String(fallbackValue));
    if (rawValue === null) {
      return {
        ok: false,
        canceled: true,
        reason: "Canceled."
      };
    }

    normalized = String(rawValue).trim().replace(/^\$/, "");
    if (!/^-?\d+$/.test(normalized)) {
      return {
        ok: false,
        canceled: false,
        reason: "Invalid number. Enter a whole number."
      };
    }

    parsed = Math.floor(Number(normalized));
    if (Number.isNaN(parsed) || parsed < min || parsed > max) {
      return {
        ok: false,
        canceled: false,
        reason: "Value must be between " + min + " and " + max + "."
      };
    }

    return {
      ok: true,
      value: parsed
    };
  }

  function createActionResult(actionLabel, summary, stateChanged) {
    return {
      actionLabel: actionLabel,
      summary: summary,
      stateChanged: Boolean(stateChanged)
    };
  }

  function applyPromptedSocialRepSet(state, key, label, presetsText) {
    var before = getSocialValue(state, key);
    var input = promptIntegerInput(
      label + " Rep (0-100). Presets: " + presetsText + ".",
      before,
      0,
      100
    );
    var after;

    if (!input.ok) {
      return createActionResult(label + " Rep", input.reason, false);
    }

    setSocialValue(state, key, input.value);
    after = getSocialValue(state, key);
    return createActionResult(
      label + " Rep",
      "Set from " + before + " to " + after + ".",
      true
    );
  }

  function runNonResetAction(state, actionId) {
    var requirements;
    var unlockedIds;
    var unlockedNames;
    var entry;
    var beforeMoney;
    var beforeRep;
    var afterRep;
    var addMoneyInput;
    var beforeSeason;
    var beforeDay;
    var beforeSlots;
    var summerDayLimit;

    switch (actionId) {
      case "add_money":
        beforeMoney = Math.floor(Number(state.player.money) || 0);
        addMoneyInput = promptIntegerInput(
          "Add Money amount. Presets: 100, 1000, 10000.",
          1000,
          0,
          9999999
        );
        if (!addMoneyInput.ok) {
          return createActionResult("Add Money", addMoneyInput.reason, false);
        }

        state.player.money = beforeMoney + addMoneyInput.value;
        return createActionResult(
          "Add Money",
          "Added " + formatMoney(addMoneyInput.value) + " (" +
            formatMoney(beforeMoney) + " → " + formatMoney(state.player.money) + ").",
          true
        );
      case "add_money_100":
        state.player.money += 100;
        return createActionResult("Add Money", "Added $100.", true);
      case "add_money_1000":
        state.player.money += 1000;
        return createActionResult("Add Money", "Added $1000.", true);
      case "set_rep_100":
        beforeRep = getTownReputationValue(state);
        setTownReputationValue(state, 100);
        afterRep = getTownReputationValue(state);
        return createActionResult(
          "Set Town Rep 100",
          "Town Rep " + beforeRep + " → " + afterRep + ".",
          true
        );
      case "set_locals_rep":
        return applyPromptedSocialRepSet(state, "locals", "Locals", "0, 50, 60, 85, 100");
      case "set_staff_rep":
        return applyPromptedSocialRepSet(state, "staff", "Staff", "0, 50, 60, 85, 100");
      case "set_summer_rep":
        return applyPromptedSocialRepSet(state, "tourists", "Summer People", "0, 50, 80, 100");
      case "set_locals_60":
        setSocialValue(state, "locals", 60);
        return createActionResult("Locals Rep", "Set from preset to 60.", true);
      case "set_locals_85":
        setSocialValue(state, "locals", 85);
        return createActionResult("Locals Rep", "Set from preset to 85.", true);
      case "set_staff_60":
        setSocialValue(state, "staff", 60);
        return createActionResult("Staff Rep", "Set from preset to 60.", true);
      case "set_staff_85":
        setSocialValue(state, "staff", 85);
        return createActionResult("Staff Rep", "Set from preset to 85.", true);
      case "set_tourists_50":
        setSocialValue(state, "tourists", 50);
        return createActionResult("Summer People Rep", "Set from preset to 50.", true);
      case "set_tourists_80":
        setSocialValue(state, "tourists", 80);
        return createActionResult("Summer People Rep", "Set from preset to 80.", true);
      case "jump_job_l5_unlock":
        entry = state.jobs.list.halls_mowing_crew;
        if (!entry) {
          return createActionResult(
            "Jump Job L5",
            "Could not find Hall's Mowing Crew in jobs list.",
            false
          );
        }

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
          return createActionResult(
            "Jump Job L5",
            "Set to Level 5. Unlocked: " + unlockedNames.join(", ") + ".",
            true
          );
        }
        return createActionResult("Jump Job L5", "Set Hall's Mowing Crew to Level 5.", true);
      case "jump_shared_house_ready":
        requirements = housing.SHARED_HOUSE_REQUIREMENTS || { money: 3000, reputation: 20 };
        beforeMoney = Math.floor(Number(state.player.money) || 0);
        beforeRep = getTownReputationValue(state);
        state.player.money = Math.max(state.player.money, requirements.money);
        setTownReputationValue(
          state,
          Math.max(getTownReputationValue(state), requirements.reputation)
        );
        afterRep = getTownReputationValue(state);
        return createActionResult(
          "Jump Shared House Ready",
          "Money " + formatMoney(beforeMoney) + " → " + formatMoney(state.player.money) +
            ", Town Rep " + beforeRep + " → " + afterRep + ".",
          true
        );
      case "jump_sunday_night":
        beforeDay = state.time.weekdayIndex;
        beforeSlots = state.time.actionSlotsRemaining;
        state.time.weekdayIndex = 6;
        state.time.actionSlotsRemaining = 0;
        return createActionResult(
          "Jump Sunday Night",
          "weekdayIndex " + beforeDay + " → 6, slots " + beforeSlots + " → 0.",
          true
        );
      case "jump_set_season_summer":
        beforeSeason = state.time.seasonIndex;
        state.time.seasonIndex = 1;
        summerDayLimit = time && typeof time.DAYS_PER_SEASON === "number"
          ? time.DAYS_PER_SEASON
          : 21;
        state.time.day = Math.max(1, Math.min(state.time.day, summerDayLimit));
        if (!state.world || typeof state.world !== "object") {
          state.world = {};
        }
        state.world.season = "summer";
        return createActionResult(
          "Jump Set Season Summer",
          "seasonIndex " + beforeSeason + " → 1 (Summer).",
          true
        );
      default:
        return null;
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
    var economyReportViewerBindings = null;

    function devLog(actionLabel, summary) {
      onLog("[DEV] " + actionLabel + ": " + summary);
    }

    function summarizeTopIssues(entries, keyName, limit) {
      var buckets = {};
      var normalizedEntries = Array.isArray(entries) ? entries : [];
      var topLimit = Math.max(1, Math.floor(limit || 3));
      var key;

      normalizedEntries.forEach(function (entry) {
        var rawKey = entry && entry[keyName] ? String(entry[keyName]) : "unknown";
        if (!buckets[rawKey]) {
          buckets[rawKey] = 0;
        }
        buckets[rawKey] += typeof entry.count === "number" ? entry.count : 1;
      });

      return Object.keys(buckets)
        .map(function (bucketKey) {
          return {
            key: bucketKey,
            count: buckets[bucketKey]
          };
        })
        .sort(function (a, b) {
          return b.count - a.count;
        })
        .slice(0, topLimit);
    }

    function formatIsoForLog(rawIso) {
      var date;
      if (!rawIso) return "unknown";
      date = new Date(rawIso);
      if (Number.isNaN(date.getTime())) {
        return String(rawIso);
      }
      return date.toLocaleString();
    }

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

    function getEconomyReportViewerElements() {
      if (!global.document) return null;
      return {
        modal: global.document.getElementById("economy-report-modal"),
        textarea: global.document.getElementById("economy-report-json"),
        copyButton: global.document.getElementById("economy-report-copy-btn"),
        closeButton: global.document.getElementById("economy-report-close-btn")
      };
    }

    function detachEconomyReportViewerBindings() {
      if (!economyReportViewerBindings) return;

      if (
        economyReportViewerBindings.elements.closeButton &&
        economyReportViewerBindings.onCloseButtonClick
      ) {
        economyReportViewerBindings.elements.closeButton.removeEventListener(
          "click",
          economyReportViewerBindings.onCloseButtonClick
        );
      }
      if (
        economyReportViewerBindings.elements.copyButton &&
        economyReportViewerBindings.onCopyButtonClick
      ) {
        economyReportViewerBindings.elements.copyButton.removeEventListener(
          "click",
          economyReportViewerBindings.onCopyButtonClick
        );
      }
      if (
        economyReportViewerBindings.elements.modal &&
        economyReportViewerBindings.onBackdropClick
      ) {
        economyReportViewerBindings.elements.modal.removeEventListener(
          "click",
          economyReportViewerBindings.onBackdropClick
        );
      }

      economyReportViewerBindings = null;
    }

    function attachEconomyReportViewerBindings(elements) {
      var onCloseButtonClick;
      var onCopyButtonClick;
      var onBackdropClick;

      if (!elements || !elements.modal || economyReportViewerBindings) {
        return;
      }

      onCloseButtonClick = function () {
        closeEconomyReportViewer();
      };
      onCopyButtonClick = function () {
        copyTextToClipboard(elements.textarea.value).then(function () {
          elements.copyButton.textContent = "Copied!";
        }).catch(function (error) {
          onLog("[DEV][ECON-AUDIT] Copy failed: " + (error && error.message ? error.message : String(error)));
          if (global.console && typeof global.console.error === "function") {
            global.console.error("[DEV][ECON-AUDIT] Copy failed", error);
          }
        });
      };
      onBackdropClick = function (event) {
        if (event.target === elements.modal) {
          closeEconomyReportViewer();
        }
      };

      if (elements.closeButton) {
        elements.closeButton.addEventListener("click", onCloseButtonClick);
      }
      if (elements.copyButton) {
        elements.copyButton.addEventListener("click", onCopyButtonClick);
      }
      elements.modal.addEventListener("click", onBackdropClick);

      economyReportViewerBindings = {
        elements: elements,
        onCloseButtonClick: onCloseButtonClick,
        onCopyButtonClick: onCopyButtonClick,
        onBackdropClick: onBackdropClick
      };
    }

    function closeEconomyReportViewer() {
      var elements = getEconomyReportViewerElements();
      if (!elements || !elements.modal) {
        detachEconomyReportViewerBindings();
        return;
      }
      elements.modal.hidden = true;
      if (elements.copyButton) {
        elements.copyButton.textContent = "Copy to Clipboard";
      }
      detachEconomyReportViewerBindings();
    }

    function copyTextToClipboard(value) {
      if (global.navigator && global.navigator.clipboard && typeof global.navigator.clipboard.writeText === "function") {
        return global.navigator.clipboard.writeText(value);
      }

      return new Promise(function (resolve, reject) {
        var textarea;
        if (!global.document || !global.document.body || typeof global.document.createElement !== "function") {
          reject(new Error("Document unavailable for fallback copy."));
          return;
        }

        textarea = global.document.createElement("textarea");
        textarea.value = String(value || "");
        textarea.setAttribute("readonly", "readonly");
        textarea.style.position = "fixed";
        textarea.style.top = "-1000px";
        textarea.style.left = "-1000px";
        global.document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        try {
          if (global.document && typeof global.document.execCommand === "function" && global.document.execCommand("copy")) {
            global.document.body.removeChild(textarea);
            resolve();
            return;
          }
        } catch (error) {
          global.document.body.removeChild(textarea);
          reject(error);
          return;
        }
        global.document.body.removeChild(textarea);
        reject(new Error("Clipboard copy command failed."));
      });
    }

    function openEconomyReportViewer() {
      var report = global.__lastEconomyAuditReport;
      var elements = getEconomyReportViewerElements();
      if (!report) {
        onLog("[DEV][ECON-AUDIT] No economy report available yet. Run the audit first.");
        return false;
      }
      if (!elements || !elements.modal || !elements.textarea) {
        onLog("[DEV][ECON-AUDIT] Report viewer UI is unavailable.");
        return false;
      }

      elements.textarea.value = JSON.stringify(report, null, 2);
      elements.modal.hidden = false;
      if (elements.copyButton) {
        elements.copyButton.textContent = "Copy to Clipboard";
      }
      attachEconomyReportViewerBindings(elements);
      elements.textarea.focus();
      elements.textarea.select();
      onLog("[DEV][ECON-AUDIT] Opened economy report viewer.");
      return true;
    }

    function runSmokeTestsAction(state) {
      var report;

      if (!smokeTests || typeof smokeTests.runSmokeTests !== "function") {
        return null;
      }

      report = smokeTests.runSmokeTests(state, {
        runWorkAction: runWorkAction,
        runEatAction: runEatAction,
        runSocializeAction: runSocializeAction,
        runRestAction: runRestAction,
        runSleepAction: runSleepAction,
        setDevModeEnabled: setDevModeEnabled,
        requestRender: onStateChanged,
        syncWorldSeasonFromTime: syncWorldSeasonFromTime
      });
      global.__lastSmokeTestReport = report;

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

      return report;
    }

    function runAutoplayAction(state, options) {
      var report;

      if (!playtest || typeof playtest.runAutoplay !== "function") {
        return null;
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
      global.__lastAutoplayReport = report;

      if (global.console && typeof global.console.groupCollapsed === "function") {
        global.console.groupCollapsed(
          "[DEV] AUTOPLAY: " + report.passed + " passed, " + report.failed + " failed"
        );
        global.console.table(report.checks);
        global.console.info("Red Flags:", report.redFlags);
        global.console.info("Recommendations:", report.recommendations);
        global.console.info("Metrics:", report.metrics);
        global.console.groupEnd();
      }

      return report;
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
        return null;
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
      var topIssueCategories = summarizeTopIssues(findings, "ruleId", 3);
      var failCount = findings.filter(function (entry) {
        return entry.severity === "FAIL";
      }).length;
      var warnCount = findings.filter(function (entry) {
        return entry.severity === "WARN";
      }).length;
      var report = {
        generatedAt: new Date().toISOString(),
        settings: settings,
        catalogCount: catalog.length,
        jobCount: jobIds.length,
        findingCount: findings.length,
        failCount: failCount,
        warnCount: warnCount,
        restoreIntegrityOk: postRestoreFingerprint === restoreFingerprint,
        topIssueCategories: topIssueCategories,
        findings: findings,
        summaryByJob: summaryByJob
      };

      global.__lastMessageAuditReport = report;

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
      var startedAtMs = Date.now();
      var progressInterval = options && typeof options.progressInterval === "number"
        ? Math.max(1, Math.floor(options.progressInterval))
        : 25;

      function auditLog(line) {
        onLog("[DEV][ECON-AUDIT] " + line);
      }

      function formatDurationMs(durationMs) {
        return (durationMs / 1000).toFixed(1) + "s";
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

      function buildWorstCases(limit) {
        return runs.slice().sort(function (a, b) {
          if (a.povertyLoop !== b.povertyLoop) return a.povertyLoop ? -1 : 1;
          if (a.finalMoney !== b.finalMoney) return a.finalMoney - b.finalMoney;
          return a.averageDailySurplus - b.averageDailySurplus;
        }).slice(0, Math.max(1, limit || 3));
      }

      onSetActionRunning("run_economy_simulation_audit", true);
      auditLog("Starting economy audit...");
      auditLog("Config: " + simulationRuns + " runs x " + simulationDays + " days.");
      if (typeof onStateChanged === "function") onStateChanged();

      try {
        for (var runIndex = 0; runIndex < simulationRuns; runIndex += 1) {
          runSingleSimulation(runIndex);
          if ((runIndex + 1) % progressInterval === 0 || runIndex + 1 === simulationRuns) {
            auditLog("Progress: " + (runIndex + 1) + "/" + simulationRuns + " (elapsed " + formatDurationMs(Date.now() - startedAtMs) + ").");
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
        var worstCases = buildWorstCases(3);
        var worstCaseSummary = worstCases.map(function (run) {
          return "#" + run.run + "($" + run.finalMoney.toFixed(2) + ",surplus=" + run.averageDailySurplus.toFixed(2) + ",poverty=" + (run.povertyLoop ? "Y" : "N") + ")";
        }).join("; ");

        auditLog("Summary: runs=" + summary.runCount + ", avg final=$" + summary.averageFinalMoney.toFixed(2) + ", median=$" + summary.medianFinalMoney.toFixed(2) + ", avg surplus=" + summary.averageDailySurplus.toFixed(2) + ".");
        auditLog("Flags: negative=" + summary.negativeMoneyRatePct.toFixed(1) + "%, poverty=" + summary.povertyLoopRatePct.toFixed(1) + "%, rent burden=" + summary.averageRentBurdenPct.toFixed(2) + "%, FAIL=" + summary.failCount + ", WARN=" + summary.warnCount + ".");
        auditLog("Worst runs: " + worstCaseSummary + ".");

        if (global.console && typeof global.console.groupCollapsed === "function") {
          global.console.groupCollapsed("[DEV][ECON-AUDIT] Economy audit report");
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
          global.console.error("[DEV][ECON-AUDIT] ERROR", error && error.stack ? error.stack : error, { partialRuns: runs });
        }
      } finally {
        restoreState(state, originalSnapshot);
        if (ns.rng && typeof ns.rng.reset === "function") ns.rng.reset();

        if (JSON.stringify(state) !== restoreFingerprint) {
          auditLog("State restore integrity: FAIL (fingerprint mismatch).");
        } else {
          auditLog("State restore integrity: PASS.");
        }

        onSetActionRunning("run_economy_simulation_audit", false);
        if (typeof onStateChanged === "function") onStateChanged();
      }

      return firstError === null;
    }


    function deactivateUi() {
      closeEconomyReportViewer();
      return true;
    }


    function runAction(actionId) {
      var state;
      var message;

      if (!isDevModeEnabled()) {
        deactivateUi();
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
      runAction: runAction,
      deactivateUi: deactivateUi
    };
  }

  ns.devtools = {
    DEV_MODE_KEY: DEV_MODE_KEY,
    isDevModeEnabled: isDevModeEnabled,
    setDevModeEnabled: setDevModeEnabled,
    initDevTools: initDevTools
  };
})(window);
