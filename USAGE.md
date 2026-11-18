# Running & Using the System

This guide covers setting up, running, configuring, and playing **Grand Theft Auto V — Los Santos** locally or on a network, including keyboard/mouse controls, full gamepad setup, gameplay systems, and importing original audio tracks for the Stonebwoy & Kweku Smoke soundtrack.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation & Running](#installation--running)
3. [Quick Start Walkthrough](#quick-start-walkthrough)
4. [Controls Reference](#controls-reference)
5. [Gamepad Setup & Tuning](#gamepad-setup--tuning)
6. [Gameplay Systems Guide](#gameplay-systems-guide)
7. [Soundtrack & Custom MP3 Setup](#soundtrack--custom-mp3-setup)
8. [Project Directory Reference](#project-directory-reference)
9. [Performance & Troubleshooting](#performance--troubleshooting)

---

## Prerequisites

* **Docker** `24.0+` (with Docker Compose) — *or* **Node.js** `18.0+` (includes `npm`) for local development
* A modern desktop browser with **WebGL 2** enabled (Chrome, Edge, Firefox, Brave, or Safari)
* *(Optional)* Any standard USB or Bluetooth controller (Xbox Wireless, PlayStation DualSense / DualShock 4, Pro Controller, or generic W3C-compatible gamepad)

---

## Installation & Running

### Option A — Docker (Recommended: everything in one container)

The entire app — build toolchain and production server — runs inside a single multi-stage Docker image (`node:22-alpine` builds the Vite bundle, `nginx:alpine` serves it). No Node.js install needed on the host.

```bash
git clone https://github.com/Randy-Dosu/GTA-V_clone.git
cd GTA-V_clone
docker compose up --build
```

* Open `http://localhost:5173` in your browser (container port `80` → host `5173`).
* Stop with `docker compose down`. Rebuild after code changes with `docker compose up --build`.
* Plain Docker (no Compose): `docker build -t gta-v-los-santos . && docker run --rm -p 5173:80 gta-v-los-santos`
* Files: `Dockerfile` (multi-stage build), `docker/nginx.conf` (SPA fallback, gzip, asset caching), `docker-compose.yml` (port mapping + healthcheck), `.dockerignore` (excludes `node_modules`, `dist`, `.git`).

### Option B — Local Development (Node.js)

### 1. Install Dependencies

```bash
git clone https://github.com/Randy-Dosu/GTA-V_clone.git
cd GTA-V_clone
npm install
```

### 2. Start the Development Server

```bash
npm run dev
```

Opens Vite with Hot Module Replacement on `http://localhost:5173` (bound to `0.0.0.0:5173` for LAN/preview access).

### 3. Build & Preview for Production

```bash
npm run build
npm run preview
```

* `npm run build` runs strict TypeScript type-checking (`tsc`) and bundles optimized static assets into `dist/`.
* `npm run preview` serves the production build on `http://localhost:4173`.

---

## Quick Start Walkthrough

1. **Title Screen:** Choose **STORY MODE** (or press `Enter` / `Start` / `A` / `✕`) to drop into downtown Los Santos as **Franklin Clinton**. You can also open **RADIO**, **CONTROLS**, or **SETTINGS** right from the title bar.
2. **Mouse Lock (Keyboard/Mouse):** Click anywhere on the game viewport to lock the mouse cursor for smooth 360° third-person camera control. Press `Esc` or `M` anytime to release the cursor and open the Pause Menu.
3. **Drive or Fly:** Walk up to the **Pegassi Zentorno** parked beside you (or any vehicle across Los Santos) and press `F` (`Y` / `△` on gamepad) to get in. Visit the **Maze Bank Helipad** or **Vespucci Helipad** (or call the **Mechanic** on your iFruit phone) to fly the **Buckingham Maverick** helicopter.
4. **Navigate Los Santos:** Press `M` (`Menu` / `Options` on gamepad, or click the bottom-left radar) to open the full interactive city map. Click anywhere—or pan the crosshair with `Left Stick` and press `A` / `✕`—to plot a street-snapped purple GPS route.

---

## Controls Reference

### On Foot & Combat

| Action | Keyboard & Mouse | Gamepad (Xbox / PlayStation) |
| --- | --- | --- |
| Move (Walk / Jog) | `W` `A` `S` `D` | `Left Stick` (proportional analog) |
| Camera Look | `Mouse` (or `←` `→` arrows) | `Right Stick` (analog, slows while aiming) |
| Sprint | Hold `Shift` | Hold `A` / `✕` |
| Jump | `Space` | `X` / `□` |
| Aim Weapon | Hold `Right Click` | Hold `LT` / `L2` |
| Fire / Melee Attack | `Left Click` | `RT` / `R2` |
| Reload | `R` | `B` / `○` |
| Weapon Wheel | Hold `Tab` + `Mouse` | Hold `LB` (`L1`) + `Right Stick` |
| Quick Select / Cycle Weapon | `1`–`6` or `Mouse Wheel` | Tap `LB` (`L1`) |
| Enter Vehicle | `F` or `E` | `Y` / `△` |
| Start Mission / Enter Shop | `E` | `D-Pad Right` |
| Special Ability | `X` or `CapsLock` | `L3 + R3` (press both sticks) |

### Cars, Motorcycles & Helicopters

| Action | Keyboard & Mouse | Gamepad (Xbox / PlayStation) |
| --- | --- | --- |
| Accelerate | `W` | `RT` / `R2` (proportional analog) |
| Brake / Reverse | `S` | `LT` / `L2` (proportional analog) |
| Steer | `A` / `D` | `Left Stick` |
| Handbrake Drift | Hold `Space` | Hold `RB` (`R1`) or `A` (`✕`) |
| Turbo / Nitro Boost | Hold `Shift` | Hold `X` / `□` |
| Exit Vehicle | `F` or `E` | `Y` / `△` |
| Horn / Toggle LSPD Siren | `H` | `L3` |
| Helicopter Ascend / Descend | `Space` / `Shift` | `RT` / `LT` (`R2` / `L2`) |
| Helicopter Pitch & Yaw | `W` `A` `S` `D` | `Left Stick` + `LB` / `RB` (`L1` / `R1`) |
| Cycle Camera Distance | `V` | `View` / `Create` (`Select`) |
| Look Behind | Hold `C` | Hold `R3` |

### Characters, Soundtrack, Phone & Menus

| Action | Keyboard & Mouse | Gamepad (Xbox / PlayStation) |
| --- | --- | --- |
| Character Switch Wheel | Hold `Alt` + `1` / `2` / `3` (or `F1`–`F3`) | Hold `D-Pad Down` + `Right Stick` |
| Radio Wheel | Hold `Q` + `Mouse` | Hold `D-Pad Left` + `Right Stick` |
| Skip to Next Song | `N` | Tap `D-Pad Left` (or `RB` in Radio Wheel) |
| Cycle Radio Station (Vehicle) | `R` | Hold `D-Pad Left` + `Right Stick` |
| Open / Close iFruit Phone | `P` or `↑` (`↓` to close) | `D-Pad Up` (`B` / `○` to go back/close) |
| Pause Menu & GPS Map | `M`, `Esc`, or click Radar | `Menu` / `Options` (`Start`) |
| Switch Pause Tabs | Click Tab | `LB` / `RB` (`L1` / `R1`) |
| Menu Navigate / Confirm / Back | `Mouse` / `Esc` | `D-Pad` or `LS` / `A` (`✕`) / `B` (`○`) |
| Pause Map Set / Clear Waypoint | Click Map / `CLEAR WAYPOINT` | `LS` Pan + `A` (`✕`) Set / `X` (`□`) Clear |

---

## Gamepad Setup & Tuning

1. Connect your controller via USB or Bluetooth, focus the browser tab, and press any face button to wake the W3C Gamepad API.
2. A top-left notification confirms the controller name, and all HUD prompts automatically switch between **Keyboard**, **Xbox**, and **PlayStation** button glyphs based on whichever device you touch last.
3. Open **SETTINGS** (from the Title Screen or Pause Menu) to fine-tune:
   * **Controller Sensitivity** (`0.4` – `2.4`)
   * **Controller Deadzone** (`0.05` – `0.35`, helpful if a stick has slight drift)
   * **Controller Vibration** (toggles `dual-rumble` haptic feedback for gunfire, explosions, collisions, drifting, stunt jumps, and character switches)

---

## Gameplay Systems Guide

* **Character Switching:** Switch anytime between **Michael De Santa** (*Bullet Time* combat slow-motion, Rockford Hills), **Franklin Clinton** (*Driving Focus* precision slow-motion cornering, Downtown), and **Trevor Philips** (*Red Mist* double damage and damage resistance, East Los Santos).
* **Story Missions:** Look for colored letter blips (`F`, `S`, `L`, `M`) on the radar and Pause Map, or select a mission under **Pause → BRIEF** to set a yellow GPS route. Drive or walk into the glowing mission marker and press `E` / `D-Pad Right` to begin.
* **iFruit Smartphone (`P` / `D-Pad Up`):**
  * **iFruit Music:** Skip songs, switch stations, pick any track directly, or import local MP3 files.
  * **Mechanic:** Deliver any vehicle (Zentorno, Gauntlet, Bati 801 sportbike, Dubsta, LSPD Cruiser, or Maverick helicopter) directly to your street.
  * **Quick GPS:** Plot instant routes to key Los Santos landmarks.
  * **Switch Hero:** Trigger satellite transitions to Franklin, Michael, or Trevor.
  * **Time & Sky:** Jump between *Golden Hour*, *California Noon*, *Vespucci Sunset*, and *Downtown Night*.
  * **Lester (Evade) / 3★ Heat:** Instantly clear wanted stars or launch a 3-star LSPD chase.
* **Los Santos Customs & Ammu-Nation:** Drive into the **Los Santos Customs** bay (`LSC` map icon) to repair vehicle damage, install Twin-Turbo tuning, apply metallic clearcoat resprays, add neon underglow, or clear wanted plates. Walk into **Ammu-Nation** to purchase weapons, refill magazines, and buy body armor.
* **LSPD Wanted System & Stunt Jumps:** Stars (`1★`–`5★`) escalate patrol density and aggression; break line-of-sight when the stars begin flashing to evade. Hit marked wooden/steel ramps across the city at high speed to trigger slow-motion **Stunt Jump** cameras and cash rewards.

---

## Soundtrack & Custom MP3 Setup

The game includes **9 curated songs** by **Stonebwoy** and **Kweku Smoke** across three stations (playing on foot and in vehicles by default; toggle **Play Soundtrack On Foot** in **Settings**):

| Station | Artist | Tracks |
| --- | --- | --- |
| **Gold Coast FM** *(Default)* | Stonebwoy & Kweku Smoke | Alternates all 9 tracks back-to-back |
| **BHIM Nation 101.9** | Stonebwoy | *People Dey*, *Run Go*, *Send Dem a Prayer*, *Hero*, *Jejereje (feat. Ginton)* |
| **Scatter Der 96.5** | Kweku Smoke | *Sober*, *Faith*, *Survivor*, *Hallelujah* |
| **Radio Off** | — | Mutes soundtrack (city & engine SFX only) |

**Music API streaming (default):** the moment you select any track — in the Radio deck, the Radio Wheel, or the iFruit Music app — the game looks it up through the free **Apple Music / iTunes Search API** (`src/audio/MusicApi.ts`) and streams the real song instantly. Resolved rows carry a **`LIVE`** badge; the Now Playing panel shows *Apple Music API Stream* with album/genre tooltips. Lookups are cached per session, and a confident artist+title match is always required (covers/karaoke/remix noise is rejected). If there is no internet or no confident match, the tempo- and key-matched Web Audio instrumental riddim plays seamlessly instead.

Playback source priority per song: **local import / `manifest.json` file → music API stream → built-in instrumental**.

### Option A — One-Click In-Game Import (Fastest)

1. Open **RADIO** (from the Title Screen or Pause Menu) or **iFruit Phone → iFruit Music**.
2. Click **`+ Import MP3s`** and select one or more audio files from your device.
3. Files automatically match to existing songs by title (e.g. `Sober.mp3`, `People Dey.mp3`, `Send Dem a Prayer.mp3`, `Jejereje.mp3`)—and any additional Stonebwoy or Kweku Smoke tracks are added directly to their station and start streaming immediately.

### Option B — Persistent `public/music/` Folder

1. Copy your audio files into `public/music/`.
2. Map each track ID in `public/music/manifest.json`:

```json
{
  "files": {
    "kweku-smoke-sober": "/music/sober.mp3",
    "kweku-smoke-faith": "/music/faith.mp3",
    "kweku-smoke-survivor": "/music/survivor.mp3",
    "kweku-smoke-hallelujah": "/music/hallelujah.mp3",
    "stonebwoy-people-dey": "/music/people-dey.mp3",
    "stonebwoy-run-go": "/music/run-go.mp3",
    "stonebwoy-send-dem-a-prayer": "/music/send-dem-a-prayer.mp3",
    "stonebwoy-hero": "/music/hero.mp3",
    "stonebwoy-jejereje": "/music/jejereje.mp3"
  }
}
```

3. Reload the game—each mapped track will automatically display an `AUDIO` badge and stream the original file across all radio stations.

---

## Project Directory Reference

```text
GTA-V_clone/
├── Dockerfile                 # Multi-stage production image (Node build → nginx serve)
├── docker-compose.yml         # One-command container run (5173:80, healthcheck)
├── docker/
│   └── nginx.conf             # SPA fallback, gzip, asset caching & security headers
├── index.html                 # App shell, HUD, radial wheels, phone, shops & pause menu
├── public/
│   ├── favicon.svg            # GTA V app icon
│   └── music/manifest.json    # Optional persistent local audio file mapping
└── src/
    ├── main.ts                # Master game loop, post-processing composer & mode routing
    ├── style.css              # GTA V UI styling & Xbox/PlayStation controller glyphs
    ├── types.ts               # Shared types, character/vehicle/weapon/radio definitions
    ├── audio/
    │   ├── MusicApi.ts         # Apple Music (iTunes Search) API client: resolves & streams real songs
    │   └── SoundtrackData.ts  # 9-track Stonebwoy & Kweku Smoke catalog & arrangements
    ├── core/
    │   ├── AudioEngine.ts     # Web Audio sequencer, music-API/MP3 streamer, engine/combat/UI SFX
    │   ├── CameraController.ts# Orbit/chase camera, intro drop, sky-switch & stunt cam
    │   ├── GamepadManager.ts  # W3C Gamepad API polling, deadzones, glyphs & haptics
    │   └── InputManager.ts    # Keyboard, mouse & Pointer Lock input
    ├── graphics/
    │   ├── TextureFactory.ts  # Procedural PBR asphalt, glass, concrete, sand & stucco
    │   ├── SkyAndOcean.ts     # GLSL sky dome, Pacific Ocean waves, PMREM & day/night
    │   └── EffectsManager.ts  # Muzzle flash, tracers, smoke, skid marks & explosions
    ├── world/
    │   ├── WorldData.ts       # Los Santos districts, street grid, landmarks & GPS A*
    │   ├── CityBuilder.ts     # Downtown towers, Vinewood Hills, beach, pier & props
    │   └── TrafficAndPeds.ts  # AI vehicle traffic & sidewalk pedestrian simulation
    ├── entities/
    │   ├── VehicleFactory.ts  # Clearcoat cars, sportbike, cruiser & helicopter meshes
    │   ├── Vehicle.ts         # Analog vehicle physics, drifting, nitro & flight model
    │   ├── CharacterMesh.ts   # Articulated humanoid rig & weapon visuals
    │   └── Player.ts          # Protagonist state, movement, combat & special abilities
    ├── gameplay/
    │   ├── MissionSystem.ts   # 4 multi-stage Story Missions, markers & timers
    │   └── PoliceSystem.ts    # 1–5 star LSPD wanted dispatch, pursuit & evasion
    └── ui/
        ├── Minimap.ts         # Rotating 2D radar, GPS route & interactive Pause Map
        └── UIManager.ts       # HUD, Radio deck, iFruit phone, shops & menu navigation
```

---

## Performance & Troubleshooting

* **Low Frame Rate on Integrated GPUs:** Open **SETTINGS → Shadow & Render Quality** and switch from `Ultra (2048 Shadows)` to `Performance (1024)`. Ensure browser **Hardware Acceleration** is enabled.
* **No Sound on Startup:** Browsers pause Web Audio until the first user click, key press, or gamepad button press. Interact once with the Title Screen or viewport, and check **Master Volume** and **Soundtrack Volume** in **Settings**.
* **Gamepad Not Responding:** Press any face button (`A` / `✕`) while the browser window is focused—browsers hide connected gamepads for privacy until a button is pressed. Check **Pause → CONTROLS → Gamepad** to confirm live detection.
* **Mouse Cursor Won't Lock:** Click directly on the 3D canvas while in active gameplay (close any open Pause Menu, shop drawer, or iFruit phone first).
* **Windows: `Cannot find module @rollup/rollup-win32-x64-msvc` (or esbuild install scripts blocked):** This is a known npm optional-dependency bug (`npm/cli#4828`) — the committed `package-lock.json` was generated on Linux, so Windows native binaries for Rollup/esbuild are skipped on first install. Fix in PowerShell:
  ```powershell
  Remove-Item -Recurse -Force node_modules, package-lock.json
  npm install
  npm run dev
  ```
  Or, without deleting the lockfile:
  ```powershell
  npm install @rollup/rollup-win32-x64-msvc --no-save
  npm rebuild esbuild
  npm run dev
  ```
  The repo now declares `"trustedDependencies": ["esbuild"]` so npm allows the esbuild postinstall script. If you hit repeated native-binary issues on Windows, use the Docker path (`docker compose up --build`) instead — it runs entirely in Linux containers and avoids this class of bug.
