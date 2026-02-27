(function (global) {
  var ns = global.BlockIsland = global.BlockIsland || {};

  var LOCALS_DISCOUNT_THRESHOLDS = {
    tier1: {
      min: 60,
      discountPercent: 10
    },
    tier2: {
      min: 85,
      discountPercent: 20
    }
  };

  var STAFF_REFERRAL_THRESHOLDS = {
    tier1: {
      min: 60,
      bonus: 10
    },
    tier2: {
      min: 85,
      bonus: 20
    }
  };

  var TOURIST_TIP_THRESHOLDS = {
    tier1: {
      min: 50,
      chance: 0.18,
      minAmount: 10,
      maxAmount: 40
    },
    tier2: {
      min: 80,
      chance: 0.32,
      minAmount: 15,
      maxAmount: 50
    }
  };

  function getRelationshipValue(state, key) {
    var relationships;
    var value;
    var canonicalKey = key === "tourists" ? "summerPeople" : key;

    if (!state) return 0;

    relationships = state.relationships;
    if (!relationships || typeof relationships !== "object") {
      relationships = state.player && state.player.social ? state.player.social : null;
    }
    if (!relationships) return 0;

    value = relationships[canonicalKey];
    if (
      typeof value !== "number" &&
      canonicalKey === "summerPeople" &&
      typeof relationships.tourists === "number"
    ) {
      value = relationships.tourists;
    }

    if (typeof value !== "number" || Number.isNaN(value)) return 0;
    return Math.max(0, Math.min(100, Math.floor(value)));
  }

  function getLocalsDiscountPercent(state) {
    var locals = getRelationshipValue(state, "locals");

    if (locals >= LOCALS_DISCOUNT_THRESHOLDS.tier2.min) {
      return LOCALS_DISCOUNT_THRESHOLDS.tier2.discountPercent;
    }
    if (locals >= LOCALS_DISCOUNT_THRESHOLDS.tier1.min) {
      return LOCALS_DISCOUNT_THRESHOLDS.tier1.discountPercent;
    }

    return 0;
  }

  function getStaffReferralBonus(state) {
    var staff = getRelationshipValue(state, "staff");

    if (staff >= STAFF_REFERRAL_THRESHOLDS.tier2.min) {
      return STAFF_REFERRAL_THRESHOLDS.tier2.bonus;
    }
    if (staff >= STAFF_REFERRAL_THRESHOLDS.tier1.min) {
      return STAFF_REFERRAL_THRESHOLDS.tier1.bonus;
    }

    return 0;
  }

  function getTouristTipConfig(state) {
    var summerPeople = getRelationshipValue(state, "summerPeople");

    if (summerPeople >= TOURIST_TIP_THRESHOLDS.tier2.min) {
      return {
        enabled: true,
        chance: TOURIST_TIP_THRESHOLDS.tier2.chance,
        minAmount: TOURIST_TIP_THRESHOLDS.tier2.minAmount,
        maxAmount: TOURIST_TIP_THRESHOLDS.tier2.maxAmount
      };
    }

    if (summerPeople >= TOURIST_TIP_THRESHOLDS.tier1.min) {
      return {
        enabled: true,
        chance: TOURIST_TIP_THRESHOLDS.tier1.chance,
        minAmount: TOURIST_TIP_THRESHOLDS.tier1.minAmount,
        maxAmount: TOURIST_TIP_THRESHOLDS.tier1.maxAmount
      };
    }

    return {
      enabled: false,
      chance: 0,
      minAmount: 0,
      maxAmount: 0
    };
  }

  ns.socialUnlocks = {
    LOCALS_DISCOUNT_THRESHOLDS: LOCALS_DISCOUNT_THRESHOLDS,
    STAFF_REFERRAL_THRESHOLDS: STAFF_REFERRAL_THRESHOLDS,
    TOURIST_TIP_THRESHOLDS: TOURIST_TIP_THRESHOLDS,
    getLocalsDiscountPercent: getLocalsDiscountPercent,
    getStaffReferralBonus: getStaffReferralBonus,
    getTouristTipConfig: getTouristTipConfig
  };
})(window);
