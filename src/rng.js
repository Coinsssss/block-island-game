(function (global) {
  var ns = global.BlockIsland = global.BlockIsland || {};
  var seededGenerator = null;

  function toUint32(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return 0;
    }
    return (Math.floor(value) >>> 0);
  }

  function createMulberry32(seed) {
    var state = toUint32(seed);
    return function () {
      state += 0x6D2B79F5;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function setSeed(seed) {
    seededGenerator = createMulberry32(seed);
  }

  function reset() {
    seededGenerator = null;
  }

  function next() {
    if (typeof seededGenerator === "function") {
      return seededGenerator();
    }
    return Math.random();
  }

  ns.rng = {
    next: next,
    setSeed: setSeed,
    reset: reset
  };
})(window);
