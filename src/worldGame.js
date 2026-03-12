(function (global) {
  var ns = global.BlockIsland = global.BlockIsland || {};
  var worldMap = ns.worldMap;
  var worldPlayer = ns.worldPlayer;
  var worldNpcs = ns.worldNpcs;
  var worldTime = ns.worldTime;
  var worldInteractions = ns.worldInteractions;
  var worldRenderer = ns.worldRenderer;

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
    var context2d;
    var map;
    var player;
    var input;
    var npcs;
    var lastFrameTime = 0;
    var interactionCooldownMs = 0;
    var feedbackTimeoutMs = 0;
    var lastKnownDayKey = "";
    var destroyed = false;

    if (!canvas || typeof canvas.getContext !== "function") {
      return null;
    }

    context2d = canvas.getContext("2d");
    if (!context2d) {
      return null;
    }

    map = worldMap && typeof worldMap.createStarterMap === "function"
      ? worldMap.createStarterMap()
      : null;
    if (!map) {
      return null;
    }

    player = worldPlayer.createPlayer(map.spawnPoint);
    input = worldPlayer.createInputState();
    npcs = worldNpcs && typeof worldNpcs.createNpcRuntime === "function"
      ? worldNpcs.createNpcRuntime()
      : [];

    function getState() {
      return options && typeof options.getState === "function"
        ? options.getState()
        : null;
    }

    function resetPlayerToHome() {
      if (!player) return;

      worldPlayer.resetPlayerPosition(player, map.sleepSpawnPoint || map.spawnPoint);
    }

    function onKeyDown(event) {
      if (!event || isFormLikeElement(event.target)) return;

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
          onSelectStartingJob: options && typeof options.onSelectStartingJob === "function"
            ? options.onSelectStartingJob
            : null
        }
      });

      if (!result || !result.handled) {
        setFeedback({ feedback: feedbackValue }, "Move closer to someone or a location to interact.");
      } else {
        setFeedback({ feedback: feedbackValue }, result.message || "");
      }

      feedbackTimeoutMs = 4200;
      interactionCooldownMs = 260;
      input.interactPressed = false;

      if (result && result.endDay) {
        resetPlayerToHome();
      }
    }

    function updateHud(state) {
      var minuteOfDay;
      var segmentId;
      var hint;
      var locationName;

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

      if (worldTime && typeof worldTime.ensureTimeState === "function") {
        worldTime.ensureTimeState(state);
      }

      dayKey = getDayKey(state);
      if (lastKnownDayKey && dayKey !== lastKnownDayKey) {
        resetPlayerToHome();
      }
      lastKnownDayKey = dayKey;

      movementResult = worldPlayer.updatePlayer(player, input, map, deltaMs / 1000);
      if (worldTime && typeof worldTime.tickClock === "function") {
        worldTime.tickClock(state, deltaMs, Boolean(movementResult && movementResult.moved));
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

      renderFrame(state);
      global.requestAnimationFrame(updateFrame);
    }

    global.addEventListener("keydown", onKeyDown);
    global.addEventListener("keyup", onKeyUp);
    global.requestAnimationFrame(updateFrame);

    return {
      resetPlayerToHome: resetPlayerToHome,
      destroy: function () {
        destroyed = true;
        global.removeEventListener("keydown", onKeyDown);
        global.removeEventListener("keyup", onKeyUp);
      }
    };
  }

  ns.overworldGame = {
    initOverworld: initOverworld
  };
})(window);
