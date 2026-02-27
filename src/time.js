(function (global) {
  var ns = global.BlockIsland = global.BlockIsland || {};

  var WEEKDAYS = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday"
  ];

  var SEASONS = ["Spring", "Summer", "Fall", "Winter"];
  var SEASON_IDS = ["spring", "summer", "fall", "winter"];
  var DAYS_PER_WEEK = 7;
  var DAYS_PER_SEASON = 21;
  var MAX_ACTION_SLOTS = 3;

  function createInitialTimeState() {
    return {
      day: 1,
      weekdayIndex: 0,
      week: 1,
      seasonIndex: 0,
      year: 1,
      actionSlotsRemaining: MAX_ACTION_SLOTS
    };
  }

  function consumeActionSlot(timeState) {
    if (!timeState || timeState.actionSlotsRemaining <= 0) return false;
    timeState.actionSlotsRemaining -= 1;
    return true;
  }

  function advanceDay(timeState) {
    timeState.day += 1;
    timeState.weekdayIndex = (timeState.weekdayIndex + 1) % DAYS_PER_WEEK;

    if (timeState.weekdayIndex === 0) {
      timeState.week += 1;
    }

    if (timeState.day > DAYS_PER_SEASON) {
      timeState.day = 1;
      timeState.week = 1;
      timeState.seasonIndex += 1;

      if (timeState.seasonIndex >= SEASONS.length) {
        timeState.seasonIndex = 0;
        timeState.year += 1;
      }
    }

    timeState.actionSlotsRemaining = MAX_ACTION_SLOTS;
  }

  function getWeekdayName(index) {
    return WEEKDAYS[index] || WEEKDAYS[0];
  }

  function getSeasonName(index) {
    return SEASONS[index] || SEASONS[0];
  }

  function getSeasonId(index) {
    return SEASON_IDS[index] || SEASON_IDS[0];
  }

  function getSeasonIdFromState(state) {
    if (
      state &&
      state.world &&
      typeof state.world.season === "string" &&
      SEASON_IDS.indexOf(state.world.season.toLowerCase()) >= 0
    ) {
      return state.world.season.toLowerCase();
    }

    if (state && state.time && typeof state.time.seasonIndex === "number") {
      return getSeasonId(state.time.seasonIndex);
    }

    return SEASON_IDS[0];
  }

  function isBusySeason(state) {
    return getSeasonIdFromState(state) === "summer";
  }

  ns.time = {
    WEEKDAYS: WEEKDAYS,
    SEASONS: SEASONS,
    SEASON_IDS: SEASON_IDS,
    DAYS_PER_WEEK: DAYS_PER_WEEK,
    DAYS_PER_SEASON: DAYS_PER_SEASON,
    MAX_ACTION_SLOTS: MAX_ACTION_SLOTS,
    createInitialTimeState: createInitialTimeState,
    consumeActionSlot: consumeActionSlot,
    advanceDay: advanceDay,
    getWeekdayName: getWeekdayName,
    getSeasonName: getSeasonName,
    getSeasonId: getSeasonId,
    getSeasonIdFromState: getSeasonIdFromState,
    isBusySeason: isBusySeason
  };
})(window);
