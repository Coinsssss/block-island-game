(function (global) {
  var ns = global.BlockIsland = global.BlockIsland || {};

  var DEFAULT_OPTIONS = {
    iterationsPerJob: 50,
    includeSeasonSweep: true,
    includeNeedsSweep: true,
    seasonSweepIterations: 10,
    needsSweepIterations: 5
  };

  var VENUE_KEYWORDS = {
    bar: [/\bbar\b/i, /\bregulars?\b/i, /\btab\b/i, /\bpour(?:ed|ing)?\b/i, /\bshots?\b/i],
    restaurantService: [/\btable\b/i, /\bserver\b/i, /\bkitchen\b/i],
    delivery: [/\bdrop-?off\b/i, /\baddress\b/i, /\bdoorstep\b/i]
  };

  var SEASON_KEYWORDS = {
    summer: [/\bsummer\b/i, /\btourists?\b/i, /\bcrowds?\b/i, /\bseasonal rush\b/i, /\bbeach day\b/i],
    winter: [/\bwinter\b/i, /\boff-season\b/i, /\bquiet\b/i, /\bcold\b/i],
    spring: [/\bspring\b/i, /\bshoulder-season\b/i],
    fall: [/\bfall\b/i, /\bautumn\b/i, /\bshoulder-season\b/i]
  };

  var MECHANICS_DENYLIST = [
    { pattern: /\bboat\b/i, mechanic: "boat-system" },
        { pattern: /\bweather storm\b/i, mechanic: "weather-system" }
  ];

  var MONEY_GAIN_WORDS = [/\bearned\b/i, /\bgain(?:ed)?\b/i, /\bbonus\b/i, /\bpays? extra\b/i, /\btips?\b/i, /\bpaid\b/i, /\bpick(?:ed)? up \$/i, /\b\+\$\d+/i];
  var MONEY_LOSS_WORDS = [/\bneed \$/i, /\bcost\b/i, /\blose\b/i, /\bpaid \$/i, /\bcouldn't afford\b/i, /\b-\$\d+/i];

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeSeason(state) {
    return state && state.world && typeof state.world.season === "string"
      ? state.world.season.toLowerCase()
      : "spring";
  }

  function parseMoneyDelta(text) {
    var plus = /\+\$(\d+)/g;
    var minus = /-\$(\d+)/g;
    var total = 0;
    var match;

    while ((match = plus.exec(text))) {
      total += Number(match[1] || 0);
    }
    while ((match = minus.exec(text))) {
      total -= Number(match[1] || 0);
    }

    return total;
  }

  function hasKeyword(text, patterns) {
    var i;
    for (i = 0; i < patterns.length; i += 1) {
      if (patterns[i].test(text)) return true;
    }
    return false;
  }

  function getJobProfile(jobsApi, jobId) {
    if (!jobsApi || typeof jobsApi.getJobMessagingProfile !== "function") {
      return { isTipped: false, tipModel: "none", payModel: "perShift", venueType: "service" };
    }
    return jobsApi.getJobMessagingProfile(jobId);
  }

  function buildStaticMainCatalog() {
    return [
      {
        id: "main.work.shift-earnings",
        file: "src/main.js",
        sourceFunction: "onWork",
        category: "work",
        requiredContext: { needsJob: true, needsVenue: false, needsSeason: false, needsHousingTier: false, needsShiftType: false },
        tokensUsed: ["jobName", "totalPay"],
        sampleTemplate: "You worked your shift at {jobName} and earned ${totalPay}."
      },
      {
        id: "main.work.tip.bar",
        file: "src/main.js",
        sourceFunction: "onWork",
        category: "work",
        requiredContext: { needsJob: true, needsVenue: true, needsSeason: false, needsHousingTier: false, needsShiftType: false },
        tokensUsed: ["tipAmount"],
        sampleTemplate: "Guests left you ${tipAmount} behind the bar."
      },
      {
        id: "main.work.tip.delivery",
        file: "src/main.js",
        sourceFunction: "onWork",
        category: "work",
        requiredContext: { needsJob: true, needsVenue: true, needsSeason: false, needsHousingTier: false, needsShiftType: false },
        tokensUsed: ["tipAmount"],
        sampleTemplate: "Clients added a ${tipAmount} bonus for fast service."
      },
      {
        id: "main.work.promotion.pay",
        file: "src/main.js",
        sourceFunction: "onWork",
        category: "promo",
        requiredContext: { needsJob: true, needsVenue: false, needsSeason: false, needsHousingTier: false, needsShiftType: false },
        tokensUsed: ["pay", "payUnit"],
        sampleTemplate: "Your pay is now ${pay} {payUnit}."
      },
      {
        id: "main.sleep.new-day",
        file: "src/main.js",
        sourceFunction: "onSleep",
        category: "sleep",
        requiredContext: { needsJob: false, needsVenue: false, needsSeason: false, needsHousingTier: false, needsShiftType: false },
        tokensUsed: [],
        sampleTemplate: "You sleep through the night and wake to a new island day."
      },
      {
        id: "main.social.visitor-drink",
        file: "src/main.js",
        sourceFunction: "onSocialize",
        category: "social",
        requiredContext: { needsJob: false, needsVenue: false, needsSeason: true, needsHousingTier: false, needsShiftType: false },
        tokensUsed: ["touristTip"],
        sampleTemplate: "A summer visitor insisted on buying you a drink. (+${touristTip})"
      },
      {
        id: "main.eat.purchase",
        file: "src/main.js",
        sourceFunction: "onEat",
        category: "eat",
        requiredContext: { needsJob: false, needsVenue: false, needsSeason: false, needsHousingTier: false, needsShiftType: false },
        tokensUsed: ["mealCost"],
        sampleTemplate: "You bought a meal for ${mealCost} and feel more energized."
      },
      {
        id: "housing.rent.paid",
        file: "src/housing.js",
        sourceFunction: "chargeWeeklyRentIfDue",
        category: "expenses",
        requiredContext: { needsJob: false, needsVenue: false, needsSeason: false, needsHousingTier: true, needsShiftType: false },
        tokensUsed: ["rent"],
        sampleTemplate: "You paid ${rent} in rent."
      },
      {
        id: "housing.rent.missed",
        file: "src/housing.js",
        sourceFunction: "chargeWeeklyRentIfDue",
        category: "expenses",
        requiredContext: { needsJob: false, needsVenue: false, needsSeason: false, needsHousingTier: true, needsShiftType: false },
        tokensUsed: [],
        sampleTemplate: "You couldn't afford rent. Word gets around."
      }
    ];
  }

  function buildShiftCatalog(jobsApi) {
    var defs = jobsApi && typeof jobsApi.getShiftTypeDefinitions === "function"
      ? jobsApi.getShiftTypeDefinitions()
      : [];

    return defs.map(function (def) {
      return {
        id: "jobs.shift." + def.id,
        file: "src/jobs.js",
        sourceFunction: "renderShiftLogLine",
        category: "work",
        requiredContext: { needsJob: true, needsVenue: true, needsSeason: false, needsHousingTier: false, needsShiftType: true },
        tokensUsed: ["job", "shift"],
        sampleTemplate: Array.isArray(def.logTemplates) && def.logTemplates.length > 0 ? def.logTemplates[0] : ""
      };
    });
  }

  function buildEventCatalog(eventsApi) {
    var defs = eventsApi && typeof eventsApi.getDailyEventDefinitions === "function"
      ? eventsApi.getDailyEventDefinitions()
      : [];

    return defs.map(function (def) {
      var sample = "";
      try {
        sample = def && def.apply ? ((def.apply({
          player: { needs: { energy: 50, social: 50 }, money: 100 },
          world: { season: "summer", events: { modifiers: [] } },
          time: { weekdayIndex: 1, seasonIndex: 1, day: 5, year: 1 },
          jobs: { activeJobId: "", list: {} }
        }) || {}).logLines || [])[0] : "";
      } catch (error) {
        sample = "";
      }

      return {
        id: "events.daily." + def.id,
        file: "src/events.js",
        sourceFunction: "runDailyEvent",
        category: "events",
        requiredContext: { needsJob: false, needsVenue: false, needsSeason: false, needsHousingTier: false, needsShiftType: false },
        tokensUsed: [],
        sampleTemplate: sample || ""
      };
    });
  }

  function createMessageCatalog(apis) {
    var jobsApi = apis && apis.jobs;
    var eventsApi = apis && apis.events;

    return buildStaticMainCatalog()
      .concat(buildShiftCatalog(jobsApi))
      .concat(buildEventCatalog(eventsApi));
  }

  function evaluateMessageAgainstRules(input) {
    var text = String(input.message || "");
    var context = input.context || {};
    var profile = context.profile || { isTipped: false, tipModel: "none", venueType: "service" };
    var findings = [];
    var season = String(context.season || "").toLowerCase();

    function pushFinding(severity, ruleId, details) {
      findings.push({ severity: severity, ruleId: ruleId, details: details });
    }

    if (hasKeyword(text, VENUE_KEYWORDS.bar) && profile.venueType.indexOf("bar") < 0) {
      pushFinding("FAIL", "job-venue.bar-language-without-bar-venue", "Bar language used for non-bar venue.");
    }
    if (hasKeyword(text, VENUE_KEYWORDS.restaurantService) && !/restaurant|service/.test(profile.venueType || "")) {
      pushFinding("FAIL", "job-venue.restaurant-language-without-service-venue", "Restaurant/service language used for incompatible venue.");
    }
    if (hasKeyword(text, VENUE_KEYWORDS.delivery) && !(profile.tipModel === "delivery" || /delivery|transport|service/.test(profile.venueType || ""))) {
      pushFinding("FAIL", "job-venue.delivery-language-without-delivery-model", "Delivery language used for job without delivery support.");
    }

    if (!profile.isTipped && /\btip|tips|tipped\b/i.test(text)) {
      pushFinding("FAIL", "tips.tip-language-on-non-tipped-job", "Tip language appeared on non-tipped job.");
    }

    Object.keys(SEASON_KEYWORDS).forEach(function (seasonId) {
      if (hasKeyword(text, SEASON_KEYWORDS[seasonId]) && seasonId !== season) {
        pushFinding("WARN", "season.explicit-season-mismatch", "Message references " + seasonId + " while state season is " + season + ".");
      }
    });

    if (/\bstarving\b/i.test(text) && context.needs && context.needs.hunger > 35) {
      pushFinding("FAIL", "contradiction.starving-at-high-hunger", "Starving language at non-critical hunger.");
    }
    if (/\bwell-rested\b/i.test(text) && context.needs && context.needs.energy < 35) {
      pushFinding("FAIL", "contradiction.well-rested-at-low-energy", "Well-rested language at low energy.");
    }

    if (context.moneyDelta === 0 && hasKeyword(text, MONEY_GAIN_WORDS)) {
      pushFinding("WARN", "contradiction.money-gain-text-without-gain", "Money gain wording without money gain delta.");
    }
    if (context.moneyDelta > 0 && hasKeyword(text, MONEY_LOSS_WORDS)) {
      pushFinding("WARN", "contradiction.money-loss-text-with-gain", "Money loss wording despite positive money delta.");
    }

    if (/\brent\b/i.test(text) && context.actionType === "sleep" && !context.rentDue) {
      pushFinding("WARN", "contradiction.rent-text-outside-rent-cadence", "Rent message occurred when rent was not due.");
    }

    MECHANICS_DENYLIST.forEach(function (entry) {
      if (entry.pattern.test(text)) {
        pushFinding("WARN", "mechanics.unimplemented-mechanic-reference", "Mentions potential unimplemented mechanic: " + entry.mechanic + ".");
      }
    });

    if (parseMoneyDelta(text) !== 0 && context.moneyDelta === 0) {
      pushFinding("WARN", "contradiction.currency-delta-token-without-delta", "Message has explicit +$/-$ token without observed money delta.");
    }

    return findings;
  }

  ns.devMessageAudit = {
    DEFAULT_OPTIONS: DEFAULT_OPTIONS,
    SEASON_KEYWORDS: SEASON_KEYWORDS,
    VENUE_KEYWORDS: VENUE_KEYWORDS,
    MECHANICS_DENYLIST: MECHANICS_DENYLIST,
    createMessageCatalog: createMessageCatalog,
    evaluateMessageAgainstRules: evaluateMessageAgainstRules,
    getJobProfile: getJobProfile,
    deepClone: deepClone,
    normalizeSeason: normalizeSeason
  };
})(window);
