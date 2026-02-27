(function (global) {
  var ns = global.BlockIsland = global.BlockIsland || {};
  var STORAGE_KEY = "block_island_phase1_save_v1";

  function saveState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (error) {
      console.error("Save failed:", error);
      return false;
    }
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (error) {
      console.error("Load failed:", error);
      return null;
    }
  }

  function clearSavedState() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      return true;
    } catch (error) {
      console.error("Clear save failed:", error);
      return false;
    }
  }

  ns.storage = {
    STORAGE_KEY: STORAGE_KEY,
    saveState: saveState,
    loadState: loadState,
    clearSavedState: clearSavedState
  };
})(window);
