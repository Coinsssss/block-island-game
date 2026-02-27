(function (global) {
  var ns = global.BlockIsland = global.BlockIsland || {};
  var stateApi = ns.state;
  var time = ns.time;
  var reputation = ns.reputation;
  var jobs = ns.jobs;
  var housing = ns.housing;
  var socialUnlocks = ns.socialUnlocks;
  var balance = ns.balance;
  var lifestyle = ns.lifestyle;
  var devtools = ns.devtools;

  var elements = {};
  var fallbackRequirements = {
    money: 3000,
    reputation: 20
  };
  var monthBySeason = ["April", "July", "October", "January"];
  var friendlyLogMap = {
    "You arrive on Block Island ready for a fresh start.":
      "You arrive on Block Island with a small room and a fresh start.",
    "You settle into Employee Housing with three actions each day.":
      "Find work, earn your place, and build a life here.",
    "Choose a job to begin earning.":
      "Pick a job to start earning.",
    "You start over and begin a new island story.":
      ""
  };
  var dedupeFriendlyLogEntries = {
    "You arrive on Block Island with a small room and a fresh start.":
      true,
    "Find work, earn your place, and build a life here.":
      true,
    "Pick a job to start earning.":
      true
  };
  var careerPanelMode = "default";
  var previewTooltipsEnabled = false;
  var uiState = {
    isLogCollapsed: false,
    isDevToolsCollapsed: false,
    lastActionResult: "",
    panelCollapsed: {
      world: false,
      opportunities: false,
      career: false,
      social: true,
      economy: false,
      goal: true
    }
  };

  function ensureElement(id) {
    var node = document.getElementById(id);
    if (!node) {
      throw new Error("Missing required UI element: #" + id);
    }
    return node;
  }

  function setNeed(name, value) {
    var bar = elements[name + "Bar"];
    var valueNode = elements[name + "Value"];
    var clamped = Math.max(0, Math.min(100, Math.round(value)));

    bar.style.width = clamped + "%";
    valueNode.textContent = String(clamped);
  }

  function renderPlayerPanel(state) {
    if (!state || !state.player || !state.player.needs) {
      console.warn("[Block Island UI] Missing player needs state; skipping player panel render.");
      return;
    }

    var townReputation = reputation && typeof reputation.getTownReputation === "function"
      ? reputation.getTownReputation(state)
      : state.player.reputation;
    var barReputation = reputation && typeof reputation.getBarReputation === "function"
      ? reputation.getBarReputation(state)
      : 0;

    elements.money.textContent = "$" + state.player.money;
    elements.reputationTown.textContent = String(townReputation);
    elements.reputationBar.textContent = String(barReputation);
    elements.reputationTier.textContent = reputation.getReputationTier(townReputation);

    setNeed("energy", state.player.needs.energy);
    setNeed("hunger", state.player.needs.hunger);
    setNeed("social", state.player.needs.social);
  }

  function renderSocialNetworkPanel(state) {
    elements.socialLocals.textContent = stateApi.getLocalRelationship(state) + " / 100";
    elements.socialStaff.textContent = stateApi.getStaffRelationship(state) + " / 100";
    elements.socialSummerPeople.textContent = (
      stateApi.getSummerPeopleRelationship
        ? stateApi.getSummerPeopleRelationship(state)
        : stateApi.getTouristRelationship(state)
    ) + " / 100";
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatPerkPercent(value) {
    return Math.round(value * 100);
  }

  function getHousingPerkSummary(state) {
    var perks = housing && typeof housing.getActiveHousingPerks === "function"
      ? housing.getActiveHousingPerks(state)
      : null;
    var parts = [];

    if (!perks || typeof perks !== "object") {
      return "None";
    }

    if (perks.energyRecoveryBonus > 0) {
      parts.push("+" + perks.energyRecoveryBonus + " Energy on Sleep");
    }
    if (perks.moodBonus > 0) {
      parts.push("+" + perks.moodBonus + " Mood on Sleep");
    }
    if (perks.socializeGainMult !== 0) {
      parts.push(
        (perks.socializeGainMult > 0 ? "+" : "") +
          formatPerkPercent(perks.socializeGainMult) +
          "% Social Gain"
      );
    }
    if (perks.tipBonus > 0) {
      parts.push("+" + formatPerkPercent(perks.tipBonus) + "% Tips");
    }
    if (perks.rentDiscount > 0) {
      parts.push("-" + formatPerkPercent(perks.rentDiscount) + "% Rent");
    }

    if (parts.length <= 0) {
      return "None";
    }

    return parts.join(", ");
  }

  function getCareerPerkSummary(state) {
    var perks = jobs && typeof jobs.getActiveJobPerks === "function"
      ? jobs.getActiveJobPerks(state)
      : null;
    var parts = [];

    if (!perks || typeof perks !== "object") {
      return "None";
    }

    if (perks.tipBonus > 0) {
      parts.push("+" + formatPerkPercent(perks.tipBonus) + "% Tips");
    }
    if (perks.repGainBonus > 0) {
      parts.push("+" + formatPerkPercent(perks.repGainBonus) + "% Rep Gain");
    }
    if (perks.promotionSpeedBonus > 0) {
      parts.push("+" + formatPerkPercent(perks.promotionSpeedBonus) + "% Promotion Speed");
    }
    if (perks.workPayMult > 0) {
      parts.push("+" + formatPerkPercent(perks.workPayMult) + "% Shift Pay");
    }

    if (parts.length <= 0) {
      return "None";
    }

    return parts.join(", ");
  }

  function setPreviewTooltipsEnabled(enabled) {
    previewTooltipsEnabled = Boolean(enabled);
    document.body.classList.toggle("dev-preview-tooltips", previewTooltipsEnabled);

    if (elements.previewTooltipsToggle) {
      elements.previewTooltipsToggle.textContent =
        "Preview Tooltips: " + (previewTooltipsEnabled ? "ON" : "OFF");
      elements.previewTooltipsToggle.setAttribute(
        "aria-pressed",
        previewTooltipsEnabled ? "true" : "false"
      );
    }
  }

  function togglePreviewTooltips() {
    if (elements.devToolsPanel.hidden || !elements.devModeToggle.checked) {
      return;
    }

    setPreviewTooltipsEnabled(!previewTooltipsEnabled);
  }

  function getFriendlyLogEntry(entry, state) {
    var promotionMatch;
    var promotedLevel;
    var promotedJobName;
    var promotedJobId;
    var roleTitle;
    var currentHousingId;
    var moveInLine;

    if (Object.prototype.hasOwnProperty.call(friendlyLogMap, entry)) {
      return friendlyLogMap[entry];
    }

    if (entry === "You moved into a shared house room.") {
      currentHousingId = state && state.housing ? state.housing.current : "";
      moveInLine = housing && typeof housing.getMoveInLogLine === "function"
        ? housing.getMoveInLogLine(currentHousingId)
        : "";

      if (moveInLine) {
        return moveInLine;
      }
    }

    promotionMatch = /^You were promoted to Level (\d+) at (.+)!$/.exec(String(entry || ""));
    if (promotionMatch) {
      promotedLevel = Math.max(1, Math.floor(Number(promotionMatch[1]) || 1));
      promotedJobName = promotionMatch[2];
      promotedJobId = jobs && typeof jobs.getJobIdByName === "function"
        ? jobs.getJobIdByName(promotedJobName)
        : "";
      roleTitle = jobs && typeof jobs.getJobRoleLogTitle === "function"
        ? jobs.getJobRoleLogTitle(promotedJobId, promotedLevel)
        : ("Level " + promotedLevel);

      return "You were promoted to " + roleTitle + " at " + promotedJobName + "!";
    }

    return entry;
  }

  function renderCareerJobPreview(state) {
    elements.careerJobPreview.innerHTML = jobs.getAvailableJobIds(state)
      .map(function (jobId) {
        var entryRoleTitle = jobs && typeof jobs.getEntryRoleTitle === "function"
          ? jobs.getEntryRoleTitle(jobId)
          : "Level 1";

        return (
          "<li>" +
            "<span class=\"career-job-name\">" +
              escapeHtml(jobs.getJobName(jobId) + " \u2014 " + entryRoleTitle) +
            "</span>" +
            "<span class=\"career-job-pay\">$" +
              jobs.getPayForLevel(jobId, 1) +
              "/shift</span>" +
          "</li>"
        );
      })
      .join("");
  }

  function getUnlockedOpportunityJobIds(state, activeJobId) {
    return jobs.getAllJobIds().filter(function (jobId) {
      var definition = jobs.JOBS[jobId];

      return Boolean(
        definition &&
        definition.unlockRequires &&
        jobId !== activeJobId &&
        jobs.isJobUnlocked(state, jobId)
      );
    });
  }

  function renderUnlockedOpportunities(state, activeJobId) {
    var unlockedOpportunityJobIds = getUnlockedOpportunityJobIds(state, activeJobId);
    var previewJobIds = unlockedOpportunityJobIds.slice(0, 5);

    elements.careerUnlockedOpportunitiesTitle.textContent = "Unlocked Opportunities";

    if (unlockedOpportunityJobIds.length <= 0) {
      elements.careerUnlockedOpportunities.hidden = true;
      elements.careerUnlockedOpportunitiesList.innerHTML = "";
      return;
    }

    elements.careerUnlockedOpportunities.hidden = false;
    elements.careerUnlockedOpportunitiesList.innerHTML = previewJobIds
      .map(function (jobId) {
        return (
          "<li>" +
            "<span class=\"career-job-name\">" +
              escapeHtml(jobs.getJobName(jobId)) +
            "</span>" +
            "<span class=\"career-job-pay\">$" +
              jobs.JOBS[jobId].basePay +
              "/shift</span>" +
          "</li>"
        );
      })
      .join("");
  }

  function renderOpportunitiesSummary(state, activeJobId) {
    var activeJobState = activeJobId && state.jobs.list ? state.jobs.list[activeJobId] : null;
    var hasActiveJob = Boolean(activeJobId && activeJobState);
    var pendingJobId = state && state.jobs && typeof state.jobs.pendingJobId === "string"
      ? state.jobs.pendingJobId
      : "";
    var pendingJobName = pendingJobId && jobs.JOBS[pendingJobId]
      ? jobs.getJobName(pendingJobId)
      : "";
    var hasPendingJob = Boolean(pendingJobName);
    var applyButtonLabel = hasActiveJob
      ? "Apply (switch tomorrow)"
      : "Apply (start tomorrow)";
    var roleTitle = activeJobId && activeJobState && jobs && typeof jobs.getJobRoleTitle === "function"
      ? jobs.getJobRoleTitle(activeJobId, activeJobState.level)
      : "-";
    var payText = activeJobId && activeJobState
      ? ("$" + jobs.getPayForLevel(activeJobId, activeJobState.level) + "/shift")
      : "No active job";
    var availableJobIds = jobs.getAvailableJobIds(state).filter(function (jobId) {
      return !activeJobId || jobId !== activeJobId;
    });
    var housingOpportunityIds = getUnlockedHousingOpportunityIds(state);

    elements.opportunitiesCurrentJobName.textContent = hasActiveJob
      ? (jobs.getJobName(activeJobId) + " \u2014 " + roleTitle)
      : "None";
    elements.opportunitiesCurrentJobRole.textContent = roleTitle;
    elements.opportunitiesCurrentJobPay.textContent = payText;
    if (elements.opportunitiesCurrentJobRoleLine) {
      elements.opportunitiesCurrentJobRoleLine.hidden = true;
    }

    if (elements.opportunitiesCurrentJobSection) {
      elements.opportunitiesCurrentJobSection.hidden = !hasActiveJob;
    }

    elements.switchJobButton.hidden = true;
    elements.switchJobButton.disabled = true;
    elements.quitJobButton.disabled = !hasActiveJob;
    if (!hasActiveJob) {
      elements.quitJobButton.setAttribute("title", "No active job");
    } else {
      elements.quitJobButton.removeAttribute("title");
    }

    if (availableJobIds.length <= 0) {
      elements.opportunitiesJobList.innerHTML = "";
      elements.opportunitiesUnlockedSummary.hidden = false;
      elements.opportunitiesUnlockedSummary.textContent = "No job opportunities unlocked yet.";
    } else {
      elements.opportunitiesJobList.innerHTML = availableJobIds.map(function (jobId) {
        var entryRoleTitle = jobs && typeof jobs.getEntryRoleTitle === "function"
          ? jobs.getEntryRoleTitle(jobId)
          : "Level 1";
        var recommendationBadge = !hasActiveJob && jobId === "halls_mowing_crew"
          ? " <mark>Recommended for beginners</mark>"
          : "";

        return (
          "<li>" +
            "<span class=\"career-job-name\">" +
              escapeHtml(jobs.getJobName(jobId) + " \u2014 " + entryRoleTitle) +
              recommendationBadge +
            "</span>" +
            "<span class=\"career-job-pay\">$" + jobs.getPayForLevel(jobId, 1) + "/shift</span>" +
            "<button type=\"button\" data-apply-job-id=\"" + escapeHtml(jobId) + "\">" +
              escapeHtml(applyButtonLabel) +
            "</button>" +
          "</li>"
        );
      }).join("");
      elements.opportunitiesUnlockedSummary.hidden = true;
      elements.opportunitiesUnlockedSummary.textContent = "";
    }

    if (elements.opportunitiesPendingJob) {
      if (hasPendingJob) {
        elements.opportunitiesPendingJob.hidden = false;
        elements.opportunitiesPendingJob.textContent =
          "Pending job change: " + pendingJobName + " (starts tomorrow)";
      } else {
        elements.opportunitiesPendingJob.hidden = true;
        elements.opportunitiesPendingJob.textContent = "";
      }
    }
    if (elements.cancelPendingJobButton) {
      elements.cancelPendingJobButton.hidden = !hasPendingJob;
      elements.cancelPendingJobButton.disabled = !hasPendingJob;
    }

    if (housingOpportunityIds.length <= 0) {
      elements.opportunitiesHousingList.innerHTML = "";
      elements.opportunitiesHousingEmpty.hidden = false;
    } else {
      elements.opportunitiesHousingList.innerHTML = housingOpportunityIds.map(function (housingId) {
        var housingName = housing.getHousingLabel(housingId);
        var rentText = "$" + housing.getWeeklyRent(housingId) + "/wk";
        var perksText = formatHousingOptionPerks(housingId);

        return (
          "<li>" +
            "<span class=\"career-job-name\">" + escapeHtml(housingName) + "</span>" +
            "<span class=\"career-job-pay\">" + escapeHtml(rentText) + "</span>" +
            "<span class=\"helper-text\">" + escapeHtml(perksText) + "</span>" +
            "<button type=\"button\" data-housing-move-id=\"" + escapeHtml(housingId) + "\">Move In</button>" +
          "</li>"
        );
      }).join("");
      elements.opportunitiesHousingEmpty.hidden = true;
    }
  }

  function getUnlockedHousingOpportunityIds(state) {
    if (!housing || typeof housing.getAvailableHousingOptionIds !== "function") {
      return [];
    }

    return housing.getAvailableHousingOptionIds(state);
  }

  function getHousingUnlockFlagKey(housingId) {
    return "unlockedHousing_" + housingId;
  }

  function ensureFlagsObject(state) {
    if (state.flags && typeof state.flags === "object") {
      return;
    }

    if (stateApi && typeof stateApi.createInitialFlagsState === "function") {
      state.flags = stateApi.createInitialFlagsState();
      return;
    }

    state.flags = {};
  }

  function formatHousingOptionPerks(housingId) {
    var perks = housing && typeof housing.getHousingPerks === "function"
      ? housing.getHousingPerks(housingId)
      : null;
    var parts = [];

    if (!perks || typeof perks !== "object") {
      return "No passive perks";
    }

    if (perks.energyRecoveryBonus !== 0) {
      parts.push((perks.energyRecoveryBonus > 0 ? "+" : "") + perks.energyRecoveryBonus + " Energy Sleep");
    }
    if (perks.moodBonus !== 0) {
      parts.push((perks.moodBonus > 0 ? "+" : "") + perks.moodBonus + " Mood Sleep");
    }
    if (perks.socializeGainMult !== 0) {
      parts.push((perks.socializeGainMult > 0 ? "+" : "") + formatPerkPercent(perks.socializeGainMult) + "% Socialize");
    }
    if (perks.tipBonus > 0) {
      parts.push("+" + formatPerkPercent(perks.tipBonus) + "% Tips");
    }
    if (perks.rentDiscount > 0) {
      parts.push("-" + formatPerkPercent(perks.rentDiscount) + "% Rent");
    }

    if (parts.length <= 0) {
      return "No passive perks";
    }

    return parts.join(" • ");
  }

  function renderUnlockedHousingOpportunities(state) {
    var unlockedHousingIds = getUnlockedHousingOpportunityIds(state);
    var shouldShowNew = false;
    var groupedByTier = {};
    var sortedTiers;

    if (unlockedHousingIds.length <= 0) {
      elements.housingUnlockedOpportunities.hidden = true;
      elements.housingUnlockedOpportunitiesList.innerHTML = "";
      return;
    }

    ensureFlagsObject(state);

    unlockedHousingIds.forEach(function (housingId) {
      var flagKey = getHousingUnlockFlagKey(housingId);
      var message = "New housing is now available: " + housing.getHousingLabel(housingId) + ".";
      var definition = housing && typeof housing.getHousingDefinition === "function"
        ? housing.getHousingDefinition(housingId)
        : null;

      if (!definition || !definition.unlockRequires) {
        return;
      }
      if (state.flags[flagKey] || (Array.isArray(state.log) && state.log.indexOf(message) !== -1)) {
        state.flags[flagKey] = true;
        return;
      }

      stateApi.addLogEntry(state, message);
      state.flags[flagKey] = true;
      shouldShowNew = true;
    });

    elements.housingUnlockedOpportunitiesTitle.textContent = "Available Housing Options";
    if (shouldShowNew || unlockedHousingIds.length > 0) {
      elements.housingUnlockedOpportunitiesTitle.appendChild(document.createTextNode(" "));
      elements.housingUnlockedOpportunitiesTitle.appendChild(document.createElement("mark"));
      elements.housingUnlockedOpportunitiesTitle.lastChild.textContent = "NEW";
    }

    unlockedHousingIds.forEach(function (housingId) {
      var tier = housing && typeof housing.getHousingTier === "function"
        ? housing.getHousingTier(housingId)
        : 0;

      if (!groupedByTier[tier]) {
        groupedByTier[tier] = [];
      }
      groupedByTier[tier].push(housingId);
    });
    sortedTiers = Object.keys(groupedByTier).sort(function (left, right) {
      return Number(left) - Number(right);
    });

    elements.housingUnlockedOpportunities.hidden = false;
    elements.housingUnlockedOpportunitiesList.innerHTML = sortedTiers
      .map(function (tierValue) {
        var tierHousingIds = groupedByTier[tierValue];

        return (
          "<li class=\"housing-tier-group\">" +
            "<p class=\"helper-text\"><strong>Tier " + escapeHtml(tierValue) + "</strong></p>" +
            tierHousingIds.map(function (housingId) {
              var housingName = housing.getHousingLabel(housingId);
              var housingVibe = housing.getHousingVibe(housingId);
              var rentText = "$" + housing.getWeeklyRent(housingId) + "/wk";
              var perksText = formatHousingOptionPerks(housingId);

              return (
                "<div class=\"housing-option-row\">" +
                  "<p><strong>" + escapeHtml(housingName) + "</strong> <span class=\"career-job-pay\">" + rentText + "</span></p>" +
                  "<p class=\"helper-text\">" + escapeHtml(housingVibe || "A different island pace with its own tradeoffs.") + "</p>" +
                  "<p class=\"helper-text\"><strong>Perks:</strong> " + escapeHtml(perksText) + "</p>" +
                "</div>"
              );
            }).join("") +
          "</li>"
        );
      })
      .join("");
  }

  function buildJobOptions(state, placeholder, activeJobId, includeActiveJob) {
    var options = [
      "<option value=\"\">" + escapeHtml(placeholder) + "</option>"
    ];

    jobs.getAvailableJobIds(state).forEach(function (jobId) {
      if (!includeActiveJob && activeJobId && jobId === activeJobId) {
        return;
      }

      options.push(
        "<option value=\"" + jobId + "\">" + escapeHtml(jobs.getJobName(jobId)) + "</option>"
      );
    });

    return options.join("");
  }

  function syncSwitchConfirmAvailability(activeJobId) {
    var switchTarget = elements.switchJobSelect.value;
    var disabledReason = "";

    if (!switchTarget) {
      disabledReason = "Select new job";
    } else if (switchTarget === activeJobId) {
      disabledReason = "Already your active job";
    }

    elements.confirmSwitchButton.disabled = Boolean(disabledReason);
    if (disabledReason) {
      elements.confirmSwitchButton.setAttribute("title", disabledReason);
    } else {
      elements.confirmSwitchButton.removeAttribute("title");
    }
  }

  function renderLog(state) {
    var recent = state.log.slice(-24).reverse();
    var seenDedupeEntries = {};
    var rendered = [];

    recent.forEach(function (entry) {
      var displayEntry = getFriendlyLogEntry(entry, state);

      if (!displayEntry) return;
      if (
        dedupeFriendlyLogEntries[displayEntry] &&
        seenDedupeEntries[displayEntry]
      ) {
        return;
      }

      seenDedupeEntries[displayEntry] = true;
      rendered.push(displayEntry);
    });

    elements.messageLog.innerHTML = rendered
      .map(function (entry) {
        return "<li>" + escapeHtml(entry) + "</li>";
      })
      .join("");
  }

  function setButtonAvailability(wrapperEl, buttonEl, reason) {
    var disabled = Boolean(reason);

    buttonEl.disabled = disabled;
    if (disabled) {
      wrapperEl.setAttribute("data-disabled-reason", reason);
      buttonEl.setAttribute("title", reason);
    } else {
      wrapperEl.setAttribute("data-disabled-reason", "");
      buttonEl.removeAttribute("title");
    }
  }

  function getDateLabel(timeState) {
    var seasonIndex = timeState && typeof timeState.seasonIndex === "number"
      ? timeState.seasonIndex
      : 0;
    var monthLabel = monthBySeason[seasonIndex] || monthBySeason[0];
    var day = timeState && typeof timeState.day === "number" ? timeState.day : 1;

    return monthLabel + " " + day;
  }

  function getDaysUntilRentDue(weekdayIndex) {
    var daysPerWeek = typeof time.DAYS_PER_WEEK === "number" ? time.DAYS_PER_WEEK : 7;
    var normalized = typeof weekdayIndex === "number" ? weekdayIndex : 0;
    var remaining = (daysPerWeek - normalized) % daysPerWeek;

    return remaining === 0 ? daysPerWeek : remaining;
  }

  function formatRentDueText(daysUntilRent) {
    return "Monday (in " + daysUntilRent + " day" + (daysUntilRent === 1 ? "" : "s") + ")";
  }

  function getSeasonVibeLine(seasonId) {
    if (seasonId === "summer") {
      return "Tourism is strong. The island feels busy and loud.";
    }
    if (seasonId === "fall") {
      return "The crowds are thinning. Locals reclaim the island.";
    }
    if (seasonId === "winter") {
      return "The island is quiet. The wind and cold keep things slow.";
    }

    return "The island is waking up. Workers are returning and things are picking up.";
  }

  function getTodayVibeSummary(seasonId) {
    if (seasonId === "summer") {
      return "Today vibe: Crowded ferries and packed venues.";
    }
    if (seasonId === "fall") {
      return "Today vibe: Slower pace as summer crowds fade.";
    }
    if (seasonId === "winter") {
      return "Today vibe: Quiet streets and a colder island rhythm.";
    }

    return "Today vibe: The island is waking up for the season.";
  }

  function getActionsHint(state) {
    if (!state || !state.player || !state.player.needs) {
      return "It's a normal day on the island.";
    }

    if (state.player.needs.energy < 35) {
      return "You look exhausted. Rest is recommended.";
    }
    if (state.player.needs.hunger > 75) {
      return "You're hungry. Eating will help.";
    }
    if (state.player.needs.social < 35) {
      return "You feel down. Socializing may help.";
    }

    return "It's a normal day on the island.";
  }

  function summarizeActiveModifiers(state) {
    var modifiers = state &&
      state.world &&
      state.world.events &&
      Array.isArray(state.world.events.modifiers)
      ? state.world.events.modifiers
      : [];

    modifiers = modifiers.filter(function (modifier) {
      return modifier && typeof modifier === "object" && typeof modifier.type === "string";
    });

    if (modifiers.length <= 0) {
      return "No unusual conditions today.";
    }

    return modifiers.slice(0, 4).map(function (modifier) {
      var value = typeof modifier.value === "number" ? modifier.value : 0;
      var valueText = modifier.type === "tipChanceBonus"
        ? (value >= 0 ? "+" : "") + Math.round(value * 100) + "%"
        : (value >= 0 ? "+" : "") + value.toFixed(2);
      return modifier.type + " (" + valueText + ")";
    }).join(", ");
  }

  function setLogCollapsed(collapsed) {
    uiState.isLogCollapsed = Boolean(collapsed);
    if (elements.logPanel) {
      elements.logPanel.classList.toggle("collapsed", uiState.isLogCollapsed);
    }
    if (elements.leftColumn) {
      elements.leftColumn.classList.toggle("log-collapsed", uiState.isLogCollapsed);
    }
    if (elements.logToggleButton) {
      elements.logToggleButton.textContent = uiState.isLogCollapsed ? "Expand Log" : "Collapse Log";
    }
  }

  function toggleLogCollapsed() {
    setLogCollapsed(!uiState.isLogCollapsed);
  }

  function setDevToolsCollapsed(collapsed) {
    uiState.isDevToolsCollapsed = Boolean(collapsed);
    if (elements.devToolsContent) {
      elements.devToolsContent.hidden = uiState.isDevToolsCollapsed;
    }
    if (elements.devToolsToggleButton) {
      elements.devToolsToggleButton.textContent = uiState.isDevToolsCollapsed ? "Expand" : "Collapse";
    }
  }

  function toggleDevToolsCollapsed() {
    setDevToolsCollapsed(!uiState.isDevToolsCollapsed);
  }

  function setPanelCollapsed(panelKey, collapsed) {
    var bodyElement = elements[panelKey + "PanelBody"];
    var toggleElement = elements[panelKey + "ToggleButton"];

    if (!bodyElement || !toggleElement) {
      return;
    }

    uiState.panelCollapsed[panelKey] = Boolean(collapsed);
    bodyElement.hidden = uiState.panelCollapsed[panelKey];
    toggleElement.textContent = uiState.panelCollapsed[panelKey] ? "Expand" : "Collapse";
    toggleElement.setAttribute(
      "aria-expanded",
      uiState.panelCollapsed[panelKey] ? "false" : "true"
    );
  }

  function togglePanelCollapsed(panelKey) {
    setPanelCollapsed(panelKey, !uiState.panelCollapsed[panelKey]);
  }

  function getLatestRenderedLogLine() {
    var firstLogItem;

    if (!elements.messageLog) {
      return "";
    }

    firstLogItem = elements.messageLog.querySelector("li");
    return firstLogItem ? String(firstLogItem.textContent || "").trim() : "";
  }

  function setLastActionResult(summary, failurePrefixes) {
    var latestLog = getLatestRenderedLogLine();
    var blocked = Array.isArray(failurePrefixes) && failurePrefixes.some(function (prefix) {
      return latestLog.indexOf(prefix) === 0;
    });

    if (blocked) {
      return;
    }

    uiState.lastActionResult = summary;
  }

  function initUI(handlers) {
    elements.leftColumn = document.querySelector(".left-column");
    elements.topDate = ensureElement("top-date-value");
    elements.topSeason = ensureElement("top-season-value");
    elements.slots = ensureElement("slots-value");
    elements.topRentValue = ensureElement("top-rent-value");
    elements.topRentDue = ensureElement("top-rent-due-value");
    elements.devModeToggle = ensureElement("dev-mode-toggle");
    elements.devToolsPanel = ensureElement("dev-tools-panel");
    elements.previewTooltipsToggle = ensureElement("dev-preview-tooltips-toggle");

    elements.money = ensureElement("money-value");
    elements.reputationTown = ensureElement("reputation-town-value");
    elements.reputationBar = ensureElement("reputation-bar-value");
    elements.reputationTier = ensureElement("reputation-tier");
    elements.socialLocals = ensureElement("social-locals-value");
    elements.socialStaff = ensureElement("social-staff-value");
    elements.socialSummerPeople = ensureElement("social-summer-people-value");
    elements.worldDateLine = ensureElement("world-date-line");
    elements.worldSeasonLine = ensureElement("world-season-line");
    elements.worldVibeLine = ensureElement("world-vibe-line");
    elements.worldModifiersSummary = ensureElement("world-modifiers-summary");
    elements.opportunitiesUnlockedSummary = ensureElement("opportunities-unlocked-summary");
    elements.opportunitiesCurrentJobName = ensureElement("opportunities-current-job-name");
    elements.opportunitiesCurrentJobRole = ensureElement("opportunities-current-job-role");
    elements.opportunitiesCurrentJobRoleLine = elements.opportunitiesCurrentJobRole.parentNode;
    elements.opportunitiesCurrentJobPay = ensureElement("opportunities-current-job-pay");
    elements.opportunitiesCurrentJobSection = elements.opportunitiesCurrentJobName.closest(".opportunities-section");
    elements.opportunitiesJobList = ensureElement("opportunities-job-list");
    elements.opportunitiesPendingJob = ensureElement("opportunities-pending-job");
    elements.cancelPendingJobButton = ensureElement("cancel-pending-job-button");
    elements.opportunitiesHousingList = ensureElement("opportunities-housing-list");
    elements.opportunitiesHousingEmpty = ensureElement("opportunities-housing-empty");
    elements.worldPanelBody = ensureElement("world-panel-body");
    elements.opportunitiesPanelBody = ensureElement("opportunities-panel-body");
    elements.careerPanelBody = ensureElement("career-panel-body");
    elements.socialPanelBody = ensureElement("social-panel-body");
    elements.economyPanelBody = ensureElement("economy-panel-body");
    elements.goalPanelBody = ensureElement("goal-panel-body");
    elements.worldToggleButton = ensureElement("world-toggle-btn");
    elements.opportunitiesToggleButton = ensureElement("opportunities-toggle-btn");
    elements.careerToggleButton = ensureElement("career-toggle-btn");
    elements.socialToggleButton = ensureElement("social-toggle-btn");
    elements.economyToggleButton = ensureElement("economy-toggle-btn");
    elements.goalToggleButton = ensureElement("goal-toggle-btn");

    elements.housing = ensureElement("housing-value");
    elements.weeklyRent = ensureElement("weekly-rent-value");
    elements.weeklyExpenses = document.getElementById("weekly-expenses-value");
    if (!elements.weeklyExpenses) {
      console.warn("[Block Island UI] Missing #weekly-expenses-value. Housing perks row not inserted.");
    }
    elements.todayEvent = ensureElement("today-event-value");
    elements.localDiscountNote = ensureElement("local-discount-note");
    elements.economyNextRentDue = ensureElement("economy-next-rent-due-value");
    elements.housingPerksRow = document.createElement("p");
    elements.housingPerksRow.id = "housing-perks-row";
    elements.housingPerksRow.innerHTML =
      "<strong>Perks:</strong> <span id=\"housing-perks-value\">None</span>";
    if (elements.weeklyExpenses && elements.weeklyExpenses.parentNode) {
      elements.weeklyExpenses.parentNode.insertAdjacentElement("afterend", elements.housingPerksRow);
      elements.housingPerksValue = document.getElementById("housing-perks-value");
      if (!elements.housingPerksValue) {
        console.warn("[Block Island UI] Missing #housing-perks-value after row insertion.");
      }
    } else {
      elements.housingPerksValue = null;
      console.warn("[Block Island UI] Unable to insert housing perks row (missing weekly expenses anchor).");
    }
    elements.housingUnlockedOpportunities = document.createElement("div");
    elements.housingUnlockedOpportunities.id = "housing-unlocked-opportunities";
    elements.housingUnlockedOpportunities.hidden = true;
    elements.housingUnlockedOpportunities.innerHTML =
      "<p><strong id=\"housing-unlocked-opportunities-title\">Available Housing Options</strong></p>" +
      "<div class=\"scroll-list\"><ul id=\"housing-unlocked-opportunities-list\" class=\"career-job-preview\"></ul></div>";
    elements.localDiscountNote.parentNode.insertBefore(
      elements.housingUnlockedOpportunities,
      elements.localDiscountNote
    );
    elements.housingUnlockedOpportunitiesTitle = ensureElement("housing-unlocked-opportunities-title");
    elements.housingUnlockedOpportunitiesList = ensureElement("housing-unlocked-opportunities-list");

    elements.energyBar = ensureElement("energy-bar");
    elements.hungerBar = ensureElement("hunger-bar");
    elements.socialBar = ensureElement("social-bar");

    elements.energyValue = ensureElement("energy-value");
    elements.hungerValue = ensureElement("hunger-value");
    elements.socialValue = ensureElement("social-value");
    elements.lifestyleSelect = ensureElement("lifestyle-select");

    elements.startJobSelect = ensureElement("job-select-start");
    elements.switchJobSelect = ensureElement("job-select-switch");
    elements.careerJobName = ensureElement("career-job-name");
    elements.careerLevel = ensureElement("career-level-value");
    elements.careerPay = ensureElement("career-pay-value");
    elements.nextPromotionValue = ensureElement("next-promotion-value");
    elements.careerJobLabel = elements.careerJobName.parentNode.querySelector("strong");
    elements.careerRoleLabel = elements.careerLevel.parentNode.querySelector("strong");
    elements.careerStartState = ensureElement("career-start-state");
    elements.careerActiveState = ensureElement("career-active-state");
    elements.careerSwitchState = ensureElement("career-switch-state");
    elements.careerStatusRow = ensureElement("career-status-row");
    elements.careerStatusValue = ensureElement("career-status-value");
    elements.careerEmployedDetails = ensureElement("career-employed-details");
    elements.careerPerksRow = document.createElement("p");
    elements.careerPerksRow.id = "career-perks-row";
    elements.careerPerksRow.innerHTML =
      "<strong>Perks:</strong> <span id=\"career-perks-value\">None</span>";
    elements.careerEmployedDetails.appendChild(elements.careerPerksRow);
    elements.careerPerksValue = ensureElement("career-perks-value");
    elements.careerJobPreview = ensureElement("career-job-preview");
    elements.switchJobButton = ensureElement("switch-job-button");
    elements.quitJobButton = ensureElement("quit-job-button");
    elements.findJobButton = ensureElement("find-job-button");
    elements.confirmSwitchButton = ensureElement("confirm-switch-button");
    elements.careerUnlockedOpportunities = document.createElement("div");
    elements.careerUnlockedOpportunities.id = "career-unlocked-opportunities";
    elements.careerUnlockedOpportunities.hidden = true;
    elements.careerUnlockedOpportunities.innerHTML =
      "<p><strong id=\"career-unlocked-opportunities-title\">Unlocked Opportunities</strong></p>" +
      "<div class=\"scroll-list\"><ul id=\"career-unlocked-opportunities-list\" class=\"career-job-preview\"></ul></div>";
    elements.careerEmployedDetails.appendChild(elements.careerUnlockedOpportunities);
    elements.careerUnlockedOpportunitiesTitle = ensureElement("career-unlocked-opportunities-title");
    elements.careerUnlockedOpportunitiesList = ensureElement("career-unlocked-opportunities-list");

    elements.messageLog = ensureElement("message-log");
    elements.logPanel = elements.messageLog.closest(".log-panel");
    elements.logToggleButton = ensureElement("log-toggle-btn");
    elements.goalMoneyProgress = ensureElement("goal-money-progress");
    elements.goalReputationProgress = ensureElement("goal-reputation-progress");
    elements.goalStatus = ensureElement("goal-status");

    elements.workButton = ensureElement("work-button");
    elements.workButtonSub = elements.workButton.querySelector(".btn-sub");
    elements.workWrap = ensureElement("work-wrap");
    elements.actionsTodayDate = ensureElement("actions-today-date");
    elements.actionsTodaySlots = ensureElement("actions-today-slots");
    elements.actionsTodayHint = ensureElement("actions-today-hint");
    elements.quickSummaryRent = ensureElement("quick-summary-rent");
    elements.quickSummaryPay = ensureElement("quick-summary-pay");
    elements.quickSummaryConditions = ensureElement("quick-summary-conditions");
    elements.quickSummarySuggestion = ensureElement("quick-summary-suggestion");
    elements.actionsQuickSummary = ensureElement("actions-quick-summary");
    elements.lastActionResultLine = document.createElement("p");
    elements.lastActionResultLine.id = "last-action-result-line";
    elements.lastActionResultLine.hidden = true;
    elements.actionsQuickSummary.appendChild(elements.lastActionResultLine);
    elements.actionsTooltipEatLine = ensureElement("actions-tooltip-eat-line");
    elements.actionsTooltipSocializeLine = ensureElement("actions-tooltip-socialize-line");
    elements.eatButton = ensureElement("eat-button");
    elements.eatWrap = ensureElement("eat-wrap");
    elements.socializeButton = ensureElement("socialize-button");
    elements.socializeWrap = ensureElement("socialize-wrap");
    elements.restButton = ensureElement("rest-button");
    elements.restWrap = ensureElement("rest-wrap");
    elements.sleepButton = ensureElement("sleep-button");
    elements.sleepWrap = ensureElement("sleep-wrap");
    elements.moveSharedHouseButton = ensureElement("move-shared-house-button");
    elements.moveSharedHouseWrap = ensureElement("move-shared-house-wrap");
    elements.moveSharedHouseHelp = ensureElement("move-shared-house-help");
    elements.newGameButton = ensureElement("new-game-button");
    elements.devToolsContent = ensureElement("dev-tools-content");
    elements.devToolsToggleButton = ensureElement("dev-tools-toggle-btn");
    elements.devActionButtons = Array.prototype.slice.call(
      document.querySelectorAll("[data-dev-action]")
    );

    elements.startJobSelect.innerHTML = "<option value=\"\">Select a starting job</option>";
    elements.switchJobSelect.innerHTML = "<option value=\"\">Select new job</option>";
    elements.careerJobPreview.innerHTML = "";
    if (elements.careerJobLabel) {
      elements.careerJobLabel.textContent = "Job:";
    }
    if (elements.careerRoleLabel) {
      elements.careerRoleLabel.textContent = "Role:";
    }
    setPreviewTooltipsEnabled(false);
    setLogCollapsed(false);
    setDevToolsCollapsed(false);
    setPanelCollapsed("world", uiState.panelCollapsed.world);
    setPanelCollapsed("opportunities", uiState.panelCollapsed.opportunities);
    setPanelCollapsed("career", uiState.panelCollapsed.career);
    setPanelCollapsed("social", uiState.panelCollapsed.social);
    setPanelCollapsed("economy", uiState.panelCollapsed.economy);
    setPanelCollapsed("goal", uiState.panelCollapsed.goal);

    elements.workButton.addEventListener("click", function () {
      handlers.onWork();
      setLastActionResult("Last: Worked a shift. (see log)", [
        "You need a job before you can work.",
        "You've already worked today.",
        "That shift couldn't start right now.",
        "You're out of actions today. Sleep to begin tomorrow."
      ]);
    });
    elements.eatButton.addEventListener("click", function () {
      handlers.onEat();
      setLastActionResult("Last: Ate a meal. (see log)", [
        "You need $",
        "You're out of actions today. Sleep to begin tomorrow."
      ]);
    });
    elements.socializeButton.addEventListener("click", function () {
      handlers.onSocialize();
      setLastActionResult("Last: Socialized. (see log)", [
        "You need $",
        "You're out of actions today. Sleep to begin tomorrow."
      ]);
    });
    elements.restButton.addEventListener("click", function () {
      handlers.onRest();
      setLastActionResult("Last: Rested. (see log)", [
        "You're out of actions today. Sleep to begin tomorrow."
      ]);
    });
    elements.sleepButton.addEventListener("click", function () {
      handlers.onSleep();
      setLastActionResult("Last: Slept. New day started. (see log)");
    });
    elements.moveSharedHouseButton.addEventListener("click", handlers.onMoveToSharedHouse);
    elements.newGameButton.addEventListener("click", function () {
      uiState.lastActionResult = "";
      handlers.onNewGame();
    });
    elements.devModeToggle.addEventListener("change", function (event) {
      if (typeof handlers.onToggleDevMode === "function") {
        handlers.onToggleDevMode(Boolean(event.target.checked));
      }
    });
    elements.devActionButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        if (typeof handlers.onDevToolAction === "function") {
          handlers.onDevToolAction(button.getAttribute("data-dev-action"));
        }
      });
    });
    elements.previewTooltipsToggle.addEventListener("click", togglePreviewTooltips);
    elements.logToggleButton.addEventListener("click", toggleLogCollapsed);
    elements.devToolsToggleButton.addEventListener("click", toggleDevToolsCollapsed);
    elements.worldToggleButton.addEventListener("click", function () {
      togglePanelCollapsed("world");
    });
    elements.opportunitiesToggleButton.addEventListener("click", function () {
      togglePanelCollapsed("opportunities");
    });
    elements.careerToggleButton.addEventListener("click", function () {
      togglePanelCollapsed("career");
    });
    elements.socialToggleButton.addEventListener("click", function () {
      togglePanelCollapsed("social");
    });
    elements.economyToggleButton.addEventListener("click", function () {
      togglePanelCollapsed("economy");
    });
    elements.goalToggleButton.addEventListener("click", function () {
      togglePanelCollapsed("goal");
    });
    elements.lifestyleSelect.addEventListener("change", function (event) {
      if (typeof handlers.onSetLifestyle === "function") {
        handlers.onSetLifestyle(event.target.value);
      }
    });

    elements.startJobSelect.addEventListener("change", function (event) {
      handlers.onSelectStartingJob(event.target.value);
    });
    elements.opportunitiesJobList.addEventListener("click", function (event) {
      var button = event.target && typeof event.target.closest === "function"
        ? event.target.closest("[data-apply-job-id]")
        : null;
      var jobId;
      var activeJobId;

      if (!button) return;
      jobId = button.getAttribute("data-apply-job-id");
      if (!jobId) return;

      activeJobId = typeof handlers.getActiveJobId === "function"
        ? handlers.getActiveJobId()
        : "";
      if (activeJobId) {
        handlers.onConfirmSwitchJob(jobId);
      } else {
        handlers.onSelectStartingJob(jobId);
      }
    });
    elements.opportunitiesHousingList.addEventListener("click", function (event) {
      var button = event.target && typeof event.target.closest === "function"
        ? event.target.closest("[data-housing-move-id]")
        : null;
      var housingId;

      if (!button) return;
      housingId = button.getAttribute("data-housing-move-id");
      if (!housingId) return;

      if (housing && typeof housing.setPendingMoveTarget === "function") {
        housing.setPendingMoveTarget(housingId);
      }
      handlers.onMoveToSharedHouse();
    });
    elements.cancelPendingJobButton.addEventListener("click", function () {
      if (typeof handlers.onCancelPendingJob === "function") {
        handlers.onCancelPendingJob();
      }
    });
    elements.housingUnlockedOpportunitiesList.addEventListener("click", function (event) {
      var button = event.target && typeof event.target.closest === "function"
        ? event.target.closest("[data-housing-move-id]")
        : null;
      var housingId;

      if (!button) return;

      housingId = button.getAttribute("data-housing-move-id");
      if (!housingId) return;

      if (housing && typeof housing.setPendingMoveTarget === "function") {
        housing.setPendingMoveTarget(housingId);
      }
      handlers.onMoveToSharedHouse();
    });

    elements.quitJobButton.addEventListener("click", function () {
      careerPanelMode = "default";
      handlers.onQuitJob();
    });

    elements.findJobButton.addEventListener("click", function () {
      careerPanelMode = "find";
      handlers.onFindJob();
    });

    elements.switchJobSelect.addEventListener("change", function () {
      syncSwitchConfirmAvailability(handlers.getActiveJobId());
    });

    elements.confirmSwitchButton.addEventListener("click", function () {
      var success = handlers.onConfirmSwitchJob(elements.switchJobSelect.value);
      if (success) {
        careerPanelMode = "default";
        elements.switchJobSelect.value = "";
        handlers.onOpenSwitchJob();
      }
    });
  }

  function renderUI(state) {
    if (
      !state ||
      !state.time ||
      !state.jobs ||
      !state.player ||
      !state.player.needs ||
      !state.world
    ) {
      console.warn("[Block Island UI] Missing core state; skipping UI render.");
      return;
    }

    var requirements = housing.SHARED_HOUSE_REQUIREMENTS || fallbackRequirements;
    var slotsRemaining = state.time.actionSlotsRemaining;
    var noSlots = slotsRemaining <= 0;
    var townReputation = reputation && typeof reputation.getTownReputation === "function"
      ? reputation.getTownReputation(state)
      : state.player.reputation;
    var moneyNeeded = Math.max(0, requirements.money - state.player.money);
    var reputationNeeded = Math.max(0, requirements.reputation - townReputation);
    var availableHousingIds = housing && typeof housing.getAvailableHousingOptionIds === "function"
      ? housing.getAvailableHousingOptionIds(state)
      : [];
    var readyToMove = availableHousingIds.length > 0;
    var goalNeeds = [];
    var minWorkEnergy = typeof jobs.MIN_WORK_ENERGY === "number" ? jobs.MIN_WORK_ENERGY : null;
    var workDisabledReason = "";
    var rentAmount = housing.getEffectiveWeeklyRent(state);
    var weeklyExpenses = rentAmount;
    var localDiscountPercent = 0;
    var daysUntilRent = getDaysUntilRentDue(state.time.weekdayIndex);
    var rentDueText = formatRentDueText(daysUntilRent);
    var weekdayName = time.getWeekdayName(state.time.weekdayIndex);
    var seasonName = time.getSeasonName(state.time.seasonIndex);
    var seasonId = state && state.world && typeof state.world.season === "string"
      ? String(state.world.season).toLowerCase()
      : "spring";
    var activeJobId = state.jobs.activeJobId;
    var conditionsSummary = summarizeActiveModifiers(state);
    var activeJobState;
    var activeJobPay;
    var activeRoleTitle;
    var promotionStatus;
    var lifestyleId = lifestyle && typeof lifestyle.getLifestyle === "function"
      ? lifestyle.getLifestyle(state)
      : "normal";
    var baseEatCost = balance && typeof balance.BASE_EAT_COST === "number"
      ? balance.BASE_EAT_COST
      : 18;
    var baseSocializeCost = balance && typeof balance.BASE_SOCIALIZE_COST === "number"
      ? balance.BASE_SOCIALIZE_COST
      : 8;
    var eatCost = lifestyle && typeof lifestyle.applyLifestyleToCost === "function"
      ? lifestyle.applyLifestyleToCost(baseEatCost, lifestyleId, "eat")
      : baseEatCost;
    var socializeCost = lifestyle && typeof lifestyle.applyLifestyleToCost === "function"
      ? lifestyle.applyLifestyleToCost(baseSocializeCost, lifestyleId, "socialize")
      : baseSocializeCost;
    var devModeEnabled = Boolean(
      devtools &&
      typeof devtools.isDevModeEnabled === "function" &&
      devtools.isDevModeEnabled()
    );

    if (
      socialUnlocks &&
      typeof socialUnlocks.getLocalsDiscountPercent === "function"
    ) {
      localDiscountPercent = socialUnlocks.getLocalsDiscountPercent(state);
    }

    elements.topDate.textContent = getDateLabel(state.time) + " \u2022 " + weekdayName;
    elements.topSeason.textContent = seasonName;
    elements.slots.textContent = slotsRemaining + "/" + time.MAX_ACTION_SLOTS;
    elements.topRentValue.textContent = "$" + rentAmount;
    elements.topRentDue.textContent = "Next rent due: " + rentDueText;
    elements.devModeToggle.checked = devModeEnabled;
    elements.devToolsPanel.hidden = !devModeEnabled;
    elements.devToolsContent.hidden = !devModeEnabled || uiState.isDevToolsCollapsed;
    elements.previewTooltipsToggle.hidden = !devModeEnabled;
    if (!devModeEnabled && previewTooltipsEnabled) {
      setPreviewTooltipsEnabled(false);
    }
    if (elements.devToolsToggleButton) {
      elements.devToolsToggleButton.textContent = uiState.isDevToolsCollapsed ? "Expand" : "Collapse";
    }
    elements.lifestyleSelect.value = lifestyleId;
    elements.actionsTooltipEatLine.textContent =
      "Eat: Costs $" + eatCost + " to restore hunger and energy.";
    elements.actionsTooltipSocializeLine.textContent =
      "Socialize: Costs $" + socializeCost + " to build reputation and social network.";
    elements.actionsTodayDate.textContent = seasonName + " \u2022 " + weekdayName;
    elements.actionsTodaySlots.textContent =
      "Actions left: " + slotsRemaining + "/" + time.MAX_ACTION_SLOTS;
    elements.actionsTodayHint.textContent = getActionsHint(state);
    elements.worldDateLine.textContent = getDateLabel(state.time) + " \u2022 " + weekdayName;
    elements.worldSeasonLine.textContent = seasonName;
    elements.worldVibeLine.textContent = getSeasonVibeLine(seasonId);
    elements.worldModifiersSummary.textContent = conditionsSummary;
    elements.quickSummaryRent.textContent = "Next rent due: " + rentDueText;
    elements.quickSummaryPay.textContent = getTodayVibeSummary(seasonId);
    elements.quickSummaryConditions.textContent = "Conditions: " + conditionsSummary;
    elements.quickSummarySuggestion.textContent = "Suggested action: " + getActionsHint(state);
    if (elements.lastActionResultLine) {
      elements.lastActionResultLine.textContent = uiState.lastActionResult;
      elements.lastActionResultLine.hidden = !uiState.lastActionResult;
    }

    renderPlayerPanel(state);
    renderSocialNetworkPanel(state);
    renderOpportunitiesSummary(state, activeJobId);

    elements.housing.textContent = housing.getHousingLabel(state.housing.current);
    elements.weeklyRent.textContent = "$" + rentAmount + "/wk";
    if (elements.weeklyExpenses) {
      elements.weeklyExpenses.textContent = "$" + weeklyExpenses + "/wk";
    }
    if (elements.housingPerksValue) {
      elements.housingPerksValue.textContent = getHousingPerkSummary(state);
    }
    elements.todayEvent.textContent = state.world &&
      state.world.events &&
      typeof state.world.events.lastEventTitle === "string" &&
      state.world.events.lastEventTitle
      ? state.world.events.lastEventTitle
      : "None";
    if (localDiscountPercent > 0) {
      elements.localDiscountNote.hidden = false;
      elements.localDiscountNote.textContent = "Local discount: -" + localDiscountPercent + "%";
    } else {
      elements.localDiscountNote.hidden = true;
    }
    elements.economyNextRentDue.textContent = rentDueText;
    renderUnlockedHousingOpportunities(state);

    elements.careerStartState.hidden = true;
    elements.careerSwitchState.hidden = true;
    elements.careerActiveState.hidden = false;

    if (!activeJobId) {
      elements.careerUnlockedOpportunities.hidden = true;
      elements.careerJobName.textContent = "None";
      elements.careerStatusValue.textContent = "Unemployed";
      elements.careerStatusRow.hidden = false;
      elements.careerEmployedDetails.hidden = true;
      elements.careerPerksValue.textContent = "None";
    } else {
      elements.careerStatusRow.hidden = true;
      elements.careerEmployedDetails.hidden = false;

      activeJobState = state.jobs.list[activeJobId];
      activeJobPay = jobs.getPayForLevel(activeJobId, activeJobState.level);
      activeRoleTitle = jobs && typeof jobs.getJobRoleTitle === "function"
        ? jobs.getJobRoleTitle(activeJobId, activeJobState.level)
        : ("Level " + activeJobState.level);
      promotionStatus = jobs.getPromotionStatusForJob(state, activeJobId);

      elements.careerJobName.textContent = jobs.getJobName(activeJobId);
      elements.careerLevel.textContent = activeRoleTitle + " (Level " + activeJobState.level + ")";
      elements.careerPay.textContent = "$" + activeJobPay + "/shift";
      elements.careerPerksValue.textContent = getCareerPerkSummary(state);

      if (promotionStatus.isMaxLevel) {
        elements.nextPromotionValue.textContent = "MAX (" + activeRoleTitle + ")";
      } else {
        elements.nextPromotionValue.textContent =
          promotionStatus.progress + " / " + promotionStatus.threshold;
      }

      renderUnlockedOpportunities(state, activeJobId);
    }

    renderLog(state);

    elements.goalMoneyProgress.textContent = "$" + state.player.money + " / $" + requirements.money;
    elements.goalReputationProgress.textContent =
      townReputation + " / " + requirements.reputation;

    if (state.housing.current === "shared_house_room") {
      elements.goalStatus.textContent = "Goal completed.";
    } else if (readyToMove) {
      elements.goalStatus.textContent = "Ready to move!";
    } else {
      if (moneyNeeded > 0) {
        goalNeeds.push("Need $" + moneyNeeded + " more money");
      }
      if (reputationNeeded > 0) {
        goalNeeds.push("Need " + reputationNeeded + " more Town Rep");
      }
      elements.goalStatus.textContent = goalNeeds.join(". ");
    }

    elements.moveSharedHouseButton.hidden = true;
    elements.moveSharedHouseWrap.hidden = true;
    if (readyToMove) {
      elements.moveSharedHouseHelp.textContent = "Available housing options are listed above.";
    } else {
      elements.moveSharedHouseHelp.textContent =
        "Requires $" + requirements.money + " and " + requirements.reputation + " Town Rep";
    }

    if (!activeJobId) {
      workDisabledReason = "You need a job first. Apply in Opportunities.";
    } else if (noSlots) {
      workDisabledReason = "No actions remaining today";
    } else if (state.jobs.workedToday) {
      workDisabledReason = "You already worked today";
    } else if (minWorkEnergy !== null && state.player.needs.energy < minWorkEnergy) {
      workDisabledReason = "Not enough energy";
    }

    if (elements.workButtonSub) {
      elements.workButtonSub.textContent = activeJobId
        ? "Money + rep (varies by shift)"
        : "You need a job first. Apply in Opportunities.";
    }

    setButtonAvailability(elements.workWrap, elements.workButton, workDisabledReason);
    setButtonAvailability(
      elements.eatWrap,
      elements.eatButton,
      noSlots ? "No actions remaining today" : ""
    );
    setButtonAvailability(
      elements.socializeWrap,
      elements.socializeButton,
      noSlots ? "No actions remaining today" : ""
    );
    setButtonAvailability(
      elements.restWrap,
      elements.restButton,
      noSlots ? "No actions remaining today" : ""
    );
    setButtonAvailability(
      elements.sleepWrap,
      elements.sleepButton,
      slotsRemaining > 0 ? "Use your remaining actions before sleeping" : ""
    );

  }

  ns.ui = {
    initUI: initUI,
    renderUI: renderUI,
    formatLogEntryForDisplay: getFriendlyLogEntry
  };
})(window);
