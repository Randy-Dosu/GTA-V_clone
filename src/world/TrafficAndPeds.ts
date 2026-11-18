import * as THREE from 'three';
import {
  BuildingCollider,
  CHARACTER_PROFILES,
  StuntRamp,
  VehicleKind,
} from '../types';
import { Vehicle } from '../entities/Vehicle';
import { VehicleFactory } from '../entities/VehicleFactory';
import { CharacterRig } from '../entities/CharacterMesh';
import { EffectsManager } from '../graphics/EffectsManager';
import { Player, lerpAngle } from '../entities/Player';
import {
  LANE_OFFSET,
  ROAD_COORDS,
  ROAD_HALF,
  SIDEWALK_Y,
  sampleBaseTerrainHeight,
} from './WorldData';

interface TrafficDriver {
  vehicle: Vehicle;
  axis: 'ns' | 'ew';
  roadCoord: number;
  dir: 1 | -1; // +1 toward +Z or +X, -1 toward -Z or -X
  cruiseSpeed: number;
  lastIntersection: number;
}

export interface Pedestrian {
  rig: CharacterRig;
  pos: THREE.Vector3;
  heading: number;
  speed: number;
  walkDir: number;
  health: number;
  dead: boolean;
  deadTimer: number;
  fleeTimer: number;
  fleeFrom: THREE.Vector3;
  isOfficer: boolean;
  shootTimer: number;
  /** Display name used by the Groq AI street-talk system */
  name: string;
  /** Loiter/idle countdown while the ped stands still (natural sidewalk life) */
  pauseTimer: number;
}

/** Street names cycled across the 34 pedestrian NPCs for AI street talk */
const PED_NAMES = [
  'Marcus', 'Denise', 'Tyrell', 'Rosa', 'Jamal', 'Priya', 'Diego', 'Keisha',
  'Big Tone', 'Lil Smokey', 'Frank', 'Angela', 'Vince', 'Tanya', 'Omar', 'Gloria',
  'DeShawn', 'Marisol', 'Big Rube', 'Cassandra', 'Elroy', 'Nia', 'Paco', 'Tamika',
  'Wilson', 'Bree', 'Hakeem', 'Sofia', 'Duke', 'Yolanda', 'Chop', 'Reggie',
  'Vanessa', 'Old Pete',
];

const PED_SKINS = [
  0xf1c29b, 0xd8a07a, 0x8d5524, 0x5c3822, 0xe6b89c, 0xb87b52,
  0x6b442a, 0xcf9977, 0x9c6644, 0x4a2c1a, 0xf5d0a9, 0x7c4a2d,
];
const PED_TOPS = [
  0xf8fafc, 0x2563eb, 0xef4444, 0x10b981, 0xf59e0b,
  0x8b5cf6, 0xec4899, 0x1e293b, 0x06b6d4, 0xeab308,
  0x0f172a, 0x7c2d12, 0x365314, 0x581c87, 0x9d174d,
];
const PED_PANTS = [0x1e293b, 0x334155, 0x1e3a5f, 0xd6cfc2, 0x3f3f46, 0x4b5563, 0x292524, 0x1c1917];
const PED_HAIR = [0x171412, 0x3d2817, 0x6b4423, 0xc79c52, 0x292524, 0xd6d3d1, 0x7f1d1d, 0x1e3a5f];
const PED_HAIR_STYLES: Array<'short' | 'long' | 'bald' | 'cap' | 'beanie' | 'ponytail' | 'afro' | 'mohawk'> = [
  'short', 'short', 'long', 'cap', 'beanie', 'ponytail', 'afro', 'bald', 'mohawk', 'short',
];
const PED_OUTFITS: Array<'tee' | 'hoodie' | 'jacket' | 'suit' | 'athletic'> = [
  'tee', 'hoodie', 'jacket', 'suit', 'athletic', 'tee', 'hoodie', 'jacket',
];
const PED_BODY_TYPES: Array<'slim' | 'average' | 'heavy' | 'athletic'> = [
  'slim', 'average', 'average', 'heavy', 'athletic', 'average', 'slim', 'heavy',
];

