// sfxPlayer.js — Web Audio-based SFX player for the ukulele rhythm game.
// Decodes each clip once and plays via cheap AudioBufferSourceNodes
// for low-latency triggering (important for rhythm feedback).
//
// Public API:
//   initSfx()           -> Promise<void>  pre-load + decode all clips
//   playSfx(name)       -> void           fire-and-forget playback
//   setSfxVolume(v)     -> void           master SFX volume (0..1)
//   isSfxReady()        -> boolean        true once buffers are decoded

const SFX_FILES = {
  'hit-perfect':    '/sfx/hit-perfect.wav',
  'hit-good':       '/sfx/hit-good.wav',
  'miss':           '/sfx/miss.wav',
  'combo-10':       '/sfx/combo-10.wav',
  'combo-25':       '/sfx/combo-25.wav',
  'combo-50':       '/sfx/combo-50.wav',
  'menu-select':    '/sfx/menu-select.wav',
  'menu-confirm':   '/sfx/menu-confirm.wav',
  'countdown-tick': '/sfx/countdown-tick.wav',
  'countdown-go':   '/sfx/countdown-go.wav',
};

let ctx = null;
let masterGain = null;
let volume = 0.8;
const buffers = {};
let loadPromise = null;
let ready = false;

function getContext() {
  if (ctx) return ctx;
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
    masterGain = ctx.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(ctx.destination);
    return ctx;
  } catch (_) {
    return null;
  }
}

async function loadOne(name, url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch ${url} ${res.status}`);
    const arr = await res.arrayBuffer();
    // decodeAudioData requires an active AudioContext.
    const buf = await new Promise((resolve, reject) => {
      ctx.decodeAudioData(arr.slice(0), resolve, reject);
    });
    buffers[name] = buf;
  } catch (err) {
    // swallow — missing/bad SFX should never crash gameplay.
    // eslint-disable-next-line no-console
    console.warn(`[sfxPlayer] failed to load ${name}:`, err);
  }
}

export function initSfx() {
  if (loadPromise) return loadPromise;
  const c = getContext();
  if (!c) {
    // No AudioContext yet (SSR or pre-gesture). Try again next call.
    loadPromise = null;
    return Promise.resolve();
  }
  loadPromise = Promise.all(
    Object.entries(SFX_FILES).map(([name, url]) => loadOne(name, url))
  ).then(() => {
    ready = true;
  });
  return loadPromise;
}

// Press/hit/miss/combo cues fire on every keypress — noisy on top of song audio.
// Muted here; keep menu + countdown SFX audible.
const MUTED_SFX = new Set([
  'hit-perfect',
  'hit-good',
  'miss',
  'combo-10',
  'combo-25',
  'combo-50',
]);

export function playSfx(name) {
  if (MUTED_SFX.has(name)) return;
  const c = getContext();
  if (!c) return; // no audio available yet
  // Resume on first gesture if needed.
  if (c.state === 'suspended') {
    c.resume().catch(() => {});
  }
  // Kick off loading on first use if nobody called initSfx yet.
  if (!loadPromise) initSfx();
  const buf = buffers[name];
  if (!buf) return; // not loaded yet — no-op
  try {
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(masterGain);
    src.start(0);
  } catch (_) {
    /* no-op */
  }
}

export function setSfxVolume(v) {
  volume = Math.max(0, Math.min(1, Number(v) || 0));
  if (masterGain) masterGain.gain.value = volume;
}

export function isSfxReady() {
  return ready;
}

const sfxPlayer = { initSfx, playSfx, setSfxVolume, isSfxReady };
export default sfxPlayer;
