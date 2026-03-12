(function (global) {
  var ns = global.BlockIsland = global.BlockIsland || {};

  var STARTER_MAP = {
    id: "starter_town_slice",
    name: "Old Harbor Starter Slice",
    width: 2200,
    height: 1400,
    spawnPoint: { x: 230, y: 1030 },
    sleepSpawnPoint: { x: 230, y: 1030 },
    water: [
      { x: 1380, y: 0, width: 820, height: 640 },
      { x: 1780, y: 620, width: 420, height: 420 }
    ],
    roads: [
      { x: 120, y: 1080, width: 1700, height: 80 },
      { x: 760, y: 580, width: 90, height: 520 },
      { x: 760, y: 520, width: 910, height: 90 },
      { x: 1500, y: 560, width: 90, height: 620 }
    ],
    buildings: [
      {
        id: "player_home",
        name: "Employee Housing",
        x: 120,
        y: 900,
        width: 320,
        height: 220,
        color: "#c7ad8f",
        roofColor: "#815f3f"
      },
      {
        id: "work_yard",
        name: "Harbor Work Yard",
        x: 1080,
        y: 250,
        width: 420,
        height: 260,
        color: "#9caec0",
        roofColor: "#5b7289"
      },
      {
        id: "food_spot",
        name: "Island Market Cafe",
        x: 700,
        y: 820,
        width: 360,
        height: 240,
        color: "#b8caa8",
        roofColor: "#6f845d"
      },
      {
        id: "social_hub",
        name: "Dock Square Hall",
        x: 1420,
        y: 620,
        width: 360,
        height: 240,
        color: "#d0b6c2",
        roofColor: "#8d5d77"
      }
    ],
    decorativeTrees: [
      { x: 560, y: 980, radius: 34 },
      { x: 950, y: 1220, radius: 32 },
      { x: 1260, y: 1040, radius: 30 },
      { x: 1640, y: 1030, radius: 28 },
      { x: 420, y: 560, radius: 32 },
      { x: 610, y: 430, radius: 30 }
    ],
    colliders: [
      { x: 1080, y: 250, width: 420, height: 260 },
      { x: 700, y: 820, width: 360, height: 240 },
      { x: 1420, y: 620, width: 360, height: 240 },
      { x: 1380, y: 0, width: 820, height: 640 },
      { x: 1780, y: 620, width: 420, height: 420 },
      { x: 20, y: 0, width: 60, height: 1400 },
      { x: 0, y: 0, width: 2200, height: 40 },
      { x: 2140, y: 0, width: 60, height: 1400 },
      { x: 0, y: 1360, width: 2200, height: 40 }
    ],
    interactables: [
      {
        id: "home_rest",
        type: "rest",
        label: "Front Porch",
        x: 300,
        y: 1050,
        radius: 42,
        prompt: "Press E to rest at home."
      },
      {
        id: "home_sleep",
        type: "sleep",
        label: "Bed",
        x: 220,
        y: 980,
        radius: 42,
        prompt: "Press E at your bed to sleep."
      },
      {
        id: "work_counter",
        type: "work",
        label: "Work Check-in",
        x: 1260,
        y: 550,
        radius: 42,
        prompt: "Press E to check in for work."
      },
      {
        id: "food_counter",
        type: "eat",
        label: "Food Counter",
        x: 880,
        y: 1110,
        radius: 42,
        prompt: "Press E to buy a meal."
      },
      {
        id: "social_square",
        type: "socialize",
        label: "Dock Square",
        x: 1610,
        y: 900,
        radius: 44,
        prompt: "Press E to hang out in Dock Square."
      }
    ],
    locations: [
      {
        id: "housing",
        name: "Employee Housing",
        x: 80,
        y: 840,
        width: 460,
        height: 360
      },
      {
        id: "market_row",
        name: "Market Row",
        x: 620,
        y: 760,
        width: 560,
        height: 460
      },
      {
        id: "work_yard",
        name: "Harbor Work Yard",
        x: 980,
        y: 180,
        width: 650,
        height: 460
      },
      {
        id: "dock_square",
        name: "Dock Square",
        x: 1330,
        y: 540,
        width: 520,
        height: 500
      }
    ]
  };

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function createStarterMap() {
    return deepClone(STARTER_MAP);
  }

  function getCollisionRects(map) {
    if (!map || !Array.isArray(map.colliders)) {
      return [];
    }

    return map.colliders;
  }

  function getInteractables(map) {
    if (!map || !Array.isArray(map.interactables)) {
      return [];
    }

    return map.interactables;
  }

  function isPointInsideRect(x, y, rect) {
    return (
      x >= rect.x &&
      x <= rect.x + rect.width &&
      y >= rect.y &&
      y <= rect.y + rect.height
    );
  }

  function getLocationNameAtPosition(map, x, y) {
    var i;
    var locations = map && Array.isArray(map.locations) ? map.locations : [];

    for (i = 0; i < locations.length; i += 1) {
      if (isPointInsideRect(x, y, locations[i])) {
        return locations[i].name;
      }
    }

    return "Island Road";
  }

  function clampToBounds(map, x, y, radius) {
    var safeRadius = typeof radius === "number" ? Math.max(0, radius) : 0;
    var maxX = (map && typeof map.width === "number" ? map.width : 0) - safeRadius;
    var maxY = (map && typeof map.height === "number" ? map.height : 0) - safeRadius;

    return {
      x: Math.max(safeRadius, Math.min(maxX, x)),
      y: Math.max(safeRadius, Math.min(maxY, y))
    };
  }

  ns.worldMap = {
    createStarterMap: createStarterMap,
    getCollisionRects: getCollisionRects,
    getInteractables: getInteractables,
    getLocationNameAtPosition: getLocationNameAtPosition,
    clampToBounds: clampToBounds
  };
})(window);
