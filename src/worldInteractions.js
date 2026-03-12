(function (global) {
  var ns = global.BlockIsland = global.BlockIsland || {};
  var jobs = ns.jobs;
  var worldMap = ns.worldMap;
  var worldTime = ns.worldTime;
  var worldNpcs = ns.worldNpcs;

  var INTERACTION_DISTANCE = 72;
  var DEFAULT_STARTER_JOB_ID = "halls_mowing_crew";

  function getDistance(ax, ay, bx, by) {
    var dx = bx - ax;
    var dy = by - ay;
    return Math.sqrt((dx * dx) + (dy * dy));
  }

  function getNearestInteractable(map, player, maxDistance) {
    var interactables = worldMap && typeof worldMap.getInteractables === "function"
      ? worldMap.getInteractables(map)
      : [];
    var maxRange = typeof maxDistance === "number" ? maxDistance : INTERACTION_DISTANCE;
    var nearest = null;
    var nearestDistance = maxRange;
    var i;

    for (i = 0; i < interactables.length; i += 1) {
      var interactable = interactables[i];
      var radius = typeof interactable.radius === "number" ? interactable.radius : maxRange;
      var distance = getDistance(player.x, player.y, interactable.x, interactable.y);
      var allowedDistance = Math.max(28, Math.min(maxRange, radius + 18));

      if (distance <= allowedDistance && distance <= nearestDistance) {
        nearest = interactable;
        nearestDistance = distance;
      }
    }

    return nearest;
  }

  function getBlockedTimeMessage(actionId) {
    if (actionId === "work") {
      return "Work check-ins are open in the morning and afternoon.";
    }
    if (actionId === "eat") {
      return "Food spots are open in the daytime and evening.";
    }
    if (actionId === "socialize") {
      return "People are mostly around to socialize in the afternoon and evening.";
    }
    if (actionId === "sleep") {
      return "It's still early. Come back in the evening to sleep.";
    }

    return "That action isn't available right now.";
  }

  function chooseStarterJobId(state) {
    var available = jobs && typeof jobs.getAvailableJobIds === "function"
      ? jobs.getAvailableJobIds(state)
      : [];

    if (available.indexOf(DEFAULT_STARTER_JOB_ID) >= 0) {
      return DEFAULT_STARTER_JOB_ID;
    }

    return available[0] || "";
  }

  function applyActionAndAdvanceTime(actionFn) {
    return typeof actionFn === "function" ? Boolean(actionFn()) : false;
  }

  function spendTimeForAction(state, actionId, success) {
    if (!success) {
      return {
        minutesSpent: 0,
        reachedEndOfDay: false
      };
    }

    if (!worldTime || typeof worldTime.spendActionTime !== "function") {
      return {
        minutesSpent: 0,
        reachedEndOfDay: false
      };
    }

    return worldTime.spendActionTime(state, actionId);
  }

  function interactWithNpc(context, npc) {
    var state = context.state;
    var callbacks = context.callbacks;
    var dialogue;
    var success;
    var timeResult;

    if (!worldTime || !worldTime.isActionAllowedNow || !worldTime.isActionAllowedNow(state, "socialize")) {
      return {
        handled: true,
        success: false,
        message: getBlockedTimeMessage("socialize")
      };
    }

    if (typeof callbacks.onNpcTalk === "function") {
      success = Boolean(callbacks.onNpcTalk(npc));
    } else {
      success = Boolean(callbacks.onSocialize && callbacks.onSocialize());
    }
    if (!success) {
      return {
        handled: true,
        success: false,
        message: "You couldn't socialize right now."
      };
    }

    dialogue = worldNpcs && typeof worldNpcs.getNpcDialogueLine === "function"
      ? worldNpcs.getNpcDialogueLine(npc, worldTime.getMinuteOfDay(state))
      : "Nice seeing you around town.";
    timeResult = spendTimeForAction(state, "npcTalk", success);

    return {
      handled: true,
      success: true,
      message: "You chat with " + npc.name + ".",
      dialogueTitle: npc.name,
      dialogue: dialogue,
      timeAdvancedMinutes: timeResult.minutesSpent,
      reachedEndOfDay: timeResult.reachedEndOfDay
    };
  }

  function interactWithLocation(context, interactable) {
    var state = context.state;
    var callbacks = context.callbacks;
    var isAllowed;
    var starterJobId;
    var starterJobName;
    var pendingJobName;
    var success;
    var timeResult;

    if (!interactable || !interactable.type) {
      return {
        handled: false,
        success: false,
        message: ""
      };
    }

    if (interactable.type === "work") {
      isAllowed = worldTime && worldTime.isActionAllowedNow
        ? worldTime.isActionAllowedNow(state, "work")
        : true;

      if (!isAllowed) {
        return { handled: true, success: false, message: getBlockedTimeMessage("work") };
      }

      if (!state.jobs.activeJobId) {
        if (state.jobs.pendingJobId) {
          pendingJobName = jobs && jobs.getJobName ? jobs.getJobName(state.jobs.pendingJobId) : "your job";
          return {
            handled: true,
            success: false,
            message: "You're already hired at " + pendingJobName + ". You start tomorrow."
          };
        }

        starterJobId = chooseStarterJobId(state);
        if (!starterJobId) {
          return {
            handled: true,
            success: false,
            message: "No jobs are unlocked yet. Build reputation first."
          };
        }

        success = typeof callbacks.onSelectStartingJob === "function"
          ? Boolean(callbacks.onSelectStartingJob(starterJobId))
          : false;
        if (!success) {
          return {
            handled: true,
            success: false,
            message: "You couldn't lock in a starting shift yet."
          };
        }

        starterJobName = jobs && jobs.getJobName ? jobs.getJobName(starterJobId) : "a new job";
        return {
          handled: true,
          success: true,
          message: "You apply at " + starterJobName + ". Show up tomorrow for your first shift."
        };
      }

      success = applyActionAndAdvanceTime(callbacks.onWork);
      timeResult = spendTimeForAction(state, "work", success);
      return {
        handled: true,
        success: success,
        message: success ? "Shift completed." : "That shift couldn't happen right now.",
        timeAdvancedMinutes: timeResult.minutesSpent,
        reachedEndOfDay: timeResult.reachedEndOfDay
      };
    }

    if (interactable.type === "eat") {
      isAllowed = worldTime && worldTime.isActionAllowedNow
        ? worldTime.isActionAllowedNow(state, "eat")
        : true;
      if (!isAllowed) {
        return { handled: true, success: false, message: getBlockedTimeMessage("eat") };
      }

      success = applyActionAndAdvanceTime(callbacks.onEat);
      timeResult = spendTimeForAction(state, "eat", success);
      return {
        handled: true,
        success: success,
        message: success ? "You grab a meal." : "You couldn't buy food right now.",
        timeAdvancedMinutes: timeResult.minutesSpent,
        reachedEndOfDay: timeResult.reachedEndOfDay
      };
    }

    if (interactable.type === "socialize") {
      isAllowed = worldTime && worldTime.isActionAllowedNow
        ? worldTime.isActionAllowedNow(state, "socialize")
        : true;
      if (!isAllowed) {
        return { handled: true, success: false, message: getBlockedTimeMessage("socialize") };
      }

      success = applyActionAndAdvanceTime(callbacks.onSocialize);
      timeResult = spendTimeForAction(state, "socialize", success);
      return {
        handled: true,
        success: success,
        message: success ? "You spend time around town." : "You couldn't socialize right now.",
        timeAdvancedMinutes: timeResult.minutesSpent,
        reachedEndOfDay: timeResult.reachedEndOfDay
      };
    }

    if (interactable.type === "rest") {
      success = applyActionAndAdvanceTime(callbacks.onRest);
      timeResult = spendTimeForAction(state, "rest", success);
      return {
        handled: true,
        success: success,
        message: success ? "You take a breather." : "You couldn't rest right now.",
        timeAdvancedMinutes: timeResult.minutesSpent,
        reachedEndOfDay: timeResult.reachedEndOfDay
      };
    }

    if (interactable.type === "stand") {
      success = typeof callbacks.onToggleStand === "function"
        ? Boolean(callbacks.onToggleStand())
        : false;
      timeResult = spendTimeForAction(state, "stand", success);
      return {
        handled: true,
        success: success,
        message: success
          ? "You adjust the stand setup."
          : "You couldn't change stand status right now.",
        timeAdvancedMinutes: timeResult.minutesSpent,
        reachedEndOfDay: timeResult.reachedEndOfDay
      };
    }

    if (interactable.type === "sleep") {
      success = typeof callbacks.onSleep === "function" ? Boolean(callbacks.onSleep()) : false;
      return {
        handled: true,
        success: success,
        endDay: success,
        message: success ? "You settle in and end the day." : "You couldn't sleep right now."
      };
    }

    return { handled: true, success: false, message: "Nothing happened." };
  }

  function getNearbyTarget(state, player, map, npcs) {
    var npc = worldNpcs && typeof worldNpcs.getNearestNpc === "function"
      ? worldNpcs.getNearestNpc(npcs, player, INTERACTION_DISTANCE)
      : null;
    var interactable = getNearestInteractable(map, player, INTERACTION_DISTANCE);

    if (npc) {
      return {
        kind: "npc",
        npc: npc
      };
    }

    if (interactable) {
      return {
        kind: "interactable",
        interactable: interactable
      };
    }

    return null;
  }

  function attemptInteraction(context) {
    var target = getNearbyTarget(context.state, context.player, context.map, context.npcs);

    if (!target) {
      return {
        handled: false,
        success: false,
        message: "Move closer to a person or location to interact."
      };
    }

    if (target.kind === "npc") {
      return interactWithNpc(context, target.npc);
    }

    return interactWithLocation(context, target.interactable);
  }

  function getInteractionHint(state, player, map, npcs) {
    var target = getNearbyTarget(state, player, map, npcs);

    if (!target) {
      return "Move with WASD/Arrows. Press E to interact.";
    }

    if (target.kind === "npc") {
      return "Press E to talk to " + target.npc.name + ".";
    }

    return target.interactable.prompt || "Press E to interact.";
  }

  ns.worldInteractions = {
    INTERACTION_DISTANCE: INTERACTION_DISTANCE,
    getNearestInteractable: getNearestInteractable,
    attemptInteraction: attemptInteraction,
    getInteractionHint: getInteractionHint
  };
})(window);
