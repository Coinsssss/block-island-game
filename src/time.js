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
  var MINUTE_PER_DAY = 24 * 60;
  var DAY_START_MINUTE = 8 * 60;
  var DAY_END_MINUTE = 20 * 60;
  var DAY_ACTIVE_MINUTES = DAY_END_MINUTE - DAY_START_MINUTE;
  var DAY_DURATION_REAL_MS = 10 * 60 * 1000;
  var DEFAULT_DAY_START_MINUTE = DAY_START_MINUTE;
  var MIN_MINUTE_OF_DAY = DAY_START_MINUTE;
  var MAX_MINUTE_OF_DAY = DAY_END_MINUTE;

  function createInitialTimeState() {
    return {
      day: 1,
      weekdayIndex: 0,
      week: 1,
      seasonIndex: 0,
      year: 1,
      actionSlotsRemaining: MAX_ACTION_SLOTS,
      minuteOfDay: DEFAULT_DAY_START_MINUTE
    };
  }

  function clampMinuteOfDay(value) {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return DEFAULT_DAY_START_MINUTE;
    }

    return Math.max(MIN_MINUTE_OF_DAY, Math.min(MAX_MINUTE_OF_DAY, Math.floor(value)));
  }

  function getMinuteOfDay(timeState) {
    if (!timeState || typeof timeState.minuteOfDay !== "number") {
      return DEFAULT_DAY_START_MINUTE;
    }

    return clampMinuteOfDay(timeState.minuteOfDay);
  }

  function setMinuteOfDay(timeState, minuteOfDay) {
    if (!timeState || typeof timeState !== "object") {
      return DEFAULT_DAY_START_MINUTE;
    }

    timeState.minuteOfDay = clampMinuteOfDay(minuteOfDay);
    return timeState.minuteOfDay;
  }

  function advanceMinutes(timeState, minutes) {
    var delta = typeof minutes === "number" && !Number.isNaN(minutes)
      ? Math.floor(minutes)
      : 0;
    var nextMinute = getMinuteOfDay(timeState) + delta;

    return setMinuteOfDay(timeState, nextMinute);
  }

  function consumeActionSlot(timeState) {
    // Legacy compatibility shim: action points are no longer the core loop.
    if (!timeState) return false;
    timeState.actionSlotsRemaining = MAX_ACTION_SLOTS;
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
    timeState.minuteOfDay = DEFAULT_DAY_START_MINUTE;
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

  function getTimeSegmentId(timeState) {
    var minute = getMinuteOfDay(timeState);

    if (minute >= 20 * 60 || minute < 8 * 60) {
      return "night";
    }
    if (minute >= 17 * 60) {
      return "evening";
    }
    if (minute >= 12 * 60) {
      return "afternoon";
    }

    return "morning";
  }

  function formatClock(minuteOfDay) {
    var minute = clampMinuteOfDay(minuteOfDay);
    var hour = Math.floor(minute / 60);
    var minutePart = minute % 60;

    return String(hour).padStart(2, "0") + ":" + String(minutePart).padStart(2, "0");
  }

  function getDayProgress(minuteOfDay) {
    var minute = clampMinuteOfDay(minuteOfDay);
    return Math.max(0, Math.min(1, (minute - DAY_START_MINUTE) / DAY_ACTIVE_MINUTES));
  }

  ns.time = {
    WEEKDAYS: WEEKDAYS,
    SEASONS: SEASONS,
    SEASON_IDS: SEASON_IDS,
    DAYS_PER_WEEK: DAYS_PER_WEEK,
    DAYS_PER_SEASON: DAYS_PER_SEASON,
    MAX_ACTION_SLOTS: MAX_ACTION_SLOTS,
    MINUTE_PER_DAY: MINUTE_PER_DAY,
    DAY_START_MINUTE: DAY_START_MINUTE,
    DAY_END_MINUTE: DAY_END_MINUTE,
    DAY_ACTIVE_MINUTES: DAY_ACTIVE_MINUTES,
    DAY_DURATION_REAL_MS: DAY_DURATION_REAL_MS,
    DEFAULT_DAY_START_MINUTE: DEFAULT_DAY_START_MINUTE,
    MIN_MINUTE_OF_DAY: MIN_MINUTE_OF_DAY,
    MAX_MINUTE_OF_DAY: MAX_MINUTE_OF_DAY,
    createInitialTimeState: createInitialTimeState,
    clampMinuteOfDay: clampMinuteOfDay,
    getMinuteOfDay: getMinuteOfDay,
    setMinuteOfDay: setMinuteOfDay,
    advanceMinutes: advanceMinutes,
    consumeActionSlot: consumeActionSlot,
    advanceDay: advanceDay,
    getWeekdayName: getWeekdayName,
    getSeasonName: getSeasonName,
    getSeasonId: getSeasonId,
    getSeasonIdFromState: getSeasonIdFromState,
    getTimeSegmentId: getTimeSegmentId,
    formatClock: formatClock,
    getDayProgress: getDayProgress,
    isBusySeason: isBusySeason
  };
})(window);
