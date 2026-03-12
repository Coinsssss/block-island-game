(function (global) {
  var ns = global.BlockIsland = global.BlockIsland || {};
  var worldMap = ns.worldMap;
  var worldPlayer = ns.worldPlayer;
  var worldNpcs = ns.worldNpcs;
  var worldTime = ns.worldTime;
  var worldInteractions = ns.worldInteractions;
  var worldSimulation = ns.worldSimulation;
  var worldRenderer = ns.worldRenderer;
  var AUTOSAVE_INTERVAL_MS = 6000;

  function isFormLikeElement(target) {
    var tagName;

    if (!target || typeof target.tagName !== "string") {
      return false;
    }

    tagName = target.tagName.toLowerCase();
    return tagName === "input" || tagName === "textarea" || tagName === "select";
  }

  function getDayKey(state) {
    if (!state || !state.time) return "0:0:0";
    return [
      state.time.year || 1,
      state.time.seasonIndex || 0,
      state.time.day || 1
    ].join(":");
  }

  function setFeedback(elements, text) {
    if (!elements.feedback) return;
    elements.feedback.textContent = text || "";
  }

  function initOverworld(options) {
    var canvas = global.document.getElementById("world-canvas");
    var clockValue = global.document.getElementById("world-clock-value");
    var segmentValue = global.document.getElementById("world-segment-value");
    var locationValue = global.document.getElementById("world-location-value");
    var hintValue = global.document.getElementById("world-hint-value");
    var feedbackValue = global.document.getElementById("world-feedback-value");
    var standValue = global.document.getElementById("world-stand-value");
    var hungerValue = global.document.getElementById("world-hunger-value");
    var energyValue = global.document.getElementById("world-energy-value");
    var moodValue = global.document.getElementById("world-mood-value");
    var dialogueOverlay = global.document.getElementById("world-dialogue-overlay");
    var dialogueName = global.document.getElementById("world-dialogue-name");
    var dialogueText = global.document.getElementById("world-dialogue-text");
    var context2d;
    var map;
    var player;
    var input;
    var npcs;
    var lastFrameTime = 0;
    var interactionCooldownMs = 0;
    var feedbackTimeoutMs = 0;
    var lastKnownDayKey = "";
    var uiRefreshAccumulatorMs = 0;
    var dialogueOpen = false;
    var destroyed = false;
    var autosaveAccumulatorMs = 0;
    var autosavePending = false;

    if (!canvas || typeof canvas.getContext !== "function") {
      return null;
    }

    context2d = canvas.getContext("2d");
    if (!context2d) {
      return null;
    }

    function getState() {
      return options && typeof options.getState === "function"
        ? options.getState()
        : null;
    }

    function getDefaultMapId() {
      return worldMap && typeof worldMap.getDefaultMapId === "function"
        ? worldMap.getDefaultMapId()
        : "starter_town_slice";
    }

    function getSavedMapId(state) {
      return state &&
        state.world &&
        state.world.overworld &&
        typeof state.world.overworld.currentMapId === "string" &&
        state.world.overworld.currentMapId.length > 0
        ? state.world.overworld.currentMapId
        : getDefaultMapId();
    }

    function ensurePersistentOverworldState(state) {
      if (!state || !state.world || typeof state.world !== "object") {
        return null;
      }

      if (!state.world.overworld || typeof state.world.overworld !== "object") {
        state.world.overworld = {};
      }
      if (typeof state.world.overworld.currentMapId !== "string" || state.world.overworld.currentMapId.length <= 0) {
        state.world.overworld.currentMapId = getDefaultMapId();
      }
      if (!state.world.overworld.player || typeof state.world.overworld.player !== "object") {
        state.world.overworld.player = {};
      }
      if (!state.world.overworld.mapStates || typeof state.world.overworld.mapStates !== "object") {
        state.world.overworld.mapStates = {};
      }

      if (typeof state.world.overworld.player.x !== "number" || Number.isNaN(state.world.overworld.player.x)) {
        state.world.overworld.player.x = map && map.spawnPoint ? map.spawnPoint.x : 230;
      }
      if (typeof state.world.overworld.player.y !== "number" || Number.isNaN(state.world.overworld.player.y)) {
        state.world.overworld.player.y = map && map.spawnPoint ? map.spawnPoint.y : 1030;
      }
      if (typeof state.world.overworld.player.facingX !== "number" || Number.isNaN(state.world.overworld.player.facingX)) {
        state.world.overworld.player.facingX = 0;
      }
      if (typeof state.world.overworld.player.facingY !== "number" || Number.isNaN(state.world.overworld.player.facingY)) {
        state.world.overworld.player.facingY = 1;
      }

      if (
        state.world.overworld.player.facingX === 0 &&
        state.world.overworld.player.facingY === 0
      ) {
        state.world.overworld.player.facingY = 1;
      }

      return state.world.overworld;
    }

    map = worldMap && typeof worldMap.createMapById === "function"
      ? worldMap.createMapById(getSavedMapId(getState()))
      : (worldMap && typeof worldMap.createStarterMap === "function"
        ? worldMap.createStarterMap()
        : null);
    if (!map) {
      return null;
    }

    player = worldPlayer.createPlayer(map.spawnPoint);

    function applySavedPlayerState(state) {
      var overworldState = ensurePersistentOverworldState(state);
      var savedPlayerState;
      var clampedPosition;

      if (!overworldState || !player) {
        return;
      }

      savedPlayerState = overworldState.player;
      clampedPosition = worldMap && typeof worldMap.clampToBounds === "function"
        ? worldMap.clampToBounds(map, savedPlayerState.x, savedPlayerState.y, player.radius)
        : {
            x: savedPlayerState.x,
            y: savedPlayerState.y
          };

      player.x = clampedPosition.x;
      player.y = clampedPosition.y;
      player.facingX = Math.max(-1, Math.min(1, Math.round(savedPlayerState.facingX || 0)));
      player.facingY = Math.max(-1, Math.min(1, Math.round(savedPlayerState.facingY || 1)));
      if (player.facingX === 0 && player.facingY === 0) {
        player.facingY = 1;
      }
    }

    function syncPersistentOverworldState(state) {
      var overworldState = ensurePersistentOverworldState(state);
      var roundedX;
      var roundedY;
      var roundedFacingX;
      var roundedFacingY;
      var changed = false;

      if (!overworldState || !player || !map) {
        return false;
      }

      roundedX = Math.round(player.x);
      roundedY = Math.round(player.y);
      roundedFacingX = Math.max(-1, Math.min(1, Math.round(player.facingX || 0)));
      roundedFacingY = Math.max(-1, Math.min(1, Math.round(player.facingY || 1)));
      if (roundedFacingX === 0 && roundedFacingY === 0) {
        roundedFacingY = 1;
      }

      if (overworldState.currentMapId !== map.id) {
        overworldState.currentMapId = map.id;
        changed = true;
      }
      if (overworldState.player.x !== roundedX) {
        overworldState.player.x = roundedX;
        changed = true;
      }
      if (overworldState.player.y !== roundedY) {
        overworldState.player.y = roundedY;
        changed = true;
      }
      if (overworldState.player.facingX !== roundedFacingX) {
        overworldState.player.facingX = roundedFacingX;
        changed = true;
      }
      if (overworldState.player.facingY !== roundedFacingY) {
        overworldState.player.facingY = roundedFacingY;
        changed = true;
      }

      return changed;
    }

    function markAutosavePending() {
      autosavePending = true;
    }

    function flushAutosave(reason, forceSave) {
      var currentState = getState();

      if (!currentState) {
        return false;
      }

      if (syncPersistentOverworldState(currentState)) {
        autosavePending = true;
      }

      if (!forceSave && !autosavePending) {
        return false;
      }

      autosaveAccumulatorMs = 0;
      autosavePending = false;
      if (options && typeof options.onAutosave === "function") {
        return Boolean(options.onAutosave(reason || "overworld"));
      }

      return false;
    }

    applySavedPlayerState(getState());
    input = worldPlayer.createInputState();
    npcs = worldNpcs && typeof worldNpcs.createNpcRuntime === "function"
      ? worldNpcs.createNpcRuntime()
      : [];

    function resetPlayerToHome() {
      if (!player) return;

      worldPlayer.resetPlayerPosition(player, map.sleepSpawnPoint || map.spawnPoint);
      if (syncPersistentOverworldState(getState())) {
        markAutosavePending();
      }
    }

    function onKeyDown(event) {
      if (!event || isFormLikeElement(event.target)) return;

      if (
        dialogueOpen &&
        (event.code === "KeyE" || event.code === "Escape")
      ) {
        closeDialogue();
        event.preventDefault();
        return;
      }

      if (event.code === "ArrowUp" || event.code === "KeyW") {
        input.up = true;
      } else if (event.code === "ArrowDown" || event.code === "KeyS") {
        input.down = true;
      } else if (event.code === "ArrowLeft" || event.code === "KeyA") {
        input.left = true;
      } else if (event.code === "ArrowRight" || event.code === "KeyD") {
        input.right = true;
      } else if (event.code === "KeyE" && !event.repeat) {
        input.interactPressed = true;
      } else {
        return;
      }

      event.preventDefault();
    }

    function onKeyUp(event) {
      if (!event) return;

      if (event.code === "ArrowUp" || event.code === "KeyW") {
        input.up = false;
      } else if (event.code === "ArrowDown" || event.code === "KeyS") {
        input.down = false;
      } else if (event.code === "ArrowLeft" || event.code === "KeyA") {
        input.left = false;
      } else if (event.code === "ArrowRight" || event.code === "KeyD") {
        input.right = false;
      }
    }

    function runInteraction(state) {
      var result;

      if (!worldInteractions || typeof worldInteractions.attemptInteraction !== "function") {
        return;
      }

      result = worldInteractions.attemptInteraction({
        state: state,
        player: player,
        map: map,
        npcs: npcs,
        callbacks: {
          onWork: options && typeof options.onWork === "function" ? options.onWork : null,
          onEat: options && typeof options.onEat === "function" ? options.onEat : null,
          onSocialize: options && typeof options.onSocialize === "function" ? options.onSocialize : null,
          onRest: options && typeof options.onRest === "function" ? options.onRest : null,
          onSleep: options && typeof options.onSleep === "function" ? options.onSleep : null,
          onNpcTalk: options && typeof options.onNpcTalk === "function" ? options.onNpcTalk : null,
          onToggleStand: options && typeof options.onToggleStand === "function"
            ? options.onToggleStand
            : null,
          onSelectStartingJob: options && typeof options.onSelectStartingJob === "function"
            ? options.onSelectStartingJob
            : null
        }
      });

      if (!result || !result.handled) {
        setFeedback({ feedback: feedbackValue }, "Move closer to someone or a location to interact.");
      } else {
        setFeedback({ feedback: feedbackValue }, result.message || "");
        if (result && result.dialogue) {
          openDialogue(result.dialogueTitle || "Conversation", result.dialogue);
        }
      }

      feedbackTimeoutMs = 4200;
      interactionCooldownMs = 260;
      input.interactPressed = false;

      if (result && result.endDay) {
        resetPlayerToHome();
        flushAutosave("sleep_transition", true);
      } else if (result && result.reachedEndOfDay) {
        runAutomaticDayEnd(state);
      }

      if (
        result &&
        result.handled &&
        result.success &&
        !result.endDay &&
        !result.reachedEndOfDay
      ) {
        syncPersistentOverworldState(state);
        markAutosavePending();
      }

      if (result && result.handled && options && typeof options.requestRender === "function") {
        options.requestRender();
      }
    }

    function openDialogue(title, text) {
      if (!dialogueOverlay) return;

      dialogueOpen = true;
      if (dialogueName) {
        dialogueName.textContent = title || "Conversation";
      }
      if (dialogueText) {
        dialogueText.textContent = text || "...";
      }
      dialogueOverlay.hidden = false;
    }

    function closeDialogue() {
      if (!dialogueOverlay) return;

      dialogueOpen = false;
      dialogueOverlay.hidden = true;
      interactionCooldownMs = 250;
      input.interactPressed = false;
    }

    function isTimePaused() {
      var pausedElement;
      var callbackPaused = options && typeof options.isTimePaused === "function"
        ? Boolean(options.isTimePaused())
        : false;

      if (dialogueOpen || callbackPaused) {
        return true;
      }

      pausedElement = global.document.querySelector("[data-pauses-time=\"true\"]:not([hidden])");
      return Boolean(pausedElement);
    }

    function runAutomaticDayEnd(state) {
      var slept = options && typeof options.onSleep === "function"
        ? Boolean(options.onSleep())
        : false;

      if (!slept) {
        setFeedback({ feedback: feedbackValue }, "You pass out from exhaustion as day ends.");
      } else {
        setFeedback({ feedback: feedbackValue }, "The day ends. You wake up the next morning.");
      }

      if (worldSimulation && typeof worldSimulation.resetDailyWorldState === "function") {
        worldSimulation.resetDailyWorldState(state);
      }
      resetPlayerToHome();
      if (worldTime && typeof worldTime.resetClockAccumulator === "function") {
        worldTime.resetClockAccumulator();
      }
      flushAutosave("automatic_day_end", true);
      feedbackTimeoutMs = 4200;
    }

    function onPageHide() {
      flushAutosave("pagehide", true);
    }

    function updateHud(state) {
      var minuteOfDay;
      var segmentId;
      var hint;
      var locationName;
      var standLabel;

      if (!state) return;

      minuteOfDay = worldTime && typeof worldTime.getMinuteOfDay === "function"
        ? worldTime.getMinuteOfDay(state)
        : 8 * 60;
      segmentId = worldTime && typeof worldTime.getTimeSegmentId === "function"
        ? worldTime.getTimeSegmentId(minuteOfDay)
        : "morning";
      locationName = worldMap && typeof worldMap.getLocationNameAtPosition === "function"
        ? worldMap.getLocationNameAtPosition(map, player.x, player.y)
        : "Island Road";
      hint = worldInteractions && typeof worldInteractions.getInteractionHint === "function"
        ? worldInteractions.getInteractionHint(state, player, map, npcs)
        : "Move with WASD/Arrows. Press E to interact.";

      if (clockValue) {
        clockValue.textContent = worldTime && typeof worldTime.formatClock === "function"
          ? worldTime.formatClock(minuteOfDay)
          : "08:00";
      }
      if (segmentValue) {
        segmentValue.textContent = worldTime && typeof worldTime.getSegmentLabel === "function"
          ? worldTime.getSegmentLabel(segmentId)
          : "Morning";
      }
      if (locationValue) {
        locationValue.textContent = locationName;
      }
      if (hintValue) {
        hintValue.textContent = hint;
      }
      if (worldSimulation && typeof worldSimulation.getStandStatusLabel === "function") {
        standLabel = worldSimulation.getStandStatusLabel(state);
      } else {
        standLabel = "Closed";
      }
      if (standValue) {
        standValue.textContent = standLabel;
      }
      if (state.player && state.player.needs) {
        if (hungerValue) hungerValue.textContent = String(Math.round(state.player.needs.hunger));
        if (energyValue) energyValue.textContent = String(Math.round(state.player.needs.energy));
        if (moodValue) moodValue.textContent = String(Math.round(state.player.needs.social));
      }
    }

    function renderFrame(state) {
      var nearbyNpc = worldNpcs && typeof worldNpcs.getNearestNpc === "function"
        ? worldNpcs.getNearestNpc(npcs, player, 72)
        : null;
      var nearbyInteractable = worldInteractions && typeof worldInteractions.getNearestInteractable === "function"
        ? worldInteractions.getNearestInteractable(map, player, 72)
        : null;
      var highlightedNpcId = nearbyNpc ? nearbyNpc.id : "";
      var highlightedInteractableId = highlightedNpcId ? "" : (nearbyInteractable ? nearbyInteractable.id : "");
      var areaLabel = worldMap && typeof worldMap.getLocationNameAtPosition === "function"
        ? worldMap.getLocationNameAtPosition(map, player.x, player.y)
        : "Island Road";

      worldRenderer.renderFrame(canvas, context2d, map, player, npcs, {
        highlightedNpcId: highlightedNpcId,
        highlightedInteractableId: highlightedInteractableId,
        areaLabel: areaLabel
      });

      updateHud(state);
    }

    function updateFrame(timestampMs) {
      var state;
      var deltaMs;
      var movementResult;
      var minuteOfDay;
      var dayKey;
      var clockTick;
      var paused;
      var movementSpeedMult = 1;
      var previousMinute;

      if (destroyed) {
        return;
      }

      if (typeof timestampMs !== "number" || Number.isNaN(timestampMs)) {
        timestampMs = 0;
      }

      if (!lastFrameTime) {
        lastFrameTime = timestampMs;
      }

      deltaMs = Math.min(120, Math.max(0, timestampMs - lastFrameTime));
      lastFrameTime = timestampMs;

      state = getState();
      if (!state || !state.time || !state.player) {
        global.requestAnimationFrame(updateFrame);
        return;
      }

      if (worldSimulation && typeof worldSimulation.ensureStandState === "function") {
        worldSimulation.ensureStandState(state);
      }
      if (worldTime && typeof worldTime.ensureTimeState === "function") {
        worldTime.ensureTimeState(state);
      }

      dayKey = getDayKey(state);
      if (lastKnownDayKey && dayKey !== lastKnownDayKey) {
        resetPlayerToHome();
      }
      lastKnownDayKey = dayKey;

      paused = isTimePaused();
      if (worldSimulation && typeof worldSimulation.getMovementSpeedMultiplier === "function") {
        movementSpeedMult = worldSimulation.getMovementSpeedMultiplier(state);
      }
      movementResult = paused
        ? { moved: false }
        : worldPlayer.updatePlayer(player, input, map, deltaMs / 1000, movementSpeedMult);

      previousMinute = worldTime && typeof worldTime.getMinuteOfDay === "function"
        ? worldTime.getMinuteOfDay(state)
        : 8 * 60;
      clockTick = worldTime && typeof worldTime.tickClock === "function"
        ? worldTime.tickClock(state, deltaMs, paused)
        : { advancedMinutes: 0, reachedEndOfDay: false };
      if (clockTick.advancedMinutes > 0 && worldSimulation && typeof worldSimulation.stepRealtimeSimulation === "function") {
        worldSimulation.stepRealtimeSimulation(state, clockTick.advancedMinutes, previousMinute);
      }
      if (clockTick.reachedEndOfDay) {
        runAutomaticDayEnd(state);
      }

      minuteOfDay = worldTime && typeof worldTime.getMinuteOfDay === "function"
        ? worldTime.getMinuteOfDay(state)
        : 8 * 60;
      if (worldNpcs && typeof worldNpcs.updateNpcPositions === "function") {
        worldNpcs.updateNpcPositions(npcs, minuteOfDay);
      }

      if (interactionCooldownMs > 0) {
        interactionCooldownMs = Math.max(0, interactionCooldownMs - deltaMs);
      }
      if (feedbackTimeoutMs > 0) {
        feedbackTimeoutMs = Math.max(0, feedbackTimeoutMs - deltaMs);
        if (feedbackTimeoutMs === 0) {
          setFeedback({ feedback: feedbackValue }, "");
        }
      }

      if (input.interactPressed && interactionCooldownMs <= 0) {
        runInteraction(state);
      }

      if (
        movementResult.moved ||
        (clockTick.advancedMinutes > 0 && !clockTick.reachedEndOfDay)
      ) {
        syncPersistentOverworldState(state);
        markAutosavePending();
      }

      if (autosavePending) {
        autosaveAccumulatorMs += deltaMs;
        if (autosaveAccumulatorMs >= AUTOSAVE_INTERVAL_MS) {
          flushAutosave("overworld_autosave", false);
        }
      } else {
        autosaveAccumulatorMs = 0;
      }

      if (clockTick.advancedMinutes > 0 || feedbackTimeoutMs > 0) {
        uiRefreshAccumulatorMs += deltaMs;
      }
      if (uiRefreshAccumulatorMs >= 280) {
        if (options && typeof options.requestRender === "function") {
          options.requestRender();
        }
        uiRefreshAccumulatorMs = 0;
      }

      renderFrame(state);
      global.requestAnimationFrame(updateFrame);
    }

    global.addEventListener("keydown", onKeyDown);
    global.addEventListener("keyup", onKeyUp);
    global.addEventListener("pagehide", onPageHide);
    global.requestAnimationFrame(updateFrame);

    return {
      resetPlayerToHome: resetPlayerToHome,
      destroy: function () {
        destroyed = true;
        flushAutosave("destroy", true);
        global.removeEventListener("keydown", onKeyDown);
        global.removeEventListener("keyup", onKeyUp);
        global.removeEventListener("pagehide", onPageHide);
      }
    };
  }

  ns.overworldGame = {
    initOverworld: initOverworld
  };
})(window);
