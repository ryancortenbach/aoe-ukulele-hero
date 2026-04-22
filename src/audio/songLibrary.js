// Song library: in-memory store + reactive hook. Seeds with iTunes preview
// URLs for a handful of popular tracks. Uploaded songs live alongside them.
//
// Songs here are "metadata only" — no chart. Charts are generated at
// game-start time so the same song can be played at different difficulties.

import { useEffect, useState } from "react";
import { songFromUrl, songFromFile } from "./audioEngine";

// Known-good iTunes 30-second preview URLs. All publicly hosted by Apple,
// CORS-enabled, served over HTTPS. Approximate BPMs are supplied so we
// skip tempo detection for these (faster load + more reliable).
//
// NOTE: offsetMs is intentionally omitted here — audioEngine.songFromUrl
// always runs web-audio-beat-detector's guess() to get a per-song first-beat
// offset, even when BPM is known. If a specific preview feels consistently
// off on a downbeat, add a `offsetMs: <ms>` override on that entry below
// and it will flow into generateChart via Game.jsx. (BPMs below were
// verified against published tempi — MONTERO 178, Shape of You 96,
// Blinding Lights 171, bad guy 135, Flowers 118, Levitating 103, Anti-Hero
// 97, Watermelon Sugar 95, Espresso 104, Uptown Funk 115. None look
// halved/doubled.)
const DEFAULT_SOURCES = [
  {
    id: "montero",
    title: "MONTERO (Call Me By Your Name)",
    artist: "Lil Nas X",
    bpm: 178,
    color: "#f682f4",
    url: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview124/v4/6e/cd/99/6ecd9966-bbe2-36b5-35f1-cd8ed6406906/mzaf_3486740843482888093.plus.aac.p.m4a",
  },
  {
    id: "shape-of-you",
    title: "Shape of You",
    artist: "Ed Sheeran",
    bpm: 96,
    color: "#54e4e9",
    url: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/44/c7/4f/44c74f0d-72dc-6143-d4d0-ba14d661ca0d/mzaf_9566898362556366703.plus.aac.p.m4a",
  },
  {
    id: "blinding-lights",
    title: "Blinding Lights",
    artist: "The Weeknd",
    bpm: 171,
    color: "#ff4d6d",
    url: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/17/b4/8f/17b48f9a-0b93-6bb8-fe1d-3a16623c2cfb/mzaf_9560252727299052414.plus.aac.p.m4a",
  },
  {
    id: "bad-guy",
    title: "bad guy",
    artist: "Billie Eilish",
    bpm: 135,
    color: "#4d9eff",
    url: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/c3/87/1f/c3871f7e-3260-d615-1c66-5fdca2c3a48f/mzaf_10721331211699880949.plus.aac.p.m4a",
  },
  {
    id: "flowers",
    title: "Flowers",
    artist: "Miley Cyrus",
    bpm: 118,
    color: "#ffd95a",
    url: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/68/9e/f7/689ef7fe-14fe-a846-c87f-7d3b2d6344b1/mzaf_4167137058064023087.plus.aac.p.m4a",
  },
  {
    id: "levitating",
    title: "Levitating",
    artist: "Dua Lipa",
    bpm: 103,
    color: "#f682f4",
    url: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/59/dc/4d/59dc4dda-93ff-8f1c-c536-f005f6ea6af5/mzaf_3066686759813252385.plus.aac.p.m4a",
  },
  {
    id: "anti-hero",
    title: "Anti-Hero",
    artist: "Taylor Swift",
    bpm: 97,
    color: "#54e4e9",
    url: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/1d/56/2a/1d562a07-dc5f-a9c0-1f36-2051a8c14eb7/mzaf_7214829135431340590.plus.aac.p.m4a",
  },
  {
    id: "watermelon-sugar",
    title: "Watermelon Sugar",
    artist: "Harry Styles",
    bpm: 95,
    color: "#ff944d",
    url: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview116/v4/16/86/f5/1686f50d-8b77-7e32-85f7-5f0e804d68fe/mzaf_14195633304344507287.plus.aac.p.m4a",
  },
  {
    id: "espresso",
    title: "Espresso",
    artist: "Sabrina Carpenter",
    bpm: 104,
    color: "#ffd95a",
    url: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/e9/4d/02/e94d0230-11ee-ef94-d2cf-a5d547bd73f4/mzaf_554140808559155562.plus.aac.p.m4a",
  },
  {
    id: "uptown-funk",
    title: "Uptown Funk",
    artist: "Mark Ronson feat. Bruno Mars",
    bpm: 115,
    color: "#4d9eff",
    url: "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview126/v4/62/e1/98/62e19826-cd13-6eff-390e-dbca502bb7b5/mzaf_8006535252627949661.plus.aac.p.m4a",
  },
];

const state = {
  songs: [],
  loading: false,
  loadingIds: new Set(),
  error: null,
};
const subs = new Set();

function notify() {
  for (const fn of subs) fn({ ...state, loadingIds: new Set(state.loadingIds) });
}

export function subscribe(fn) {
  subs.add(fn);
  fn({ ...state, loadingIds: new Set(state.loadingIds) });
  return () => subs.delete(fn);
}

let _bootPromise = null;
export function bootDefaults() {
  if (_bootPromise) return _bootPromise;
  state.loading = true;
  notify();
  _bootPromise = (async () => {
    // Fetch in parallel — iTunes previews are small and independent.
    const tasks = DEFAULT_SOURCES.map(async (src) => {
      state.loadingIds.add(src.id);
      notify();
      try {
        const song = await songFromUrl(src);
        state.songs.push(song);
      } catch (e) {
        console.warn(`Failed to load default song ${src.id}`, e);
      } finally {
        state.loadingIds.delete(src.id);
        notify();
      }
    });
    await Promise.all(tasks);
    state.loading = false;
    notify();
  })();
  return _bootPromise;
}

export async function addUploadedFile(file) {
  const song = await songFromFile(file);
  song.color = "#ffd95a";
  state.songs.push(song);
  notify();
  return song;
}

export function removeSong(id) {
  const idx = state.songs.findIndex((s) => s.id === id);
  if (idx < 0) return;
  const [removed] = state.songs.splice(idx, 1);
  if (removed?.source === "upload" && removed.audioUrl?.startsWith("blob:")) {
    URL.revokeObjectURL(removed.audioUrl);
  }
  notify();
}

export function useSongLibrary() {
  const [snap, setSnap] = useState({ ...state, loadingIds: new Set(state.loadingIds) });
  useEffect(() => subscribe(setSnap), []);
  useEffect(() => { bootDefaults(); }, []);
  return snap;
}
