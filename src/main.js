(function (global) {
  var ns = global.BlockIsland = global.BlockIsland || {};

  var stateApi = ns.state;
  var storage = ns.storage;
  var time = ns.time;
  var needs = ns.needs;
  var jobs = ns.jobs;
  var reputation = ns.reputation;
  var housing = ns.housing;
  var events = ns.events;
  var socialUnlocks = ns.socialUnlocks;
  var balance = ns.balance;
  var lifestyle = ns.lifestyle;
  var devtools = ns.devtools;
  var ui = ns.ui;
  var DEBUG_LOGS = false;
  var JOB_SWITCH_COOLDOWN_DAYS = 3;

  function debugLog(message, details) {
    if (!DEBUG_LOGS) return;

    if (typeof details === "undefined") {
      console.info("[Block Island]", message);
      return;
    }

    console.info("[Block Island]", message, details);
  }

  function random() {
    if (ns.rng && typeof ns.rng.next === "function") {
      return ns.rng.next();
    }

    return 0.5;
  }

  function hasCoreRuntimeState() {
    return Boolean(
      state &&
      state.time &&
      state.jobs &&
      state.player &&
      state.player.needs &&
      state.world
    );
  }

  function guardCoreRuntimeState(actionName) {
    if (hasCoreRuntimeState()) {
      return true;
    }

    console.warn("[Block Island] Missing required state for action:", actionName);
    return false;
  }

  var loadedState = storage.loadState();
  var state = stateApi.createStateFromSave(loadedState);
  syncWorldSeasonFromTime();
  syncWorldDayFromTime();

  if (loadedState) {
    stateApi.addLogEntry(state, "Welcome back. Another island day awaits.");
  } else {
    debugLog("No save found. Using initial state.");
  }

  function render() {
    ui.renderUI(state);
  }

  function log(message) {
    stateApi.addLogEntry(state, message);
  }

  function persistAndRenderFromDevTool() {
    if (global.__DEV_DISABLE_SAVE) {
      render();
      return;
    }

    var saveOk = storage.saveState(state);

    if (!saveOk) {
      console.warn("[Block Island] Save failed after dev tool action.");
    }

    render();
  }

  var devToolsApi = devtools && typeof devtools.initDevTools === "function"
    ? devtools.initDevTools(
        function () {
          return state;
        },
        {
          onLog: log,
          onStateChanged: persistAndRenderFromDevTool,
          runWorkAction: onWork,
          runEatAction: onEat,
          runSocializeAction: onSocialize,
          runRestAction: onRest,
          runSleepAction: onSleep,
          applyJobAction: function (jobId) {
            if (state.jobs && state.jobs.activeJobId) {
              return onConfirmSwitchJob(jobId);
            }
            return onSelectStartingJob(jobId);
          },
          syncWorldSeasonFromTime: syncWorldSeasonFromTime
        }
      )
    : null;

  function logTierChangeIfNeeded(repChangeResult) {
    if (repChangeResult && repChangeResult.tierChanged) {
      log("People around town now see you as " + repChangeResult.afterTier + ".");
    }
  }

  function syncWorldSeasonFromTime() {
    if (!state.world || typeof state.world !== "object") {
      state.world = {};
    }

    if (time && typeof time.getSeasonId === "function") {
      state.world.season = time.getSeasonId(state.time.seasonIndex);
      return;
    }

    switch (state.time.seasonIndex) {
      case 1:
        state.world.season = "summer";
        break;
      case 2:
        state.world.season = "fall";
        break;
      case 3:
        state.world.season = "winter";
        break;
      default:
        state.world.season = "spring";
        break;
    }
  }

  function getCurrentDayNumberFromTimeState() {
    if (events && typeof events.getCurrentDayNumber === "function") {
      return events.getCurrentDayNumber(state);
    }

    if (time && typeof time.DAYS_PER_SEASON === "number") {
      return ((state.time.year - 1) * 4 * time.DAYS_PER_SEASON) +
        (state.time.seasonIndex * time.DAYS_PER_SEASON) +
        state.time.day;
    }

    return 1;
  }

  function syncWorldDayFromTime() {
    if (!state.world || typeof state.world !== "object") {
      state.world = {};
    }
    state.world.day = getCurrentDayNumberFromTimeState();
  }

  function trySpendActionSlot() {
    if (!time.consumeActionSlot(state.time)) {
      log("You're out of actions today. Sleep to begin tomorrow.");
      render();
      return false;
    }

    return true;
  }

  function applyTownReputationChange(amount) {
    if (amount === 0) return;

    if (reputation && typeof reputation.addTownReputation === "function") {
      return reputation.addTownReputation(state, amount);
    }

    return reputation.addReputation(state, amount);
  }

  function applyBarReputationChange(amount) {
    if (amount === 0) return;

    if (reputation && typeof reputation.addBarReputation === "function") {
      return reputation.addBarReputation(state, amount);
    }

    return {
      before: 0,
      after: 0,
      delta: 0
    };
  }

  function ensureLifetimeEarningsState() {
    var stats;
    var lifetime;

    if (!state.stats || typeof state.stats !== "object") {
      state.stats = stateApi && typeof stateApi.createInitialStatsState === "function"
        ? stateApi.createInitialStatsState()
        : {
            lifetimeEarningsBySource: {
              jobs: 0,
              tips: 0,
              other: 0
            }
          };
    }

    stats = state.stats;
    if (!stats.lifetimeEarningsBySource || typeof stats.lifetimeEarningsBySource !== "object") {
      stats.lifetimeEarningsBySource = {
        jobs: 0,
        tips: 0,
        other: 0
      };
    }

    lifetime = stats.lifetimeEarningsBySource;
    if (typeof lifetime.jobs !== "number" || Number.isNaN(lifetime.jobs)) lifetime.jobs = 0;
    if (typeof lifetime.tips !== "number" || Number.isNaN(lifetime.tips)) lifetime.tips = 0;
    if (typeof lifetime.other !== "number" || Number.isNaN(lifetime.other)) lifetime.other = 0;
  }

  function addLifetimeEarnings(source, amount) {
    var normalizedAmount = Math.max(0, Math.floor(amount || 0));

    if (normalizedAmount <= 0) return;

    ensureLifetimeEarningsState();

    if (!Object.prototype.hasOwnProperty.call(state.stats.lifetimeEarningsBySource, source)) {
      state.stats.lifetimeEarningsBySource[source] = 0;
    }

    state.stats.lifetimeEarningsBySource[source] += normalizedAmount;
  }

  function getLifestyleId() {
    if (lifestyle && typeof lifestyle.getLifestyle === "function") {
      return lifestyle.getLifestyle(state);
    }

    return "normal";
  }

  function clampNeedValue(value) {
    if (needs && typeof needs.clampNeed === "function") {
      return needs.clampNeed(value);
    }

    return Math.max(0, Math.min(100, Math.round(value)));
  }

  function applyLifestyleSleepPassiveEffects() {
    var lifestyleId = getLifestyleId();
    var energyDelta = 0;
    var moodDelta = 0;
    var flavorLog = "";
    var flavorLogChance = 0;

    if (lifestyleId === "frugal") {
      energyDelta = 3;
      moodDelta = -2;
      flavorLog = "You kept things simple today.";
      flavorLogChance = 0.2;
    } else if (lifestyleId === "social") {
      energyDelta = -3;
      moodDelta = 2;
      flavorLog = "You stayed out a bit later than planned.";
      flavorLogChance = 0.2;
    } else {
      flavorLog = "You settle into your routine.";
      flavorLogChance = 0.1;
    }

    if (energyDelta !== 0) {
      state.player.needs.energy = clampNeedValue(state.player.needs.energy + energyDelta);
    }
    if (moodDelta !== 0) {
      state.player.needs.social = clampNeedValue(state.player.needs.social + moodDelta);
    }

    if (flavorLog && random() < flavorLogChance) {
      log(flavorLog);
    }
  }

  function applyActionNeedsWithLifestyle(actionName, gainType, lifestyleId) {
    var baseDelta = needs.NEED_EFFECTS && needs.NEED_EFFECTS[actionName];
    var scaledDelta = {};

    if (!baseDelta || typeof needs.applyNeedsDelta !== "function") {
      needs.applyActionNeeds(state, actionName);
      return;
    }

    Object.keys(baseDelta).forEach(function (key) {
      var change = baseDelta[key];

      if (typeof change !== "number") {
        scaledDelta[key] = 0;
        return;
      }

      if (change > 0 && lifestyle && typeof lifestyle.applyLifestyleToGain === "function") {
        scaledDelta[key] = lifestyle.applyLifestyleToGain(change, lifestyleId, gainType);
      } else {
        scaledDelta[key] = change;
      }
    });

    needs.applyNeedsDelta(state, scaledDelta);
  }

  function getRandomIntegerInclusive(min, max) {
    return Math.floor(random() * (max - min + 1)) + min;
  }

  function chooseSocialGroupId() {
    var groups = ["locals", "staff", "summerPeople"];
    return groups[getRandomIntegerInclusive(0, groups.length - 1)];
  }

  function getSocializeRelationshipLogLine(groupId, amount) {
    if (groupId === "locals") {
      return "You spent time with locals around town. (+" + amount + " Local relationship)";
    }

    if (groupId === "staff") {
      return "You hung out with other seasonal workers. (+" + amount + " Staff relationship)";
    }

    return "You met some summer people and made a good impression. (+" + amount + " Summer People relationship)";
  }

  function ensureFlagsState() {
    if (!state.flags && stateApi && typeof stateApi.createInitialFlagsState === "function") {
      state.flags = stateApi.createInitialFlagsState();
    }
  }

  function logSocialUnlockAnnouncements() {
    var locals;
    var staff;
    var summerPeople;

    ensureFlagsState();
    if (!state.flags) return;

    locals = stateApi.getLocalRelationship(state);
    staff = stateApi.getStaffRelationship(state);
    summerPeople = stateApi.getSummerPeopleRelationship
      ? stateApi.getSummerPeopleRelationship(state)
      : stateApi.getTouristRelationship(state);

    if (locals >= 60 && !state.flags.announcedLocals60) {
      state.flags.announcedLocals60 = true;
      log("You're starting to feel like a local. Rent is a little easier now. (-10% rent)");
    }
    if (locals >= 85 && !state.flags.announcedLocals85) {
      state.flags.announcedLocals85 = true;
      log("Locals look out for you now. Rent is even easier to cover. (-20% rent)");
    }

    if (staff >= 60 && !state.flags.announcedStaff60) {
      state.flags.announcedStaff60 = true;
      log("Seasonal folks have your back. Work pays a bit better now.");
    }
    if (staff >= 85 && !state.flags.announcedStaff85) {
      state.flags.announcedStaff85 = true;
      log("Seasonal crews are vouching for you everywhere. Work pays even better now.");
    }

    if (summerPeople >= 50 && !state.flags.announcedSummerPeople50) {
      state.flags.announcedSummerPeople50 = true;
      state.flags.announcedTourists50 = true;
      log("You've got a good vibe with visitors. Tips happen sometimes now.");
    }
    if (summerPeople >= 80 && !state.flags.announcedSummerPeople80) {
      state.flags.announcedSummerPeople80 = true;
      state.flags.announcedTourists80 = true;
      log("Visitors keep talking about you. Tips come around even more often now.");
    }
  }

  function tryGrantTouristTip(lifestyleId) {
    var tipConfig;
    var chanceMult = 1;
    var finalChance;
    var amount;

    if (
      !socialUnlocks ||
      typeof socialUnlocks.getTouristTipConfig !== "function"
    ) {
      return 0;
    }

    tipConfig = socialUnlocks.getTouristTipConfig(state);
    if (!tipConfig.enabled) return 0;
    if (
      lifestyle &&
      typeof lifestyle.getTouristTipChanceMultiplier === "function"
    ) {
      chanceMult = lifestyle.getTouristTipChanceMultiplier(lifestyleId);
    }

    finalChance = Math.max(0, Math.min(0.75, tipConfig.chance * chanceMult));
    if (random() >= finalChance) return 0;

    amount = getRandomIntegerInclusive(tipConfig.minAmount, tipConfig.maxAmount);
    state.player.money += amount;
    return amount;
  }

  function hasJobTag(jobId, tag) {
    var tags = jobs && typeof jobs.getJobTags === "function" ? jobs.getJobTags(jobId) : [];
    return tags.indexOf(tag) >= 0;
  }

  function tryGrantWorkTips(jobId, lifestyleId) {
    var locals = stateApi.getLocalRelationship(state);
    var summerPeople = stateApi.getSummerPeopleRelationship
      ? stateApi.getSummerPeopleRelationship(state)
      : stateApi.getTouristRelationship(state);
    var baseChance = balance && typeof balance.TIP_CHANCE_BASE === "number"
      ? balance.TIP_CHANCE_BASE
      : 0.25;
    var chanceCap = balance && typeof balance.TIP_CHANCE_MAX === "number"
      ? balance.TIP_CHANCE_MAX
      : 0.75;
    var busySeasonMult = balance && typeof balance.BUSY_SEASON_TIP_MULT === "number"
      ? balance.BUSY_SEASON_TIP_MULT
      : 1.25;
    var summerChancePerPoint = balance && typeof balance.SUMMER_PEOPLE_TIP_CHANCE_PER_POINT === "number"
      ? balance.SUMMER_PEOPLE_TIP_CHANCE_PER_POINT
      : 0.002;
    var localsChancePerPoint = balance && typeof balance.LOCALS_TIP_CHANCE_PER_POINT === "number"
      ? balance.LOCALS_TIP_CHANCE_PER_POINT
      : 0.001;
    var summerAmountPerPoint = balance && typeof balance.SUMMER_PEOPLE_TIP_AMOUNT_PER_POINT === "number"
      ? balance.SUMMER_PEOPLE_TIP_AMOUNT_PER_POINT
      : 0.004;
    var localsAmountPerPoint = balance && typeof balance.LOCALS_TIP_AMOUNT_PER_POINT === "number"
      ? balance.LOCALS_TIP_AMOUNT_PER_POINT
      : 0.002;
    var tipMin = balance && typeof balance.TIP_MIN === "number" ? balance.TIP_MIN : 5;
    var tipMax = balance && typeof balance.TIP_MAX === "number" ? balance.TIP_MAX : 35;
    var chanceMultiplier = 1;
    var eventChanceBonus = 0;
    var eventAmountMultiplier = 1;
    var chance;
    var amountMultiplier;
    var amount;

    if (!hasJobTag(jobId, "tips")) {
      return 0;
    }

    if (events && typeof events.getCombinedTipChanceBonus === "function") {
      eventChanceBonus = events.getCombinedTipChanceBonus(state);
    }
    if (events && typeof events.getCombinedTipAmountMultiplier === "function") {
      eventAmountMultiplier = events.getCombinedTipAmountMultiplier(state);
    }

    chance = baseChance +
      (summerPeople * summerChancePerPoint) +
      (locals * localsChancePerPoint) +
      eventChanceBonus;
    if (time && typeof time.isBusySeason === "function" && time.isBusySeason(state)) {
      chance *= 1 + ((busySeasonMult - 1) * 0.6);
    }

    if (lifestyle && typeof lifestyle.getTouristTipChanceMultiplier === "function") {
      chanceMultiplier = lifestyle.getTouristTipChanceMultiplier(lifestyleId);
    }
    chance = Math.max(0, Math.min(chanceCap, chance * chanceMultiplier));

    if (random() >= chance) {
      return 0;
    }

    amountMultiplier = 1 +
      (summerPeople * summerAmountPerPoint) +
      (locals * localsAmountPerPoint);
    if (time && typeof time.isBusySeason === "function" && time.isBusySeason(state)) {
      amountMultiplier *= busySeasonMult;
    }

    amountMultiplier *= eventAmountMultiplier;

    amount = Math.max(0, Math.round(getRandomIntegerInclusive(tipMin, tipMax) * amountMultiplier));
    if (amount <= 0) {
      return 0;
    }

    state.player.money += amount;
    addLifetimeEarnings("tips", amount);
    return amount;
  }

  function onWork() {
    var workResult;
    var staffBonus = 0;
    var totalPay;
    var workPayMultiplier = 1;
    var payAdjustment = 0;
    var townRepResult;
    var barRepResult;
    var tipAmount = 0;
    var townRepGain = 2;
    var barRepGain = 0;
    var lifestyleId = getLifestyleId();
    var i;

    if (!guardCoreRuntimeState("work")) {
      return;
    }

    if (!state.jobs.activeJobId) {
      log("You need a job before you can work.");
      render();
      return;
    }

    if (!jobs.canWorkToday(state)) {
      log("You've already worked today. Sleep before your next shift.");
      render();
      return;
    }

    if (!trySpendActionSlot()) return;

    workResult = jobs.performWorkShift(state);

    if (!workResult) {
      debugLog("performWorkShift returned null.", state.jobs);
      log("That shift couldn't start right now.");
      render();
      return;
    }

    needs.applyActionNeeds(state, "work");
    if (
      socialUnlocks &&
      typeof socialUnlocks.getStaffReferralBonus === "function"
    ) {
      staffBonus = socialUnlocks.getStaffReferralBonus(state);
    }
    if (events && typeof events.getCombinedWorkPayMultiplier === "function") {
      workPayMultiplier = events.getCombinedWorkPayMultiplier(state);
    }
    totalPay = workResult.pay;
    if (workPayMultiplier !== 1) {
      payAdjustment = Math.round(workResult.pay * workPayMultiplier) - workResult.pay;
      if (payAdjustment !== 0) {
        state.player.money += payAdjustment;
        totalPay += payAdjustment;
      }
    }
    if (staffBonus > 0) {
      state.player.money += staffBonus;
      totalPay += staffBonus;
    }
    addLifetimeEarnings("jobs", totalPay);
    townRepResult = applyTownReputationChange(townRepGain);
    logTierChangeIfNeeded(townRepResult);
    if (townRepResult && townRepResult.delta > 0) {
      log("People are starting to recognize you. (+" + townRepResult.delta + " Town Rep)");
    }
    if (hasJobTag(workResult.jobId, "bar") && random() < 0.6) {
      barRepGain = 1;
    }
    barRepResult = applyBarReputationChange(barRepGain);
    if (barRepResult && barRepResult.delta > 0) {
      log("Your bar regulars are warming up to you. (+" + barRepResult.delta + " Bar Rep)");
    }

    if (staffBonus > 0) {
      log("Seasonal coworkers put in a good word. (+$" + staffBonus + ")");
    }
    if (payAdjustment > 0) {
      log("Today's conditions gave your shift a boost. (+$" + payAdjustment + ")");
    } else if (payAdjustment < 0) {
      log("Today's conditions cut into your shift pay. (-$" + Math.abs(payAdjustment) + ")");
    }
    log("You worked your shift and earned $" + totalPay + ".");
    tipAmount = tryGrantWorkTips(workResult.jobId, lifestyleId);
    if (tipAmount > 0) {
      log("You received $" + tipAmount + " in tips.");
    }

    for (i = 0; i < workResult.promotions.length; i += 1) {
      log("Your pay is now $" + workResult.promotions[i].pay + " per shift.");
      log("You were promoted to Level " + workResult.promotions[i].level + " at " + workResult.jobName + "!");
    }
    for (i = 0; i < workResult.unlockedJobIds.length; i += 1) {
      log(
        "Your experience has opened new opportunities: " +
          jobs.getJobName(workResult.unlockedJobIds[i]) +
          " is now available."
      );
    }

    if (events && typeof events.consumeModifiersForAction === "function") {
      events.consumeModifiersForAction(state, "work");
    }

    render();
  }

  function onEat() {
    var baseMealCost = balance && typeof balance.BASE_EAT_COST === "number"
      ? balance.BASE_EAT_COST
      : 0;
    var lifestyleId = getLifestyleId();
    var mealCost = lifestyle && typeof lifestyle.applyLifestyleToCost === "function"
      ? lifestyle.applyLifestyleToCost(baseMealCost, lifestyleId, "eat")
      : baseMealCost;

    if (!guardCoreRuntimeState("eat")) {
      return;
    }

    if (state.player.money < mealCost) {
      log("You need $" + mealCost + " to buy a meal.");
      render();
      return;
    }

    if (!trySpendActionSlot()) return;

    state.player.money -= mealCost;
    applyActionNeedsWithLifestyle("eat", "eatRestore", lifestyleId);
    log("You bought a meal for $" + mealCost + " and feel more energized.");
    render();
  }

  function onSocialize() {
    var baseOutingCost = balance && typeof balance.BASE_SOCIALIZE_COST === "number"
      ? balance.BASE_SOCIALIZE_COST
      : 0;
    var lifestyleId = getLifestyleId();
    var socializeGainMultiplier = 1;
    var outingCost = lifestyle && typeof lifestyle.applyLifestyleToCost === "function"
      ? lifestyle.applyLifestyleToCost(baseOutingCost, lifestyleId, "socialize")
      : baseOutingCost;
    var townRepGainBase = 2;
    var townRepGain = lifestyle && typeof lifestyle.applyLifestyleToGain === "function"
      ? lifestyle.applyLifestyleToGain(townRepGainBase, lifestyleId, "socializeGain")
      : townRepGainBase;
    var barRepGainBase = 1;
    var barRepGain = lifestyle && typeof lifestyle.applyLifestyleToGain === "function"
      ? lifestyle.applyLifestyleToGain(barRepGainBase, lifestyleId, "socializeGain")
      : barRepGainBase;
    var townRepChance = 0.4;
    var barRepChance = 0.18;
    var townRepResult;
    var barRepResult;
    var socialGroupId;
    var socialGainBase;
    var socialGain;
    var socialResult;
    var touristTip;

    if (!guardCoreRuntimeState("socialize")) {
      return;
    }

    if (state.player.money < outingCost) {
      log("You need $" + outingCost + " to spend time out in town.");
      render();
      return;
    }

    if (!trySpendActionSlot()) return;

    state.player.money -= outingCost;
    applyActionNeedsWithLifestyle("socialize", "socializeGain", lifestyleId);
    if (lifestyleId === "social") {
      townRepChance += 0.08;
      barRepChance += 0.12;
    } else if (lifestyleId === "frugal") {
      townRepChance -= 0.05;
      barRepChance -= 0.03;
    }
    if (events && typeof events.getCombinedSocializeGainMultiplier === "function") {
      socializeGainMultiplier = events.getCombinedSocializeGainMultiplier(state);
    }
    if (socializeGainMultiplier !== 1) {
      townRepGain = Math.max(0, Math.round(townRepGain * socializeGainMultiplier));
      barRepGain = Math.max(0, Math.round(barRepGain * socializeGainMultiplier));
    }

    if (random() < townRepChance) {
      townRepResult = applyTownReputationChange(townRepGain);
      logTierChangeIfNeeded(townRepResult);
    }
    if (random() < barRepChance) {
      barRepResult = applyBarReputationChange(barRepGain);
    }

    socialGroupId = chooseSocialGroupId();
    socialGainBase = getRandomIntegerInclusive(3, 8);
    socialGain = lifestyle && typeof lifestyle.applyLifestyleToGain === "function"
      ? lifestyle.applyLifestyleToGain(socialGainBase, lifestyleId, "socializeGain")
      : socialGainBase;
    if (socializeGainMultiplier !== 1) {
      socialGain = Math.max(0, Math.round(socialGain * socializeGainMultiplier));
    }
    socialResult = stateApi.addSocialRelationship(state, socialGroupId, socialGain);
    touristTip = tryGrantTouristTip(lifestyleId);
    if (townRepResult && townRepResult.delta > 0) {
      log("People are getting to know you. (+" + townRepResult.delta + " Town Rep)");
    }
    if (barRepResult && barRepResult.delta > 0) {
      log("You make a few new bar-side connections. (+" + barRepResult.delta + " Bar Rep)");
    }
    log(getSocializeRelationshipLogLine(socialResult.groupId, socialResult.delta));
    if (touristTip > 0) {
      log("A summer visitor insisted on buying you a drink. (+$" + touristTip + ")");
    }
    logSocialUnlockAnnouncements();
    if (events && typeof events.consumeModifiersForAction === "function") {
      events.consumeModifiersForAction(state, "socialize");
    }
    render();
  }

  function onRest() {
    if (!guardCoreRuntimeState("rest")) {
      return;
    }

    if (!trySpendActionSlot()) return;

    needs.applyActionNeeds(state, "rest");
    log("You took time to rest.");
    render();
  }

  function onSleep() {
    var penaltyInfo;
    var pendingJobId;
    var pendingStartDay;
    var currentWorldDay;
    var repPenaltyResult;
    var eventResult;
    var i;
    var saveOk;

    if (!guardCoreRuntimeState("sleep")) {
      return;
    }

    needs.applyActionNeeds(state, "sleep");

    penaltyInfo = needs.getPoorNeedsPenalty(state.player.needs);
    if (penaltyInfo.penalty > 0) {
      repPenaltyResult = applyTownReputationChange(-penaltyInfo.penalty);
      logTierChangeIfNeeded(repPenaltyResult);
      if (repPenaltyResult && repPenaltyResult.delta < 0) {
        log("You wake up worn out, and people notice (" + repPenaltyResult.delta + " Town Rep).");
      }
    }

    time.advanceDay(state.time);
    syncWorldSeasonFromTime();
    syncWorldDayFromTime();
    applyLifestyleSleepPassiveEffects();
    jobs.resetDailyWorkFlag(state);

    currentWorldDay = typeof state.world.day === "number" && !Number.isNaN(state.world.day)
      ? Math.max(1, Math.floor(state.world.day))
      : getCurrentDayNumberFromTimeState();
    state.world.day = currentWorldDay;

    pendingJobId = state.jobs.pendingJobId;
    pendingStartDay = typeof state.jobs.pendingJobStartDay === "number" &&
      !Number.isNaN(state.jobs.pendingJobStartDay)
      ? Math.max(0, Math.floor(state.jobs.pendingJobStartDay))
      : 0;
    if (
      pendingJobId &&
      jobs.JOBS[pendingJobId] &&
      jobs.isJobUnlocked(state, pendingJobId) &&
      currentWorldDay >= pendingStartDay
    ) {
      jobs.setActiveJob(state, pendingJobId);
      state.jobs.pendingJobId = "";
      state.jobs.pendingJobStartDay = 0;
      state.jobs.lastJobChangeDay = currentWorldDay;
      log("You start your new job at " + jobs.getJobName(pendingJobId) + ".");
    } else if (pendingJobId && (!jobs.JOBS[pendingJobId] || !jobs.isJobUnlocked(state, pendingJobId))) {
      state.jobs.pendingJobId = "";
      state.jobs.pendingJobStartDay = 0;
    } else if (pendingJobId) {
      state.jobs.pendingJobStartDay = pendingStartDay;
    }

    log("You sleep and wake up to a new day.");

    housing.chargeWeeklyRentIfDue(state, log);
    if (events && typeof events.runDailyEvent === "function") {
      eventResult = events.runDailyEvent(state, { on: "sleep" });
      if (eventResult) {
        log("Daily Event: " + eventResult.title + ".");
        if (Array.isArray(eventResult.logLines)) {
          for (i = 0; i < eventResult.logLines.length; i += 1) {
            log(eventResult.logLines[i]);
          }
        }
      }
    } else if (events && typeof events.pruneExpiredModifiers === "function") {
      events.pruneExpiredModifiers(state);
    }

    if (global.__DEV_DISABLE_SAVE) {
      render();
      return;
    }

    saveOk = storage.saveState(state);
    if (!saveOk) {
      console.warn("[Block Island] Auto-save failed after sleep.");
    } else {
      debugLog("Auto-saved after sleep.");
    }

    render();
  }

  function onNewGame() {
    var saveOk;

    storage.clearSavedState();
    state = stateApi.createInitialState();
    syncWorldSeasonFromTime();
    syncWorldDayFromTime();
    saveOk = storage.saveState(state);

    if (!saveOk) {
      console.warn("[Block Island] Save failed while starting a new game.");
    } else {
      debugLog("New game save written.");
    }

    render();
  }

  function onMoveToSharedHouse() {
    if (!housing.canMoveToSharedHouse(state)) {
      log("You're not ready to move into the shared house yet.");
      render();
      return;
    }

    if (housing.moveToSharedHouse(state)) {
      log("You moved into a shared house room.");
    }

    render();
  }

  function getLifestyleChangeMessage(lifestyleId) {
    if (lifestyleId === "frugal") {
      return "You decide to live a bit more frugally.";
    }
    if (lifestyleId === "social") {
      return "You lean into island life and going out.";
    }
    return "You settle into a normal routine.";
  }

  function onSetLifestyle(lifestyleId) {
    var previousLifestyle = getLifestyleId();
    var nextLifestyle = lifestyle && typeof lifestyle.setLifestyle === "function"
      ? lifestyle.setLifestyle(state, lifestyleId)
      : previousLifestyle;
    var saveOk;

    if (nextLifestyle === previousLifestyle) {
      render();
      return;
    }

    log(getLifestyleChangeMessage(nextLifestyle));
    saveOk = storage.saveState(state);
    if (!saveOk) {
      console.warn("[Block Island] Save failed after lifestyle change.");
    }
    render();
  }

  function onToggleDevMode(enabled) {
    if (!devtools || typeof devtools.setDevModeEnabled !== "function") {
      render();
      return;
    }

    devtools.setDevModeEnabled(Boolean(enabled));
    render();
  }

  function onDevToolAction(actionId) {
    if (!devToolsApi || typeof devToolsApi.runAction !== "function") {
      return false;
    }

    return devToolsApi.runAction(actionId);
  }

  function onSelectStartingJob(jobId) {
    var currentWorldDay;

    if (!guardCoreRuntimeState("select_starting_job")) {
      return false;
    }

    if (state.jobs.activeJobId) {
      render();
      return false;
    }

    if (!jobId || !jobs.JOBS[jobId] || !jobs.isJobUnlocked(state, jobId)) {
      render();
      return false;
    }

    currentWorldDay = typeof state.world.day === "number" && !Number.isNaN(state.world.day)
      ? Math.max(1, Math.floor(state.world.day))
      : getCurrentDayNumberFromTimeState();
    state.jobs.pendingJobId = jobId;
    state.jobs.pendingJobStartDay = currentWorldDay + 1;
    log("You accepted a job at " + jobs.getJobName(jobId) + ".");
    log("You start tomorrow.");

    render();
    return true;
  }

  function onOpenSwitchJob() {
    render();
  }

  function onFindJob() {
    render();
  }

  function onQuitJob() {
    var oldJobId = state.jobs.activeJobId;

    if (!guardCoreRuntimeState("quit_job")) {
      return false;
    }

    if (!oldJobId || !jobs.JOBS[oldJobId]) {
      render();
      return false;
    }

    jobs.setActiveJob(state, "");
    log("You quit your job.");
    render();
    return true;
  }

  function onConfirmSwitchJob(jobId) {
    var oldJobId;
    var oldJobName;
    var currentWorldDay;
    var daysSinceLastChange;
    var lastJobChangeDay;

    if (!guardCoreRuntimeState("confirm_switch_job")) {
      return false;
    }

    if (!state.jobs.activeJobId) {
      render();
      return false;
    }

    if (
      !jobId ||
      !jobs.JOBS[jobId] ||
      !jobs.isJobUnlocked(state, jobId) ||
      jobId === state.jobs.activeJobId
    ) {
      render();
      return false;
    }

    if (state.jobs.pendingJobId === jobId) {
      render();
      return true;
    }

    currentWorldDay = typeof state.world.day === "number" && !Number.isNaN(state.world.day)
      ? Math.max(1, Math.floor(state.world.day))
      : getCurrentDayNumberFromTimeState();
    lastJobChangeDay = Math.max(0, Math.floor(state.jobs.lastJobChangeDay || 0));
    daysSinceLastChange = currentWorldDay - lastJobChangeDay;
    if (lastJobChangeDay > 0 && daysSinceLastChange < JOB_SWITCH_COOLDOWN_DAYS) {
      log("You just changed jobs recently. Give it a few days before switching again.");
      render();
      return false;
    }

    oldJobId = state.jobs.activeJobId;
    oldJobName = jobs.getJobName(oldJobId);
    log("You left your job at " + oldJobName + ".");

    state.jobs.pendingJobId = jobId;
    state.jobs.pendingJobStartDay = currentWorldDay + 1;
    log("You accepted a job at " + jobs.getJobName(jobId) + ".");
    log("You start tomorrow.");
    render();
    return true;
  }

  function onCancelPendingJob() {
    if (!guardCoreRuntimeState("cancel_pending_job")) {
      return false;
    }

    if (!state.jobs.pendingJobId) {
      render();
      return false;
    }

    state.jobs.pendingJobId = "";
    state.jobs.pendingJobStartDay = 0;
    log("You canceled your pending job change.");
    render();
    return true;
  }

  ui.initUI({
    onWork: onWork,
    onEat: onEat,
    onSocialize: onSocialize,
    onRest: onRest,
    onSleep: onSleep,
    onMoveToSharedHouse: onMoveToSharedHouse,
    onSetLifestyle: onSetLifestyle,
    onNewGame: onNewGame,
    onToggleDevMode: onToggleDevMode,
    onDevToolAction: onDevToolAction,
    onSelectStartingJob: onSelectStartingJob,
    onOpenSwitchJob: onOpenSwitchJob,
    onFindJob: onFindJob,
    onQuitJob: onQuitJob,
    onConfirmSwitchJob: onConfirmSwitchJob,
    onCancelPendingJob: onCancelPendingJob,
    getActiveJobId: function () {
      return state.jobs.activeJobId;
    }
  });

  render();
})(window);
