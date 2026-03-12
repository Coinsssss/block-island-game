(function (global) {
  var ns = global.BlockIsland = global.BlockIsland || {};
  var time = ns.time;

  var DAY_START_MINUTE = time && typeof time.DAY_START_MINUTE === "number"
    ? time.DAY_START_MINUTE
    : (8 * 60);
  var DAY_END_MINUTE = time && typeof time.DAY_END_MINUTE === "number"
    ? time.DAY_END_MINUTE
    : (20 * 60);
  var DAY_ACTIVE_MINUTES = Math.max(1, DAY_END_MINUTE - DAY_START_MINUTE);
  var DAY_DURATION_REAL_MS = time && typeof time.DAY_DURATION_REAL_MS === "number"
    ? time.DAY_DURATION_REAL_MS
    : (10 * 60 * 1000);
  var DEFAULT_START_MINUTE = DAY_START_MINUTE;
  var MIN_MINUTE_OF_DAY = DAY_START_MINUTE;
  var MAX_MINUTE_OF_DAY = DAY_END_MINUTE;
  var MORNING_START = DAY_START_MINUTE;
  var AFTERNOON_START = 12 * 60;
  var EVENING_START = 17 * 60;
  var NIGHT_START = DAY_END_MINUTE;
  var minuteAccumulator = 0;
  var ACTION_MINUTE_COSTS = {
    npcTalk: 10,
    work: 180,
    eat: 30,
    socialize: 60,
    rest: 45,
    stand: 5
  };

  var ACTION_WINDOWS = {
    work: { morning: true, afternoon: true },
    eat: { morning: true, afternoon: true, evening: true },
    socialize: { afternoon: true, evening: true },
    rest: { morning: true, afternoon: true, evening: true, night: true },
    sleep: { evening: true, night: true }
  };

  function clampMinuteOfDay(value) {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return DEFAULT_START_MINUTE;
    }

    return Math.max(
      MIN_MINUTE_OF_DAY,
      Math.min(MAX_MINUTE_OF_DAY, Math.floor(value))
    );
  }

  function ensureTimeState(state) {
    if (!state || !state.time || typeof state.time !== "object") {
      return null;
    }

    if (typeof state.time.minuteOfDay !== "number" || Number.isNaN(state.time.minuteOfDay)) {
      state.time.minuteOfDay = DEFAULT_START_MINUTE;
    }

    state.time.minuteOfDay = clampMinuteOfDay(state.time.minuteOfDay);
    return state.time;
  }

  function getMinuteOfDay(state) {
    var timeState = ensureTimeState(state);

    if (!timeState) {
      return DEFAULT_START_MINUTE;
    }

    return clampMinuteOfDay(timeState.minuteOfDay);
  }

  function setMinuteOfDay(state, minuteOfDay) {
    var timeState = ensureTimeState(state);

    if (!timeState) {
      return DEFAULT_START_MINUTE;
    }

    timeState.minuteOfDay = clampMinuteOfDay(minuteOfDay);
    return timeState.minuteOfDay;
  }

  function addMinutes(state, minutes) {
    var delta = typeof minutes === "number" && !Number.isNaN(minutes)
      ? Math.floor(minutes)
      : 0;
    var currentMinute = getMinuteOfDay(state);
    var nextMinute = currentMinute + delta;

    return setMinuteOfDay(state, nextMinute);
  }

  function getTimeSegmentId(minuteOfDay) {
    var minute = clampMinuteOfDay(minuteOfDay);

    if (minute >= NIGHT_START || minute < MORNING_START) {
      return "night";
    }
    if (minute >= EVENING_START) {
      return "evening";
    }
    if (minute >= AFTERNOON_START) {
      return "afternoon";
    }

    return "morning";
  }

  function getCurrentSegmentId(state) {
    return getTimeSegmentId(getMinuteOfDay(state));
  }

  function getSegmentLabel(segmentId) {
    if (segmentId === "morning") return "Morning";
    if (segmentId === "afternoon") return "Afternoon";
    if (segmentId === "evening") return "Evening";
    return "Night";
  }

  function formatClock(minuteOfDay) {
    var minute = clampMinuteOfDay(minuteOfDay);
    var hour24 = Math.floor(minute / 60);
    var minutePart = minute % 60;
    var hourLabel = String(hour24).padStart(2, "0");
    var minuteLabel = String(minutePart).padStart(2, "0");

    return hourLabel + ":" + minuteLabel;
  }

  function getCurrentClockLabel(state) {
    return formatClock(getMinuteOfDay(state));
  }

  function isActionAllowedNow(state, actionId) {
    var segment = getCurrentSegmentId(state);
    var windows = ACTION_WINDOWS[actionId];

    if (!windows || typeof windows !== "object") {
      return true;
    }

    return Boolean(windows[segment]);
  }

  function getActionMinuteCost(actionId) {
    if (!actionId || !Object.prototype.hasOwnProperty.call(ACTION_MINUTE_COSTS, actionId)) {
      return 0;
    }

    return ACTION_MINUTE_COSTS[actionId];
  }

  function spendActionTime(state, actionId, explicitMinutes) {
    var cost = typeof explicitMinutes === "number" && !Number.isNaN(explicitMinutes)
      ? Math.max(0, Math.floor(explicitMinutes))
      : getActionMinuteCost(actionId);
    var beforeMinute;
    var afterMinute;

    ensureTimeState(state);
    if (cost <= 0) {
      return {
        minutesSpent: 0,
        reachedEndOfDay: getMinuteOfDay(state) >= DAY_END_MINUTE
      };
    }

    beforeMinute = getMinuteOfDay(state);
    afterMinute = setMinuteOfDay(state, beforeMinute + cost);
    return {
      minutesSpent: Math.max(0, afterMinute - beforeMinute),
      reachedEndOfDay: afterMinute >= DAY_END_MINUTE
    };
  }

  function tickClock(state, deltaMs, paused) {
    // Real-time day model: one full day window runs in fixed real-time duration.
    var safeDeltaMs = typeof deltaMs === "number" && !Number.isNaN(deltaMs)
      ? Math.max(0, deltaMs)
      : 0;
    var advanced = 0;
    var reachedEndOfDay = false;
    var currentMinute;
    var nextMinute;

    ensureTimeState(state);
    if (paused) {
      return {
        advancedMinutes: 0,
        reachedEndOfDay: false
      };
    }

    minuteAccumulator += (safeDeltaMs / DAY_DURATION_REAL_MS) * DAY_ACTIVE_MINUTES;
    advanced = Math.floor(minuteAccumulator);
    if (advanced <= 0) {
      return {
        advancedMinutes: 0,
        reachedEndOfDay: false
      };
    }

    minuteAccumulator -= advanced;
    currentMinute = getMinuteOfDay(state);
    nextMinute = Math.min(DAY_END_MINUTE, currentMinute + advanced);
    setMinuteOfDay(state, nextMinute);
    if (nextMinute >= DAY_END_MINUTE) {
      reachedEndOfDay = true;
    }

    return {
      advancedMinutes: Math.max(0, nextMinute - currentMinute),
      reachedEndOfDay: reachedEndOfDay
    };
  }

  function resetClockAccumulator() {
    minuteAccumulator = 0;
  }

  function resetToMorning(state) {
    setMinuteOfDay(
      state,
      time && typeof time.DEFAULT_DAY_START_MINUTE === "number"
        ? time.DEFAULT_DAY_START_MINUTE
        : DEFAULT_START_MINUTE
    );
    resetClockAccumulator();
  }

  ns.worldTime = {
    DAY_START_MINUTE: DAY_START_MINUTE,
    DAY_END_MINUTE: DAY_END_MINUTE,
    DAY_ACTIVE_MINUTES: DAY_ACTIVE_MINUTES,
    DAY_DURATION_REAL_MS: DAY_DURATION_REAL_MS,
    DEFAULT_START_MINUTE: DEFAULT_START_MINUTE,
    MORNING_START: MORNING_START,
    AFTERNOON_START: AFTERNOON_START,
    EVENING_START: EVENING_START,
    NIGHT_START: NIGHT_START,
    clampMinuteOfDay: clampMinuteOfDay,
    ensureTimeState: ensureTimeState,
    getMinuteOfDay: getMinuteOfDay,
    setMinuteOfDay: setMinuteOfDay,
    addMinutes: addMinutes,
    getTimeSegmentId: getTimeSegmentId,
    getCurrentSegmentId: getCurrentSegmentId,
    getSegmentLabel: getSegmentLabel,
    formatClock: formatClock,
    getCurrentClockLabel: getCurrentClockLabel,
    isActionAllowedNow: isActionAllowedNow,
    ACTION_MINUTE_COSTS: ACTION_MINUTE_COSTS,
    getActionMinuteCost: getActionMinuteCost,
    spendActionTime: spendActionTime,
    tickClock: tickClock,
    resetClockAccumulator: resetClockAccumulator,
    resetToMorning: resetToMorning
  };
})(window);
