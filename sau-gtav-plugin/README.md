# GTA V Plugin for SanAndreasUnity (Path A)

GTA V-style **features** implemented on SanAndreasUnity's plugin framework — no RAGE assets,
pure gameplay code that runs on the SA engine you already legally own.

## What it adds

| Feature | File | How it works |
| --- | --- | --- |
| **Character Switch** | `CharacterSwitchManager.cs` | V-style 3-protagonist wheel: press `T` (or use the Phone) to swap your current ped's model between 3 configured SA models, each with its own spawn position, name & signature vehicle. Ambient NPC versions of the other protagonists hang around town. |
| **iFruit Phone** | `PhoneWindow.cs` | Pause-menu phone with Contacts (mechanic: any SA vehicle delivered in front of you), Missions (start/abort), Clock (set SA time like V's phone) and Stats. |
| **Mission Framework** | `MissionFramework.cs` | Data-driven `MissionDef` → staged objectives (`GoTo`, `EnterVehicle`, `EscapePolice`-ready) with world markers, on-screen objective HUD, timers, cash rewards & mission-passed banner. Ships with 3 sample missions. |
| **GTA V HUD** | `GtaVHud.cs` | Persistent money counter, current character name, and active objective bar in V's typography & colors. |

All code uses SAU's **real** APIs (`Ped.SpawnPed`, `VehicleSpawner.CreateInFrontOf`,
`PauseMenuWindow`, `GameModeManager.RegisterGameMode`, the `/skin` command pipeline), so it
compiles inside the Unity project with zero external dependencies.

## Install (2 minutes)

1. Copy this whole folder into the Unity project:
   `external/SanAndreasUnity/Assets/Scripts/GameModes/GtaVMod/`
   (a copy is already placed there if you cloned this repo to the same machine).
2. Open the project in Unity 2020.3.26f1 and let it import — Unity auto-generates `.meta` files.
3. Play. Open **Pause Menu → GTA V** to configure protagonist model IDs and start missions,
   or press **T** in-game to character-switch.

> **Protagonist model IDs** default to CJ (`0`) plus two classic SA models. Every SA ped ID works —
> browse them in Pause Menu → Peds and paste the IDs you want into the GTA V window.

## Build a standalone game

Unity → `File → Build Settings → Windows Build Support → Build`. The mod ships inside the player
because it lives under `Assets/Scripts/` (regular runtime code, not an external DLL).

## Architecture notes

- `GtaVGameMode` is a `StartupSingleton` registered with SAU's `GameModeManager` so it activates
  like any built-in game mode on server start (works in multiplayer too — spawns/commands are
  networked by SAU's own sync code).
- Missions are pure C# data (`MissionDef`), so new missions = new `MissionDef` entries, no scene edits.
- Money is tracked per-session in `GtaVState` (SAU has no native money stat) and shown by the HUD.

## Roadmap (natural next steps on this engine)

- Wanted-level integration using SAU's police NPC spawner (`/enemy`, `PedAI.SpawnPedStalker`)
- Vehicle-boost mechanic via `Vehicle` component fields
- Weapon loadout per protagonist (`Ped_Weapons` API)
- Checkpoint race mode on top of the same `MissionDef` staging
