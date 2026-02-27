(function (global) {
  var ns = global.BlockIsland = global.BlockIsland || {};

  var time = ns.time;
  var needs = ns.needs;
  var jobs = ns.jobs;
  var reputation = ns.reputation;
  var stateApi = ns.state;

  var EVENT_TRIGGER_CHANCE = 0.5;
  var NONE_EVENT_TITLE = "None";
  var MODIFIER_TYPES = {
    workPayMult: true,
    tipChanceBonus: true,
    tipAmountMult: true,
    socializeGainMult: true
  };

  function random() {
    if (ns.rng && typeof ns.rng.next === "function") {
      return ns.rng.next();
    }

    return 0.5;
  }

  function clampNeed(value) {
    if (needs && typeof needs.clampNeed === "function") {
      return needs.clampNeed(value);
    }

    return Math.max(0, Math.min(100, Math.round(value)));
  }

  function getCurrentDayNumber(state) {
    var year = state && state.time && typeof state.time.year === "number" ? state.time.year : 1;
    var seasonIndex = state && state.time && typeof state.time.seasonIndex === "number"
      ? state.time.seasonIndex
      : 0;
    var day = state && state.time && typeof state.time.day === "number" ? state.time.day : 1;
    var seasonsPerYear = time && Array.isArray(time.SEASON_IDS) ? time.SEASON_IDS.length : 4;
    var daysPerSeason = time && typeof time.DAYS_PER_SEASON === "number" ? time.DAYS_PER_SEASON : 21;

    return ((year - 1) * seasonsPerYear * daysPerSeason) + (seasonIndex * daysPerSeason) + day;
  }

  function getCurrentDayKey(state) {
    var year = state && state.time && typeof state.time.year === "number" ? state.time.year : 1;
    var seasonIndex = state && state.time && typeof state.time.seasonIndex === "number"
      ? state.time.seasonIndex
      : 0;
    var day = state && state.time && typeof state.time.day === "number" ? state.time.day : 1;

    return year + ":" + seasonIndex + ":" + day;
  }

  function ensureWorld(state) {
    if (!state || typeof state !== "object") {
      return null;
    }

    if (!state.world || typeof state.world !== "object") {
      state.world = {};
    }

    return state.world;
  }

  function normalizeModifier(rawModifier, fallbackDayNumber) {
    var modifier = rawModifier && typeof rawModifier === "object" ? rawModifier : {};
    var type = typeof modifier.type === "string" && MODIFIER_TYPES[modifier.type]
      ? modifier.type
      : "workPayMult";
    var expiresOnDayNumber = typeof modifier.expiresOnDayNumber === "number"
      ? Math.floor(modifier.expiresOnDayNumber)
      : fallbackDayNumber;
    var remainingUses = typeof modifier.remainingUses === "number"
      ? Math.max(0, Math.floor(modifier.remainingUses))
      : null;
    var consumeOn = typeof modifier.consumeOn === "string" ? modifier.consumeOn : "";

    return {
      id: typeof modifier.id === "string" && modifier.id ? modifier.id : ("mod_" + Date.now()),
      type: type,
      value: typeof modifier.value === "number" ? modifier.value : 0,
      expiresOnDayNumber: expiresOnDayNumber,
      remainingUses: remainingUses,
      consumeOn: consumeOn
    };
  }

  function ensureEventsState(state) {
    var world = ensureWorld(state);
    var eventsState;
    var currentDayNumber = getCurrentDayNumber(state);

    if (!world) {
      return null;
    }

    eventsState = world.events;

    if (!eventsState || typeof eventsState !== "object") {
      eventsState = {};
    }

    if (typeof eventsState.lastEventDayKey !== "string") {
      eventsState.lastEventDayKey = "";
    }
    if (typeof eventsState.lastEventRollDayKey !== "string") {
      eventsState.lastEventRollDayKey = "";
    }
    if (typeof eventsState.lastEventTitle !== "string") {
      eventsState.lastEventTitle = NONE_EVENT_TITLE;
    }

    if (!Array.isArray(eventsState.modifiers)) {
      eventsState.modifiers = [];
    }
    eventsState.modifiers = eventsState.modifiers.map(function (modifier) {
      return normalizeModifier(modifier, currentDayNumber);
    });

    world.events = eventsState;
    return eventsState;
  }

  function pruneExpiredModifiers(state) {
    var eventsState = ensureEventsState(state);
    var currentDayNumber = getCurrentDayNumber(state);

    if (!eventsState) {
      return;
    }

    eventsState.modifiers = eventsState.modifiers.filter(function (modifier) {
      if (!modifier || typeof modifier !== "object") return false;
      if (typeof modifier.expiresOnDayNumber === "number" && modifier.expiresOnDayNumber < currentDayNumber) {
        return false;
      }
      if (typeof modifier.remainingUses === "number" && modifier.remainingUses <= 0) {
        return false;
      }
      return true;
    });
  }

  function addModifier(state, modifier) {
    var eventsState = ensureEventsState(state);
    var normalized = normalizeModifier(modifier, getCurrentDayNumber(state));

    if (!eventsState) {
      return normalized;
    }

    eventsState.modifiers.push(normalized);
    return normalized;
  }

  function getActiveModifiers(state, type) {
    var eventsState = ensureEventsState(state);

    if (!eventsState) {
      return [];
    }

    pruneExpiredModifiers(state);

    return eventsState.modifiers.filter(function (modifier) {
      return modifier.type === type;
    });
  }

  function getCombinedWorkPayMultiplier(state) {
    var modifiers = getActiveModifiers(state, "workPayMult");
    var multiplier = 1;

    modifiers.forEach(function (modifier) {
      multiplier *= modifier.value;
    });

    return Math.max(0, multiplier);
  }

  function getCombinedTipChanceBonus(state) {
    var modifiers = getActiveModifiers(state, "tipChanceBonus");
    var bonus = 0;

    modifiers.forEach(function (modifier) {
      bonus += modifier.value;
    });

    return bonus;
  }

  function getCombinedTipAmountMultiplier(state) {
    var modifiers = getActiveModifiers(state, "tipAmountMult");
    var multiplier = 1;

    modifiers.forEach(function (modifier) {
      multiplier *= modifier.value;
    });

    return Math.max(0, multiplier);
  }

  function getCombinedSocializeGainMultiplier(state) {
    var modifiers = getActiveModifiers(state, "socializeGainMult");
    var multiplier = 1;

    modifiers.forEach(function (modifier) {
      multiplier *= modifier.value;
    });

    return Math.max(0, multiplier);
  }

  function consumeModifiersForAction(state, actionId) {
    var eventsState = ensureEventsState(state);

    if (!eventsState) {
      return;
    }

    eventsState.modifiers.forEach(function (modifier) {
      if (!modifier || typeof modifier !== "object") return;
      if (modifier.consumeOn !== actionId) return;
      if (typeof modifier.remainingUses !== "number") return;

      modifier.remainingUses = Math.max(0, modifier.remainingUses - 1);
    });

    pruneExpiredModifiers(state);
  }

  function hasActiveJobTag(state, tagId) {
    var activeJobId = state && state.jobs ? state.jobs.activeJobId : "";
    var tags;

    if (!activeJobId || !jobs || typeof jobs.getJobTags !== "function") {
      return false;
    }

    tags = jobs.getJobTags(activeJobId);
    return tags.indexOf(tagId) >= 0;
  }

  function isBusySeason(state) {
    if (time && typeof time.isBusySeason === "function") {
      return time.isBusySeason(state);
    }

    return Boolean(state && state.world && String(state.world.season).toLowerCase() === "summer");
  }

  function getSeasonId(state) {
    if (time && typeof time.getSeasonIdFromState === "function") {
      return String(time.getSeasonIdFromState(state) || "spring").toLowerCase();
    }

    if (state && state.world && typeof state.world.season === "string") {
      return String(state.world.season).toLowerCase();
    }

    return "spring";
  }

  function isSeason(state, seasonId) {
    return getSeasonId(state) === seasonId;
  }

  function isWeekend(state) {
    var weekdayIndex = state && state.time && typeof state.time.weekdayIndex === "number"
      ? state.time.weekdayIndex
      : 0;

    return weekdayIndex >= 4;
  }

  function hasAnyActiveJobTag(state, tagIds) {
    if (!Array.isArray(tagIds) || tagIds.length <= 0) {
      return false;
    }

    return tagIds.some(function (tagId) {
      return hasActiveJobTag(state, tagId);
    });
  }

  function getLocalsRelationship(state) {
    var relationships;

    if (stateApi && typeof stateApi.getLocalRelationship === "function") {
      return stateApi.getLocalRelationship(state);
    }

    relationships = state && state.relationships;
    if (!relationships && state && state.player && state.player.social) {
      relationships = state.player.social;
    }

    if (!relationships || typeof relationships.locals !== "number") {
      return 0;
    }

    return Math.max(0, Math.min(100, Math.floor(relationships.locals)));
  }

  function getStaffRelationship(state) {
    var relationships;

    if (stateApi && typeof stateApi.getStaffRelationship === "function") {
      return stateApi.getStaffRelationship(state);
    }

    relationships = state && state.relationships;
    if (!relationships && state && state.player && state.player.social) {
      relationships = state.player.social;
    }

    if (!relationships || typeof relationships.staff !== "number") {
      return 0;
    }

    return Math.max(0, Math.min(100, Math.floor(relationships.staff)));
  }

  function getSummerPeopleRelationship(state) {
    var relationships;
    var value;

    if (stateApi && typeof stateApi.getSummerPeopleRelationship === "function") {
      return stateApi.getSummerPeopleRelationship(state);
    }

    if (stateApi && typeof stateApi.getTouristRelationship === "function") {
      return stateApi.getTouristRelationship(state);
    }

    relationships = state && state.relationships;
    if (!relationships && state && state.player && state.player.social) {
      relationships = state.player.social;
    }
    if (!relationships) return 0;

    value = typeof relationships.summerPeople === "number"
      ? relationships.summerPeople
      : relationships.tourists;
    if (typeof value !== "number") {
      return 0;
    }

    return Math.max(0, Math.min(100, Math.floor(value)));
  }

  function getTownReputationValue(state) {
    if (reputation && typeof reputation.getTownReputation === "function") {
      return reputation.getTownReputation(state);
    }

    if (state && state.player && typeof state.player.reputationTown === "number") {
      return Math.max(0, Math.min(100, Math.floor(state.player.reputationTown)));
    }

    if (state && state.player && typeof state.player.reputation === "number") {
      return Math.max(0, Math.min(100, Math.floor(state.player.reputation)));
    }

    return 0;
  }

  function getBarReputationValue(state) {
    if (reputation && typeof reputation.getBarReputation === "function") {
      return reputation.getBarReputation(state);
    }

    if (state && state.player && typeof state.player.reputationBar === "number") {
      return Math.max(0, Math.min(100, Math.floor(state.player.reputationBar)));
    }

    return 0;
  }

  function adjustMoney(state, amount) {
    if (!state || !state.player || typeof state.player.money !== "number") {
      return 0;
    }

    var before = state.player.money;
    var after = Math.max(0, Math.floor(before + amount));

    state.player.money = after;
    return after - before;
  }

  function adjustNeed(state, needId, amount) {
    if (!state.player || !state.player.needs) return 0;
    if (typeof state.player.needs[needId] !== "number") return 0;

    var before = state.player.needs[needId];
    var after = clampNeed(before + amount);

    state.player.needs[needId] = after;
    return after - before;
  }

  function adjustTownRep(state, amount) {
    if (!amount) return 0;

    if (reputation && typeof reputation.addTownReputation === "function") {
      return reputation.addTownReputation(state, amount).delta;
    }

    if (reputation && typeof reputation.addReputation === "function") {
      return reputation.addReputation(state, amount).delta;
    }

    return 0;
  }

  function adjustBarRep(state, amount) {
    if (!amount) return 0;

    if (reputation && typeof reputation.addBarReputation === "function") {
      return reputation.addBarReputation(state, amount).delta;
    }

    return 0;
  }

  function adjustRelationship(state, relationshipId, amount) {
    if (!amount) return 0;

    if (stateApi && typeof stateApi.addSocialRelationship === "function") {
      return stateApi.addSocialRelationship(state, relationshipId, amount).delta;
    }

    if (stateApi && typeof stateApi.setRelationshipValue === "function") {
      var current = 0;
      if (relationshipId === "locals" && stateApi.getLocalRelationship) {
        current = stateApi.getLocalRelationship(state);
      } else if (relationshipId === "staff" && stateApi.getStaffRelationship) {
        current = stateApi.getStaffRelationship(state);
      } else if (stateApi.getSummerPeopleRelationship) {
        current = stateApi.getSummerPeopleRelationship(state);
      }

      stateApi.setRelationshipValue(state, relationshipId, current + amount);
      return amount;
    }

    return 0;
  }

  function weightedPick(definitions) {
    var totalWeight = 0;
    var roll;
    var running = 0;
    var i;

    definitions.forEach(function (definition) {
      totalWeight += Math.max(0, definition.weight || 1);
    });

    if (totalWeight <= 0) {
      return definitions[0] || null;
    }

    roll = random() * totalWeight;

    for (i = 0; i < definitions.length; i += 1) {
      running += Math.max(0, definitions[i].weight || 1);
      if (roll <= running) {
        return definitions[i];
      }
    }

    return definitions[definitions.length - 1] || null;
  }

  function createEventDefinitions() {
    return [
      {
        id: "fog_rolls_in",
        title: "Fog Rolls In",
        weight: 1.2,
        when: function () {
          return true;
        },
        apply: function (state) {
          var energyDelta = adjustNeed(state, "energy", -3);
          var moodDelta = adjustNeed(state, "social", -2);

          return {
            logLines: [
              "Fog blankets the harbor and everything moves a little slower.",
              "Energy " + (energyDelta >= 0 ? "+" : "") + energyDelta + ", Mood " + (moodDelta >= 0 ? "+" : "") + moodDelta + "."
            ],
            effectsApplied: {
              energy: energyDelta,
              mood: moodDelta
            }
          };
        }
      },
      {
        id: "summer_rush",
        title: "Summer Rush",
        weight: 1.4,
        when: function (state) {
          return isBusySeason(state);
        },
        apply: function (state) {
          var dayNumber = getCurrentDayNumber(state);

          addModifier(state, {
            id: "summer_rush_tip_chance",
            type: "tipChanceBonus",
            value: 0.12,
            expiresOnDayNumber: dayNumber
          });
          addModifier(state, {
            id: "summer_rush_tip_amount",
            type: "tipAmountMult",
            value: 1.15,
            expiresOnDayNumber: dayNumber
          });

          return {
            logLines: [
              "A wave of visitors hits the island today.",
              "Tip-heavy shifts feel a little better paid."
            ],
            effectsApplied: {
              tipChanceBonus: 0.12,
              tipAmountMult: 1.15
            }
          };
        }
      },
      {
        id: "off_season_lull",
        title: "Off-Season Lull",
        weight: 1,
        when: function (state) {
          return !isBusySeason(state);
        },
        apply: function (state) {
          var dayNumber = getCurrentDayNumber(state);

          addModifier(state, {
            id: "off_season_tip_chance",
            type: "tipChanceBonus",
            value: -0.08,
            expiresOnDayNumber: dayNumber
          });
          addModifier(state, {
            id: "off_season_tip_amount",
            type: "tipAmountMult",
            value: 0.9,
            expiresOnDayNumber: dayNumber
          });

          return {
            logLines: [
              "Town feels quieter than usual today.",
              "Tip income may come in a little lighter."
            ],
            effectsApplied: {
              tipChanceBonus: -0.08,
              tipAmountMult: 0.9
            }
          };
        }
      },
      {
        id: "storm_warning",
        title: "Storm Warning",
        weight: 0.8,
        when: function () {
          return true;
        },
        apply: function (state) {
          var energyDelta = adjustNeed(state, "energy", -5);
          var dayNumber = getCurrentDayNumber(state);

          addModifier(state, {
            id: "storm_warning_work_penalty",
            type: "workPayMult",
            value: 0.9,
            consumeOn: "work",
            remainingUses: 1,
            expiresOnDayNumber: dayNumber
          });

          return {
            logLines: [
              "A storm warning goes out over the island.",
              "You feel a little drained, and today's next shift may pay less."
            ],
            effectsApplied: {
              energy: energyDelta,
              workPayMult: 0.9
            }
          };
        }
      },
      {
        id: "generous_regular",
        title: "Generous Regular",
        weight: 1,
        when: function (state) {
          return stateApi.getLocalRelationship(state) >= 20;
        },
        apply: function (state) {
          var moneyDelta = adjustMoney(state, 28);
          var localsDelta = adjustRelationship(state, "locals", 2);

          return {
            logLines: [
              "A familiar face spots you and picks up your tab.",
              "You gain $" + moneyDelta + " and +" + localsDelta + " Local relationship."
            ],
            effectsApplied: {
              money: moneyDelta,
              locals: localsDelta
            }
          };
        }
      },
      {
        id: "town_hall_chatter",
        title: "Town Hall Chatter",
        weight: 1,
        when: function () {
          return true;
        },
        apply: function (state) {
          var townRepDelta = adjustTownRep(state, 2);

          return {
            logLines: [
              "Your name comes up in a good way around town hall.",
              "Town Rep +" + townRepDelta + "."
            ],
            effectsApplied: {
              townRep: townRepDelta
            }
          };
        }
      },
      {
        id: "bar_connection",
        title: "Bar Connection",
        weight: 1,
        when: function (state) {
          return hasActiveJobTag(state, "bar") || (reputation && reputation.getBarReputation && reputation.getBarReputation(state) >= 8);
        },
        apply: function (state) {
          var barRepDelta = adjustBarRep(state, 2);
          var summerDelta = adjustRelationship(state, "summerPeople", 1);

          return {
            logLines: [
              "You make a useful connection after last call.",
              "Bar Rep +" + barRepDelta + ", Summer People +" + summerDelta + "."
            ],
            effectsApplied: {
              barRep: barRepDelta,
              summerPeople: summerDelta
            }
          };
        }
      },
      {
        id: "staff_party_night",
        title: "Staff Party Night",
        weight: 0.9,
        when: function (state) {
          return stateApi.getStaffRelationship(state) >= 10;
        },
        apply: function (state) {
          var staffDelta = adjustRelationship(state, "staff", 4);
          var moodDelta = adjustNeed(state, "social", 4);
          var energyDelta = adjustNeed(state, "energy", -4);

          return {
            logLines: [
              "A late-night staff hang turns into a full island party.",
              "Staff +" + staffDelta + ", Mood +" + moodDelta + ", Energy " + energyDelta + "."
            ],
            effectsApplied: {
              staff: staffDelta,
              mood: moodDelta,
              energy: energyDelta
            }
          };
        }
      },
      {
        id: "rental_shortage",
        title: "Rental Shortage",
        weight: 0.8,
        when: function (state) {
          return isBusySeason(state) && stateApi.getSummerPeopleRelationship(state) >= 12;
        },
        apply: function (state) {
          var moneyDelta = adjustMoney(state, 22);
          var summerDelta = adjustRelationship(state, "summerPeople", 3);

          return {
            logLines: [
              "Word spreads fast as visitors scramble for rooms.",
              "You pick up $" + moneyDelta + " and +" + summerDelta + " Summer People relationship."
            ],
            effectsApplied: {
              money: moneyDelta,
              summerPeople: summerDelta
            }
          };
        }
      },
      {
        id: "quiet_morning",
        title: "Quiet Morning",
        weight: 1.1,
        when: function () {
          return true;
        },
        apply: function (state) {
          var energyDelta = adjustNeed(state, "energy", 6);
          var moodDelta = adjustNeed(state, "social", -2);

          return {
            logLines: [
              "The island starts slow, giving you a calm morning.",
              "Energy +" + energyDelta + ", Mood " + moodDelta + "."
            ],
            effectsApplied: {
              energy: energyDelta,
              mood: moodDelta
            }
          };
        }
      },
      {
        id: "found_shift_coverage",
        title: "Found Shift Coverage",
        weight: 0.9,
        when: function (state) {
          return Boolean(state.jobs && state.jobs.activeJobId);
        },
        apply: function (state) {
          var dayNumber = getCurrentDayNumber(state);

          addModifier(state, {
            id: "found_shift_coverage_bonus",
            type: "workPayMult",
            value: 1.18,
            consumeOn: "work",
            remainingUses: 1,
            expiresOnDayNumber: dayNumber
          });

          return {
            logLines: [
              "Someone asks you to cover a better-paid shift.",
              "Your next shift today pays extra."
            ],
            effectsApplied: {
              workPayMult: 1.18
            }
          };
        }
      },
      {
        id: "unexpected_expense",
        title: "Unexpected Expense",
        weight: 0.6,
        when: function (state) {
          return state.player.money > 20;
        },
        apply: function (state) {
          var moneyDelta = adjustMoney(state, -35);

          return {
            logLines: [
              "A small emergency eats into your budget.",
              "You lose $" + Math.abs(moneyDelta) + "."
            ],
            effectsApplied: {
              money: moneyDelta
            }
          };
        }
      },
      {
        id: "ferry_delay",
        title: "Ferry Delay",
        weight: 0.9,
        when: function (state) {
          return hasActiveJobTag(state, "tourism") || hasActiveJobTag(state, "municipal");
        },
        apply: function (state) {
          var townRepDelta = adjustTownRep(state, 1);
          var energyDelta = adjustNeed(state, "energy", -2);

          return {
            logLines: [
              "A ferry delay scrambles everyone's plans.",
              "You keep your cool and earn a little trust."
            ],
            effectsApplied: {
              townRep: townRepDelta,
              energy: energyDelta
            }
          };
        }
      },
      {
        id: "community_cleanup",
        title: "Community Cleanup",
        weight: 0.85,
        when: function (state) {
          return hasActiveJobTag(state, "outdoors") || stateApi.getLocalRelationship(state) >= 15;
        },
        apply: function (state) {
          var localsDelta = adjustRelationship(state, "locals", 3);
          var townRepDelta = adjustTownRep(state, 1);
          var energyDelta = adjustNeed(state, "energy", -2);

          return {
            logLines: [
              "Neighbors rally for a quick cleanup effort.",
              "Locals +" + localsDelta + ", Town Rep +" + townRepDelta + ", Energy " + energyDelta + "."
            ],
            effectsApplied: {
              locals: localsDelta,
              townRep: townRepDelta,
              energy: energyDelta
            }
          };
        }
      },
      {
        id: "ferry_crowd_wave",
        title: "Ferry Crowd Wave",
        weight: 10,
        when: function (state) {
          return isBusySeason(state) && isWeekend(state);
        },
        apply: function (state) {
          var dayNumber = getCurrentDayNumber(state);
          var energyDelta = adjustNeed(state, "energy", -2);

          addModifier(state, {
            id: "ferry_crowd_wave_tip_chance",
            type: "tipChanceBonus",
            value: 0.12,
            consumeOn: "work",
            remainingUses: 1,
            expiresOnDayNumber: dayNumber
          });
          addModifier(state, {
            id: "ferry_crowd_wave_tip_amount",
            type: "tipAmountMult",
            value: 1.18,
            consumeOn: "work",
            remainingUses: 1,
            expiresOnDayNumber: dayNumber
          });

          return {
            logLines: [
              "A packed ferry unloads and town fills up fast.",
              "Your next shift may tip better, but the pace is draining."
            ],
            effectsApplied: {
              energy: energyDelta,
              tipChanceBonus: 0.12,
              tipAmountMult: 1.18
            }
          };
        }
      },
      {
        id: "july_weekend_crush",
        title: "July Weekend Crush",
        weight: 5,
        when: function (state) {
          return isBusySeason(state) &&
            isWeekend(state) &&
            state &&
            state.time &&
            typeof state.time.day === "number" &&
            state.time.day >= 10;
        },
        apply: function (state) {
          var dayNumber = getCurrentDayNumber(state);
          var energyDelta = adjustNeed(state, "energy", -4);

          addModifier(state, {
            id: "july_weekend_crush_tip_amount",
            type: "tipAmountMult",
            value: 1.32,
            consumeOn: "work",
            remainingUses: 1,
            expiresOnDayNumber: dayNumber
          });
          addModifier(state, {
            id: "july_weekend_crush_tip_chance",
            type: "tipChanceBonus",
            value: 0.14,
            consumeOn: "work",
            remainingUses: 1,
            expiresOnDayNumber: dayNumber
          });

          return {
            logLines: [
              "Summer weekend traffic surges across the island.",
              "Your next shift could pay off, but you'll feel the rush."
            ],
            effectsApplied: {
              energy: energyDelta,
              tipAmountMult: 1.32,
              tipChanceBonus: 0.14
            }
          };
        }
      },
      {
        id: "restaurants_fully_booked",
        title: "Restaurants Fully Booked",
        weight: 10,
        when: function (state) {
          return isBusySeason(state) &&
            hasAnyActiveJobTag(state, ["service", "hospitality", "bar", "tips"]);
        },
        apply: function (state) {
          var dayNumber = getCurrentDayNumber(state);

          addModifier(state, {
            id: "restaurants_fully_booked_pay",
            type: "workPayMult",
            value: 1.16,
            consumeOn: "work",
            remainingUses: 1,
            expiresOnDayNumber: dayNumber
          });
          addModifier(state, {
            id: "restaurants_fully_booked_tips",
            type: "tipChanceBonus",
            value: 0.08,
            consumeOn: "work",
            remainingUses: 1,
            expiresOnDayNumber: dayNumber
          });

          return {
            logLines: [
              "Tables are full from open to close.",
              "Your next service shift should pay better."
            ],
            effectsApplied: {
              workPayMult: 1.16,
              tipChanceBonus: 0.08
            }
          };
        }
      },
      {
        id: "day_trippers_everywhere",
        title: "Day Trippers Everywhere",
        weight: 10,
        when: function (state) {
          return isBusySeason(state);
        },
        apply: function (state) {
          var townRepDelta = adjustTownRep(state, 1);
          var summerDelta = adjustRelationship(state, "summerPeople", 3);
          var energyDelta = adjustNeed(state, "energy", -2);

          return {
            logLines: [
              "Day trippers pour in off the morning boats.",
              "You make new connections, even if it takes extra energy."
            ],
            effectsApplied: {
              townRep: townRepDelta,
              summerPeople: summerDelta,
              energy: energyDelta
            }
          };
        }
      },
      {
        id: "shoulder_season_reopenings",
        title: "Shoulder Season Reopenings",
        weight: 5,
        when: function (state) {
          return isSeason(state, "spring") && !isWeekend(state);
        },
        apply: function (state) {
          var dayNumber = getCurrentDayNumber(state);
          var townRepDelta = adjustTownRep(state, 1);

          addModifier(state, {
            id: "shoulder_season_reopenings_pay",
            type: "workPayMult",
            value: 1.12,
            consumeOn: "work",
            remainingUses: 1,
            expiresOnDayNumber: dayNumber
          });

          return {
            logLines: [
              "Shops start reopening for the season.",
              "There's a little more opportunity around town today."
            ],
            effectsApplied: {
              townRep: townRepDelta,
              workPayMult: 1.12
            }
          };
        }
      },
      {
        id: "most_places_closed_early",
        title: "Most Places Closed Early",
        weight: 5,
        when: function (state) {
          return isSeason(state, "fall") || isSeason(state, "winter");
        },
        apply: function (state) {
          var dayNumber = getCurrentDayNumber(state);
          var energyDelta = adjustNeed(state, "energy", 3);

          addModifier(state, {
            id: "most_places_closed_early_pay",
            type: "workPayMult",
            value: 0.9,
            consumeOn: "work",
            remainingUses: 1,
            expiresOnDayNumber: dayNumber
          });

          return {
            logLines: [
              "A lot of businesses shut their doors early tonight.",
              "The pace is easier, but tomorrow's shift may pay a bit less."
            ],
            effectsApplied: {
              energy: energyDelta,
              workPayMult: 0.9
            }
          };
        }
      },
      {
        id: "quiet_winter_morning_harbor",
        title: "Quiet Winter Morning",
        weight: 10,
        when: function (state) {
          return isSeason(state, "winter");
        },
        apply: function (state) {
          var energyDelta = adjustNeed(state, "energy", 6);
          var moodDelta = adjustNeed(state, "social", -2);
          var localsDelta = adjustRelationship(state, "locals", 1);

          return {
            logLines: [
              "The harbor is still and quiet this morning.",
              "You recover energy and share a calm moment with locals."
            ],
            effectsApplied: {
              energy: energyDelta,
              mood: moodDelta,
              locals: localsDelta
            }
          };
        }
      },
      {
        id: "labor_day_surge",
        title: "Labor Day Surge",
        weight: 2,
        when: function (state) {
          return isBusySeason(state) &&
            isWeekend(state) &&
            state &&
            state.time &&
            typeof state.time.day === "number" &&
            state.time.day >= 18;
        },
        apply: function (state) {
          var dayNumber = getCurrentDayNumber(state);
          var energyDelta = adjustNeed(state, "energy", -5);

          addModifier(state, {
            id: "labor_day_surge_pay",
            type: "workPayMult",
            value: 1.2,
            consumeOn: "work",
            remainingUses: 1,
            expiresOnDayNumber: dayNumber
          });
          addModifier(state, {
            id: "labor_day_surge_tips",
            type: "tipAmountMult",
            value: 1.4,
            consumeOn: "work",
            remainingUses: 1,
            expiresOnDayNumber: dayNumber
          });

          return {
            logLines: [
              "Labor Day traffic pushes the island to full capacity.",
              "Your next shift can pay big if you can keep up."
            ],
            effectsApplied: {
              energy: energyDelta,
              workPayMult: 1.2,
              tipAmountMult: 1.4
            }
          };
        }
      },
      {
        id: "fog_delay_service_alert",
        title: "Fog Delay",
        weight: 10,
        when: function () {
          return true;
        },
        apply: function (state) {
          var dayNumber = getCurrentDayNumber(state);
          var localsDelta = adjustRelationship(state, "locals", 1);

          addModifier(state, {
            id: "fog_delay_service_alert_pay",
            type: "workPayMult",
            value: 0.92,
            consumeOn: "work",
            remainingUses: 1,
            expiresOnDayNumber: dayNumber
          });

          return {
            logLines: [
              "Heavy fog slows ferry traffic across the sound.",
              "The shared delay brings you a little closer to locals."
            ],
            effectsApplied: {
              locals: localsDelta,
              workPayMult: 0.92
            }
          };
        }
      },
      {
        id: "rough_seas_cancel_runs",
        title: "Rough Seas Cancel Runs",
        weight: 2,
        when: function () {
          return true;
        },
        apply: function (state) {
          var dayNumber = getCurrentDayNumber(state);
          var moodDelta = adjustNeed(state, "social", -3);
          var localsDelta = adjustRelationship(state, "locals", 1);

          addModifier(state, {
            id: "rough_seas_cancel_runs_pay",
            type: "workPayMult",
            value: 0.8,
            consumeOn: "work",
            remainingUses: 1,
            expiresOnDayNumber: dayNumber
          });

          return {
            logLines: [
              "Rough water forces ferry cancellations and throws plans off.",
              "Tomorrow's shift may be light, but locals appreciate your patience."
            ],
            effectsApplied: {
              mood: moodDelta,
              locals: localsDelta,
              workPayMult: 0.8
            }
          };
        }
      },
      {
        id: "perfect_weather_day",
        title: "Perfect Weather Day",
        weight: 10,
        when: function (state) {
          return isBusySeason(state);
        },
        apply: function (state) {
          var dayNumber = getCurrentDayNumber(state);
          var moodDelta = adjustNeed(state, "social", 2);

          addModifier(state, {
            id: "perfect_weather_day_tips",
            type: "tipChanceBonus",
            value: 0.1,
            consumeOn: "work",
            remainingUses: 1,
            expiresOnDayNumber: dayNumber
          });
          addModifier(state, {
            id: "perfect_weather_day_social",
            type: "socializeGainMult",
            value: 1.12,
            consumeOn: "socialize",
            remainingUses: 1,
            expiresOnDayNumber: dayNumber
          });

          return {
            logLines: [
              "Clear skies and calm water bring out everyone at once.",
              "Work and social time both feel easier today."
            ],
            effectsApplied: {
              mood: moodDelta,
              tipChanceBonus: 0.1,
              socializeGainMult: 1.12
            }
          };
        }
      },
      {
        id: "thunderstorms_rolling_in",
        title: "Thunderstorms Rolling In",
        weight: 5,
        when: function () {
          return true;
        },
        apply: function (state) {
          var dayNumber = getCurrentDayNumber(state);
          var moodDelta = adjustNeed(state, "social", -4);
          var energyDelta = adjustNeed(state, "energy", -3);

          addModifier(state, {
            id: "thunderstorms_rolling_in_tips",
            type: "tipChanceBonus",
            value: -0.06,
            consumeOn: "work",
            remainingUses: 1,
            expiresOnDayNumber: dayNumber
          });

          return {
            logLines: [
              "Storm clouds roll over and most people head inside.",
              "Energy dips, and tip-heavy shifts may run softer."
            ],
            effectsApplied: {
              mood: moodDelta,
              energy: energyDelta,
              tipChanceBonus: -0.06
            }
          };
        }
      },
      {
        id: "windy_crossing",
        title: "Windy Crossing",
        weight: 10,
        when: function () {
          return true;
        },
        apply: function (state) {
          var moodDelta = adjustNeed(state, "social", -2);
          var localsDelta = adjustRelationship(state, "locals", 1);

          return {
            logLines: [
              "A rough crossing leaves everyone a little tense.",
              "You keep your cool and earn a bit of local trust."
            ],
            effectsApplied: {
              mood: moodDelta,
              locals: localsDelta
            }
          };
        }
      },
      {
        id: "sunset_calm_after_storm",
        title: "Sunset Calm After Storm",
        weight: 5,
        when: function () {
          return true;
        },
        apply: function (state) {
          var dayNumber = getCurrentDayNumber(state);
          var moodDelta = adjustNeed(state, "social", 3);
          var localsDelta = adjustRelationship(state, "locals", 2);

          addModifier(state, {
            id: "sunset_calm_after_storm_social",
            type: "socializeGainMult",
            value: 1.1,
            consumeOn: "socialize",
            remainingUses: 1,
            expiresOnDayNumber: dayNumber
          });

          return {
            logLines: [
              "The sky clears at sunset and the island exhales.",
              "People are easier to connect with tonight."
            ],
            effectsApplied: {
              mood: moodDelta,
              locals: localsDelta,
              socializeGainMult: 1.1
            }
          };
        }
      },
      {
        id: "short_staffed_shift",
        title: "Short-Staffed Shift",
        weight: 10,
        when: function (state) {
          return isBusySeason(state) && Boolean(state && state.jobs && state.jobs.activeJobId);
        },
        apply: function (state) {
          var dayNumber = getCurrentDayNumber(state);
          var energyDelta = adjustNeed(state, "energy", -4);
          var repDelta = hasAnyActiveJobTag(state, ["bar", "service"])
            ? adjustBarRep(state, 1)
            : adjustTownRep(state, 1);

          addModifier(state, {
            id: "short_staffed_shift_pay",
            type: "workPayMult",
            value: 1.2,
            consumeOn: "work",
            remainingUses: 1,
            expiresOnDayNumber: dayNumber
          });

          return {
            logLines: [
              "A coworker calls out and everyone covers extra ground.",
              "Overtime helps your next shift pay, even if it's exhausting."
            ],
            effectsApplied: {
              energy: energyDelta,
              reputation: repDelta,
              workPayMult: 1.2
            }
          };
        }
      },
      {
        id: "shift_coverage_found_fast",
        title: "Shift Coverage Found",
        weight: 5,
        when: function (state) {
          return Boolean(state && state.jobs && state.jobs.activeJobId) && getStaffRelationship(state) >= 8;
        },
        apply: function (state) {
          var dayNumber = getCurrentDayNumber(state);
          var moodDelta = adjustNeed(state, "social", 2);

          addModifier(state, {
            id: "shift_coverage_found_fast_pay",
            type: "workPayMult",
            value: 1.22,
            consumeOn: "work",
            remainingUses: 1,
            expiresOnDayNumber: dayNumber
          });

          return {
            logLines: [
              "Another worker swaps coverage with you at the last minute.",
              "Your next shift lines up for better pay."
            ],
            effectsApplied: {
              mood: moodDelta,
              workPayMult: 1.22
            }
          };
        }
      },
      {
        id: "staff_house_bonfire",
        title: "Staff House Bonfire",
        weight: 10,
        when: function (state) {
          return isBusySeason(state) && getStaffRelationship(state) >= 10;
        },
        apply: function (state) {
          var dayNumber = getCurrentDayNumber(state);
          var staffDelta = adjustRelationship(state, "staff", 3);
          var moodDelta = adjustNeed(state, "social", 2);
          var energyDelta = adjustNeed(state, "energy", -3);

          addModifier(state, {
            id: "staff_house_bonfire_social",
            type: "socializeGainMult",
            value: 1.18,
            consumeOn: "socialize",
            remainingUses: 1,
            expiresOnDayNumber: dayNumber
          });

          return {
            logLines: [
              "Seasonal workers gather at a late bonfire after shifts.",
              "You're better connected, even if you stayed out too long."
            ],
            effectsApplied: {
              staff: staffDelta,
              mood: moodDelta,
              energy: energyDelta,
              socializeGainMult: 1.18
            }
          };
        }
      },
      {
        id: "new_workers_arrive",
        title: "New Workers Arrive",
        weight: 5,
        when: function (state) {
          return isSeason(state, "spring") || isSeason(state, "summer");
        },
        apply: function (state) {
          var staffDelta = adjustRelationship(state, "staff", 2);
          var townRepDelta = adjustTownRep(state, 1);

          return {
            logLines: [
              "A fresh batch of seasonal workers comes in on today's boats.",
              "The town feels more connected and easier to navigate."
            ],
            effectsApplied: {
              staff: staffDelta,
              townRep: townRepDelta
            }
          };
        }
      },
      {
        id: "housing_tension",
        title: "Housing Tension",
        weight: 2,
        when: function (state) {
          return isBusySeason(state) && getStaffRelationship(state) >= 18;
        },
        apply: function (state) {
          var moodDelta = adjustNeed(state, "social", -3);
          var locals = getLocalsRelationship(state);
          var staff = getStaffRelationship(state);
          var relationshipDelta;
          var relationshipTarget;

          if (locals >= staff) {
            relationshipTarget = "locals";
            relationshipDelta = adjustRelationship(state, "locals", 2);
          } else {
            relationshipTarget = "staff";
            relationshipDelta = adjustRelationship(state, "staff", 2);
          }

          return {
            logLines: [
              "Housing stress puts everyone on edge for a day.",
              "You help smooth things over with your closest group."
            ],
            effectsApplied: {
              mood: moodDelta,
              relationshipTarget: relationshipTarget,
              relationshipDelta: relationshipDelta
            }
          };
        }
      },
      {
        id: "visa_paperwork_stress",
        title: "Visa Paperwork Stress",
        weight: 5,
        when: function (state) {
          return isBusySeason(state) && getStaffRelationship(state) >= 6;
        },
        apply: function (state) {
          var moodDelta = adjustNeed(state, "social", -2);
          var staffDelta = adjustRelationship(state, "staff", 2);

          return {
            logLines: [
              "Paperwork problems hit part of the seasonal crew.",
              "You show up for people, even on a low-energy day."
            ],
            effectsApplied: {
              mood: moodDelta,
              staff: staffDelta
            }
          };
        }
      },
      {
        id: "local_regular_recognizes_you",
        title: "Local Regular Recognizes You",
        weight: 10,
        when: function (state) {
          return getLocalsRelationship(state) >= 20;
        },
        apply: function (state) {
          var dayNumber = getCurrentDayNumber(state);
          var localsDelta = adjustRelationship(state, "locals", 2);
          var townRepDelta = adjustTownRep(state, 1);

          addModifier(state, {
            id: "local_regular_recognizes_you_pay",
            type: "workPayMult",
            value: 1.1,
            consumeOn: "work",
            remainingUses: 1,
            expiresOnDayNumber: dayNumber
          });

          return {
            logLines: [
              "A local regular greets you by name and puts in a good word.",
              "Your next shift should go a little smoother."
            ],
            effectsApplied: {
              locals: localsDelta,
              townRep: townRepDelta,
              workPayMult: 1.1
            }
          };
        }
      },
      {
        id: "summer_people_tip_big",
        title: "Summer People Tip Big",
        weight: 5,
        when: function (state) {
          return getSummerPeopleRelationship(state) >= 25;
        },
        apply: function (state) {
          var dayNumber = getCurrentDayNumber(state);

          addModifier(state, {
            id: "summer_people_tip_big_amount",
            type: "tipAmountMult",
            value: 1.28,
            consumeOn: "work",
            remainingUses: 1,
            expiresOnDayNumber: dayNumber
          });

          return {
            logLines: [
              "Visitors are in a generous mood today.",
              "If you work next, tip totals could spike."
            ],
            effectsApplied: {
              tipAmountMult: 1.28
            }
          };
        }
      },
      {
        id: "permit_office_praise",
        title: "Town Hall Chatter",
        weight: 5,
        when: function (state) {
          return getTownReputationValue(state) >= 12;
        },
        apply: function (state) {
          var townRepDelta = adjustTownRep(state, 2);
          var localsDelta = adjustRelationship(state, "locals", 1);

          return {
            logLines: [
              "Good chatter about you reaches the town offices.",
              "Locals seem to trust you a little more."
            ],
            effectsApplied: {
              townRep: townRepDelta,
              locals: localsDelta
            }
          };
        }
      },
      {
        id: "bar_buzz",
        title: "Bar Buzz",
        weight: 5,
        when: function (state) {
          return hasActiveJobTag(state, "bar") || getBarReputationValue(state) >= 8;
        },
        apply: function (state) {
          var barRepDelta = adjustBarRep(state, 2);
          var summerDelta = adjustRelationship(state, "summerPeople", 1);

          return {
            logLines: [
              "Word spreads quickly through the island bar crowd.",
              "You're getting known on both sides of the counter."
            ],
            effectsApplied: {
              barRep: barRepDelta,
              summerPeople: summerDelta
            }
          };
        }
      },
      {
        id: "tourist_complaint_wave",
        title: "Tourist Complaint Wave",
        weight: 2,
        when: function (state) {
          return isBusySeason(state) && hasAnyActiveJobTag(state, ["service", "tourism", "bar"]);
        },
        apply: function (state) {
          var barRepDelta = adjustBarRep(state, -1);
          var moodDelta = adjustNeed(state, "social", -3);
          var localsDelta = adjustRelationship(state, "locals", 2);

          return {
            logLines: [
              "A string of tourist complaints tests everyone's patience.",
              "You handle it well enough to earn respect from locals."
            ],
            effectsApplied: {
              barRep: barRepDelta,
              mood: moodDelta,
              locals: localsDelta
            }
          };
        }
      },
      {
        id: "tips_tag_big_night",
        title: "Big Night",
        weight: 5,
        when: function (state) {
          return hasActiveJobTag(state, "tips");
        },
        apply: function (state) {
          var dayNumber = getCurrentDayNumber(state);

          addModifier(state, {
            id: "tips_tag_big_night_chance",
            type: "tipChanceBonus",
            value: 0.14,
            consumeOn: "work",
            remainingUses: 1,
            expiresOnDayNumber: dayNumber
          });
          addModifier(state, {
            id: "tips_tag_big_night_amount",
            type: "tipAmountMult",
            value: 1.2,
            consumeOn: "work",
            remainingUses: 1,
            expiresOnDayNumber: dayNumber
          });

          return {
            logLines: [
              "A strong crowd lines up for tip-heavy work tonight.",
              "Your next shift could bring a standout payout."
            ],
            effectsApplied: {
              tipChanceBonus: 0.14,
              tipAmountMult: 1.2
            }
          };
        }
      },
      {
        id: "tips_tag_slow_night",
        title: "Slow Night",
        weight: 10,
        when: function (state) {
          return hasActiveJobTag(state, "tips") && !isBusySeason(state);
        },
        apply: function (state) {
          var dayNumber = getCurrentDayNumber(state);

          addModifier(state, {
            id: "tips_tag_slow_night_chance",
            type: "tipChanceBonus",
            value: -0.1,
            consumeOn: "work",
            remainingUses: 1,
            expiresOnDayNumber: dayNumber
          });

          return {
            logLines: [
              "The room stays quiet all evening.",
              "Tip chances are likely lower on your next shift."
            ],
            effectsApplied: {
              tipChanceBonus: -0.1
            }
          };
        }
      },
      {
        id: "outdoors_perfect_conditions",
        title: "Perfect Sea Conditions",
        weight: 5,
        when: function (state) {
          return hasActiveJobTag(state, "outdoors");
        },
        apply: function (state) {
          var dayNumber = getCurrentDayNumber(state);
          var moodDelta = adjustNeed(state, "social", 2);

          addModifier(state, {
            id: "outdoors_perfect_conditions_pay",
            type: "workPayMult",
            value: 1.15,
            consumeOn: "work",
            remainingUses: 1,
            expiresOnDayNumber: dayNumber
          });

          return {
            logLines: [
              "Water and weather line up perfectly for outdoor crews.",
              "Your next shift should run cleaner and pay better."
            ],
            effectsApplied: {
              mood: moodDelta,
              workPayMult: 1.15
            }
          };
        }
      },
      {
        id: "outdoors_rough_water_day",
        title: "Rough Water Day",
        weight: 5,
        when: function (state) {
          return hasActiveJobTag(state, "outdoors");
        },
        apply: function (state) {
          var dayNumber = getCurrentDayNumber(state);
          var energyDelta = adjustNeed(state, "energy", -3);

          addModifier(state, {
            id: "outdoors_rough_water_day_pay",
            type: "workPayMult",
            value: 0.88,
            consumeOn: "work",
            remainingUses: 1,
            expiresOnDayNumber: dayNumber
          });

          return {
            logLines: [
              "Chop on the water makes outdoor work slower and tougher.",
              "Your next shift may pay less than usual."
            ],
            effectsApplied: {
              energy: energyDelta,
              workPayMult: 0.88
            }
          };
        }
      },
      {
        id: "municipal_extra_run",
        title: "Extra Run",
        weight: 5,
        when: function (state) {
          return hasAnyActiveJobTag(state, ["municipal", "steady"]);
        },
        apply: function (state) {
          var dayNumber = getCurrentDayNumber(state);
          var townRepDelta = adjustTownRep(state, 1);

          addModifier(state, {
            id: "municipal_extra_run_pay",
            type: "workPayMult",
            value: 1.12,
            consumeOn: "work",
            remainingUses: 1,
            expiresOnDayNumber: dayNumber
          });

          return {
            logLines: [
              "Operations add an extra run to keep services moving.",
              "Your reliability around town doesn't go unnoticed."
            ],
            effectsApplied: {
              townRep: townRepDelta,
              workPayMult: 1.12
            }
          };
        }
      }
    ];
  }

  // Content Wave 2 total events: 44.
  var DAILY_EVENTS = createEventDefinitions();

  function runDailyEvent(state, context) {
    var eventsState = ensureEventsState(state);
    var dayKey = getCurrentDayKey(state);
    var eligibleEvents;
    var selectedEvent;
    var applied;
    var result;

    if (!eventsState) {
      return null;
    }

    pruneExpiredModifiers(state);

    if (eventsState.lastEventRollDayKey === dayKey) {
      return null;
    }

    eventsState.lastEventRollDayKey = dayKey;

    if (random() > EVENT_TRIGGER_CHANCE) {
      eventsState.lastEventTitle = NONE_EVENT_TITLE;
      return null;
    }

    eligibleEvents = DAILY_EVENTS.filter(function (eventDefinition) {
      if (!eventDefinition || typeof eventDefinition.when !== "function") {
        return false;
      }

      try {
        return Boolean(eventDefinition.when(state, context));
      } catch (error) {
        return false;
      }
    });

    if (eligibleEvents.length <= 0) {
      eventsState.lastEventTitle = NONE_EVENT_TITLE;
      return null;
    }

    selectedEvent = weightedPick(eligibleEvents);
    if (!selectedEvent) {
      eventsState.lastEventTitle = NONE_EVENT_TITLE;
      return null;
    }

    applied = selectedEvent.apply && typeof selectedEvent.apply === "function"
      ? selectedEvent.apply(state, context)
      : { logLines: [] };
    result = applied && typeof applied === "object" ? applied : { logLines: [] };

    eventsState.lastEventDayKey = dayKey;
    eventsState.lastEventTitle = selectedEvent.title;

    return {
      id: selectedEvent.id,
      title: selectedEvent.title,
      logLines: Array.isArray(result.logLines) ? result.logLines.slice() : [],
      effectsApplied: result.effectsApplied && typeof result.effectsApplied === "object"
        ? result.effectsApplied
        : {}
    };
  }

  function getDailyEventDefinitions() {
    return DAILY_EVENTS.slice();
  }

  ns.events = {
    EVENT_TRIGGER_CHANCE: EVENT_TRIGGER_CHANCE,
    NONE_EVENT_TITLE: NONE_EVENT_TITLE,
    getCurrentDayNumber: getCurrentDayNumber,
    getCurrentDayKey: getCurrentDayKey,
    ensureEventsState: ensureEventsState,
    pruneExpiredModifiers: pruneExpiredModifiers,
    addModifier: addModifier,
    getCombinedWorkPayMultiplier: getCombinedWorkPayMultiplier,
    getCombinedTipChanceBonus: getCombinedTipChanceBonus,
    getCombinedTipAmountMultiplier: getCombinedTipAmountMultiplier,
    getCombinedSocializeGainMultiplier: getCombinedSocializeGainMultiplier,
    consumeModifiersForAction: consumeModifiersForAction,
    runDailyEvent: runDailyEvent,
    getDailyEventDefinitions: getDailyEventDefinitions
  };
})(window);
