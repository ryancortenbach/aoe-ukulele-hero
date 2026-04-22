// Audio engine: decode files, detect BPM + first-beat offset, return a
// playable song descriptor. Charts are generated later (in Game.jsx) based
// on the selected difficulty.

import { analyze, guess } from "web-audio-beat-detector";

let _ctx = null;
export function getCtx() {
  if (!_ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    _ctx = new C();
  }
  return _ctx;
}

// Total output latency (seconds) for the shared AudioContext. This is the
// gap between "sample scheduled to play at ctx.currentTime = T" and "sample
// actually hitting the speakers". We subtract it from the song clock so
// visual notes line up with what the player HEARS (not with the buffer
// playhead, which is always ahead of what's audible).
export function getOutputLatencySec() {
  const ctx = getCtx();
  // outputLatency is the device-reported latency; baseLatency is the
  // context's internal buffering latency. Sum them for total.
  const out = typeof ctx.outputLatency === "number" ? ctx.outputLatency : 0;
  const base = typeof ctx.baseLatency === "number" ? ctx.baseLatency : 0;
  return out + base;
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
//
// We retain the decoded AudioBuffer on the song descriptor so playback can
// go through an AudioBufferSourceNode routed into the AudioContext. Playing
// via the context (rather than a plain <audio> element) makes
// ctx.outputLatency / ctx.baseLatency meaningful and lets us start playback
// at a deterministic ctx.currentTime — no play() promise slop.
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
    audioBuffer,
    source: "upload",
  };
}

// Build a song object from a remote URL (e.g. iTunes preview).
// If knownBpm is supplied, we skip BPM detection but still compute an offset
// by detecting beats ourselves. That's important for preview clips cut
// mid-song — the first downbeat is rarely at t=0.
//
// When the remote host is CORS-enabled (iTunes previews are), we fetch the
// bytes ourselves, decode into an AudioBuffer, and stash it on the descriptor
// for AudioBufferSourceNode playback. If a host blocks CORS we fall back to
// an HTMLAudioElement-only descriptor (no audioBuffer, no detected offset)
// so the game still runs — with slightly looser sync because the element
// bypasses the AudioContext.
export async function songFromUrl({
  id,
  url,
  title,
  artist,
  bpm: knownBpm,
  color,
  source = "preview",
}) {
  try {
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
      audioBuffer,
      color,
      source,
    };
  } catch (err) {
    // Most commonly: CORS failure on fetch(). We can still play via <audio>
    // (which doesn't require CORS for <audio src=...> playback — only for
    // reading sample data). We don't know duration or offset in this mode,
    // so rely on the caller's knownBpm and leave offsetMs=0.
    console.warn(`songFromUrl ${id}: falling back to HTMLAudioElement path`, err);
    if (!knownBpm) throw err; // can't make a usable descriptor without a BPM
    return {
      id,
      title,
      artist,
      bpm: knownBpm,
      offsetMs: 0,
      durationMs: 0, // unknown in fallback path; game ends on <audio> ended event
      audioUrl: url,
      audioBuffer: null,
      color,
      source,
    };
  }
}
