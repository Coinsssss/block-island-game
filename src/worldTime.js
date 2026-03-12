(function (global) {
  var ns = global.BlockIsland = global.BlockIsland || {};
  var time = ns.time;

  var DEFAULT_START_MINUTE = 8 * 60;
  var MIN_MINUTE_OF_DAY = 0;
  var MAX_MINUTE_OF_DAY = (24 * 60) - 1;
  var MORNING_START = 6 * 60;
  var AFTERNOON_START = 12 * 60;
  var EVENING_START = 17 * 60;
  var NIGHT_START = 21 * 60;
  var MOVING_MINUTE_MS = 900;
  var IDLE_MINUTE_MS = 3200;
  var clockAccumulatorMs = 0;

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

  function tickClock(state, deltaMs, isMoving) {
    var minuteStepMs = isMoving ? MOVING_MINUTE_MS : IDLE_MINUTE_MS;
    var safeDeltaMs = typeof deltaMs === "number" && !Number.isNaN(deltaMs)
      ? Math.max(0, deltaMs)
      : 0;
    var advanced = 0;

    ensureTimeState(state);
    clockAccumulatorMs += safeDeltaMs;

    while (clockAccumulatorMs >= minuteStepMs) {
      if (getMinuteOfDay(state) >= MAX_MINUTE_OF_DAY) {
        clockAccumulatorMs = 0;
        break;
      }

      addMinutes(state, 1);
      advanced += 1;
      clockAccumulatorMs -= minuteStepMs;
    }

    return advanced;
  }

  function resetClockAccumulator() {
    clockAccumulatorMs = 0;
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
    tickClock: tickClock,
    resetClockAccumulator: resetClockAccumulator,
    resetToMorning: resetToMorning
  };
})(window);
