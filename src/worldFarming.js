(function (global) {
  var ns = global.BlockIsland = global.BlockIsland || {};

  var TOOL_ORDER = ["hoe", "watering_can", "turnip_seeds"];
  var TOOL_HOTKEYS = {
    Digit1: "hoe",
    Digit2: "watering_can",
    Digit3: "turnip_seeds"
  };
  var ITEM_LABELS = {
    hoe: "Hoe",
    watering_can: "Watering Can",
    turnip_seeds: "Turnip Seeds",
    turnip: "Turnips"
  };
  var CROP_DEFINITIONS = {
    turnip: {
      seedItemId: "turnip_seeds",
      produceItemId: "turnip",
      label: "Island Turnip",
      daysToGrow: 2
    }
  };
  var ACTION_MINUTE_COSTS = {
    till: 20,
    plant: 15,
    water: 10,
    harvest: 12
  };
  var INTERACTION_DISTANCE = 72;

  function createInventorySnapshot() {
    return {
      hoe: 1,
      watering_can: 1,
      turnip_seeds: 6,
      turnip: 0
    };
  }

  function getFarmPlots(map) {
    return map && Array.isArray(map.farmPlots) ? map.farmPlots : [];
  }

  function ensureInventory(state) {
    var player;
    var inventory;
    var defaults = createInventorySnapshot();

    if (!state || !state.player || typeof state.player !== "object") {
      return defaults;
    }

    player = state.player;
    if (!player.inventory || typeof player.inventory !== "object") {
      player.inventory = createInventorySnapshot();
    }

    inventory = player.inventory;
    Object.keys(defaults).forEach(function (itemId) {
      if (typeof inventory[itemId] !== "number" || Number.isNaN(inventory[itemId])) {
        inventory[itemId] = defaults[itemId];
      }
      inventory[itemId] = Math.max(0, Math.floor(inventory[itemId]));
    });

    return inventory;
  }

  function ensureEquippedTool(state) {
    if (!state || !state.player || typeof state.player !== "object") {
      return TOOL_ORDER[0];
    }

    ensureInventory(state);
    if (
      typeof state.player.equippedToolId !== "string" ||
      TOOL_ORDER.indexOf(state.player.equippedToolId) < 0
    ) {
      state.player.equippedToolId = TOOL_ORDER[0];
    }

    return state.player.equippedToolId;
  }

  function createInitialPlotState() {
    return {
      tilled: false,
      watered: false,
      cropId: "",
      growthStage: 0,
      plantedOnDay: 0,
      readyToHarvest: false
    };
  }

  function normalizePlotState(rawPlotState) {
    var plotState = createInitialPlotState();

    if (!rawPlotState || typeof rawPlotState !== "object") {
      return plotState;
    }

    plotState.tilled = Boolean(rawPlotState.tilled);
    plotState.watered = Boolean(rawPlotState.watered);
    plotState.cropId = typeof rawPlotState.cropId === "string" ? rawPlotState.cropId : "";
    plotState.growthStage = typeof rawPlotState.growthStage === "number" && !Number.isNaN(rawPlotState.growthStage)
      ? Math.max(0, Math.floor(rawPlotState.growthStage))
      : 0;
    plotState.plantedOnDay = typeof rawPlotState.plantedOnDay === "number" && !Number.isNaN(rawPlotState.plantedOnDay)
      ? Math.max(0, Math.floor(rawPlotState.plantedOnDay))
      : 0;
    plotState.readyToHarvest = Boolean(rawPlotState.readyToHarvest);

    if (!CROP_DEFINITIONS[plotState.cropId]) {
      plotState.cropId = "";
      plotState.growthStage = 0;
      plotState.readyToHarvest = false;
      plotState.watered = false;
      plotState.plantedOnDay = 0;
    }

    return plotState;
  }

  function ensureMapState(state, map) {
    var overworldState;
    var mapState;
    var farmPlots;

    if (!state || !state.world || typeof state.world !== "object" || !map || !map.id) {
      return null;
    }

    if (!state.world.overworld || typeof state.world.overworld !== "object") {
      state.world.overworld = {
        currentMapId: map.id,
        player: { x: 0, y: 0, facingX: 0, facingY: 1 },
        mapStates: {}
      };
    }

    overworldState = state.world.overworld;
    if (!overworldState.mapStates || typeof overworldState.mapStates !== "object") {
      overworldState.mapStates = {};
    }
    if (!overworldState.mapStates[map.id] || typeof overworldState.mapStates[map.id] !== "object") {
      overworldState.mapStates[map.id] = {};
    }

    mapState = overworldState.mapStates[map.id];
    if (!mapState.farmPlots || typeof mapState.farmPlots !== "object") {
      mapState.farmPlots = {};
    }

    farmPlots = getFarmPlots(map);
    farmPlots.forEach(function (plot) {
      if (!mapState.farmPlots[plot.id] || typeof mapState.farmPlots[plot.id] !== "object") {
        mapState.farmPlots[plot.id] = createInitialPlotState();
      } else {
        mapState.farmPlots[plot.id] = normalizePlotState(mapState.farmPlots[plot.id]);
      }
    });

    return mapState;
  }

  function getPlotState(state, map, plotId) {
    var mapState = ensureMapState(state, map);

    if (!mapState || !plotId) {
      return createInitialPlotState();
    }

    if (!mapState.farmPlots[plotId]) {
      mapState.farmPlots[plotId] = createInitialPlotState();
    } else {
      mapState.farmPlots[plotId] = normalizePlotState(mapState.farmPlots[plotId]);
    }

    return mapState.farmPlots[plotId];
  }

  function getCurrentDayNumber(state) {
    if (state && state.world && typeof state.world.day === "number" && !Number.isNaN(state.world.day)) {
      return Math.max(1, Math.floor(state.world.day));
    }

    return 1;
  }

  function getPlotCenter(plot) {
    return {
      x: plot.x + (plot.width / 2),
      y: plot.y + (plot.height / 2)
    };
  }

  function getNearestPlot(state, map, player, maxDistance) {
    var plots = getFarmPlots(map);
    var nearest = null;
    var nearestDistance = typeof maxDistance === "number" ? maxDistance : INTERACTION_DISTANCE;

    if (!player) {
      return null;
    }

    plots.forEach(function (plot) {
      var center = getPlotCenter(plot);
      var dx = center.x - player.x;
      var dy = center.y - player.y;
      var distance = Math.sqrt((dx * dx) + (dy * dy));
      var allowedDistance = Math.max(30, Math.min(nearestDistance, (plot.width / 2) + 28));

      if (distance <= allowedDistance && distance <= nearestDistance) {
        nearest = plot;
        nearestDistance = distance;
      }
    });

    return nearest;
  }

  function getEquippedToolId(state) {
    return ensureEquippedTool(state);
  }

  function getToolLabel(toolId) {
    return ITEM_LABELS[toolId] || "Hands";
  }

  function getToolIdForHotkey(code) {
    return TOOL_HOTKEYS[code] || "";
  }

  function equipTool(state, toolId) {
    if (TOOL_ORDER.indexOf(toolId) < 0) {
      return ensureEquippedTool(state);
    }

    ensureInventory(state);
    state.player.equippedToolId = toolId;
    return state.player.equippedToolId;
  }

  function cycleEquippedTool(state, direction) {
    var currentToolId = ensureEquippedTool(state);
    var currentIndex = TOOL_ORDER.indexOf(currentToolId);
    var delta = typeof direction === "number" && direction < 0 ? -1 : 1;
    var nextIndex = (currentIndex + delta + TOOL_ORDER.length) % TOOL_ORDER.length;

    state.player.equippedToolId = TOOL_ORDER[nextIndex];
    return state.player.equippedToolId;
  }

  function addInventoryItem(state, itemId, amount) {
    var inventory = ensureInventory(state);
    var delta = typeof amount === "number" && !Number.isNaN(amount)
      ? Math.floor(amount)
      : 0;

    if (!Object.prototype.hasOwnProperty.call(inventory, itemId)) {
      inventory[itemId] = 0;
    }
    inventory[itemId] = Math.max(0, Math.floor(inventory[itemId] + delta));
    return inventory[itemId];
  }

  function getInventoryCount(state, itemId) {
    var inventory = ensureInventory(state);

    if (!Object.prototype.hasOwnProperty.call(inventory, itemId)) {
      return 0;
    }

    return Math.max(0, Math.floor(inventory[itemId]));
  }

  function getInventorySummary(state) {
    return "Turnip Seeds " + getInventoryCount(state, "turnip_seeds") +
      " | Turnips " + getInventoryCount(state, "turnip");
  }

  function getPlotHint(state, plotState, plot) {
    var equippedToolId = getEquippedToolId(state);
    var crop = plotState.cropId ? CROP_DEFINITIONS[plotState.cropId] : null;

    if (plotState.readyToHarvest && crop) {
      return "Press E to harvest " + crop.label + ".";
    }
    if (!plotState.tilled) {
      return equippedToolId === "hoe"
        ? "Press E to till this garden plot."
        : "Equip the hoe (1) to till this plot.";
    }
    if (!plotState.cropId) {
      return equippedToolId === "turnip_seeds"
        ? "Press E to plant turnip seeds."
        : "Equip turnip seeds (3) to plant here.";
    }
    if (!plotState.watered) {
      return equippedToolId === "watering_can"
        ? "Press E to water this crop."
        : "Equip the watering can (2) to water this crop.";
    }

    return "This plot is watered for today. Sleep to grow it.";
  }

  function interactWithPlot(context, plot) {
    var state = context.state;
    var plotState = getPlotState(state, context.map, plot.id);
    var equippedToolId = getEquippedToolId(state);
    var currentDay = getCurrentDayNumber(state);
    var crop = plotState.cropId ? CROP_DEFINITIONS[plotState.cropId] : null;

    if (plotState.readyToHarvest && crop) {
      addInventoryItem(state, crop.produceItemId, 1);
      plotState.cropId = "";
      plotState.growthStage = 0;
      plotState.readyToHarvest = false;
      plotState.watered = false;
      plotState.plantedOnDay = 0;
      return {
        handled: true,
        success: true,
        actionId: "farm",
        minutesCost: ACTION_MINUTE_COSTS.harvest,
        message: "You harvest an " + crop.label + "."
      };
    }

    if (!plotState.tilled) {
      if (equippedToolId !== "hoe") {
        return {
          handled: true,
          success: false,
          message: "Equip the hoe (1) to till this plot."
        };
      }

      plotState.tilled = true;
      return {
        handled: true,
        success: true,
        actionId: "farm",
        minutesCost: ACTION_MINUTE_COSTS.till,
        message: "You till the soil."
      };
    }

    if (!plotState.cropId) {
      if (equippedToolId !== "turnip_seeds") {
        return {
          handled: true,
          success: false,
          message: "Equip turnip seeds (3) to plant here."
        };
      }
      if (getInventoryCount(state, "turnip_seeds") <= 0) {
        return {
          handled: true,
          success: false,
          message: "You are out of turnip seeds."
        };
      }

      addInventoryItem(state, "turnip_seeds", -1);
      plotState.cropId = "turnip";
      plotState.growthStage = 0;
      plotState.watered = false;
      plotState.plantedOnDay = currentDay;
      plotState.readyToHarvest = false;
      return {
        handled: true,
        success: true,
        actionId: "farm",
        minutesCost: ACTION_MINUTE_COSTS.plant,
        message: "You plant turnip seeds."
      };
    }

    if (!crop) {
      return {
        handled: true,
        success: false,
        message: "Nothing happened."
      };
    }

    if (!plotState.watered) {
      if (equippedToolId !== "watering_can") {
        return {
          handled: true,
          success: false,
          message: "Equip the watering can (2) to water this crop."
        };
      }

      plotState.watered = true;
      return {
        handled: true,
        success: true,
        actionId: "farm",
        minutesCost: ACTION_MINUTE_COSTS.water,
        message: "You water the " + crop.label + "."
      };
    }

    return {
      handled: true,
      success: false,
      message: "This crop is already watered for today."
    };
  }

  function advanceCropsForNewDay(state) {
    var mapStates;

    if (!state || !state.world || !state.world.overworld || !state.world.overworld.mapStates) {
      return 0;
    }

    mapStates = state.world.overworld.mapStates;
    return Object.keys(mapStates).reduce(function (grownCount, mapId) {
      var mapState = mapStates[mapId];
      var plotIds;

      if (!mapState || !mapState.farmPlots || typeof mapState.farmPlots !== "object") {
        return grownCount;
      }

      plotIds = Object.keys(mapState.farmPlots);
      plotIds.forEach(function (plotId) {
        var plotState = normalizePlotState(mapState.farmPlots[plotId]);
        var crop = plotState.cropId ? CROP_DEFINITIONS[plotState.cropId] : null;

        if (!crop) {
          mapState.farmPlots[plotId] = plotState;
          return;
        }

        if (plotState.watered && !plotState.readyToHarvest) {
          plotState.growthStage += 1;
          if (plotState.growthStage >= crop.daysToGrow) {
            plotState.growthStage = crop.daysToGrow;
            plotState.readyToHarvest = true;
          }
          grownCount += 1;
        }

        plotState.watered = false;
        mapState.farmPlots[plotId] = plotState;
      });

      return grownCount;
    }, 0);
  }

  function getRenderablePlots(state, map) {
    return getFarmPlots(map).map(function (plot) {
      var plotState = getPlotState(state, map, plot.id);
      return {
        id: plot.id,
        x: plot.x,
        y: plot.y,
        width: plot.width,
        height: plot.height,
        tilled: plotState.tilled,
        watered: plotState.watered,
        cropId: plotState.cropId,
        growthStage: plotState.growthStage,
        readyToHarvest: plotState.readyToHarvest
      };
    });
  }

  ns.worldFarming = {
    TOOL_ORDER: TOOL_ORDER,
    TOOL_HOTKEYS: TOOL_HOTKEYS,
    ACTION_MINUTE_COSTS: ACTION_MINUTE_COSTS,
    getFarmPlots: getFarmPlots,
    ensureMapState: ensureMapState,
    getPlotState: getPlotState,
    getNearestPlot: getNearestPlot,
    getEquippedToolId: getEquippedToolId,
    getToolLabel: getToolLabel,
    getToolIdForHotkey: getToolIdForHotkey,
    equipTool: equipTool,
    cycleEquippedTool: cycleEquippedTool,
    getInventoryCount: getInventoryCount,
    getInventorySummary: getInventorySummary,
    getPlotHint: getPlotHint,
    interactWithPlot: interactWithPlot,
    advanceCropsForNewDay: advanceCropsForNewDay,
    getRenderablePlots: getRenderablePlots
  };
})(window);