export class TrafficAndPeds {
  private scene: THREE.Scene;
  private vehicleFactory: VehicleFactory;

  public vehicles: Vehicle[] = [];
  private trafficDrivers: TrafficDriver[] = [];
  public peds: Pedestrian[] = [];

  private maxTraffic = 20;
  private maxPeds = 34;

  constructor(scene: THREE.Scene, vehicleFactory: VehicleFactory) {
    this.scene = scene;
    this.vehicleFactory = vehicleFactory;

    this.spawnLandmarkVehicles();
    this.initTraffic();
    this.initPedestrians();
  }

  private spawnLandmarkVehicles(): void {
    // Franklin's gleaming white Pegassi Zentorno parked right beside spawn on Vespucci Blvd!
    this.spawnParkedVehicle('supercar', -14.5, 0.0, 9.2, -Math.PI * 0.5, 0xf5f7fa);
    // Bravado Gauntlet muscle car nearby
    this.spawnParkedVehicle('muscle', -26, 0.0, 9.2, -Math.PI * 0.5, 0xe85d12);
    // Pegassi Bati 801 sportbike near Legion Square entrance
    this.spawnParkedVehicle('bike', -14.5, 0.14, 24, Math.PI, 0xd61f26);

    // Michael's black Obey Tailgater in Rockford Hills
    this.spawnParkedVehicle(
      'sedan',
      -121,
      0.0,
      -101,
      Math.PI * 0.5,
      CHARACTER_PROFILES.michael.signatureColor
    );

    // Trevor's crimson Benefactor Dubsta SUV in Strawberry / La Mesa
    this.spawnParkedVehicle(
      'suv',
      119,
      0.0,
      119,
      Math.PI * 0.5,
      CHARACTER_PROFILES.trevor.signatureColor
    );

    // Exotic showcase cars outside Simeon's Premium Deluxe Motorsport & Del Perro Pier
    this.spawnParkedVehicle('supercar', 136, 0.14, 94, Math.PI * 0.5, 0xf5b800);
    this.spawnParkedVehicle('supercar', -234, 0.14, 22, 0, 0x14b866);

    // Luxury, vintage & taxi additions
    // Benefactor Schafter luxury sedan outside Eclipse Towers
    this.spawnParkedVehicle('luxury', -135, 0.14, -145, Math.PI * 0.5, 0x1a1d22);
    // Declasse Tornado classic in Strawberry
    this.spawnParkedVehicle('vintage', 30, 0.14, 160, 0, 0x7a1f1f);
    // Vapid Taxi rank downtown + one near Legion Square
    this.spawnParkedVehicle('cab', -5, 0.0, 20, 0, 0xf5b800);
    this.spawnParkedVehicle('cab', 115, 0.0, 5, Math.PI * 0.5, 0xf5b800);

    // FLYABLE BUCKINGHAM MAVERICK HELICOPTERS!
    // 1. Vespucci Beach Helipad
    this.spawnParkedVehicle('helicopter', -272, 0.16, 185, Math.PI * 0.25, 0x1b2838);
    // 2. Vinewood Observatory Overlook
    this.spawnParkedVehicle('helicopter', -22, 28.0, -356, 0, 0x991b1b);
  }

  public spawnParkedVehicle(
    kind: VehicleKind,
    x: number,
    y: number,
    z: number,
    heading: number,
    color?: number
  ): Vehicle {
    const v = new Vehicle(this.vehicleFactory, this.scene, kind, x, y, z, heading, color);
    this.vehicles.push(v);
    return v;
  }

