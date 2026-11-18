import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import './style.css';
import {
  CharacterId,
  CHARACTER_PROFILES,
  GameMode,
  GameSettings,
  RADIO_STATIONS,
  StuntRamp,
  TimePreset,
  VehicleKind,
  WEAPON_SPECS,
} from './types';
import { InputManager } from './core/InputManager';
import { GP, GamepadManager } from './core/GamepadManager';
import { AudioEngine } from './core/AudioEngine';
import { CameraController } from './core/CameraController';
import { TextureFactory } from './graphics/TextureFactory';
import { SkyAndOcean } from './graphics/SkyAndOcean';
import { EffectsManager } from './graphics/EffectsManager';
import {
  createDefaultStuntRamps,
  sampleBaseTerrainHeight,
} from './world/WorldData';
import { CityBuilder } from './world/CityBuilder';
import { TrafficAndPeds } from './world/TrafficAndPeds';
import { VehicleFactory } from './entities/VehicleFactory';
import { Vehicle } from './entities/Vehicle';
import { Player } from './entities/Player';
import { PoliceSystem } from './gameplay/PoliceSystem';
import { MissionSystem } from './gameplay/MissionSystem';
import { Minimap } from './ui/Minimap';
import { UIManager } from './ui/UIManager';

class GTAVGame {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private scene: THREE.Scene;

  private settings: GameSettings = {
    mouseSensitivity: 1.0,
    gamepadSensitivity: 1.15,
    gamepadDeadzone: 0.14,
    gamepadVibration: true,
    masterVolume: 0.65,
    musicVolume: 0.45,
    sfxVolume: 0.75,
    invertY: false,
    autoTimeCycle: true,
    showSpeedometer: true,
    graphicsQuality: 'high',
  };

  private mode: GameMode = 'title';
  private input: InputManager;
  private gamepad: GamepadManager;
  private audio: AudioEngine;
  private cameraCtrl: CameraController;
  private textures: TextureFactory;
  private sky: SkyAndOcean;
  private effects: EffectsManager;
  private ramps: StuntRamp[];
  private city: CityBuilder;
  private vehicleFactory: VehicleFactory;
  private traffic: TrafficAndPeds;
  private player: Player;
  private police: PoliceSystem;
  private missions: MissionSystem;
  private minimap: Minimap;
  private ui: UIManager;

  private lastTime = performance.now();
  private wastedTimer = 0;
  private lastPlayerHealth = 100;

  constructor() {
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();

    this.input = new InputManager(this.canvas);
    this.audio = new AudioEngine();
    this.gamepad = new GamepadManager((connected, label) => {
      if (this.ui) {
        this.ui.refreshControlsPanels();
        this.ui.showHelpToast(
          connected ? `<b>${label}</b> connected.` : `<b>${label}</b> disconnected.`,
          3.4
        );
      }
      if (connected) {
        this.gamepad.rumble(0.28, 0.16, 120);
      }
    });
    this.gamepad.deadzone = this.settings.gamepadDeadzone;
    this.gamepad.vibrationEnabled = this.settings.gamepadVibration;
    this.input.onKeyboardOrMouse = () => this.gamepad.markKeyboardOrMouseUsed();
    this.cameraCtrl = new CameraController(window.innerWidth / window.innerHeight);
    this.textures = new TextureFactory(this.renderer);
    this.sky = new SkyAndOcean(this.scene, this.renderer, true);
    this.setupPostProcessing();
    this.effects = new EffectsManager(this.scene);
    this.ramps = createDefaultStuntRamps();
    this.city = new CityBuilder(this.scene, this.textures, this.ramps);
    this.vehicleFactory = new VehicleFactory(this.textures);
    this.traffic = new TrafficAndPeds(this.scene, this.vehicleFactory);
    this.player = new Player(this.scene);
    this.police = new PoliceSystem(this.scene, this.vehicleFactory, this.traffic);
    this.missions = new MissionSystem(this.scene, this.traffic, this.police, this.audio);

    this.minimap = new Minimap(
      document.getElementById('radar-canvas') as HTMLCanvasElement,
      document.getElementById('pause-map-canvas') as HTMLCanvasElement,
      this.city.footprints,
      () => {
        this.audio.playUiClick(680);
        this.minimap.renderFullPauseMap(this.player, this.missions);
      }
    );

    this.ui = new UIManager(this.canvas, this.settings, this.audio, this.gamepad, {
      onStartGame: () => this.startStoryMode(),
      onOpenPauseMap: () => {
        if (this.mode === 'playing') {
          this.ui.selectPauseTab('map');
          this.setMode('paused', false);
        }
      },
      onResumeGame: () => this.setMode('playing', true),
      onSwitchCharacter: (id) => this.triggerCharacterSwitch(id),
      onDeliverVehicle: (kind) => this.deliverVehicleToPlayer(kind),
      onSetWaypoint: (x, z, label) => {
        this.minimap.customWaypoint = { x, z };
        this.minimap.renderFullPauseMap(this.player, this.missions);
        this.ui.showHelpToast(`GPS route set to <b>${label}</b>.`);
      },
      onClearWaypoint: () => {
        this.minimap.customWaypoint = null;
        this.minimap.renderFullPauseMap(this.player, this.missions);
      },
      onSetTimePreset: (preset: TimePreset) => {
        this.sky.setTimePreset(preset);
      },
      onClearWantedPaid: () => {
        if (this.police.wantedLevel > 0) {
          if (this.player.cash >= 500) {
            this.player.cash -= 500;
            this.ui.showCashDelta(-500);
          }
          this.police.clearWanted();
          this.ui.showHelpToast('Lester called off the LSPD pursuit.');
        } else {
          this.police.clearWanted();
        }
      },
      onTriggerPursuit: () => {
        this.police.reportCrime(85, 3);
        this.ui.showHelpToast('LSPD units dispatched to your location.');
      },
      onCloseShop: () => this.setMode('playing', true),
      onSettingsChanged: (s) => this.applySettings(s),
      onAbortMission: () => {
        this.missions.abortMission();
      },
    });

    window.addEventListener('resize', () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.renderer.setSize(w, h);
      this.cameraCtrl.resize(w, h);
      if (this.composer) {
        this.composer.setSize(w, h);
      }
    });

    // Expose safe read-only state hook for inspection/debugging
    (window as unknown as Record<string, unknown>).__gtav = this;

