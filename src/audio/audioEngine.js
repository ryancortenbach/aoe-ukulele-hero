// Audio engine: decode files, detect BPM + first-beat offset, return a
// playable song descriptor. Charts are generated later (in Game.jsx) based
// on the selected difficulty.

import { analyze, guess } from "web-audio-beat-detector";

let _ctx = null;
function getCtx() {
  if (!_ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    _ctx = new C();
  }
  return _ctx;
}

export async function decodeArrayBuffer(arrayBuffer) {
  const ctx = getCtx();
  const copy = arrayBuffer.slice(0);
  return await ctx.decodeAudioData(copy);
}

// Detect BPM + first-beat offset (seconds). guess() is noisier than
// analyze() but gives us the offset we need for chart alignment.
export async function detectBeat(audioBuffer) {
  try {
    const g = await guess(audioBuffer);
    return {
      bpm: Math.round(g.bpm),
      offsetMs: Math.round((g.offset || 0) * 1000),
    };
  } catch (err) {
    try {
      const bpm = await analyze(audioBuffer);
      return { bpm: Math.round(bpm), offsetMs: 0 };
    } catch (err2) {
      console.warn("BPM detection failed, defaulting to 120", err2);
      return { bpm: 120, offsetMs: 0 };
    }
  }
}

// Build a song object from an uploaded File.
export async function songFromFile(file) {
  const url = URL.createObjectURL(file);
  const arrayBuffer = await file.arrayBuffer();
  const audioBuffer = await decodeArrayBuffer(arrayBuffer);
  const { bpm, offsetMs } = await detectBeat(audioBuffer);
  const durationMs = Math.round(audioBuffer.duration * 1000);
  const title = file.name.replace(/\.[^.]+$/, "");
  return {
    id: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    artist: "You",
    bpm,
    offsetMs,
    durationMs,
    audioUrl: url,
    source: "upload",
  };
}

// Build a song object from a remote URL (e.g. iTunes preview).
// If knownBpm is supplied, we skip BPM detection but still compute an offset
// by detecting beats ourselves. That's important for preview clips cut
// mid-song — the first downbeat is rarely at t=0.
export async function songFromUrl({
  id,
  url,
  title,
  artist,
  bpm: knownBpm,
  color,
  source = "preview",
}) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`fetch ${url} → ${resp.status}`);
  const arrayBuffer = await resp.arrayBuffer();
  const audioBuffer = await decodeArrayBuffer(arrayBuffer);
  const detected = await detectBeat(audioBuffer);
  const bpm = knownBpm || detected.bpm;
  const offsetMs = detected.offsetMs;
  const durationMs = Math.round(audioBuffer.duration * 1000);
  return {
    id,
    title,
    artist,
    bpm,
    offsetMs,
    durationMs,
    audioUrl: url,
    color,
    source,
  };
}