  private initTraffic(): void {
    const kinds: VehicleKind[] = [
      'sedan', 'sedan', 'suv', 'muscle', 'supercar', 'sedan', 'bike',
      'luxury', 'vintage', 'cab', 'cab', 'luxury', 'vintage', 'sedan',
    ];
    for (let i = 0; i < this.maxTraffic; i++) {
      const axis: 'ns' | 'ew' = i % 2 === 0 ? 'ns' : 'ew';
      const roadCoord = ROAD_COORDS[i % ROAD_COORDS.length];
      const dir: 1 | -1 = i % 4 < 2 ? 1 : -1;
      const along = -195 + ((i * 47) % 390);
      const pos = this.computeLanePos(axis, roadCoord, dir, along);
      const heading = this.computeLaneHeading(axis, dir);
      const kind = kinds[i % kinds.length];

      const v = new Vehicle(this.vehicleFactory, this.scene, kind, pos.x, 0, pos.z, heading);
      v.isTraffic = true;
      this.vehicles.push(v);
      this.trafficDrivers.push({
        vehicle: v,
        axis,
        roadCoord,
        dir,
        cruiseSpeed: 12.5 + (i % 5) * 2.1,
        lastIntersection: -9999,
      });
    }
  }

  private computeLanePos(
    axis: 'ns' | 'ew',
    roadCoord: number,
    dir: 1 | -1,
    along: number
  ): { x: number; z: number } {
    // US Right-hand traffic!
    // Moving +Z (South): right is -X -> x = roadCoord - LANE_OFFSET
    // Moving -Z (North): right is +X -> x = roadCoord + LANE_OFFSET
    // Moving +X (East):  right is +Z -> z = roadCoord + LANE_OFFSET
    // Moving -X (West):  right is -Z -> z = roadCoord - LANE_OFFSET
    if (axis === 'ns') {
      return { x: roadCoord - dir * LANE_OFFSET, z: along };
    }
    return { x: along, z: roadCoord + dir * LANE_OFFSET };
  }

  private computeLaneHeading(axis: 'ns' | 'ew', dir: 1 | -1): number {
    if (axis === 'ns') return dir === 1 ? 0 : Math.PI;
    return dir === 1 ? Math.PI * 0.5 : -Math.PI * 0.5;
  }

  private initPedestrians(): void {
    for (let i = 0; i < this.maxPeds; i++) {
      const spot = this.randomSidewalkPos(new THREE.Vector3(0, 0, 0), 25, 195);
      const rig = new CharacterRig({
        skin: PED_SKINS[i % PED_SKINS.length],
        hair: PED_HAIR[i % PED_HAIR.length],
        top: PED_TOPS[i % PED_TOPS.length],
        pants: PED_PANTS[i % PED_PANTS.length],
        shoes: i % 2 === 0 ? 0xf1f5f9 : 0x1f2937,
        hasSunglasses: i % 3 === 0,
        hairStyle: PED_HAIR_STYLES[i % PED_HAIR_STYLES.length],
        outfit: PED_OUTFITS[i % PED_OUTFITS.length],
        bodyType: PED_BODY_TYPES[i % PED_BODY_TYPES.length],
        beard: i % 4 === 1,
        detail: 'simple',
      });
      rig.root.position.copy(spot);
      this.scene.add(rig.root);

      const walkDir = (i % 4) * (Math.PI * 0.5);
      this.peds.push({
        rig,
        pos: spot,
        heading: walkDir,
        speed: 1.35 + (i % 4) * 0.22,
        walkDir,
        health: 65,
        dead: false,
        deadTimer: 0,
        fleeTimer: 0,
        fleeFrom: new THREE.Vector3(),
        isOfficer: false,
        shootTimer: 0,
        name: PED_NAMES[i % PED_NAMES.length],
        pauseTimer: i % 5 === 0 ? 1 + Math.random() * 4 : 0,
      });
    }
  }

  private randomSidewalkPos(center: THREE.Vector3, minDist: number, maxDist: number): THREE.Vector3 {
    for (let attempt = 0; attempt < 16; attempt++) {
      const pickAxis = Math.random() < 0.5;
      const road = ROAD_COORDS[Math.floor(Math.random() * ROAD_COORDS.length)];
      const side = Math.random() < 0.5 ? -1 : 1;
      const offset = ROAD_HALF + 2.1; // Right on the Los Santos concrete sidewalk!
      const along = -215 + Math.random() * 430;
      const x = pickAxis ? road + side * offset : along;
      const z = pickAxis ? along : road + side * offset;
      const d = Math.hypot(x - center.x, z - center.z);
      if (d >= minDist && d <= maxDist) {
        return new THREE.Vector3(x, SIDEWALK_Y, z);
      }
    }
    return new THREE.Vector3(-13.2, SIDEWALK_Y, 45);
  }

