# ☕ Coffee Runner: The Heart of Ethiopia

A 3D endless runner that sprints through Ethiopia — coffee highlands heavy with
red cherries, tukul villages with jebena brewing on the coals, the streets of
Addis Ababa, the Simien escarpment, and the Blue Nile gorge.

Runs in any modern browser, installs as a PWA, and plays offline.

```bash
npm install
npm run dev      # local dev server
npm run build    # typecheck + full test suite + production build
npm test         # all three test suites
```

---

## What's in it

**A real 3D world.** Not sprites — a three.js scene with a rigged character, a
streaming environment, dynamic sky and a full lighting rig.

- **Character** — a joint hierarchy (hips → spine → chest → neck, plus four
  limbs with knee and elbow joints) driven by procedural animation. Run, jump,
  fall, slide, idle, death and stumble states blend into each other, the torso
  counter-rotates against the arm swing, the head stays level so you can read
  it at speed, and a trailing netela scarf adds secondary motion.
- **Environment** — chunk-streamed and recycled, so cost is constant no matter
  how far you get. Coffee bushes, terraced fields, drying beds, coffee-ceremony
  scenes, tukuls, enset, acacia, giant lobelia, Simien cliffs, Addis blocks with
  lit windows, Nile reed banks, and a multi-tier waterfall.
- **Sky & light** — a gradient sky-dome shader, sun and moon on a real arc,
  stars, weather-tinted clouds, and five lights (shadow-casting sun, hemisphere
  ambient, bounce fill, rim, plus a warm personal light at night).
- **Camera** — critically damped springs on every axis, look-ahead that leads
  into turns, speed-driven FOV, banking, landing dip, impact shake, and separate
  menu and game-over framing.

**Audio that responds to play.** Separate SFX / music / ambience buses through a
limiter, with a convolution reverb whose impulse is rebuilt per biome — a
village sounds dry, the Simien escarpment sounds enormous. The masinko-and-kebero
score is adaptive: drums and bass always play, the lead enters as you move, and a
krar counter-melody and kebero fills only arrive at high intensity. Music ducks
under impacts. Every biome has its own ambience, from highland songbirds and goat
bells to bajaj horns, fish eagles and night crickets.

**Progression.** 18 daily missions rolled one-per-difficulty-tier, 24
achievements including long-tail goals, a six-step rank ladder, daily streak
rewards, shop, power-ups and a local leaderboard.

**Built for phones.** Gestures resolve mid-swipe rather than on release, an
adaptive governor holds 60fps by scaling resolution before quality, scenery is
merged into a few draw calls, and there's an optional on-screen D-pad plus a
reduced-motion mode.

---

## Controls

| Action | Touch | Keyboard |
| --- | --- | --- |
| Change lane | Swipe ← → | `←` `→` / `A` `D` |
| Jump | Swipe ↑ or tap | `↑` / `W` / `Space` |
| Slide | Swipe ↓ | `↓` / `S` |
| Pause | Pause button | `Esc` / `P` |

Swipes fire the moment they cross the threshold, chain without lifting your
thumb, and buffer — a jump pressed just before you land still happens.

---

## Architecture

```
src/
  game/          gameplay, independent of any renderer
    engine.ts        simulation: physics, spawning, collision, scoring
    world.ts         biomes, weather, day/night, palettes
    progression.ts   profile, economy, missions, achievements
    save.ts          durable persistence
    controls.ts      gesture recognition
    perf.ts          adaptive quality governor
    audio*.ts        SFX, bus mixing, ambience, adaptive music
    useGameLoop.ts   the loop, wiring it all together
  game3d/        rendering, reads engine state and draws it
    scene3d.ts       per-frame sync from engine snapshot
    character.ts     rig + procedural animation
    environment.ts   chunk streaming, props, geometry merging
    sky.ts           sky dome, celestial arc, lighting rig
    camera.ts        chase camera
    effects.ts       particles, rain, speed lines, auras
  components/    React UI
scripts/         test suites
```

The engine never imports the renderer. Gameplay pushes visual cues onto an
`fxEvents` queue that the renderer drains, so the 3D layer could be swapped
wholesale without touching a line of game logic.

---

## Testing

No browser is required — the suites run headless in Node.

```bash
npm run smoke    # engine, character, props, save, economy, audio  (153 checks)
npm run render   # full Scene3D against a WebGL stub                (24 checks)
npm run ui       # every panel via react-dom/server                 (22 checks)
```

`scripts/render.ts` boots a real `Scene3D` against a stubbed WebGL context and
drives it for 9,000 frames across every biome, weather state and time of day,
asserting the scene graph plateaus (proving pooling works) and draw calls stay
within budget. The audio suite asserts the actual bus routing topology. The save
suite injects corruption, quota exhaustion and tampering.

These found real bugs during development, including infinite recursion in the
audio graph, a quota path that deleted the last good backup, and 22 buttons
whose taps were also being read as swipes.

---

## Performance

| | Before | After |
| --- | --- | --- |
| Draw calls | 1,251 | **321** |
| Scene nodes | 1,885 | **627** |
| Icon payload | 1,284 KB | **189 KB** |
| Update download | ~1 MB (all inlined) | **~130 KB** (three.js cached separately) |

Scenery is flattened and merged per material at chunk build time, foliage sway
happens in a vertex shader rather than per-object on the CPU, and the perf
governor scales render resolution before touching visual quality.

---

## Save data

Progress is checksummed and written to two alternating slots, so a crash
mid-write can only ever damage the slot being written — the other stays
recoverable. Writes are throttled and scheduled during idle time, then flushed
on `pagehide`. Schema changes run through ordered migrations, and saves from the
original build are imported automatically.

Settings → Save Data gives you a portable transfer code to move between devices.

---

## Credits

Built as a love letter to Ethiopian coffee culture and landscape. All art is
procedural geometry and all audio is synthesised — there are no external asset
downloads.
