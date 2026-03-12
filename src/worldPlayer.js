(function (global) {
  var ns = global.BlockIsland = global.BlockIsland || {};
  var worldMap = ns.worldMap;

  var PLAYER_RADIUS = 16;
  var PLAYER_SPEED = 170;

  function createPlayer(spawnPoint) {
    var start = spawnPoint && typeof spawnPoint === "object" ? spawnPoint : { x: 200, y: 200 };

    return {
      x: Number(start.x) || 200,
      y: Number(start.y) || 200,
      radius: PLAYER_RADIUS,
      speed: PLAYER_SPEED,
      facingX: 0,
      facingY: 1
    };
  }

  function createInputState() {
    return {
      up: false,
      down: false,
      left: false,
      right: false,
      interactPressed: false
    };
  }

  function getPlayerRect(player, x, y) {
    return {
      x: x - player.radius,
      y: y - player.radius,
      width: player.radius * 2,
      height: player.radius * 2
    };
  }

  function rectsOverlap(a, b) {
    return !(
      a.x + a.width <= b.x ||
      a.x >= b.x + b.width ||
      a.y + a.height <= b.y ||
      a.y >= b.y + b.height
    );
  }

  function hasCollision(map, player, x, y) {
    var i;
    var colliders = worldMap && typeof worldMap.getCollisionRects === "function"
      ? worldMap.getCollisionRects(map)
      : [];
    var rect = getPlayerRect(player, x, y);

    for (i = 0; i < colliders.length; i += 1) {
      if (rectsOverlap(rect, colliders[i])) {
        return true;
      }
    }

    return false;
  }

  function updatePlayer(player, input, map, deltaSeconds) {
    var moveX = 0;
    var moveY = 0;
    var length;
    var speed;
    var nextX;
    var nextY;
    var moved = false;
    var clamped;

    if (!player || !input || !map) {
      return { moved: false };
    }

    if (input.up) moveY -= 1;
    if (input.down) moveY += 1;
    if (input.left) moveX -= 1;
    if (input.right) moveX += 1;

    length = Math.sqrt((moveX * moveX) + (moveY * moveY));
    if (length > 0) {
      moveX /= length;
      moveY /= length;
    }

    speed = player.speed * (typeof deltaSeconds === "number" ? Math.max(0, deltaSeconds) : 0);
    nextX = player.x + (moveX * speed);
    nextY = player.y + (moveY * speed);

    clamped = worldMap && typeof worldMap.clampToBounds === "function"
      ? worldMap.clampToBounds(map, nextX, player.y, player.radius)
      : { x: nextX, y: player.y };
    if (!hasCollision(map, player, clamped.x, player.y)) {
      moved = moved || clamped.x !== player.x;
      player.x = clamped.x;
    }

    clamped = worldMap && typeof worldMap.clampToBounds === "function"
      ? worldMap.clampToBounds(map, player.x, nextY, player.radius)
      : { x: player.x, y: nextY };
    if (!hasCollision(map, player, player.x, clamped.y)) {
      moved = moved || clamped.y !== player.y;
      player.y = clamped.y;
    }

    if (length > 0) {
      player.facingX = moveX;
      player.facingY = moveY;
    }

    return {
      moved: moved,
      moveX: moveX,
      moveY: moveY
    };
  }

  function resetPlayerPosition(player, spawnPoint) {
    if (!player || !spawnPoint) return;

    player.x = Number(spawnPoint.x) || player.x;
    player.y = Number(spawnPoint.y) || player.y;
    player.facingX = 0;
    player.facingY = 1;
  }

  ns.worldPlayer = {
    PLAYER_RADIUS: PLAYER_RADIUS,
    PLAYER_SPEED: PLAYER_SPEED,
    createPlayer: createPlayer,
    createInputState: createInputState,
    updatePlayer: updatePlayer,
    resetPlayerPosition: resetPlayerPosition
  };
})(window);
