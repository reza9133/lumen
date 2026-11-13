# Performance

What was measured, how, and what is claimed only by design. Every number here can be reproduced with the commands shown.

## Reads from the chain

Version 1 of the app polled the chain every 12 seconds with `stats` plus the first page of `list_vows` (60 vows). Version 2 polls `pulse()` every 8 seconds, which is a revision number, and fetches only the vows that changed with `changes_since(rev)`. Polling pauses while the browser tab is hidden.

Measured on the contract in memory with 60 vows (two thirds of them backed on both sides, one in five with a progress note), as the length of the JSON the call returns:

| Read | Bytes |
|---|---|
| Version 1 poll: `stats` + `list_vows(0, 60)` | 30,842 |
| Version 2 idle poll: `pulse()` | 25 |
| Version 2 poll after one vow changed: `changes_since(rev)` | 657 |
| Version 2 full page: `stats` + `list_vows(0, 60)` (start, or when the client has fallen far behind) | 32,794 |

At those intervals an idle tab reads about 9.3 MB an hour with version 1 (30,842 bytes, 300 polls) and about 11 KB an hour with version 2 (25 bytes, 450 polls). The version 2 page is a little larger than version 1's because rows now carry progress notes; it is read once, not every poll.

Reproduce:

```bash
pytest tests/direct/test_payloads.py -s                                  # version 2 sizes, with bounds that fail on a regression
LUMEN_V1_CONTRACT=/path/to/version-1/lumen.py \
  pytest tests/direct/test_payloads.py -s -k version_1                   # version 1 page size
```

The tests assert that an idle poll stays under 60 bytes and does not grow with the number of vows, that a poll after one change is at most a twentieth of a full page, and that a quiet minute costs under a two-hundredth of what it did.

What this does not measure: network latency, or what a validator node spends answering a view call. It measures the payload, which is what every client downloads and parses.

## What the browser downloads

Measured from `vite build` output (gzipped size as reported by the build), version 1 compared with version 2:

| Chunk | Version 1 | Version 2 | Loaded |
|---|---|---|---|
| Application | 177.4 KB (one bundle that includes the chain SDK) | 86.0 KB | at start |
| Chain SDK (`genlayer-js` and its dependencies) | in the bundle above | 100.5 KB | on the first read from a chain |
| 3D engine (`three.js` and the space page) | does not exist | 126.6 KB | only on `#/space` |
| Other pages (keepers, activity, protocol, pulse, vow page) | do not exist | 1.5 to 3.5 KB each | when opened |

So the first paint no longer waits for the SDK, and the 3D engine costs nothing unless someone opens the 3D page. In a chain-connected session that never opens the 3D page, the total transferred is about the same as before (186.5 KB against 177.4 KB) while the app has many more pages; the gain is that the application code arrives and runs first.

`frontend/scripts/smoke.mjs` checks the lazy loading in a real browser: the chain SDK is not fetched in rehearsal mode, and the 3D chunk is fetched on `#/space` and on no other page.

Reproduce:

```bash
cd frontend && npm install && npm run build      # the table above is the build output
npm run smoke                                      # needs Playwright and Chromium
```

## Rendering (by design, not measured)

These changes were made to cut work per frame. No frame-time figure is claimed, because it depends on the device and was not measured.

- The night-sky background (gradients and static stars) is drawn once into an offscreen canvas and copied each frame instead of being repainted.
- The gold constellation lines between kept lanterns are cached and rebuilt only when the set of vows or the canvas size changes.
- The animation loop stops when the tab is hidden or when a page that covers the sky is open, and resumes on return.
- Every on-screen countdown reads one shared one-second clock instead of running its own timer.
- In the 3D view all lanterns are one instanced mesh and all glows one points object, so the number of draw calls does not grow with the number of vows. The loop pauses when the page is hidden or scrolled out of view, and animation is reduced when the system asks for reduced motion.
- The sync store merges changed rows into the existing list and updates only the components that read them.