  public alertNearbyPeds(origin: THREE.Vector3, radius = 55): void {
    for (const p of this.peds) {
      if (p.dead || p.isOfficer) continue;
      if (p.pos.distanceTo(origin) < radius) {
        p.fleeTimer = 8.5 + Math.random() * 4;
        p.fleeFrom.copy(origin);
      }
    }
  }

  public damagePed(
    ped: Pedestrian,
    amount: number,
    effects: EffectsManager,
    onKill?: (ped: Pedestrian) => void
  ): void {
    if (ped.dead) return;
    ped.health -= amount;
    effects.spawnImpact(ped.pos.clone().add(new THREE.Vector3(0, 1.15, 0)), true);
    if (ped.health <= 0) {
      ped.dead = true;
      ped.deadTimer = 0;
      ped.rig.updateAnimation(0.016, 0, false, true, false, 0, true);
      // Drop authentic GTA V green cash bundle!
      const cash = 45 + Math.floor(Math.random() * 140);
      effects.spawnCash(ped.pos, cash);
      onKill?.(ped);
    } else if (!ped.isOfficer) {
      ped.fleeTimer = 10;
    }
  }

  public findNearestEnterableVehicle(pos: THREE.Vector3, maxDist = 5.4): Vehicle | null {
    let best: Vehicle | null = null;
    let bestD = maxDist;
    for (const v of this.vehicles) {
      if (v.destroyed) continue;
      const reach = v.kind === 'helicopter' ? 6.8 : maxDist;
      const d = pos.distanceTo(v.pos);
      if (d < reach && d < bestD + (v.kind === 'helicopter' ? 1.8 : 0)) {
        bestD = d;
        best = v;
      }
    }
    return best;
  }

