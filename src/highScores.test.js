// NOTE: highScores.js caches at module load and attaches its storage
// listener at import time. We use jest.isolateModules to get a fresh
// module per test so the listener registers cleanly and the cache is
// pristine.

const KEY = "uh_highscores_v1";

describe("highScores cache invalidation", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("caches high scores across reads (same module instance)", () => {
    jest.isolateModules(() => {
      const { recordScore, getHighScore } = require("./highScores");

      recordScore("song-a", "medium", {
        score: 1000,
        maxCombo: 10,
        perfect: 5,
        good: 2,
        miss: 0,
        total: 7,
        grade: "A",
        accuracy: 0.9,
      });

      // First read: populates cache (or reads the cached write).
      const first = getHighScore("song-a", "medium");
      expect(first).not.toBeNull();
      expect(first.score).toBe(1000);

      // Simulate a stale/rogue direct write to localStorage by a
      // NON-storage-event path. Since the cache is still populated,
      // reads should return the CACHED value, not the mutated storage.
      localStorage.setItem(
        KEY,
        JSON.stringify({ "song-a:medium": { score: 999, date: Date.now() } })
      );

      const second = getHighScore("song-a", "medium");
      expect(second.score).toBe(1000); // cache, not 999 from storage
    });
  });

  it("invalidates the cache on a `storage` event from another tab", () => {
    jest.isolateModules(() => {
      const { recordScore, getHighScore } = require("./highScores");

      recordScore("song-b", "hard", {
        score: 500,
        maxCombo: 3,
        perfect: 2,
        good: 1,
        miss: 0,
        total: 3,
        grade: "B",
        accuracy: 0.85,
      });

      // Prime the cache.
      expect(getHighScore("song-b", "hard").score).toBe(500);

      // Simulate another tab overwriting the key directly...
      const updated = {
        "song-b:hard": {
          score: 9999,
          maxCombo: 50,
          perfect: 30,
          good: 0,
          miss: 0,
          total: 30,
          grade: "S",
          accuracy: 1.0,
          date: Date.now(),
        },
      };
      localStorage.setItem(KEY, JSON.stringify(updated));

      // ...and firing the storage event that real browsers send.
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: KEY,
          newValue: JSON.stringify(updated),
          storageArea: localStorage,
        })
      );

      // Cache should be invalidated — next read re-parses localStorage
      // and returns the new score, not the pre-event 500.
      const afterEvent = getHighScore("song-b", "hard");
      expect(afterEvent.score).toBe(9999);
      expect(afterEvent.grade).toBe("S");
    });
  });

  it("invalidates the cache when storage is cleared (key === null)", () => {
    jest.isolateModules(() => {
      const { recordScore, getHighScore } = require("./highScores");

      recordScore("song-c", "easy", {
        score: 200,
        maxCombo: 1,
        perfect: 1,
        good: 0,
        miss: 0,
        total: 1,
        grade: "C",
        accuracy: 1.0,
      });

      expect(getHighScore("song-c", "easy").score).toBe(200);

      localStorage.clear();
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: null,
          newValue: null,
          storageArea: localStorage,
        })
      );

      expect(getHighScore("song-c", "easy")).toBeNull();
    });
  });

  it("ignores storage events for unrelated keys", () => {
    jest.isolateModules(() => {
      const { recordScore, getHighScore } = require("./highScores");

      recordScore("song-d", "medium", {
        score: 777,
        maxCombo: 7,
        perfect: 7,
        good: 0,
        miss: 0,
        total: 7,
        grade: "A",
        accuracy: 1.0,
      });
      expect(getHighScore("song-d", "medium").score).toBe(777);

      // An unrelated key's storage event should NOT invalidate the cache.
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "some-other-key",
          newValue: "whatever",
          storageArea: localStorage,
        })
      );

      // Mutate the highscores key in storage directly (simulating a
      // foreign write that we DIDN'T see the event for).
      localStorage.setItem(
        KEY,
        JSON.stringify({ "song-d:medium": { score: 111, date: Date.now() } })
      );
      // Cache should still return the original 777 because the unrelated
      // event didn't invalidate it.
      expect(getHighScore("song-d", "medium").score).toBe(777);
    });
  });
});
