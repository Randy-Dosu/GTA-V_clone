import * as THREE from 'three';
import { BuildingCollider, StuntRamp } from '../types';
import { Vehicle } from '../entities/Vehicle';
import { VehicleFactory } from '../entities/VehicleFactory';
import { CharacterRig } from '../entities/CharacterMesh';
import { Pedestrian, TrafficAndPeds } from '../world/TrafficAndPeds';
import { Player, lerpAngle } from '../entities/Player';
import { EffectsManager } from '../graphics/EffectsManager';
import { AudioEngine } from '../core/AudioEngine';
import { ROAD_COORDS, sampleBaseTerrainHeight } from '../world/WorldData';

interface PoliceUnit {
  cruiser: Vehicle;
  deployedOfficer: boolean;
  stuckTimer: number;
}

export class PoliceSystem {
  private scene: THREE.Scene;
  private factory: VehicleFactory;
  private traffic: TrafficAndPeds;

  public wantedLevel = 0; // 0..5
  public crimeHeat = 0;
  public evading = false;
  public evadeProgress = 0; // 0..1

  private lastSeenTimer = 0;
  private spawnTimer = 0;
  public units: PoliceUnit[] = [];

  constructor(scene: THREE.Scene, factory: VehicleFactory, traffic: TrafficAndPeds) {
    this.scene = scene;
    this.factory = factory;
    this.traffic = traffic;
  }

  public reportCrime(heatDelta: number, minStars = 1): void {
    this.crimeHeat += heatDelta;
    this.lastSeenTimer = 0;
    this.evading = false;
    this.evadeProgress = 0;

    let targetStars = Math.max(this.wantedLevel, minStars);
    if (this.crimeHeat >= 220) targetStars = 5;
    else if (this.crimeHeat >= 135) targetStars = Math.max(targetStars, 4);
    else if (this.crimeHeat >= 75) targetStars = Math.max(targetStars, 3);
    else if (this.crimeHeat >= 32) targetStars = Math.max(targetStars, 2);

    this.wantedLevel = Math.min(5, targetStars);
  }

  public clearWanted(): void {
    this.wantedLevel = 0;
    this.crimeHeat = 0;
    this.evading = false;
    this.evadeProgress = 0;
    this.lastSeenTimer = 0;

    // Stand down active pursuit cruisers cleanly
    for (const u of this.units) {
      u.cruiser.sirenOn = false;
      u.cruiser.isPoliceUnit = false;
    }
    this.units = [];

    // Remove remaining foot officers gradually
    for (let i = this.traffic.peds.length - 1; i >= 0; i--) {
      const p = this.traffic.peds[i];
      if (p.isOfficer) {
        this.scene.remove(p.rig.root);
        this.traffic.peds.splice(i, 1);
      }
    }
  }

  public getNearestSirenIntensity(playerPos: THREE.Vector3, playerVehicle: Vehicle | null): number {
    if (playerVehicle && playerVehicle.sirenOn) return 0.9;
    let best = 0;
    for (const u of this.units) {
      if (u.cruiser.destroyed || !u.cruiser.sirenOn) continue;
      const d = u.cruiser.pos.distanceTo(playerPos);
      const val = THREE.MathUtils.clamp(1 - d / 95, 0, 1);
      if (val > best) best = val;
    }
    return best;
  }

  private spawnCruiserNear(playerPos: THREE.Vector3): void {
    // Pick a Los Santos road point 68–115m away from the player
    let sx = 0;
    let sz = 0;
    let found = false;
    for (let attempt = 0; attempt < 18; attempt++) {
      const useNS = Math.random() < 0.5;
      const road = ROAD_COORDS[Math.floor(Math.random() * ROAD_COORDS.length)];
      const along = THREE.MathUtils.clamp(
        (useNS ? playerPos.z : playerPos.x) + (Math.random() < 0.5 ? -1 : 1) * (72 + Math.random() * 48),
        -220,
        220
      );
      sx = useNS ? road : along;
      sz = useNS ? along : road;
      const dist = Math.hypot(sx - playerPos.x, sz - playerPos.z);
      if (dist > 58 && dist < 145) {
        found = true;
        break;
      }
    }
    if (!found) return;

    const heading = Math.atan2(playerPos.x - sx, playerPos.z - sz);
    const cruiser = new Vehicle(this.factory, this.scene, 'police', sx, 0, sz, heading);
    cruiser.isPoliceUnit = true;
    cruiser.sirenOn = true;
    this.traffic.vehicles.push(cruiser);
    this.units.push({ cruiser, deployedOfficer: false, stuckTimer: 0 });
  }

