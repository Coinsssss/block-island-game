(function (global) {
  var ns = global.BlockIsland = global.BlockIsland || {};
  var worldTime = ns.worldTime;

  var NPC_DEFINITIONS = [
    {
      id: "mara_locals",
      name: "Mara",
      socialGroup: "locals",
      color: "#2e5a7f",
      schedule: {
        morning: { x: 900, y: 1120, areaLabel: "Market Row" },
        afternoon: { x: 1560, y: 900, areaLabel: "Dock Square" },
        evening: { x: 1635, y: 940, areaLabel: "Dock Square" },
        night: { x: 340, y: 980, areaLabel: "Employee Housing" }
      },
      dialogue: {
        morning: [
          "Morning starts slow, but it always picks up by ferry time.",
          "Locals always notice who shows up early."
        ],
        afternoon: [
          "Dock Square is where people hear about openings first.",
          "Town's easier once people know your name."
        ],
        evening: [
          "Good evening crowd tonight. Could be worth socializing.",
          "Keep showing up and the island starts to open up."
        ],
        night: [
          "Getting late. Don't forget to head home when you're done."
        ]
      }
    },
    {
      id: "owen_staff",
      name: "Owen",
      socialGroup: "staff",
      color: "#7a5d2c",
      schedule: {
        morning: { x: 1260, y: 560, areaLabel: "Harbor Work Yard" },
        afternoon: { x: 1200, y: 600, areaLabel: "Harbor Work Yard" },
        evening: { x: 1585, y: 905, areaLabel: "Dock Square" },
        night: { x: 250, y: 1040, areaLabel: "Employee Housing" }
      },
      dialogue: {
        morning: [
          "If you are on time, managers remember it.",
          "Work check-in's open now if you want a shift."
        ],
        afternoon: [
          "Afternoon is still fair game for a solid shift.",
          "Stay reliable and referrals come naturally."
        ],
        evening: [
          "Shift's done for me. Dock Square's where everyone unwinds.",
          "You can still build rep out here after work."
        ],
        night: [
          "Long day. Make sure you recover before tomorrow."
        ]
      }
    },
    {
      id: "lena_summer",
      name: "Lena",
      socialGroup: "summerPeople",
      color: "#7c3e54",
      schedule: {
        morning: { x: 840, y: 1140, areaLabel: "Market Row" },
        afternoon: { x: 1680, y: 820, areaLabel: "Dock Square" },
        evening: { x: 1720, y: 900, areaLabel: "Dock Square" },
        night: { x: 1480, y: 1110, areaLabel: "Harbor Walk" }
      },
      dialogue: {
        morning: [
          "I came over on the first ferry and already need coffee.",
          "This island has the best mornings by the water."
        ],
        afternoon: [
          "Crowds are good today. Lots of people spending.",
          "Busy afternoons usually mean better tip chances."
        ],
        evening: [
          "Evenings here are why visitors keep coming back.",
          "Good vibes tonight. Networking could pay off."
        ],
        night: [
          "It's beautiful out, but everything's winding down."
        ]
      }
    }
  ];

  function random() {
    if (ns.rng && typeof ns.rng.next === "function") {
      return ns.rng.next();
    }

    return Math.random();
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function createNpcRuntime() {
    return NPC_DEFINITIONS.map(function (definition) {
      var runtime = deepClone(definition);
      runtime.x = definition.schedule.morning.x;
      runtime.y = definition.schedule.morning.y;
      runtime.areaLabel = definition.schedule.morning.areaLabel || "";
      return runtime;
    });
  }

  function getSegmentForMinute(minuteOfDay) {
    if (worldTime && typeof worldTime.getTimeSegmentId === "function") {
      return worldTime.getTimeSegmentId(minuteOfDay);
    }

    return "morning";
  }

  function updateNpcPositions(npcs, minuteOfDay) {
    var segment = getSegmentForMinute(minuteOfDay);

    if (!Array.isArray(npcs)) {
      return;
    }

    npcs.forEach(function (npc) {
      var slot = npc && npc.schedule ? npc.schedule[segment] : null;

      if (!npc || !slot) {
        return;
      }

      npc.x = slot.x;
      npc.y = slot.y;
      npc.areaLabel = slot.areaLabel || "";
    });
  }

  function getNearestNpc(npcs, player, maxDistance) {
    var i;
    var nearest = null;
    var nearestDistance = typeof maxDistance === "number" ? maxDistance : 70;

    if (!Array.isArray(npcs) || !player) {
      return null;
    }

    for (i = 0; i < npcs.length; i += 1) {
      var npc = npcs[i];
      var dx;
      var dy;
      var distance;

      if (!npc) continue;

      dx = npc.x - player.x;
      dy = npc.y - player.y;
      distance = Math.sqrt((dx * dx) + (dy * dy));
      if (distance <= nearestDistance) {
        nearest = npc;
        nearestDistance = distance;
      }
    }

    return nearest;
  }

  function getNpcDialogueLine(npc, minuteOfDay) {
    var segment = getSegmentForMinute(minuteOfDay);
    var lines = npc && npc.dialogue && Array.isArray(npc.dialogue[segment])
      ? npc.dialogue[segment]
      : [];
    var index;

    if (lines.length <= 0) {
      return "Nice seeing you around town.";
    }

    index = Math.floor(random() * lines.length);
    return lines[index] || lines[0];
  }

  ns.worldNpcs = {
    NPC_DEFINITIONS: NPC_DEFINITIONS,
    createNpcRuntime: createNpcRuntime,
    updateNpcPositions: updateNpcPositions,
    getNearestNpc: getNearestNpc,
    getNpcDialogueLine: getNpcDialogueLine
  };
})(window);