    requestAnimationFrame((t) => this.loop(t));
  }

  private setupPostProcessing(): void {
    try {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const rt = new THREE.WebGLRenderTarget(w, h, {
        type: THREE.HalfFloatType,
        samples: 4,
      });
      const composer = new EffectComposer(this.renderer, rt);
      composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      composer.setSize(w, h);

      const renderPass = new RenderPass(this.scene, this.cameraCtrl.camera);
      const bloom = new UnrealBloomPass(
        new THREE.Vector2(Math.floor(w * 0.5), Math.floor(h * 0.5)),
        0.24,
        0.42,
        0.92
      );
      const outputPass = new OutputPass();

      composer.addPass(renderPass);
      composer.addPass(bloom);
      composer.addPass(outputPass);

      this.composer = composer;
      this.bloomPass = bloom;
    } catch {
      this.composer = null;
      this.bloomPass = null;
    }
  }

  private applySettings(s: GameSettings): void {
    this.audio.setVolumes(s.masterVolume, s.musicVolume, s.sfxVolume);
    this.gamepad.deadzone = s.gamepadDeadzone;
    this.gamepad.vibrationEnabled = s.gamepadVibration;
    const high = s.graphicsQuality === 'high';
    this.sky.setQuality(high);
    const dpr = high ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    this.renderer.setPixelRatio(dpr);
    if (this.composer) {
      this.composer.setPixelRatio(dpr);
      this.composer.setSize(window.innerWidth, window.innerHeight);
    }
    if (this.bloomPass) {
      this.bloomPass.enabled = high;
    }
  }

  private startStoryMode(): void {
    this.setMode('playing', !this.gamepad.usingGamepad);
    this.cameraCtrl.triggerIntroDrop(this.player);
    this.ui.triggerAreaReadout('', this.player.pos.x, this.player.pos.z);
    const enterGlyph = this.gamepad.usingGamepad
      ? this.gamepad.badge('north')
      : '<span class="keycap">F</span>';
    const mapGlyph = this.gamepad.usingGamepad
      ? this.gamepad.badge('start')
      : '<span class="keycap">M</span>';
    this.ui.showHelpToast(
      `Walk to the <b style="color:#fff">Pegassi Zentorno</b> and press ${enterGlyph} to drive, or ${mapGlyph} for Map.`,
      5.5
    );
  }

  private setMode(next: GameMode, lockPointer = false): void {
    this.mode = next;
    const gameplay = next === 'playing';
    this.input.allowPointerLock = gameplay;
    this.input.overlayBlocking = !gameplay;
    if (lockPointer && gameplay && !this.gamepad.usingGamepad) {
      this.input.requestLock();
    } else if (!gameplay) {
      this.input.exitLock();
    }
    this.ui.setMode(next, this.player, this.missions, this.minimap, this.sky.timeOfDay);
  }

  private triggerCharacterSwitch(targetId: CharacterId): void {
    if (targetId === this.player.characterId || this.cameraCtrl.isSwitching()) return;
    if (this.mode !== 'playing') return;

    const from = this.player.pos.clone();
    const targetSpot = this.player.savedSpots[targetId];
    this.setMode('switching', false);

    this.cameraCtrl.startCharacterSwitch(
      from,
      targetSpot.pos,
      targetSpot.heading,
      () => {
        this.player.switchCharacterModel(targetId);
        this.lastPlayerHealth = this.player.health;
      },
      () => {
        this.audio.playSwitchPulse();
        this.ui.triggerWhitePulse();
        this.gamepad.rumble(0.35, 0.65, 130);
      },
      () => {
        this.setMode('playing', true);
        const prof = CHARACTER_PROFILES[targetId];
        this.ui.triggerAreaReadout(prof.fullName, this.player.pos.x, this.player.pos.z);
      }
    );
  }

  private deliverVehicleToPlayer(kind: VehicleKind): void {
    const yaw = this.cameraCtrl.yaw;
    const fwdX = -Math.sin(yaw);
    const fwdZ = -Math.cos(yaw);
    const dist = kind === 'helicopter' ? 10.5 : 6.5;
    const sx = this.player.pos.x + fwdX * dist;
    const sz = this.player.pos.z + fwdZ * dist;
    const sy = Math.max(this.player.pos.y, sampleBaseTerrainHeight(sx, sz));
    const v = this.traffic.spawnParkedVehicle(kind, sx, sy, sz, Math.atan2(-fwdZ, fwdX));
    this.ui.showHelpToast(
      `Your <b>${v.spec.brand} ${v.spec.name}</b> has been delivered nearby.`
    );
  }

  private handleVehicleExplosion(v: Vehicle): void {
    const distToPlayer = v.pos.distanceTo(this.player.pos);
    this.audio.playExplosion(distToPlayer);
    if (distToPlayer < 45) {
      const shock = Math.max(0.25, 1 - distToPlayer / 45);
      this.cameraCtrl.addShake(shock);
      this.gamepad.rumble(shock * 0.85, shock, 520);
    }

    // Blast damage to player, nearby pedestrians & chain-reaction vehicles!
    if (this.player.currentVehicle === v) {
      this.player.exitVehicle();
      this.player.takeDamage(140);
    } else if (distToPlayer < 11) {
      this.player.takeDamage((1 - distToPlayer / 11) * 95);
    }

    for (const ped of this.traffic.peds) {
      if (ped.dead) continue;
      const d = ped.pos.distanceTo(v.pos);
      if (d < 12) {
        this.traffic.damagePed(ped, 160, this.effects);
      }
    }
    this.traffic.alertNearbyPeds(v.pos, 75);

    // Chain-reaction damage to adjacent vehicles
    for (const other of this.traffic.vehicles) {
      if (other === v || other.destroyed) continue;
      const d = other.pos.distanceTo(v.pos);
      if (d < 10) {
        other.applyDamage((1 - d / 10) * 650, this.effects, (ov) =>
          this.handleVehicleExplosion(ov)
        );
      }
    }

    if (distToPlayer < 70) {
      this.police.reportCrime(45, 2);
    }
  }

  private triggerWorldExplosion(pos: THREE.Vector3): void {
    this.effects.spawnExplosion(pos);
    const dPlayer = pos.distanceTo(this.player.pos);
    this.audio.playExplosion(dPlayer);
    if (dPlayer < 50) {
      const shock = Math.max(0.3, 1.1 - dPlayer / 50);
      this.cameraCtrl.addShake(shock);
      this.gamepad.rumble(shock * 0.9, Math.min(1, shock), 560);
    }
    if (dPlayer < 10) {
      this.player.takeDamage((1 - dPlayer / 10) * 85);
    }
    for (const ped of this.traffic.peds) {
      if (!ped.dead && ped.pos.distanceTo(pos) < 12.5) {
        this.traffic.damagePed(ped, 180, this.effects, (k) => {
          this.police.reportCrime(k.isOfficer ? 38 : 20, k.isOfficer ? 3 : 1);
        });
      }
    }
    for (const v of this.traffic.vehicles) {
      if (!v.destroyed && v.pos.distanceTo(pos) < 12) {
        v.applyDamage(900, this.effects, (ev) => this.handleVehicleExplosion(ev));
      }
    }
    for (const ex of this.city.explodables) {
      if (!ex.exploded && ex.pos.distanceTo(pos) < 9) {
        ex.exploded = true;
        ex.mesh.visible = false;
        this.effects.spawnExplosion(ex.pos);
      }
    }
    this.traffic.alertNearbyPeds(pos, 80);
    this.police.reportCrime(50, 2);
  }

  private performPlayerAttack(): void {
    if (this.player.fireCooldown > 0 || this.player.reloadTimer > 0) return;

    const spec = this.player.getWeaponSpec();
    const slot = this.player.weapons[spec.id];
    const dmgMultiplier =
      this.player.specialActive && this.player.characterId === 'trevor' ? 2.4 : 1.0;

    if (spec.id === 'unarmed') {
      this.player.fireCooldown = 1 / spec.fireRate;
      this.player.rig.triggerAttack();
      this.audio.playWeaponSound('unarmed');

      const fwd = new THREE.Vector3(Math.sin(this.player.heading), 0, Math.cos(this.player.heading));
      for (const ped of this.traffic.peds) {
        if (ped.dead) continue;
        const toPed = ped.pos.clone().sub(this.player.pos);
        if (toPed.length() < spec.range && toPed.normalize().dot(fwd) > 0.35) {
          this.traffic.damagePed(ped, spec.damage * dmgMultiplier, this.effects, (k) => {
            this.police.reportCrime(k.isOfficer ? 35 : 14, k.isOfficer ? 2 : 1);
          });
          this.ui.triggerHitMarker();
          this.traffic.alertNearbyPeds(this.player.pos, 26);
          break;
        }
      }
      return;
    }

    // Firearm ammo check
    if (slot.inMag <= 0) {
      this.player.startReload();
      return;
    }

    slot.inMag--;
    this.player.fireCooldown = 1 / spec.fireRate;
    this.player.rig.triggerAttack();
    this.audio.playWeaponSound(spec.id);
    const heavy = spec.id === 'shotgun' || spec.id === 'rpg';
    this.cameraCtrl.addShake(heavy ? 0.22 : 0.06);
    this.gamepad.rumble(
      heavy ? 0.72 : spec.id === 'smg' ? 0.28 : 0.42,
      heavy ? 0.95 : spec.id === 'rifle' ? 0.45 : 0.24,
      heavy ? 210 : 75
    );

    // Rotate character smoothly toward camera aim line when firing
    const aim = this.cameraCtrl.getAimRay();
    this.player.heading = Math.atan2(aim.dir.x, aim.dir.z);
    const muzzle = this.player.rig.getMuzzleWorldPos();
    this.effects.spawnMuzzleFlash(muzzle);

    // Alert Los Santos locals & LSPD
    this.traffic.alertNearbyPeds(this.player.pos, 58);
    if (Math.random() < 0.45) {
      this.police.reportCrime(8, 1);
    }

    // RPG Rocket launcher
    if (spec.projectile) {
      this.effects.spawnRocket(muzzle, aim.dir);
      if (slot.inMag === 0 && slot.reserve > 0) this.player.startReload();
      return;
    }

    // Hitscan pellets (1 for pistol/smg/rifle, 7 for pump shotgun)
    for (let p = 0; p < spec.pellets; p++) {
      const dir = aim.dir.clone();
      const spreadScale = this.player.isAiming ? 0.55 : 1.0;
      dir.x += (Math.random() - 0.5) * spec.spread * spreadScale;
      dir.y += (Math.random() - 0.5) * spec.spread * spreadScale;
      dir.z += (Math.random() - 0.5) * spec.spread * spreadScale;
      dir.normalize();

      this.castBullet(aim.origin, muzzle, dir, spec.range, spec.damage * dmgMultiplier);
    }

    if (slot.inMag === 0 && slot.reserve > 0) {
      this.player.startReload();
    }
  }

  private castBullet(
    rayOrigin: THREE.Vector3,
    muzzle: THREE.Vector3,
    dir: THREE.Vector3,
    maxRange: number,
    damage: number
  ): void {
    let bestT = maxRange;
    let hitType: 'none' | 'world' | 'ped' | 'vehicle' | 'explodable' = 'none';
    let hitPed: (typeof this.traffic.peds)[number] | null = null;
    let hitVeh: Vehicle | null = null;
    let hitExp: (typeof this.city.explodables)[number] | null = null;

    // Ground intersection
    if (dir.y < -0.01) {
      const tg = (this.player.pos.y - rayOrigin.y) / dir.y;
      if (tg > 2 && tg < bestT) {
        bestT = tg;
        hitType = 'world';
      }
    }

    // Building AABB slab intersection
    for (const b of this.city.colliders) {
      const t = intersectRayAABB(rayOrigin, dir, b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ);
      if (t !== null && t > 2 && t < bestT) {
        bestT = t;
        hitType = 'world';
      }
    }

    // Pedestrians & LSPD Officers (sphere/capsule center at y + 1.05)
    for (const ped of this.traffic.peds) {
      if (ped.dead) continue;
      const center = new THREE.Vector3(ped.pos.x, ped.pos.y + 1.05, ped.pos.z);
      const t = intersectRaySphere(rayOrigin, dir, center, 0.68);
      if (t !== null && t > 2 && t < bestT) {
        bestT = t;
        hitType = 'ped';
        hitPed = ped;
      }
    }

    // Vehicles
    for (const v of this.traffic.vehicles) {
      if (v === this.player.currentVehicle) continue;
      const center = new THREE.Vector3(v.pos.x, v.pos.y + 0.85, v.pos.z);
      const t = intersectRaySphere(rayOrigin, dir, center, v.spec.halfLength * 0.82);
      if (t !== null && t > 2.5 && t < bestT) {
        bestT = t;
        hitType = 'vehicle';
        hitVeh = v;
      }
    }

    // Explodable LTD Gasoline pumps!
    for (const ex of this.city.explodables) {
      if (ex.exploded) continue;
      const t = intersectRaySphere(rayOrigin, dir, ex.pos, ex.radius);
      if (t !== null && t > 2 && t < bestT) {
        bestT = t;
        hitType = 'explodable';
        hitExp = ex;
      }
    }

    const hitPos = rayOrigin.clone().addScaledVector(dir, bestT);
    this.effects.spawnTracer(muzzle, hitPos);

    if (hitType === 'world') {
      this.effects.spawnImpact(hitPos, false);
    } else if (hitType === 'ped' && hitPed) {
      this.ui.triggerHitMarker();
      this.traffic.damagePed(hitPed, damage, this.effects, (k) => {
        this.police.reportCrime(k.isOfficer ? 38 : 18, k.isOfficer ? 3 : 1);
      });
    } else if (hitType === 'vehicle' && hitVeh) {
      this.ui.triggerHitMarker();
      this.effects.spawnImpact(hitPos, false);
      hitVeh.applyDamage(damage * 2.8, this.effects, (ev) => this.handleVehicleExplosion(ev));
      if (hitVeh.isPoliceUnit) this.police.reportCrime(22, 2);
    } else if (hitType === 'explodable' && hitExp) {
      hitExp.exploded = true;
      hitExp.mesh.visible = false;
      this.ui.triggerHitMarker();
      this.triggerWorldExplosion(hitExp.pos);
    }
  }

  private loop(now: number): void {
    requestAnimationFrame((t) => this.loop(t));

    const realDt = Math.min(0.05, Math.max(0.001, (now - this.lastTime) / 1000));
    this.lastTime = now;

    // Poll standard W3C Gamepad state first every frame
    this.gamepad.poll(realDt);

    // Pause / Resume / Modal navigation (Keyboard + Gamepad)
    if (this.mode === 'playing') {
      if (
        this.input.wasPressed('KeyM') ||
        this.input.wasPressed('Escape') ||
        this.gamepad.wasPressed(GP.START)
      ) {
        if (this.ui.phoneOpen) {
          this.ui.togglePhone(false);
          this.input.overlayBlocking = false;
          if (!this.gamepad.usingGamepad) this.input.requestLock();
        } else {
          this.ui.selectPauseTab('map');
          this.setMode('paused', false);
        }
      }
    } else if (this.mode === 'paused') {
      if (this.input.wasPressed('KeyM') || this.input.wasPressed('Escape')) {
        this.setMode('playing', true);
      } else {
        this.ui.handlePauseGamepad(realDt, this.player, this.missions, this.minimap);
      }
    } else if (this.mode === 'lscustoms' || this.mode === 'ammunation') {
      if (this.input.wasPressed('Escape')) {
        this.setMode('playing', true);
      } else {
        this.ui.handleShopGamepad();
      }
    } else if (this.mode === 'title') {
      if (this.input.wasPressed('Enter')) {
        this.audio.unlock();
        this.startStoryMode();
      } else {
        this.ui.handleTitleGamepad();
      }
    }

    // Compute GTA V dynamic time dilation (Weapon Wheel, Special Ability, Stunt Jump, Wasted!)
    let timeScale = 1.0;
    if (this.mode === 'paused') {
      timeScale = 0.0;
    } else if (this.mode === 'wasted') {
      timeScale = 0.25;
    } else if (this.mode === 'playing') {
      if (this.ui.weaponWheelOpen || this.ui.radioWheelOpen) {
        timeScale = 0.22;
      } else if (this.cameraCtrl.stuntTimer > 0) {
        timeScale = 0.48;
      } else if (
        this.player.specialActive &&
        (this.player.characterId === 'franklin' || this.player.characterId === 'michael')
      ) {
        timeScale = 0.44;
      }
    }

    const simDt = realDt * timeScale;
    let contextPrompt: string | null = null;

    // Active Gameplay Input & Simulation
    if (this.mode === 'playing') {
      contextPrompt = this.updateGameplay(realDt, simDt);
    } else if (this.mode === 'title') {
      // Keep live Los Santos traffic, pedestrians, palms, ocean & Ferris Wheel bustling on Title Screen!
      const titleFocus = new THREE.Vector3(-20, 0, -20);
      this.sky.update(realDt, titleFocus, false);
      this.city.update(realDt, this.sky.nightFactor);
      this.traffic.update(
        realDt,
        titleFocus,
        null,
        this.city.colliders,
        this.ramps,
        this.effects,
        this.sky.nightFactor,
        {
          onPlayerCollision: () => {},
          onPedKilledByPlayer: () => {},
          onVehicleExplode: () => {},
        }
      );
      this.cameraCtrl.update(realDt, this.mode, this.player, this.city.colliders, false);
    } else if (this.mode === 'wasted') {
      this.wastedTimer -= realDt;
      this.sky.update(simDt, this.player.pos, false);
      this.effects.update(simDt);
      this.cameraCtrl.update(realDt, this.mode, this.player, this.city.colliders, false);
      this.audio.updateVehicleAudio(false, null, 0, 0, 0, 0, realDt, true);
      if (this.wastedTimer <= 0) {
        this.police.clearWanted();
        this.player.respawnAtHospital();
        this.lastPlayerHealth = this.player.health;
        this.setMode('playing', true);
        this.cameraCtrl.yaw = this.player.heading + Math.PI;
        this.ui.triggerAreaReadout('Discharged', this.player.pos.x, this.player.pos.z);
      }
    } else if (this.mode === 'switching' || this.mode === 'lscustoms' || this.mode === 'ammunation') {
      this.sky.update(realDt, this.player.pos, false);
      this.city.update(realDt, this.sky.nightFactor);
      this.cameraCtrl.update(realDt, this.mode, this.player, this.city.colliders, false);
      this.audio.updateVehicleAudio(false, null, 0, 0, 0, 0, realDt, true);
    } else if (this.mode === 'paused') {
      this.audio.updateVehicleAudio(false, null, 0, 0, 0, 0, realDt, true);
    }

    this.ui.updateHUD(realDt, this.mode, this.player, this.police, this.missions, contextPrompt);
    if (this.composer && this.settings.graphicsQuality === 'high') {
      // Slightly richer neon bloom during Los Santos nights!
      if (this.bloomPass) {
        this.bloomPass.strength = THREE.MathUtils.lerp(0.22, 0.42, this.sky.nightFactor);
      }
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.cameraCtrl.camera);
    }
    this.input.endFrame();
  }

  private cycleRadioStation(): void {
    const curIdx = RADIO_STATIONS.findIndex((s) => s.id === this.audio.currentStation);
    const nextSt = RADIO_STATIONS[(curIdx + 1) % RADIO_STATIONS.length];
    this.audio.currentStation = nextSt.id;
    this.audio.playUiClick(660);
    this.ui.showHelpToast(
      nextSt.id === 'off' ? 'Radio Off' : `<b>${nextSt.name}</b> — ${nextSt.track}`,
      2.4
    );
  }

  private updateGameplay(realDt: number, dt: number): string | null {
    const gp = this.gamepad;
    const isGp = gp.usingGamepad;
    const inHeli = this.player.currentVehicle?.kind === 'helicopter';

    // Unlock audio smoothly on gamepad interactions
    if (isGp && (gp.wasPressed(GP.SOUTH) || gp.wasPressed(GP.NORTH) || gp.wasPressed(GP.RT))) {
      this.audio.unlock();
    }

    // 1. iFruit Phone toggle (P, ArrowUp, or Gamepad D-Pad Up)
    if (
      this.input.wasPressed('KeyP') ||
      this.input.wasPressed('ArrowUp') ||
      (!this.ui.phoneOpen && gp.wasPressed(GP.DPAD_UP))
    ) {
      const next = !this.ui.phoneOpen;
      this.ui.togglePhone(next, this.sky.timeOfDay);
      this.input.overlayBlocking = next;
      if (next) this.input.exitLock();
      else if (!isGp) this.input.requestLock();
    } else if (this.ui.phoneOpen) {
      if (this.input.wasPressed('ArrowDown')) {
        this.ui.togglePhone(false);
        this.input.overlayBlocking = false;
        if (!isGp) this.input.requestLock();
      } else {
        this.ui.handlePhoneGamepad();
        if (!this.ui.phoneOpen) {
          this.input.overlayBlocking = false;
        }
      }
    }

    const phoneOpen = this.ui.phoneOpen;

    // 2. Radial Weapon Wheel (Hold TAB or Hold LB/L1 when not flying helicopter) + quick tap LB to cycle
    const gpWeaponHold = !inHeli && !phoneOpen && gp.isDown(GP.LB) && gp.getHoldDuration(GP.LB) > 0.16;
    const weaponWheelWant = (this.input.isDown('Tab') && !phoneOpen) || gpWeaponHold;
    if (weaponWheelWant && !this.ui.weaponWheelOpen) {
      this.input.resetRadialCursor();
      this.ui.setWeaponWheel(true, this.player);
    } else if (!weaponWheelWant && this.ui.weaponWheelOpen) {
      this.player.equipWeapon(this.ui.hoveredWeapon);
      this.ui.setWeaponWheel(false, this.player);
    }
    if (this.ui.weaponWheelOpen) {
      const rdx =
        Math.hypot(gp.rawRightX, gp.rawRightY) > 0.25 ? gp.rawRightX * 150 : this.input.radialDX;
      const rdy =
        Math.hypot(gp.rawRightX, gp.rawRightY) > 0.25 ? gp.rawRightY * 150 : this.input.radialDY;
      this.ui.updateWeaponWheelCursor(rdx, rdy, this.player);
    } else if (!inHeli && !phoneOpen && gp.wasQuickTapped(GP.LB, 0.16)) {
      this.player.cycleWeapon(1);
      this.audio.playUiClick(560);
    }

    const digitCodes = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'];
    digitCodes.forEach((code, idx) => {
      if (this.input.wasPressed(code) && !this.input.isDown('AltLeft')) {
        this.player.equipWeapon(WEAPON_SPECS[idx].id);
        this.audio.playUiClick(560);
      }
    });
    if (this.input.wheelDelta !== 0 && !phoneOpen) {
      this.player.cycleWeapon(this.input.wheelDelta > 0 ? 1 : -1);
      this.audio.playUiClick(560);
    }

    // 3. Radio Station Wheel (Hold Q or Hold D-Pad Left in vehicle; quick-tap D-Pad Left cycles)
    const inAnyVeh = !!this.player.currentVehicle;
    const gpRadioHold =
      inAnyVeh && !phoneOpen && gp.isDown(GP.DPAD_LEFT) && gp.getHoldDuration(GP.DPAD_LEFT) > 0.18;
    const radioWheelWant = (this.input.isDown('KeyQ') && inAnyVeh && !phoneOpen) || gpRadioHold;
    if (radioWheelWant && !this.ui.radioWheelOpen) {
      this.input.resetRadialCursor();
      this.ui.setRadioWheel(true);
    } else if (!radioWheelWant && this.ui.radioWheelOpen) {
      this.ui.setRadioWheel(false);
    }
    if (this.ui.radioWheelOpen) {
      const rdx =
        Math.hypot(gp.rawRightX, gp.rawRightY) > 0.25 ? gp.rawRightX * 150 : this.input.radialDX;
      const rdy =
        Math.hypot(gp.rawRightX, gp.rawRightY) > 0.25 ? gp.rawRightY * 150 : this.input.radialDY;
      this.ui.updateRadioWheelCursor(rdx, rdy);
    } else if (inAnyVeh && !phoneOpen && gp.wasQuickTapped(GP.DPAD_LEFT, 0.18)) {
      this.cycleRadioStation();
    }

    // 4. Character Switch Diamond (Hold ALT + 1/2/3, F1-F3, or Gamepad Hold D-Pad Down + Right Stick)
    const altDown = (this.input.isDown('AltLeft') || this.input.isDown('AltRight')) && !phoneOpen;
    const gpCharDown = !phoneOpen && gp.isDown(GP.DPAD_DOWN);
    const charWheelWant = altDown || gpCharDown;
    if (charWheelWant && !this.ui.charWheelOpen) {
      this.ui.setCharWheel(true, this.player);
    } else if (!charWheelWant && this.ui.charWheelOpen) {
      const picked = this.ui.hoveredChar;
      this.ui.setCharWheel(false, this.player);
      if (gp.wasReleased(GP.DPAD_DOWN) && picked !== this.player.characterId) {
        this.triggerCharacterSwitch(picked);
        return null;
      }
    }
    if (this.ui.charWheelOpen && gpCharDown) {
      this.ui.updateCharWheelStick(gp.rawRightX, gp.rawRightY);
    }
    if (this.input.wasPressed('F1') || (altDown && this.input.wasPressed('Digit1'))) {
      this.triggerCharacterSwitch('michael');
      return null;
    }
    if (this.input.wasPressed('F2') || (altDown && this.input.wasPressed('Digit2'))) {
      this.triggerCharacterSwitch('franklin');
      return null;
    }
    if (this.input.wasPressed('F3') || (altDown && this.input.wasPressed('Digit3'))) {
      this.triggerCharacterSwitch('trevor');
      return null;
    }

    // 5. Camera Look (Mouse + Analog Right Stick + Trackpad Arrow Assist) & View Cycle (V / Select)
    const anyWheelOpen =
      this.ui.weaponWheelOpen || this.ui.radioWheelOpen || this.ui.charWheelOpen || phoneOpen;
    if (!anyWheelOpen) {
      const keyLookX =
        ((this.input.isDown('ArrowRight') ? 1 : 0) - (this.input.isDown('ArrowLeft') ? 1 : 0)) *
        realDt *
        820;
      if (this.input.mouseDeltaX !== 0 || this.input.mouseDeltaY !== 0 || keyLookX !== 0) {
        this.cameraCtrl.applyMouseLook(
          this.input.mouseDeltaX + keyLookX,
          this.input.mouseDeltaY,
          this.settings.mouseSensitivity,
          this.settings.invertY
        );
      }
      if (gp.rightX !== 0 || gp.rightY !== 0) {
        const aimSlow = this.player.isAiming ? 0.62 : 1.0;
        this.cameraCtrl.applyMouseLook(
          gp.rightX * realDt * 1160 * aimSlow,
          gp.rightY * realDt * 780 * aimSlow,
          this.settings.gamepadSensitivity,
          this.settings.invertY
        );
      }
    }
    if (this.input.wasPressed('KeyV') || (!phoneOpen && gp.wasPressed(GP.SELECT))) {
      const label = this.cameraCtrl.cycleDistance();
      this.ui.showHelpToast(`Camera: <b>${label}</b>`, 1.6);
    }

    // 6. Protagonist Special Ability (X, CapsLock, or authentic GTA V L3 + R3 combo!)
    const gpSpecialCombo =
      !phoneOpen &&
      ((gp.isDown(GP.L3) && gp.wasPressed(GP.R3)) || (gp.isDown(GP.R3) && gp.wasPressed(GP.L3)));
    if (this.input.wasPressed('KeyX') || this.input.wasPressed('CapsLock') || gpSpecialCombo) {
      const activated = this.player.toggleSpecial();
      if (activated) {
        this.audio.playSwitchPulse();
        gp.rumble(0.45, 0.55, 160);
      }
    }
    this.player.updateSpecialAndVitals(realDt);

    // 7. Contextual Interactions: Vehicles, Los Santos Customs, Ammu-Nation, Story Missions!
    let promptHtml: string | null = null;
    const pVeh = this.player.currentVehicle;
    const interactKeyHtml = isGp ? gp.badge('dpad_right') : '<span class="keycap">E</span>';
    const enterVehHtml = isGp ? gp.badge('north') : '<span class="keycap">F</span>';
    const interactPressed =
      !phoneOpen && (this.input.wasPressed('KeyE') || gp.wasPressed(GP.DPAD_RIGHT));

    // Los Santos Customs check (82, 88)
    const dLSC = Math.hypot(this.player.pos.x - 82, this.player.pos.z - 88);
    if (pVeh && pVeh.kind !== 'helicopter' && dLSC < 7.5 && Math.abs(pVeh.speed) < 12) {
      promptHtml = `Press ${interactKeyHtml} to enter <b>Los Santos Customs</b>.`;
      if (interactPressed) {
        pVeh.vel.set(0, 0, 0);
        pVeh.speed = 0;
        this.setMode('lscustoms', false);
        return null;
      }
    }

    // Ammu-Nation check (28, 92)
    const dAmmu = Math.hypot(this.player.pos.x - 28, this.player.pos.z - 92);
    if (!pVeh && dAmmu < 4.5) {
      promptHtml = `Press ${interactKeyHtml} to browse <b>Ammu-Nation</b>.`;
      if (interactPressed) {
        this.setMode('ammunation', false);
        return null;
      }
    }

    // Story Mission Start Marker check
    const nearbyMission = this.missions.findNearbyMissionTrigger(this.player.pos);
    if (nearbyMission && !promptHtml) {
      promptHtml = `Press ${interactKeyHtml} to start <b>${nearbyMission.title}</b> ($${nearbyMission.reward.toLocaleString()}).`;
      if (interactPressed) {
        gp.rumble(0.3, 0.4, 140);
        this.missions.startMission(nearbyMission, this.player, (title, sub) => {
          this.ui.showBanner(title.toUpperCase(), sub, '', false, 3.0);
        });
      }
    }

    // Vehicle Enter / Exit (F / E on keyboard, Y / Triangle on Gamepad)
    const nearestCar = !pVeh ? this.traffic.findNearestEnterableVehicle(this.player.pos) : null;
    if (!pVeh && nearestCar && !promptHtml) {
      promptHtml = `Press ${enterVehHtml} to enter <b>${nearestCar.spec.brand} ${nearestCar.spec.name}</b>.`;
    }

    const enterPressed =
      !phoneOpen &&
      (this.input.wasPressed('KeyF') ||
        gp.wasPressed(GP.NORTH) ||
        (!promptHtml?.includes('Customs') &&
          !nearbyMission &&
          dAmmu >= 4.5 &&
          this.input.wasPressed('KeyE')));
    if (enterPressed && this.player.enterExitCooldown <= 0) {
      if (pVeh) {
        this.player.exitVehicle();
        this.audio.playUiClick(480);
      } else if (nearestCar) {
        const wasTrafficOrCop = nearestCar.isTraffic || nearestCar.isPoliceUnit;
        const wasCop = nearestCar.kind === 'police';
        this.player.enterVehicle(nearestCar);
        this.audio.playUiClick(620);
        gp.rumble(0.22, 0.3, 95);
        if (wasCop) {
          this.police.reportCrime(34, 2);
        } else if (wasTrafficOrCop && Math.random() < 0.35) {
          this.police.reportCrime(12, 1);
        }
      }
    }

    // 8. Drive Current Vehicle OR Move & Fight On Foot!
    const activeVeh = this.player.currentVehicle;
    let throttleInput = 0;

    if (activeVeh) {
      const kbFwd = (this.input.isDown('KeyW') ? 1 : 0) - (this.input.isDown('KeyS') ? 1 : 0);
      const kbSteer = (this.input.isDown('KeyA') ? 1 : 0) - (this.input.isDown('KeyD') ? 1 : 0);

      let fwdIn = kbFwd;
      let steerIn = kbSteer;
      let handbrake = false;
      let boost = false;
      let ascend = 0;

      if (!phoneOpen) {
        if (activeVeh.kind === 'helicopter') {
          // Helicopter: RT ascend, LT descend, Left Stick Y cyclic pitch, Left Stick X + LB/RB yaw
          const gpRudder = (gp.isDown(GP.LB) ? 0.85 : 0) - (gp.isDown(GP.RB) ? 0.85 : 0);
          fwdIn = THREE.MathUtils.clamp(kbFwd - gp.leftY, -1, 1);
          steerIn = THREE.MathUtils.clamp(kbSteer - gp.leftX + gpRudder, -1, 1);
          const kbAsc =
            (this.input.isDown('Space') ? 1 : 0) -
            (this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight') ? 1 : 0);
          ascend = THREE.MathUtils.clamp(kbAsc + (gp.rtValue - gp.ltValue), -1, 1);
        } else {
          // Cars & Bikes: Proportional analog RT throttle, LT brake/reverse, LS steering, RB/A drift, X nitro!
          const gpThrottle = gp.rtValue - gp.ltValue;
          fwdIn = THREE.MathUtils.clamp(kbFwd + gpThrottle, -1, 1);
          steerIn = THREE.MathUtils.clamp(kbSteer - gp.leftX, -1, 1);
          handbrake =
            this.input.isDown('Space') || gp.isDown(GP.RB) || gp.isDown(GP.SOUTH);
          boost =
            this.input.isDown('ShiftLeft') ||
            this.input.isDown('ShiftRight') ||
            gp.isDown(GP.WEST);
        }
      }

      throttleInput = fwdIn;

      // Horn & LSPD Siren (H or L3 solo), Quick Radio Cycle (R)
      if (
        !phoneOpen &&
        (this.input.wasPressed('KeyH') || (gp.wasPressed(GP.L3) && !gp.isDown(GP.R3)))
      ) {
        if (activeVeh.kind === 'police') {
          activeVeh.sirenOn = !activeVeh.sirenOn;
        } else {
          this.audio.playHorn();
        }
      }
      if (!phoneOpen && this.input.wasPressed('KeyR')) {
        this.cycleRadioStation();
      }

      // First-time helicopter controls tooltip (adapts to Controller vs Keyboard!)
      if (activeVeh.kind === 'helicopter' && !activeVeh.airborne && !promptHtml) {
        promptHtml = isGp
          ? `Hold ${gp.badge('rt')} to ascend, ${gp.badge('lt')} to descend, ${gp.badge('ls')} to fly.`
          : 'Hold <span class="keycap">SPACE</span> to ascend, <span class="keycap">SHIFT</span> to descend, <span class="keycap">WASD</span> to fly.';
      }

      activeVeh.update(
        dt,
        {
          throttle: fwdIn,
          steer: steerIn,
          handbrake,
          boost,
          ascend,
          focusGrip: this.player.specialActive && this.player.characterId === 'franklin',
        },
        this.city.colliders,
        this.ramps,
        this.effects,
        this.sky.nightFactor,
        {
          onCollision: (intensity) => {
            this.audio.playCollision(intensity);
            this.cameraCtrl.addShake(intensity * 0.35);
            gp.rumble(intensity * 0.65, Math.min(1, intensity * 0.95), 180);
          },
          onStuntLaunch: (ramp) => {
            this.cameraCtrl.triggerStuntCam(activeVeh.pos, ramp.dirX, ramp.dirZ);
            gp.rumble(0.45, 0.55, 240);
          },
          onStuntLand: (ramp) => {
            const reward = ramp.completed ? 500 : 2500;
            ramp.completed = true;
            this.player.cash += reward;
            this.audio.playMissionPassed();
            gp.rumble(0.65, 0.85, 280);
            this.ui.showCashDelta(reward);
            this.ui.showBanner(
              'STUNT JUMP COMPLETED',
              ramp.name,
              `+$${reward.toLocaleString()}`,
              false,
              3.5
            );
          },
          onExplode: (v) => this.handleVehicleExplosion(v),
        }
      );

      // Subtle continuous tire-slip / turbo haptic feedback!
      if (activeVeh.driftIntensity > 0.38 && !activeVeh.airborne) {
        gp.rumble(activeVeh.driftIntensity * 0.26, activeVeh.driftIntensity * 0.14, 110, true);
      } else if (boost && fwdIn > 0.3 && !activeVeh.airborne) {
        gp.rumble(0.18, 0.22, 110, true);
      }

      this.player.updateOnFoot(
        dt,
        0,
        0,
        false,
        false,
        false,
        this.cameraCtrl.yaw,
        0,
        this.city.colliders,
        this.ramps
      );
    } else {
      const kbF = (this.input.isDown('KeyW') ? 1 : 0) - (this.input.isDown('KeyS') ? 1 : 0);
      const kbR = (this.input.isDown('KeyD') ? 1 : 0) - (this.input.isDown('KeyA') ? 1 : 0);
      const moveF = phoneOpen ? 0 : THREE.MathUtils.clamp(kbF - gp.leftY, -1, 1);
      const moveR = phoneOpen ? 0 : THREE.MathUtils.clamp(kbR + gp.leftX, -1, 1);
      const sprint =
        !phoneOpen &&
        (this.input.isDown('ShiftLeft') ||
          this.input.isDown('ShiftRight') ||
          gp.isDown(GP.SOUTH));
      const jump =
        !phoneOpen && (this.input.wasPressed('Space') || gp.wasPressed(GP.WEST));
      const aiming =
        !this.ui.weaponWheelOpen &&
        !phoneOpen &&
        (this.input.mouseDownRight || gp.ltValue > 0.25);

      if (!phoneOpen && (this.input.wasPressed('KeyR') || gp.wasPressed(GP.EAST))) {
        if (this.player.startReload()) this.audio.playUiClick(420);
      }

      const spec = this.player.getWeaponSpec();
      const wantsFire =
        !this.ui.weaponWheelOpen &&
        !phoneOpen &&
        (spec.automatic
          ? this.input.mouseDownLeft || gp.isDown(GP.RT)
          : this.input.mousePressedLeft || gp.wasPressed(GP.RT));
      if (wantsFire) {
        this.performPlayerAttack();
      }

      this.player.updateOnFoot(
        dt,
        moveF,
        moveR,
        sprint,
        jump,
        aiming,
        this.cameraCtrl.yaw,
        this.cameraCtrl.pitch,
        this.city.colliders,
        this.ramps
      );
    }

    // 9. Update World, Sky, Ocean, Traffic, Pedestrians, Police, Effects & Missions!
    this.sky.update(dt, this.player.pos, this.settings.autoTimeCycle);
    this.city.update(dt, this.sky.nightFactor);

    this.traffic.update(
      dt,
      this.player.pos,
      this.player,
      this.city.colliders,
      this.ramps,
      this.effects,
      this.sky.nightFactor,
      {
        onPlayerCollision: (intensity) => {
          this.audio.playCollision(intensity);
          this.cameraCtrl.addShake(intensity * 0.35);
        },
        onPedKilledByPlayer: (isOfficer) => {
          this.police.reportCrime(isOfficer ? 38 : 18, isOfficer ? 3 : 1);
        },
        onVehicleExplode: (v) => this.handleVehicleExplosion(v),
      }
    );

    this.police.update(
      dt,
      this.player,
      this.city.colliders,
      this.ramps,
      this.effects,
      this.audio,
      this.sky.nightFactor,
      (v) => this.handleVehicleExplosion(v)
    );

    this.effects.update(dt, (_prev, next) => {
      // RPG Rocket collision test
      const gy = sampleBaseTerrainHeight(next.x, next.z);
      if (next.y <= gy + 0.15) {
        this.triggerWorldExplosion(next);
        return true;
      }
      for (const b of this.city.colliders) {
        if (
          next.x >= b.minX &&
          next.x <= b.maxX &&
          next.z >= b.minZ &&
          next.z <= b.maxZ &&
          next.y <= b.maxY
        ) {
          this.triggerWorldExplosion(next);
          return true;
        }
      }
      for (const v of this.traffic.vehicles) {
        if (v !== this.player.currentVehicle && v.pos.distanceTo(next) < 2.8) {
          this.triggerWorldExplosion(next);
          return true;
        }
      }
      return false;
    });

    // Collect floating cash stacks
    for (let i = this.effects.cashPickups.length - 1; i >= 0; i--) {
      const c = this.effects.cashPickups[i];
      if (c.pos.distanceTo(this.player.pos) < 2.4) {
        this.player.cash += c.amount;
        this.audio.playCashPickup();
        this.ui.showCashDelta(c.amount);
        this.scene.remove(c.mesh);
        this.effects.cashPickups.splice(i, 1);
      }
    }

    // Missions tick
    this.missions.update(dt, this.player, {
      onPassed: (title, reward) => {
        this.ui.showBanner(
          'MISSION PASSED',
          `${title}  •  RESPECT +`,
          `+$${reward.toLocaleString()}`,
          false,
          5.0
        );
      },
      onFailed: (reason) => {
        this.ui.showBanner('MISSION FAILED', reason.replace('MISSION FAILED — ', ''), '', true, 4.2);
      },
      onCashDelta: (delta) => this.ui.showCashDelta(delta),
    });

    // Damage flash, controller damage rumble & WASTED transition!
    if (this.player.health < this.lastPlayerHealth - 0.5) {
      this.ui.triggerDamageFlash();
      gp.rumble(0.42, 0.58, 140);
    }
    this.lastPlayerHealth = this.player.health;

    if (this.player.dead) {
      this.wastedTimer = 3.8;
      this.audio.playWasted();
      gp.rumble(0.75, 0.95, 650);
      this.setMode('wasted', false);
      return null;
    }

    // Vehicle Engine, Drift Tire Screech, Siren & Los Santos Radio Audio
    const sirenVol = this.police.getNearestSirenIntensity(this.player.pos, activeVeh);
    this.audio.updateVehicleAudio(
      !!activeVeh,
      activeVeh?.kind ?? null,
      activeVeh ? activeVeh.speed / activeVeh.spec.maxSpeed : 0,
      throttleInput,
      activeVeh?.driftIntensity ?? 0,
      sirenVol,
      realDt,
      false
    );

    // Camera (including R3 Look-Behind!) & GTA V Rectangular Radar
    const lookBack =
      this.input.isDown('KeyC') || (!phoneOpen && gp.isDown(GP.R3) && !gp.isDown(GP.L3));
    this.cameraCtrl.update(realDt, this.mode, this.player, this.city.colliders, lookBack);
    this.minimap.updateRadar(
      realDt,
      this.player,
      this.cameraCtrl.yaw,
      this.police,
      this.missions,
      this.traffic.vehicles
    );

    return promptHtml;
  }
}

function intersectRaySphere(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  center: THREE.Vector3,
  radius: number
): number | null {
  const ocX = origin.x - center.x;
  const ocY = origin.y - center.y;
  const ocZ = origin.z - center.z;
  const b = ocX * dir.x + ocY * dir.y + ocZ * dir.z;
  const c = ocX * ocX + ocY * ocY + ocZ * ocZ - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : null;
}

function intersectRayAABB(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number
): number | null {
  let tmin = -Infinity;
  let tmax = Infinity;

  const checkAxis = (o: number, d: number, mn: number, mx: number): boolean => {
    if (Math.abs(d) < 1e-6) return o >= mn && o <= mx;
    let t1 = (mn - o) / d;
    let t2 = (mx - o) / d;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    return tmax >= tmin;
  };

  if (!checkAxis(origin.x, dir.x, minX, maxX)) return null;
  if (!checkAxis(origin.y, dir.y, minY, maxY)) return null;
  if (!checkAxis(origin.z, dir.z, minZ, maxZ)) return null;
  return tmax >= 0 ? (tmin >= 0 ? tmin : tmax) : null;
}

new GTAVGame();
