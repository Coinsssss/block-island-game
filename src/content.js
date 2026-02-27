(function (global) {
  var ns = global.BlockIsland = global.BlockIsland || {};
  var existingContent = ns.content && typeof ns.content === "object" ? ns.content : {};

  var defaultJobs = {
    diamond_blue_surf_shop: {
      id: "diamond_blue_surf_shop",
      name: "DiamondBlue Surf Shop",
      basePay: 58,
      payPerLevel: 10,
      promotionGain: 12,
      tags: ["retail", "tourism", "entry"],
      careerLadder: {
        levelTitles: [
          "Rental Stocker",
          "Rental Associate",
          "Bike Specialist",
          "Keyholder",
          "Shop Manager"
        ]
      },
      perks: {}
    },
    the_oar_busser: {
      id: "the_oar_busser",
      name: "The Oar",
      basePay: 64,
      payPerLevel: 11,
      promotionGain: 11,
      tags: ["hospitality", "service", "entry"],
      careerLadder: {
        levelTitles: [
          "Busser",
          "Food Runner",
          "Server",
          "Lead Server",
          "Dining Supervisor"
        ]
      },
      perks: {}
    },
    halls_mowing_crew: {
      id: "halls_mowing_crew",
      name: "Hall's Mowing Crew",
      basePay: 72,
      payPerLevel: 12,
      promotionGain: 13,
      tags: ["outdoors", "labor", "entry"],
      careerLadder: {
        levelTitles: [
          "Grounds Helper",
          "Crew Member",
          "Equipment Operator",
          "Crew Lead",
          "Grounds Supervisor"
        ]
      },
      perks: {
        promotionSpeedBonus: 0.08
      }
    },
    island_landscaping_crew: {
      id: "island_landscaping_crew",
      name: "Island Landscaping",
      basePay: 130,
      payPerLevel: 16,
      promotionGain: 10,
      unlockRequires: {
        jobId: "halls_mowing_crew",
        level: 5
      },
      tags: ["outdoors", "labor", "advanced"],
      careerLadder: {
        levelTitles: [
          "Landscaping Apprentice",
          "Landscaping Technician",
          "Irrigation Specialist",
          "Site Lead",
          "Landscape Foreman"
        ]
      },
      perks: {
        workPayMult: 0.12
      }
    },
    captain_nicks_bartender: {
      id: "captain_nicks_bartender",
      name: "Captain Nick's",
      basePay: 90,
      payPerLevel: 13,
      promotionGain: 11,
      unlockRequires: {
        reputationTown: 12
      },
      tags: ["service", "bar", "tips"],
      careerLadder: {
        levelTitles: [
          "Host",
          "Barback",
          "Service Bartender",
          "Lead Bartender",
          "Bar Manager"
        ]
      },
      perks: {
        tipBonus: 0.15
      }
    },
    ferry_worker: {
      id: "ferry_worker",
      name: "Block Island Ferry",
      basePay: 120,
      payPerLevel: 15,
      promotionGain: 10,
      unlockRequires: {
        reputationTown: 18,
        locals: 15
      },
      tags: ["municipal", "steady"],
      careerLadder: {
        levelTitles: [
          "Dock Assistant",
          "Ticketing Agent",
          "Deckhand",
          "Operations Lead",
          "Shift Supervisor"
        ]
      },
      perks: {
        repGainBonus: 0.1
      }
    },
    charter_fishing_crew: {
      id: "charter_fishing_crew",
      name: "Payne's Dock Charters",
      basePay: 110,
      payPerLevel: 14,
      promotionGain: 10,
      unlockRequires: {
        reputationTown: 20,
        summerPeople: 20
      },
      tags: ["outdoors", "tips", "tourism"],
      careerLadder: {
        levelTitles: [
          "Deckhand Trainee",
          "Deckhand",
          "First Mate",
          "Charter Lead",
          "Crew Supervisor"
        ]
      },
      perks: {
        tipBonus: 0.1,
        workPayMult: 0.1
      }
    },
    dead_eye_dicks_server: {
      id: "dead_eye_dicks_server",
      name: "Dead Eye Dick's",
      basePay: 98,
      payPerLevel: 14,
      promotionGain: 11,
      unlockRequires: {
        reputationTown: 16,
        reputationBar: 12
      },
      tags: ["service", "bar", "tips"],
      careerLadder: {
        levelTitles: [
          "Host",
          "Runner",
          "Server",
          "Senior Server",
          "Floor Supervisor"
        ]
      },
      perks: {
        tipBonus: 0.12
      }
    },
    ballards_bartender: {
      id: "ballards_bartender",
      name: "Ballard's",
      basePay: 118,
      payPerLevel: 16,
      promotionGain: 10,
      unlockRequires: {
        reputationBar: 24,
        summerPeople: 18
      },
      tags: ["service", "bar", "tips", "tourism"],
      careerLadder: {
        levelTitles: [
          "Barback",
          "Bartender",
          "Senior Bartender",
          "Bar Lead",
          "Beverage Manager"
        ]
      },
      perks: {
        tipBonus: 0.18
      }
    },
    champlins_dockhand: {
      id: "champlins_dockhand",
      name: "Champlin's Marina",
      basePay: 112,
      payPerLevel: 15,
      promotionGain: 10,
      unlockRequires: {
        reputationTown: 20,
        locals: 18
      },
      tags: ["outdoors", "labor", "tourism"],
      careerLadder: {
        levelTitles: [
          "Dock Runner",
          "Dockhand",
          "Marina Technician",
          "Dock Lead",
          "Harbor Operations Lead"
        ]
      },
      perks: {
        workPayMult: 0.08
      }
    },
    bike_rental_staff: {
      id: "bike_rental_staff",
      name: "Aldo's Bike Rental",
      basePay: 88,
      payPerLevel: 12,
      promotionGain: 12,
      unlockRequires: {
        summerPeople: 16
      },
      tags: ["service", "tourism"],
      careerLadder: {
        levelTitles: [
          "Rental Assistant",
          "Bike Technician",
          "Rental Specialist",
          "Shift Lead",
          "Rental Manager"
        ]
      },
      perks: {}
    },
    hotel_front_desk: {
      id: "hotel_front_desk",
      name: "National Hotel",
      basePay: 102,
      payPerLevel: 14,
      promotionGain: 11,
      unlockRequires: {
        reputationTown: 15
      },
      tags: ["service", "steady", "tourism"],
      careerLadder: {
        levelTitles: [
          "Front Desk Associate",
          "Concierge",
          "Front Desk Supervisor",
          "Assistant Manager",
          "Hotel Manager"
        ]
      },
      perks: {
        repGainBonus: 0.2
      }
    },
    coffee_shop_barista: {
      id: "coffee_shop_barista",
      name: "Persephone's Kitchen",
      basePay: 84,
      payPerLevel: 12,
      promotionGain: 12,
      unlockRequires: {
        reputationTown: 10
      },
      tags: ["service", "steady"],
      careerLadder: {
        levelTitles: [
          "Cafe Helper",
          "Barista",
          "Lead Barista",
          "Shift Supervisor",
          "Cafe Manager"
        ]
      },
      perks: {
        repGainBonus: 0.08
      }
    },
    grocery_clerk: {
      id: "grocery_clerk",
      name: "Island Market",
      basePay: 78,
      payPerLevel: 11,
      promotionGain: 13,
      unlockRequires: {
        reputationTown: 8
      },
      tags: ["steady", "retail"],
      careerLadder: {
        levelTitles: [
          "Stock Clerk",
          "Store Associate",
          "Senior Clerk",
          "Keyholder",
          "Store Manager"
        ]
      },
      perks: {}
    },
    beach_cleanup_crew: {
      id: "beach_cleanup_crew",
      name: "Town Beach Cleanup Crew",
      basePay: 92,
      payPerLevel: 13,
      promotionGain: 11,
      unlockRequires: {
        locals: 14
      },
      tags: ["outdoors", "municipal", "steady"],
      careerLadder: {
        levelTitles: [
          "Cleanup Volunteer",
          "Cleanup Crew",
          "Equipment Lead",
          "Route Lead",
          "Operations Supervisor"
        ]
      },
      perks: {
        repGainBonus: 0.1
      }
    },
    town_maintenance_helper: {
      id: "town_maintenance_helper",
      name: "Town of New Shoreham Maintenance",
      basePay: 116,
      payPerLevel: 15,
      promotionGain: 10,
      unlockRequires: {
        reputationTown: 22,
        staff: 18
      },
      tags: ["municipal", "steady", "labor"],
      careerLadder: {
        levelTitles: [
          "Maintenance Assistant",
          "Facilities Crew",
          "Utility Specialist",
          "Lead Technician",
          "Maintenance Supervisor"
        ]
      },
      perks: {
        repGainBonus: 0.15
      }
    },
    water_taxi_hand: {
      id: "water_taxi_hand",
      name: "Block Island Water Taxi",
      basePay: 124,
      payPerLevel: 16,
      promotionGain: 10,
      unlockRequires: {
        reputationTown: 24,
        summerPeople: 24
      },
      tags: ["tourism", "tips", "outdoors"],
      careerLadder: {
        levelTitles: [
          "Dock Runner",
          "Water Taxi Deckhand",
          "Route Coordinator",
          "Lead Deckhand",
          "Shift Supervisor"
        ]
      },
      perks: {
        tipBonus: 0.1
      }
    }
  };

  var defaultHousing = {
    employee_housing: {
      id: "employee_housing",
      name: "Employee Housing",
      description: "Starter bunk provided by your employer.",
      vibe: "Simple and practical, close to other workers and basic amenities.",
      tier: 0,
      weeklyRent: 200,
      perks: {
        energyRecoveryBonus: 0,
        moodBonus: 0,
        socializeGainMult: 0,
        rentDiscount: 0,
        tipBonus: 0
      }
    },
    staff_bunkhouse: {
      id: "staff_bunkhouse",
      name: "Staff Bunkhouse",
      description: "Crowded seasonal housing near the service strip.",
      vibe: "Loud, social, and always active after shifts.",
      tier: 0,
      weeklyRent: 230,
      perks: {
        energyRecoveryBonus: 0,
        moodBonus: 0,
        socializeGainMult: 0.12,
        rentDiscount: 0,
        tipBonus: 0.03
      }
    },
    shared_house_room: {
      id: "shared_house_room",
      name: "Old Harbor Shared Room",
      description: "A compact room in a lively harbor-side shared house.",
      vibe: "You are near restaurants and the docks, with people always around.",
      tier: 1,
      weeklyRent: 500,
      unlockRequires: {
        money: 3000,
        reputation: 20
      },
      perks: {
        energyRecoveryBonus: 1,
        moodBonus: 0,
        socializeGainMult: 0.16,
        rentDiscount: 0,
        tipBonus: 0.04
      }
    },
    off_island_road_room: {
      id: "off_island_road_room",
      name: "Off-Island Road Room",
      description: "A quiet room farther from the busy harbor blocks.",
      vibe: "Quiet nights and fewer distractions, but less social momentum.",
      tier: 1,
      weeklyRent: 430,
      unlockRequires: {
        money: 3000,
        reputation: 20
      },
      perks: {
        energyRecoveryBonus: 4,
        moodBonus: 2,
        socializeGainMult: -0.08,
        rentDiscount: 0.04,
        tipBonus: 0
      }
    },
    above_the_shop_room: {
      id: "above_the_shop_room",
      name: "Above-the-Shop Room",
      description: "A compact upstairs room above a busy storefront.",
      vibe: "Small and busy, but you are right where work opportunities happen.",
      tier: 1,
      weeklyRent: 540,
      unlockRequires: {
        money: 3000,
        reputation: 20
      },
      perks: {
        energyRecoveryBonus: 2,
        moodBonus: 1,
        socializeGainMult: 0.05,
        rentDiscount: 0,
        tipBonus: 0.08
      }
    },
    quiet_apartment: {
      id: "quiet_apartment",
      name: "Quiet Apartment",
      description: "A calm one-bedroom away from late-night traffic.",
      vibe: "Comfortable, private, and perfect for recovering between shifts.",
      tier: 2,
      weeklyRent: 820,
      unlockRequires: {
        money: 5600,
        reputation: 35
      },
      perks: {
        energyRecoveryBonus: 8,
        moodBonus: 5,
        socializeGainMult: -0.1,
        rentDiscount: 0.03,
        tipBonus: 0
      }
    },
    town_walk_up: {
      id: "town_walk_up",
      name: "Town Walk-Up",
      description: "A second-floor apartment in the center of town.",
      vibe: "Everything is close, and nights out are easy to keep going.",
      tier: 2,
      weeklyRent: 790,
      unlockRequires: {
        money: 5600,
        reputation: 35
      },
      perks: {
        energyRecoveryBonus: 2,
        moodBonus: 1,
        socializeGainMult: 0.18,
        rentDiscount: 0,
        tipBonus: 0.02
      }
    },
    harborview_studio: {
      id: "harborview_studio",
      name: "Harborview Studio",
      description: "A small studio with a dock-facing view near tourist traffic.",
      vibe: "Busy and scenic, with better chances to meet paying visitors.",
      tier: 2,
      weeklyRent: 940,
      unlockRequires: {
        money: 5600,
        reputation: 35
      },
      perks: {
        energyRecoveryBonus: 1,
        moodBonus: 2,
        socializeGainMult: 0.07,
        rentDiscount: 0,
        tipBonus: 0.15
      }
    },
    small_cottage: {
      id: "small_cottage",
      name: "Small Cottage",
      description: "A detached cottage on a quieter side street.",
      vibe: "Peaceful, personal space with a true year-round island feel.",
      tier: 3,
      weeklyRent: 1210,
      unlockRequires: {
        money: 9000,
        reputation: 55
      },
      perks: {
        energyRecoveryBonus: 10,
        moodBonus: 6,
        socializeGainMult: -0.08,
        rentDiscount: 0.05,
        tipBonus: 0
      }
    },
    renovated_place: {
      id: "renovated_place",
      name: "Renovated Place",
      description: "A recently renovated rental with balanced comfort and location.",
      vibe: "Balanced quality of life with enough access to both work and town life.",
      tier: 3,
      weeklyRent: 1290,
      unlockRequires: {
        money: 9000,
        reputation: 55
      },
      perks: {
        energyRecoveryBonus: 6,
        moodBonus: 3,
        socializeGainMult: 0.08,
        rentDiscount: 0.06,
        tipBonus: 0.08
      }
    },
    year_round_rental: {
      id: "year_round_rental",
      name: "Year-Round Rental",
      description: "A stable long-term place in a local-heavy neighborhood.",
      vibe: "Steady and practical, with local goodwill that keeps bills manageable.",
      tier: 3,
      weeklyRent: 1180,
      unlockRequires: {
        money: 9000,
        reputation: 55
      },
      perks: {
        energyRecoveryBonus: 4,
        moodBonus: 2,
        socializeGainMult: -0.04,
        rentDiscount: 0.18,
        tipBonus: 0.02
      }
    }
  };

  ns.content = {
    jobs: existingContent.jobs && typeof existingContent.jobs === "object"
      ? existingContent.jobs
      : defaultJobs,
    housing: existingContent.housing && typeof existingContent.housing === "object"
      ? existingContent.housing
      : defaultHousing,
    meta: existingContent.meta && typeof existingContent.meta === "object"
      ? existingContent.meta
      : {
          defaultSeason: "spring"
        }
  };
})(window);
