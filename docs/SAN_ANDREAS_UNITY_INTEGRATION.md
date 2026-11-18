# SanAndreasUnity — Clone & "GTA V on it" Assessment

## What was cloned

The complete [SanAndreasUnity](https://github.com/in0finite/SanAndreasUnity) source now lives in
`external/SanAndreasUnity/` (gitignored, so this repo's history stays clean):

| | |
| --- | --- |
| **Engine** | Unity `2020.3.26f1` (from `ProjectSettings/ProjectVersion.txt`) |
| **Size** | ~73 MB · 1,823 files · 630 C# scripts |
| **License** | MIT (free to modify & redistribute the code itself) |
| **Submodules** | All 5 included: MirrorLite (multiplayer), UnityStandardAssets, NavMeshes (52 MB baked navmesh zip), NetworkDiscoveryUnity, UGameCoreUtilities |

**Systems included:** runtime GTA SA asset importers (`Scripts/Importing/` — IMG archives,
DFF models, TXD textures, COL collisions, IFP animations), Ped + Ped AI, NPC spawning,
pathfinding, vehicles, weapons, ragdoll builder, minimap, full Mirror-based multiplayer
(PedSync/VehicleSync), and a plugin/game-mode framework.

## How to build & run it (your Windows machine)

> ⚠️ The cloud sandbox has **no Unity Editor or .NET toolchain**, so the Unity project cannot be
> compiled here — this must be done locally. One-time Unity Hub install, ~10 minutes.

1. Install **Unity Hub** → <https://unity.com/download>, then inside Hub install
   **Unity 2020.3.26f1 (LTS)** with the *Windows Build Support* module.
2. Open Unity Hub → *Add* → select `external/SanAndreasUnity` → open with **2020.3.26f1**.
   Let it import (a few minutes on first open).
3. You also need a legal copy of **GTA: San Andreas** (Steam or Rockstar) — the engine asks for
   the install path on first run because it loads SA assets at runtime.
4. Open the scene `Assets/Scenes/Startup.unity` and press **Play**.
5. To ship a standalone build: `File → Build Settings → Windows → Build`.

## Can GTA V be built on it? The honest answer

**Not by swapping in GTA V assets — that is a fundamental incompatibility, not a porting job:**

1. **Asset formats.** SanAndreasUnity's entire pipeline (`Scripts/Importing/`) parses
   GTA SA's RenderWare formats (`.img` archives, `.dff` models, `.txd` textures, `.col`
   collisions, `.ifp` animations). GTA V uses RAGE engine formats (`.rpf7` archives,
   `.ydr/.ydd/.yft` drawables, `.ytd` textures) with a completely different model, skeleton
   and material system. None of that is implemented in SAU.
2. **Legal reality.** Rockstar's GTA V assets are proprietary. They can never be committed to
   an open-source repo — any "GTA V asset" route requires you to own GTA V on PC and stay
   strictly personal-use (this is exactly why FiveM requires a legit GTA V install).
3. **Scale.** SAU re-implements SA's engine on top of Unity. A true "GTA V on Unity" would
   mean re-implementing RAGE's pipeline on top of it — a multi-year project, not a clone-and-build.

**What "GTA V on SanAndreasUnity" CAN realistically mean:**

| Path | Description |
| --- | --- |
| **A. V-style gameplay on the SA engine** *(most practical)* | Run SAU with SA assets and implement GTA V *features* on its plugin framework: character-switch wheel, cover system, smart-camera, phone UI, heist missions. The codebase is explicitly built for this (C# DLL plugins / game modes). |
| **B. Keep growing this repo's browser clone** | The web game in this repo already is a GTA V-style engine (Three.js) with zero asset requirements — nothing to license, runs in a browser tab. Feature parity keeps improving (missions, 10 vehicle types, AI dialogue, engine audio). |
| **C. True GTA V modding** | Lives in FiveM / RAGE Plugin Hook — requires owning GTA V, closed ecosystem, and cannot be built or distributed from this repo. |

## Where the code lives here

```
external/SanAndreasUnity/          ← full Unity project (gitignored)
├── Assets/Scripts/GameModes/GtaVMod/  ← ✅ GTA V plugin (installed & ready)
├── Assets/Scripts/Behaviours/     ← gameplay: Ped, PedAI, vehicles, NPC spawner, minimap
├── Assets/Scripts/Importing/      ← GTA SA asset parsers (IMG/DFF/TXD/COL/IFP)
├── Assets/Scripts/Networking/     ← Mirror multiplayer sync (PedSync, VehicleSync)
├── Assets/Scenes/Startup.unity    ← entry scene
├── Docs/                          ← upstream dev notes (Map.md, Multiplayer.md, weapons.md)
└── ProjectSettings/ProjectVersion.txt
```

## ✅ Path A is implemented — `sau-gtav-plugin/`

The GTA V plugin lives in the tracked folder **`sau-gtav-plugin/`** (5 C# files + README) and a
copy is already installed at `external/SanAndreasUnity/Assets/Scripts/GameModes/GtaVMod/`. Open
the Unity project and play — no extra wiring needed. Every file uses SAU's verified real APIs
(`Ped.SpawnPed`, `Vehicle.CreateInFrontOf`, `/skin` command pipeline, `PauseMenuWindow`,
`GameModeManager.RegisterGameMode`, `DayTimeManager.SetTime`).

Includes: V-style 3-protagonist character switch (T key), iFruit phone window (mechanic
delivery, missions, clock, stats), a data-driven mission framework with world markers,
timers & rewards, and a persistent GTA V HUD (cash/objectives/banners).

If you decide to go down Path A, say the word and I'll draft the concrete plugin architecture
(character switch + V-style phone + mission framework) as C# classes ready to drop into
`Assets/Scripts/GameModes/`.
