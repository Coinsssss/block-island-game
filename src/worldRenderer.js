(function (global) {
  var ns = global.BlockIsland = global.BlockIsland || {};
  var worldMap = ns.worldMap;
  var worldFarming = ns.worldFarming;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function getCamera(map, player, canvas) {
    var halfWidth = canvas.width / 2;
    var halfHeight = canvas.height / 2;
    var maxX = Math.max(0, map.width - canvas.width);
    var maxY = Math.max(0, map.height - canvas.height);

    return {
      x: clamp(player.x - halfWidth, 0, maxX),
      y: clamp(player.y - halfHeight, 0, maxY)
    };
  }

  function toScreenX(worldX, camera) {
    return worldX - camera.x;
  }

  function toScreenY(worldY, camera) {
    return worldY - camera.y;
  }

  function drawBackground(ctx, canvas) {
    ctx.fillStyle = "#8db47c";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function drawWater(ctx, map, camera) {
    if (!Array.isArray(map.water)) return;

    map.water.forEach(function (rect) {
      ctx.fillStyle = "#77b7d9";
      ctx.fillRect(
        toScreenX(rect.x, camera),
        toScreenY(rect.y, camera),
        rect.width,
        rect.height
      );
    });
  }

  function drawRoads(ctx, map, camera) {
    if (!Array.isArray(map.roads)) return;

    map.roads.forEach(function (road) {
      ctx.fillStyle = "#c1b28c";
      ctx.fillRect(
        toScreenX(road.x, camera),
        toScreenY(road.y, camera),
        road.width,
        road.height
      );
    });
  }

  function drawTrees(ctx, map, camera) {
    if (!Array.isArray(map.decorativeTrees)) return;

    map.decorativeTrees.forEach(function (tree) {
      ctx.beginPath();
      ctx.fillStyle = "#4a7644";
      ctx.arc(
        toScreenX(tree.x, camera),
        toScreenY(tree.y, camera),
        tree.radius,
        0,
        Math.PI * 2
      );
      ctx.fill();

      ctx.beginPath();
      ctx.fillStyle = "#2e4c2f";
      ctx.arc(
        toScreenX(tree.x, camera),
        toScreenY(tree.y, camera),
        Math.max(5, tree.radius - 10),
        0,
        Math.PI * 2
      );
      ctx.fill();
    });
  }

  function drawFarmPlots(ctx, farmPlots, camera, highlightedPlotId) {
    if (!Array.isArray(farmPlots) || farmPlots.length <= 0) return;

    farmPlots.forEach(function (plot) {
      var x = toScreenX(plot.x, camera);
      var y = toScreenY(plot.y, camera);
      var isHighlighted = highlightedPlotId && highlightedPlotId === plot.id;

      ctx.fillStyle = plot.tilled ? "#8d6544" : "rgba(74, 118, 68, 0.28)";
      ctx.fillRect(x, y, plot.width, plot.height);

      ctx.strokeStyle = isHighlighted ? "#f7a800" : "rgba(18, 32, 47, 0.38)";
      ctx.lineWidth = isHighlighted ? 3 : 2;
      ctx.strokeRect(x, y, plot.width, plot.height);

      if (plot.watered) {
        ctx.fillStyle = "rgba(88, 153, 214, 0.28)";
        ctx.fillRect(x + 4, y + 4, plot.width - 8, plot.height - 8);
      }

      if (!plot.cropId) {
        return;
      }

      if (plot.readyToHarvest) {
        ctx.fillStyle = "#d68b2f";
        ctx.beginPath();
        ctx.arc(x + (plot.width / 2), y + (plot.height / 2), 12, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#4f7f38";
        ctx.fillRect(x + (plot.width / 2) - 3, y + 8, 6, 16);
        return;
      }

      ctx.fillStyle = plot.growthStage >= 1 ? "#4f8a3f" : "#78a95e";
      ctx.beginPath();
      ctx.arc(x + (plot.width / 2), y + (plot.height / 2), 7 + (plot.growthStage * 3), 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawBuildings(ctx, map, camera) {
    if (!Array.isArray(map.buildings)) return;

    map.buildings.forEach(function (building) {
      var x = toScreenX(building.x, camera);
      var y = toScreenY(building.y, camera);

      ctx.fillStyle = building.color || "#b8b8b8";
      ctx.fillRect(x, y, building.width, building.height);

      ctx.fillStyle = building.roofColor || "#666";
      ctx.fillRect(x + 8, y + 8, building.width - 16, 24);

      ctx.strokeStyle = "rgba(18, 32, 47, 0.28)";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, building.width, building.height);

      ctx.fillStyle = "#10222f";
      ctx.font = "bold 13px Arial, sans-serif";
      ctx.fillText(building.name, x + 10, y + 56);
    });
  }

  function drawInteractables(ctx, map, camera, highlightedInteractableId) {
    var interactables = worldMap && typeof worldMap.getInteractables === "function"
      ? worldMap.getInteractables(map)
      : [];

    interactables.forEach(function (interactable) {
      var x = toScreenX(interactable.x, camera);
      var y = toScreenY(interactable.y, camera);
      var isHighlighted = highlightedInteractableId && highlightedInteractableId === interactable.id;

      ctx.beginPath();
      ctx.fillStyle = isHighlighted ? "rgba(255, 232, 153, 0.52)" : "rgba(255, 255, 255, 0.35)";
      ctx.arc(x, y, interactable.radius || 40, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.strokeStyle = isHighlighted ? "#f7a800" : "rgba(18, 32, 47, 0.45)";
      ctx.lineWidth = isHighlighted ? 3 : 2;
      ctx.arc(x, y, Math.max(14, (interactable.radius || 40) - 10), 0, Math.PI * 2);
      ctx.stroke();
    });
  }

  function drawNpcs(ctx, npcs, camera, highlightedNpcId) {
    if (!Array.isArray(npcs)) return;

    npcs.forEach(function (npc) {
      var x = toScreenX(npc.x, camera);
      var y = toScreenY(npc.y, camera);
      var isHighlighted = highlightedNpcId && highlightedNpcId === npc.id;

      ctx.beginPath();
      ctx.fillStyle = npc.color || "#5b7289";
      ctx.arc(x, y, 14, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = isHighlighted ? "#f9e270" : "rgba(18, 32, 47, 0.55)";
      ctx.lineWidth = isHighlighted ? 3 : 2;
      ctx.stroke();

      ctx.fillStyle = "#10222f";
      ctx.font = "bold 12px Arial, sans-serif";
      ctx.fillText(npc.name, x - 18, y - 18);
    });
  }

  function drawPlayer(ctx, player, camera) {
    var x = toScreenX(player.x, camera);
    var y = toScreenY(player.y, camera);

    ctx.beginPath();
    ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
    ctx.arc(x, y + 5, player.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.fillStyle = "#1f5b3f";
    ctx.arc(x, y, player.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#0f2f20";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function drawAreaLabel(ctx, canvas, areaLabel) {
    if (!areaLabel) return;

    ctx.fillStyle = "rgba(18, 32, 47, 0.7)";
    ctx.fillRect(14, 14, 220, 30);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 13px Arial, sans-serif";
    ctx.fillText(areaLabel, 24, 34);
  }

  function renderFrame(canvas, context2d, map, player, npcs, options) {
    var camera;
    var highlightedNpcId = options && options.highlightedNpcId ? options.highlightedNpcId : "";
    var highlightedPlotId = options && options.highlightedPlotId ? options.highlightedPlotId : "";
    var highlightedInteractableId = options && options.highlightedInteractableId
      ? options.highlightedInteractableId
      : "";
    var areaLabel = options && options.areaLabel ? options.areaLabel : "";
    var farmPlots = options && Array.isArray(options.farmPlots)
      ? options.farmPlots
      : (worldFarming && typeof worldFarming.getRenderablePlots === "function"
        ? worldFarming.getRenderablePlots(options.state, map)
        : []);

    if (!canvas || !context2d || !map || !player) {
      return;
    }

    camera = getCamera(map, player, canvas);
    drawBackground(context2d, canvas);
    drawWater(context2d, map, camera);
    drawRoads(context2d, map, camera);
    drawFarmPlots(context2d, farmPlots, camera, highlightedPlotId);
    drawTrees(context2d, map, camera);
    drawBuildings(context2d, map, camera);
    drawInteractables(context2d, map, camera, highlightedInteractableId);
    drawNpcs(context2d, npcs, camera, highlightedNpcId);
    drawPlayer(context2d, player, camera);
    drawAreaLabel(context2d, canvas, areaLabel);
  }

  ns.worldRenderer = {
    renderFrame: renderFrame
  };
})(window);
