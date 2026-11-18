# Grand Theft Auto V — Los Santos (3D Browser Clone)

A real-time 3D browser recreation of **Grand Theft Auto V** set in sun-drenched **Los Santos**, built with **Three.js**, **TypeScript**, **Vite**, custom GLSL atmospheric & ocean shaders, procedural PBR textures, and a synthesized Web Audio engine.

## Highlights

- **Open-World Los Santos**: Downtown skyline (Maze Bank Tower with rooftop helipad, FIB & IAA Twin Towers, Pillbox Hill Medical, Union Depository), Legion Square, Rockford Hills, Eclipse Towers, Vinewood Blvd Walk of Fame, sculpted Vinewood Hills with the 3D **VINEWOOD** sign & Galileo Observatory, Vespucci Beach, and Del Perro Pier with a rotating illuminated Ferris Wheel.
- **Dynamic Graphics & Atmosphere**: Custom GLSL California sky dome & dynamic day/sunset/night cycle, animated Pacific Ocean surf & foam, ACES Filmic tone mapping, California PMREM reflections, soft directional shadows, subtle HDR bloom, automotive clearcoat paint, dusk headlight beams, and glowing night skyscrapers.
- **3 Playable Protagonists**: Switch between **Franklin**, **Michael**, and **Trevor** with the signature GTA V multi-step satellite sky-zoom camera and unique Special Abilities (*Driving Focus*, *Bullet Time*, *Red Mist*).
- **Vehicles & Flight**: Drive the Pegassi Zentorno, Bravado Gauntlet, Obey Tailgater, Benefactor Dubsta, LSPD Cruiser, Pegassi Bati 801 sportbike, and fly the Buckingham Maverick helicopter across Los Santos — with handbrake drifting, tire smoke, skid marks, turbo boost, and cinematic Stunt Jumps.
- **Story Missions, LSPD & Shops**: 4 multi-stage Story Missions (`F`, `S`, `L`, `M`) with street-snapped GPS routing, a 1–5 star LSPD pursuit & evasion system, **Los Santos Customs** (repair, twin-turbo, metallic respray, neon underglow), **Ammu-Nation**, 4 synthesized Los Santos radio stations, and an interactive **iFruit** phone.
- **Clean GTA V UI**: Minimalist rectangular radar with integrated Health / Armor / Special Ability bars, interactive full-city Pause Map with click-to-set purple GPS waypoints, radial Weapon & Radio wheels, contextual prompts, and ephemeral street/vehicle callouts.
- **Stonebwoy & Kweku Smoke Soundtrack**: 9 selected anthems across 3 stations — **Gold Coast FM** (alternating all 9 songs), **BHIM Nation 101.9** (*People Dey*, *Run Go*, *Send Dem a Prayer*, *Hero*, *Jejereje* by **Stonebwoy**), and **Scatter Der 96.5** (*Sober*, *Faith*, *Survivor*, *Hallelujah* by **Kweku Smoke**). Plays out of the box with tempo- and key-matched Reggae one-drop, Dancehall, Afro-Highlife, Gospel Trap, and GH Drill Web Audio instrumentals — plus one-click **`+ Import MP3s`** (via Title **Radio**, Pause **Radio**, or **iFruit Music**) and `public/music/manifest.json` support to stream your own original audio files.
- **Full Gamepad Support**: Plug-and-play W3C Gamepad API integration for Xbox, PlayStation (DualSense / DualShock), and standard controllers — with analog stick/trigger physics, automatic Xbox/PlayStation HUD button glyphs, `dual-rumble` haptic feedback, radial-wheel stick selection, interactive Pause Map crosshair cursor, full Title/Pause/Phone/Shop/Radio navigation, and tunable Sensitivity / Deadzone / Vibration settings.

## Controls

| Action | Keyboard / Mouse | Gamepad (Xbox / PlayStation) |
| --- | --- | --- |
| Move / Steer | `W` `A` `S` `D` | `Left Stick` (analog) |
| Camera Look | `Mouse` | `Right Stick` (analog) |
| Sprint (On Foot) | `Shift` | Hold `A` / `✕` |
| Jump (On Foot) | `Space` | `X` / `□` |
| Aim / Fire | `Right Click` / `Left Click` | `LT` / `RT` (`L2` / `R2`) |
| Reload | `R` | `B` / `○` |
| Enter / Exit Vehicle | `F` or `E` | `Y` / `△` |
| Shop / Mission Interact | `E` | `D-Pad Right` |
| Accelerate / Brake & Reverse | `W` / `S` | `RT` / `LT` (`R2` / `L2`, analog) |
| Handbrake Drift | `Space` | `RB` (`R1`) or `A` (`✕`) |
| Vehicle Turbo Boost | `Shift` | `X` / `□` |
| Helicopter Ascend / Descend | `Space` / `Shift` | `RT` / `LT` (`R2` / `L2`) |
| Helicopter Yaw (Rudder) | `A` / `D` | `LB` / `RB` (`L1` / `R1`) or `LS` |
| Weapon Wheel / Quick Cycle | Hold `Tab` / `1`–`6` / Scroll | Hold `LB` (`L1`) + `RS` / Tap `LB` |
| Radio Wheel / Skip Song / Cycle Station | Hold `Q` / Tap `N` / Tap `R` | Hold `D-Pad Left` + `RS` / Tap `D-Pad Left` |
| Character Switch | Hold `Alt` (or `F1`–`F3`) | Hold `D-Pad Down` + `RS` |
| Special Ability | `X` or `CapsLock` | `L3 + R3` |
| Horn / Police Siren | `H` | `L3` |
| iFruit Phone | `P` or `ArrowUp` | `D-Pad Up` |
| Pause Menu & GPS Map | `M` or `Esc` (or click Radar) | `Menu` / `Options` (`Start`) |
| Cycle Camera / Look Behind | `V` / `C` | `View` / `Create` (`Select`) / `R3` |
| Menu Navigate / Confirm / Back | Mouse / `Esc` | `D-Pad` or `LS` / `A` (`✕`) / `B` (`○`) |
| Pause Tabs / Map Waypoint | Click Tabs / Click Map | `LB` `RB` / `LS` Pan + `A` Set + `X` Clear |

## Run Locally

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
npm run preview
```