  private deployOfficer(cruiser: Vehicle): void {
    const rig = new CharacterRig(
      {
        skin: 0xd9a684,
        hair: 0x221d1a,
        top: 0x162136,
        secondaryTop: 0x1f2e4a,
        pants: 0x121929,
        shoes: 0x0f1115,
        isPolice: true,
      },
      true
    );
    rig.setWeapon(this.wantedLevel >= 3 ? 'rifle' : 'pistol');
    const door = cruiser.getDriverDoorPos();
    door.y = sampleBaseTerrainHeight(door.x, door.z);
    rig.root.position.copy(door);
    this.scene.add(rig.root);

    const officer: Pedestrian = {
      rig,
      pos: door,
      heading: cruiser.heading,
      speed: 4.5,
      walkDir: cruiser.heading,
      health: this.wantedLevel >= 4 ? 115 : 85,
      dead: false,
      deadTimer: 0,
      fleeTimer: 0,
      fleeFrom: new THREE.Vector3(),
      isOfficer: true,
      shootTimer: 0.8 + Math.random() * 0.6,
    };
    this.traffic.peds.push(officer);
  }

  public update(
    dt: number,
    player: Player,
    colliders: BuildingCollider[],
    ramps: StuntRamp[],
    effects: EffectsManager,
    audio: AudioEngine,
    nightFactor: number,
    onVehicleExplode: (v: Vehicle) => void
  ): void {
    if (this.wantedLevel <= 0 || player.dead) return;

    const desiredUnits = Math.min(5, this.wantedLevel);
    this.spawnTimer -= dt;
    if (this.units.length < desiredUnits && this.spawnTimer <= 0) {
      this.spawnCruiserNear(player.pos);
      this.spawnTimer = 3.2;
    }

    let playerSpotted = false;
    const pVeh = player.currentVehicle;

    // Update LSPD Cruiser pursuits
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      const c = u.cruiser;

      if (c.destroyed || !c.isPoliceUnit || c.isPlayerDriven) {
        this.units.splice(i, 1);
        continue;
      }

      const dist3D = c.pos.distanceTo(player.pos);
      const horizDist = Math.hypot(player.pos.x - c.pos.x, player.pos.z - c.pos.z);

      // Despawn cruisers that fell way behind so new ones can intercept ahead
      if (horizDist > 185) {
        this.scene.remove(c.rig.root);
        const vIdx = this.traffic.vehicles.indexOf(c);
        if (vIdx >= 0) this.traffic.vehicles.splice(vIdx, 1);
        this.units.splice(i, 1);
        continue;
      }

      // Vision cone check (58m radius, and altitude check so helicopters can evade high up!)
      if (dist3D < 58 && player.pos.y - c.pos.y < 38) {
        playerSpotted = true;
      }

      // Steer cruiser toward player
      const desiredHeading = Math.atan2(player.pos.x - c.pos.x, player.pos.z - c.pos.z);
      let err = ((desiredHeading - c.heading + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (err < -Math.PI) err += Math.PI * 2;

      let steer = THREE.MathUtils.clamp(err * 1.75, -1, 1);
      let throttle = 0.88;
      let handbrake = false;

      // Stop near on-foot / slow player and deploy an armed LSPD officer!
      const playerSlow = !pVeh || Math.abs(pVeh.speed) < 6;
      if (horizDist < 17 && playerSlow && player.pos.y - c.pos.y < 6) {
        throttle = 0;
        handbrake = true;
        if (!u.deployedOfficer) {
          u.deployedOfficer = true;
          this.deployOfficer(c);
        }
      } else {
        // Recover cleanly if stuck against a building corner
        if (Math.abs(c.speed) < 2.2) {
          u.stuckTimer += dt;
        } else {
          u.stuckTimer = Math.max(0, u.stuckTimer - dt);
        }
        if (u.stuckTimer > 1.3) {
          throttle = -0.85;
          steer = -steer;
          if (u.stuckTimer > 2.4) u.stuckTimer = 0;
        }
      }

      c.update(
        dt,
        { throttle, steer, handbrake, boost: this.wantedLevel >= 4, ascend: 0 },
        colliders,
        ramps,
        effects,
        nightFactor,
        { onExplode: onVehicleExplode }
      );
    }

    // Update deployed foot LSPD Officers
    for (const p of this.traffic.peds) {
      if (!p.isOfficer || p.dead) continue;

      const dist = p.pos.distanceTo(player.pos);
      if (dist < 46) playerSpotted = true;

      // Hit by player's speeding car!
      if (pVeh && !pVeh.airborne && Math.abs(pVeh.speed) > 6) {
        const dCar = Math.hypot(p.pos.x - pVeh.pos.x, p.pos.z - pVeh.pos.z);
        if (dCar < pVeh.spec.halfWidth + 0.85 && Math.abs(p.pos.y - pVeh.pos.y) < 1.6) {
          this.traffic.damagePed(p, 150, effects, () => {
            this.reportCrime(28, 3);
          });
          continue;
        }
      }

      const toPlayerYaw = Math.atan2(player.pos.x - p.pos.x, player.pos.z - p.pos.z);
      p.heading = lerpAngle(p.heading, toPlayerYaw, Math.min(1, dt * 10));

      let moveSpd = 0;
      if (dist > 22 && dist < 85) {
        moveSpd = 4.2;
        const nx = p.pos.x + Math.sin(p.heading) * moveSpd * dt;
        const nz = p.pos.z + Math.cos(p.heading) * moveSpd * dt;
        let blocked = false;
        for (const b of colliders) {
          if (nx > b.minX - 0.5 && nx < b.maxX + 0.5 && nz > b.minZ - 0.5 && nz < b.maxZ + 0.5) {
            blocked = true;
            break;
          }
        }
        if (!blocked) {
          p.pos.x = nx;
          p.pos.z = nz;
          p.pos.y = sampleBaseTerrainHeight(nx, nz);
        }
      }

      // Engage player with gunfire at medium range
      const canShoot = dist < 44 && Math.abs(player.pos.y - p.pos.y) < 18;
      if (canShoot) {
        p.shootTimer -= dt;
        if (p.shootTimer <= 0) {
          p.shootTimer = this.wantedLevel >= 3 ? 0.55 + Math.random() * 0.45 : 1.05 + Math.random() * 0.6;
          p.rig.triggerAttack();
          const muzzle = p.pos.clone().add(new THREE.Vector3(0, 1.38, 0));
          const spread = 1.4;
          const target = player.pos.clone().add(
            new THREE.Vector3(
              (Math.random() - 0.5) * spread,
              1.0 + (Math.random() - 0.5) * 0.6,
              (Math.random() - 0.5) * spread
            )
          );
          effects.spawnTracer(muzzle, target, 0xffd27d);
          audio.playEnemyShot(dist);

          // Hit chance scales reasonably so gunfights feel thrilling, never unfair
          const hitProb = pVeh ? 0.35 : 0.42;
          if (Math.random() < hitProb) {
            const dmg = this.wantedLevel >= 3 ? 6.5 : 4.5;
            if (pVeh && pVeh.kind !== 'bike') {
              pVeh.applyDamage(dmg * 3.2, effects, onVehicleExplode);
            } else {
              player.takeDamage(dmg);
            }
          }
        }
      }

      p.rig.root.position.copy(p.pos);
      p.rig.root.rotation.y = p.heading;
      p.rig.updateAnimation(dt, moveSpd, moveSpd > 3, true, canShoot);
    }

    // Evasion state machine (authentic blinking stars when out of LSPD sight!)
    if (playerSpotted) {
      this.lastSeenTimer = 0;
      this.evading = false;
      this.evadeProgress = 0;
    } else {
      this.lastSeenTimer += dt;
      if (this.lastSeenTimer > 2.5) {
        this.evading = true;
        const requiredTime = 11 + this.wantedLevel * 3.5;
        this.evadeProgress = Math.min(1, (this.lastSeenTimer - 2.5) / requiredTime);
        if (this.evadeProgress >= 1) {
          this.clearWanted();
        }
      }
    }
  }
}