  /** Closest living pedestrian in talking range for the Groq AI street-talk system */
  public findNearestTalkablePed(pos: THREE.Vector3, maxDist = 3.4): Pedestrian | null {
    let best: Pedestrian | null = null;
    let bestD = maxDist;
    for (const p of this.peds) {
      if (p.dead) continue;
      const d = pos.distanceTo(p.pos);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  public update(
    dt: number,
    focusPos: THREE.Vector3,
    player: Player | null,
    colliders: BuildingCollider[],
    ramps: StuntRamp[],
    effects: EffectsManager,
    nightFactor: number,
    callbacks: {
      onPlayerCollision: (intensity: number) => void;
      onPedKilledByPlayer: (isOfficer: boolean) => void;
      onVehicleExplode: (v: Vehicle) => void;
    }
  ): void {
    // 1. Update AI Traffic Drivers
    for (let i = this.trafficDrivers.length - 1; i >= 0; i--) {
      const td = this.trafficDrivers[i];
      const v = td.vehicle;

      // If carjacked or destroyed, detach from ambient traffic loop
      if (!v.isTraffic || v.destroyed || v.isPlayerDriven) {
        this.trafficDrivers.splice(i, 1);
        continue;
      }

      // Check range from camera/player: recycle far cars to keep streets lively nearby
      const along = td.axis === 'ns' ? v.pos.z : v.pos.x;
      const distToFocus = Math.hypot(v.pos.x - focusPos.x, v.pos.z - focusPos.z);
      if (along > 236 || along < -236 || distToFocus > 265) {
        // Flip back into bounds or relocate onto a nearby road outside immediate camera cone
        if (along > 234 || along < -234) {
          td.dir = (td.dir * -1) as 1 | -1;
          td.lastIntersection = -9999;
          const clampedAlong = THREE.MathUtils.clamp(along, -228, 228);
          const lp = this.computeLanePos(td.axis, td.roadCoord, td.dir, clampedAlong);
          v.pos.set(lp.x, 0, lp.z);
          v.heading = this.computeLaneHeading(td.axis, td.dir);
          v.vel.set(0, 0, 0);
        }
      }

      // Intersection turning decision
      for (const inter of ROAD_COORDS) {
        if (Math.abs(along - inter) < 2.2 && td.lastIntersection !== inter) {
          td.lastIntersection = inter;
          const roll = Math.random();
          if (roll < 0.32) {
            // Smooth 90-degree avenue switch!
            const newAxis: 'ns' | 'ew' = td.axis === 'ns' ? 'ew' : 'ns';
            let newDir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
            if (inter <= -220) newDir = 1;
            if (inter >= 220) newDir = -1;
            td.axis = newAxis;
            td.roadCoord = inter;
            td.dir = newDir;
          }
          break;
        }
      }

      // Obstacle detection right ahead (player, player's car, or another traffic car).
      // Returns the distance to the nearest obstacle for smooth brake tapering.
      const fwd = v.getForward();
      let blockDist = Infinity;
      if (player && !player.dead) {
        const dx = player.pos.x - v.pos.x;
        const dz = player.pos.z - v.pos.z;
        const ahead = dx * fwd.x + dz * fwd.z;
        const side = Math.abs(-dx * fwd.z + dz * fwd.x);
        if (ahead > 1.8 && ahead < 13.5 && side < 3.1) {
          blockDist = Math.min(blockDist, ahead);
        }
      }
      for (const other of this.vehicles) {
        if (other === v || other.kind === 'helicopter') continue;
        const dx = other.pos.x - v.pos.x;
        const dz = other.pos.z - v.pos.z;
        const ahead = dx * fwd.x + dz * fwd.z;
        const side = Math.abs(-dx * fwd.z + dz * fwd.x);
        if (ahead > 2.2 && ahead < 12.5 && side < 2.4) {
          blockDist = Math.min(blockDist, ahead);
        }
      }

      // Gently guide onto exact lane center & target heading
      const curAlong = td.axis === 'ns' ? v.pos.z : v.pos.x;
      const targetPt = this.computeLanePos(
        td.axis,
        td.roadCoord,
        td.dir,
        curAlong + td.dir * 15
      );
      const desiredHeading = Math.atan2(targetPt.x - v.pos.x, targetPt.z - v.pos.z);
      let angleErr = ((desiredHeading - v.heading + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (angleErr < -Math.PI) angleErr += Math.PI * 2;

      const steer = THREE.MathUtils.clamp(angleErr * 1.45, -1, 1);
      // Speed tapers smoothly as the obstacle nears — no more brake-slam / gas-slam pumping
      const dangerDist = 13.0;
      const stopDist = 5.0;
      const obstacleFactor =
        blockDist === Infinity ? 1 : THREE.MathUtils.clamp((blockDist - stopDist) / (dangerDist - stopDist), 0, 1);
      const cornerFactor = Math.abs(angleErr) > 0.35 ? 0.55 : 1;
      const targetSpeed = td.cruiseSpeed * obstacleFactor * cornerFactor;
      const throttle = THREE.MathUtils.clamp((targetSpeed - v.speed) * 0.5, -0.75, 0.55);
      const handbrake = v.speed > 0.6 && targetSpeed < 0.4;

      v.update(
        dt,
        { throttle, steer, handbrake, boost: false, ascend: 0 },
        colliders,
        ramps,
        effects,
        nightFactor,
        { onExplode: callbacks.onVehicleExplode }
      );
    }

    // Replenish traffic if cars were stolen/blown up
    if (this.trafficDrivers.length < this.maxTraffic - 3) {
      const axis: 'ns' | 'ew' = Math.random() < 0.5 ? 'ns' : 'ew';
      const roadCoord = ROAD_COORDS[Math.floor(Math.random() * ROAD_COORDS.length)];
      const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
      const along = -180 + Math.random() * 360;
      const pt = this.computeLanePos(axis, roadCoord, dir, along);
      if (Math.hypot(pt.x - focusPos.x, pt.z - focusPos.z) > 75) {
        const pool: VehicleKind[] = ['sedan', 'suv', 'muscle', 'supercar', 'luxury', 'vintage', 'cab'];
        const kind = pool[Math.floor(Math.random() * pool.length)];
        const nv = new Vehicle(
          this.vehicleFactory,
          this.scene,
          kind,
          pt.x,
          0,
          pt.z,
          this.computeLaneHeading(axis, dir)
        );
        nv.isTraffic = true;
        this.vehicles.push(nv);
        this.trafficDrivers.push({
          vehicle: nv,
          axis,
          roadCoord,
          dir,
          cruiseSpeed: 13 + Math.random() * 6,
          lastIntersection: -9999,
        });
      }
    }

    // 2. Update Parked / Idle non-player non-police vehicles
    for (const v of this.vehicles) {
      if (v.isPlayerDriven || v.isTraffic || v.isPoliceUnit) continue;
      // Only simulate physics if close or moving/damaged
      const moving = v.vel.lengthSq() > 0.05 || v.airborne || v.health < v.maxHealth * 0.45;
      if (moving) {
        v.update(dt, null, colliders, ramps, effects, nightFactor, {
          onExplode: callbacks.onVehicleExplode,
        });
      }
    }

    // 3. Vehicle-vs-Vehicle Collisions (player, police & traffic — all solid)
    const len = this.vehicles.length;
    for (let i = 0; i < len; i++) {
      const a = this.vehicles[i];
      if (a.kind === 'helicopter' && a.airborne) continue;
      const aActive = a.isPlayerDriven || a.isPoliceUnit || a.isTraffic;

      for (let j = 0; j < len; j++) {
        if (i === j) continue;
        const b = this.vehicles[j];
        const bActive = b.isPlayerDriven || b.isPoliceUnit || b.isTraffic;
        if (!aActive && !bActive) continue; // parked cars stay put
        if (Math.abs(a.pos.y - b.pos.y) > 2.2) continue;

        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const minDist = (a.spec.halfWidth + b.spec.halfWidth) * 1.45;
        const distSq = dx * dx + dz * dz;
        if (distSq < minDist * minDist && distSq > 0.0001) {
          const dist = Math.sqrt(distSq);
          const nx = dx / dist;
          const nz = dz / dist;
          const overlap = minDist - dist;

          const totalMass = a.spec.mass + b.spec.mass;
          const ratioA = b.spec.mass / totalMass;
          const ratioB = a.spec.mass / totalMass;

          a.pos.x -= nx * overlap * ratioA;
          a.pos.z -= nz * overlap * ratioA;
          b.pos.x += nx * overlap * ratioB;
          b.pos.z += nz * overlap * ratioB;

          const rvx = b.vel.x - a.vel.x;
          const rvz = b.vel.z - a.vel.z;
          const relNormal = rvx * nx + rvz * nz;
          if (relNormal < 0) {
            const impulse = -1.32 * relNormal;
            a.vel.x -= nx * impulse * ratioA;
            a.vel.z -= nz * impulse * ratioA;
            b.vel.x += nx * impulse * ratioB;
            b.vel.z += nz * impulse * ratioB;

            if (impulse > 5.5) {
              const mid = a.pos.clone().lerp(b.pos, 0.5).add(new THREE.Vector3(0, 0.65, 0));
              effects.spawnImpact(mid, false);
              if (a.isPlayerDriven || b.isPlayerDriven) {
                callbacks.onPlayerCollision(Math.min(1, impulse / 26));
                a.applyDamage(impulse * 1.6, effects, callbacks.onVehicleExplode);
                b.applyDamage(impulse * 2.2, effects, callbacks.onVehicleExplode);
              }
            }
          }
          a.syncTransform();
          b.syncTransform();
        }
      }
    }

    // 4. Update Los Santos AI Pedestrians
    const pVeh = player?.currentVehicle ?? null;
    for (let i = this.peds.length - 1; i >= 0; i--) {
      const p = this.peds[i];

      if (p.dead) {
        p.deadTimer += dt;
        if (p.deadTimer > 14) {
          if (p.isOfficer) {
            this.scene.remove(p.rig.root);
            this.peds.splice(i, 1);
          } else {
            // Recycle civilian onto another nearby street
            p.dead = false;
            p.health = 65;
            p.fleeTimer = 0;
            p.pos.copy(this.randomSidewalkPos(focusPos, 55, 165));
            p.rig.root.position.copy(p.pos);
          }
        }
        continue;
      }

      // Officers are driven by PoliceSystem
      if (p.isOfficer) continue;

      // Recycle very distant civilians closer to player's current neighborhood
      const dFocus = Math.hypot(p.pos.x - focusPos.x, p.pos.z - focusPos.z);
      if (dFocus > 210) {
        p.pos.copy(this.randomSidewalkPos(focusPos, 65, 175));
        p.rig.root.position.copy(p.pos);
        continue;
      }

      let sprinting = false;
      let moveSpd = p.speed;
      if (p.fleeTimer > 0) {
        p.fleeTimer -= dt;
        p.pauseTimer = 0;
        sprinting = true;
        moveSpd = 5.4;
        p.walkDir = Math.atan2(p.pos.x - p.fleeFrom.x, p.pos.z - p.fleeFrom.z);
      } else if (p.pauseTimer > 0) {
        // Loitering: stand still and look around like a real person
        p.pauseTimer -= dt;
        moveSpd = 0;
      } else if (Math.random() < dt * 0.05) {
        // Occasional pause to check their phone / enjoy the view
        p.pauseTimer = 1.5 + Math.random() * 5;
        moveSpd = 0;
      } else if (Math.random() < dt * 0.07) {
        // Gentle drift in heading (±45°) instead of robotic right-angle snaps
        p.walkDir += (Math.random() < 0.5 ? -1 : 1) * Math.PI * 0.25;
        p.speed = 1.1 + Math.random() * 0.7;
      }

      const nextX = p.pos.x + Math.sin(p.walkDir) * moveSpd * dt;
      const nextZ = p.pos.z + Math.cos(p.walkDir) * moveSpd * dt;

      // Bounce cleanly off building walls & keep out of ocean
      let hitWall = nextX < -298 || nextX > 245 || nextZ < -235 || nextZ > 245;
      if (!hitWall) {
        for (const b of colliders) {
          if (
            nextX > b.minX - 0.6 &&
            nextX < b.maxX + 0.6 &&
            nextZ > b.minZ - 0.6 &&
            nextZ < b.maxZ + 0.6
          ) {
            hitWall = true;
            break;
          }
        }
      }

      if (hitWall) {
        p.walkDir += Math.PI * 0.65;
      } else {
        p.pos.x = nextX;
        p.pos.z = nextZ;
        p.pos.y = sampleBaseTerrainHeight(p.pos.x, p.pos.z);
      }

      // Check collision with player's speeding vehicle
      if (pVeh && !pVeh.airborne && Math.abs(pVeh.speed) > 5.5) {
        const dCar = Math.hypot(p.pos.x - pVeh.pos.x, p.pos.z - pVeh.pos.z);
        if (dCar < pVeh.spec.halfWidth + 0.85 && Math.abs(p.pos.y - pVeh.pos.y) < 1.6) {
          this.damagePed(p, 120, effects, () => {
            callbacks.onPedKilledByPlayer(false);
          });
          this.alertNearbyPeds(p.pos, 45);
          continue;
        }
      }

      // Solid body collision: pedestrians step aside from the on-foot player
      if (player && !player.currentVehicle && !player.dead && Math.abs(player.pos.y - p.pos.y) < 1.8) {
        const pdx = p.pos.x - player.pos.x;
        const pdz = p.pos.z - player.pos.z;
        const pd = Math.hypot(pdx, pdz);
        if (pd > 0.0001 && pd < 0.72) {
          const push = (0.72 - pd) * 0.6;
          p.pos.x += (pdx / pd) * push;
          p.pos.z += (pdz / pd) * push;
        }
      }

      p.heading = lerpAngle(p.heading, p.walkDir, Math.min(1, dt * 8));
      p.rig.root.position.copy(p.pos);
      p.rig.root.rotation.y = p.heading;
      p.rig.updateAnimation(dt, moveSpd, sprinting, true, false);
    }
  }
}
