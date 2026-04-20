# SFX Assets

All files served from `/sfx/*.wav` at runtime. Loaded and played via
`src/audio/sfxPlayer.js` (Web Audio API, decode-once playback).

## Status: all synthesized placeholders (Wave 1C)

Kenney.nl and OpenGameArt direct-download URLs were not reachable during
the Wave 1 cleanup (404 on the archived Kenney URLs we tried; other
sources required logins or human-in-the-loop search). Rather than block
Wave 2 integration, every slot was filled with a short synthesized tone
produced locally by `ffmpeg`'s `sine=` source with an `afade` tail.

Because these were generated from scratch with no input media, they are
not derived works and carry no license — treat them as public-domain
placeholders. Please replace with real sourced assets before shipping.

| File                 | Duration | Description                             | Source / License                              |
| -------------------- | -------- | --------------------------------------- | --------------------------------------------- |
| hit-perfect.wav      | 120 ms   | 1320 Hz bright pluck, fast fade-out     | Synthesized placeholder (ffmpeg sine) — CC0   |
| hit-good.wav         | 140 ms   | 880 Hz duller hit                       | Synthesized placeholder (ffmpeg sine) — CC0   |
| miss.wav             | 180 ms   | 140 Hz low thud                         | Synthesized placeholder (ffmpeg sine) — CC0   |
| combo-10.wav         | 600 ms   | 784 Hz stinger (G5)                     | Synthesized placeholder (ffmpeg sine) — CC0   |
| combo-25.wav         | 600 ms   | 988 Hz stinger (B5)                     | Synthesized placeholder (ffmpeg sine) — CC0   |
| combo-50.wav         | 700 ms   | 1318 Hz stinger (E6)                    | Synthesized placeholder (ffmpeg sine) — CC0   |
| menu-select.wav      | 50 ms    | 1600 Hz blip                            | Synthesized placeholder (ffmpeg sine) — CC0   |
| menu-confirm.wav     | 200 ms   | 660 Hz confirm tone                     | Synthesized placeholder (ffmpeg sine) — CC0   |
| countdown-tick.wav   | 100 ms   | 880 Hz tick (A5)                        | Synthesized placeholder (ffmpeg sine) — CC0   |
| countdown-go.wav     | 300 ms   | 1320 Hz bright "GO"                     | Synthesized placeholder (ffmpeg sine) — CC0   |

## Recommended replacements (for a future pass)

- Kenney Interface Sounds pack (CC0): <https://kenney.nl/assets/interface-sounds>
- Kenney UI Audio / Casino / Impact Sounds (CC0): <https://kenney.nl/assets?q=audio>
- OpenGameArt CC0 UI SFX: <https://opengameart.org/art-search-advanced?field_art_tags_tid=ui&sort_by=count&field_art_licenses_tid%5B%5D=2>
- Freesound CC0 ukulele plucks: <https://freesound.org/search/?q=ukulele+pluck&f=license:%22Creative+Commons+0%22>

When replacing, keep each file under 200 KB and ideally under the durations
above to preserve rhythm-game responsiveness.
