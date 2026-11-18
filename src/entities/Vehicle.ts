import * as THREE from 'three';
import { BuildingCollider, StuntRamp, VehicleKind, VehicleSpec, VEHICLE_SPECS } from '../types';
import { BuiltVehicleRig, VehicleFactory } from './VehicleFactory';
import { EffectsManager } from '../graphics/EffectsManager';
import { sampleBaseTerrainHeight, sampleRampHeight, WORLD_BOUNDS } from '../world/WorldData';

export interface VehicleControlInput {
  throttle: number;  // -1..1
  steer: number;     // -1..1 (+1 = left, -1 = right)
  handbrake: boolean;
  boost: boolean;
  ascend: number;    // helicopter -1..1
  focusGrip?: boolean; // Franklin's Driving Focus special ability!
}

export class Vehicle {
  public id: number;
  public kind: VehicleKind;
  public spec: VehicleSpec;
  public rig: BuiltVehicleRig;

  public pos = new THREE.Vector3();
  public vel = new THREE.Vector3();
  public heading = 0; // 0 = +Z, +PI/2 = +X
  public speed = 0;   // signed forward speed (m/s)

  public steerAngle = 0;
  public bodyRoll = 0;
  public bodyPitch = 0;
  public airborne = false;
  public airTime = 0;
  public driftIntensity = 0;

  public health: number;
  public maxHealth: number;
  public destroyed = false;
  private burnTimer = 0;
  private smokeTimer = 0;
  private skidTimer = 0;

  public sirenOn = false;
  private sirenTimer = 0;
  public rotorSpin = 0;

  // Los Santos Customs upgrades
  public colorHex: number;
  public turboInstalled = false;
  public neonColor: number | null = null;

  // Ownership / role tags
  public isPlayerDriven = false;
  public isTraffic = false;
  public isPoliceUnit = false;
  public isMissionTarget = false;
  public activeRamp: StuntRamp | null = null;

  private static nextId = 1;

  constructor(
    factory: VehicleFactory,
    scene: THREE.Scene,
    kind: VehicleKind,
    x: number,
    y: number,
    z: number,
    heading = 0,
    colorHex?: number
  ) {
    this.id = Vehicle.nextId++;
    this.kind = kind;
    this.spec = VEHICLE_SPECS[kind];
    this.colorHex =
      colorHex ?? this.spec.colors[Math.floor(Math.random() * this.spec.colors.length)];

    this.maxHealth = this.spec.maxHealth;
    this.health = this.maxHealth;

    this.rig = factory.build(kind, this.colorHex);
    this.pos.set(x, y, z);
    this.heading = heading;
    this.syncTransform();
    scene.add(this.rig.root);
  }

  public setPaintColor(hex: number): void {
    this.colorHex = hex;
    this.rig.paintMat.color.setHex(hex);
  }

  public setNeon(hex: number | null): void {
    this.neonColor = hex;
    if (this.rig.neonMat) {
      if (hex === null) {
        this.rig.neonMat.opacity = 0;
      } else {
        this.rig.neonMat.color.setHex(hex);
        this.rig.neonMat.opacity = 0.62;
      }
    }
  }

  public repair(): void {
    this.health = this.maxHealth;
    this.destroyed = false;
    this.rig.paintMat.color.setHex(this.colorHex);
    this.rig.paintMat.roughness = 0.2;
    this.rig.paintMat.clearcoat = 1.0;
  }

  public getForward(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  public getRight(out = new THREE.Vector3()): THREE.Vector3 {
    // Right-hand cross(forward, up) for forward=(sin h, 0, cos h): (-cos h, 0, sin h)
    return out.set(-Math.cos(this.heading), 0, Math.sin(this.heading));
  }

  public getDriverDoorPos(): THREE.Vector3 {
    // Left side of vehicle (+cos h, 0, -sin h)
    const leftX = Math.cos(this.heading) * (this.spec.halfWidth + 0.92);
    const leftZ = -Math.sin(this.heading) * (this.spec.halfWidth + 0.92);
    return new THREE.Vector3(this.pos.x + leftX, this.pos.y, this.pos.z + leftZ);
  }

  public applyDamage(
    amount: number,
    effects: EffectsManager,
    onExplode?: (v: Vehicle) => void
  ): void {
    if (this.destroyed) return;
    this.health = Math.max(0, this.health - amount);
    if (this.health <= 0) {
      this.explode(effects, onExplode);
    }
  }

  public explode(effects: EffectsManager, onExplode?: (v: Vehicle) => void): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.health = 0;
    this.sirenOn = false;
    this.setNeon(null);

    // Scorched matte charcoal wreck
    this.rig.paintMat.color.setHex(0x1f2023);
    this.rig.paintMat.roughness = 0.92;
    this.rig.paintMat.metalness = 0.15;
    this.rig.paintMat.clearcoat = 0;
    this.rig.headlightMat.color.setHex(0x222222);
    this.rig.brakeMat.color.setHex(0x221111);
    if (this.rig.sirenLight) this.rig.sirenLight.intensity = 0;
    if (this.rig.headlightBeam) this.rig.headlightBeam.visible = false;

    // Pop vehicle slightly upward from blast
    this.vel.y = 5.5;
    this.vel.x *= 0.3;
    this.vel.z *= 0.3;

    effects.spawnExplosion(this.pos);
    onExplode?.(this);
  }

  public update(
    dt: number,
    input: VehicleControlInput | null,
    colliders: BuildingCollider[],
    ramps: StuntRamp[],
    effects: EffectsManager,
    nightFactor: number,
    callbacks?: {
      onCollision?: (intensity: number) => void;
      onStuntLaunch?: (ramp: StuntRamp) => void;
      onStuntLand?: (ramp: StuntRamp) => void;
      onExplode?: (v: Vehicle) => void;
    }
  ): void {
    const ctrl: VehicleControlInput = input && !this.destroyed
      ? input
      : { throttle: 0, steer: 0, handbrake: !this.isTraffic, boost: false, ascend: 0 };

    if (this.kind === 'helicopter') {
      this.updateHelicopter(dt, ctrl, input !== null && !this.destroyed, colliders, effects, callbacks);
      return;
    }

    const fwd = this.getForward();
    const right = this.getRight();

    // Decompose horizontal velocity into forward & lateral components
    let forwardVel = this.vel.x * fwd.x + this.vel.z * fwd.z;
    let lateralVel = this.vel.x * right.x + this.vel.z * right.z;

    const topMult = (this.turboInstalled ? 1.18 : 1.0) * (ctrl.boost ? 1.2 : 1.0);
    const maxSpd = this.spec.maxSpeed * topMult;
    const accelRate =
      this.spec.acceleration * (this.turboInstalled ? 1.24 : 1.0) * (ctrl.boost ? 1.45 : 1.0);

    let brakingVisual = false;

    if (!this.airborne) {
      if (ctrl.throttle > 0.01) {
        if (forwardVel < -1.2) {
          // Braking while reversing
          forwardVel = Math.min(0, forwardVel + this.spec.braking * dt);
          brakingVisual = true;
        } else {
          // Smooth power curve tapering near top speed
          const ratio = Math.max(0, forwardVel / maxSpd);
          const torque = Math.max(0.15, 1 - Math.pow(ratio, 2.2));
          forwardVel += accelRate * ctrl.throttle * torque * dt;
        }
      } else if (ctrl.throttle < -0.01) {
        if (forwardVel > 1.5) {
          // Crisp hydraulic disc brakes
          forwardVel = Math.max(0, forwardVel - this.spec.braking * Math.abs(ctrl.throttle) * dt);
          brakingVisual = true;
        } else {
          // Smooth reverse gear
          forwardVel = Math.max(
            -this.spec.reverseSpeed,
            forwardVel - this.spec.acceleration * 0.65 * Math.abs(ctrl.throttle) * dt
          );
        }
      } else {
        // Natural rolling resistance / engine braking
        const drag = ctrl.handbrake ? 18.0 : 4.2;
        if (Math.abs(forwardVel) <= drag * dt) forwardVel = 0;
        else forwardVel -= Math.sign(forwardVel) * drag * dt;
      }

      if (ctrl.handbrake && Math.abs(forwardVel) > 0.5) {
        forwardVel -= Math.sign(forwardVel) * 11.5 * dt;
        brakingVisual = true;
      }

      // Smooth steering interpolation
      const targetSteer = ctrl.steer;
      this.steerAngle = THREE.MathUtils.lerp(this.steerAngle, targetSteer, Math.min(1, dt * 11));

      const absSpd = Math.abs(forwardVel);
      if (absSpd > 0.35) {
        const lowSpdFactor = Math.min(1, absSpd / 5.5);
        const highSpdDamp = 1 / (1 + absSpd * (ctrl.focusGrip ? 0.012 : 0.022));
        const driftBoost = ctrl.handbrake && absSpd > 8 ? 1.38 : 1.0;
        const focusBoost = ctrl.focusGrip ? 1.45 : 1.0;
        const revSign = forwardVel >= 0 ? 1 : -1;
        this.heading +=
          this.steerAngle *
          this.spec.turnRate *
          lowSpdFactor *
          highSpdDamp *
          driftBoost *
          focusBoost *
          revSign *
          dt;
      }

      // Recompute basis after yaw update & apply lateral tire grip (powerslide magic!)
      this.getForward(fwd);
      this.getRight(right);
      const grip = ctrl.focusGrip
        ? 18.0
        : ctrl.handbrake && absSpd > 7
          ? this.spec.driftGrip
          : this.spec.grip;
      lateralVel *= Math.exp(-grip * dt);

      // Recombine horizontal velocity
      this.vel.x = fwd.x * forwardVel + right.x * lateralVel;
      this.vel.z = fwd.z * forwardVel + right.z * lateralVel;

      // Drift intensity for smoke, skidmarks & tire screech!
      const slip = Math.abs(lateralVel);
      this.driftIntensity =
        (ctrl.handbrake && absSpd > 9) || slip > 4.2
          ? THREE.MathUtils.clamp((slip - 2.2) / 9 + (ctrl.handbrake ? 0.55 : 0), 0, 1)
          : 0;
    } else {
      // Subtle mid-air GTA V car attitude control!
      this.driftIntensity = 0;
      this.heading += ctrl.steer * 0.45 * dt;
    }

    this.speed = forwardVel;

    // Nitro boost exhaust flame!
    if (ctrl.boost && ctrl.throttle > 0.2 && !this.destroyed && this.isPlayerDriven) {
      const exhaustPos = this.pos
        .clone()
        .addScaledVector(fwd, -this.spec.halfLength)
        .add(new THREE.Vector3(0, 0.42, 0));
      effects.spawnNitroFlame(exhaustPos, fwd.clone().negate());
    }

    // Gravity & position integration
    this.vel.y -= 21.5 * dt;
    const prevY = this.pos.y;
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.pos.z += this.vel.z * dt;

    // Keep inside Los Santos map bounds
    if (this.pos.x < WORLD_BOUNDS.minX) {
      this.pos.x = WORLD_BOUNDS.minX;
      this.vel.x = Math.max(0, this.vel.x);
    } else if (this.pos.x > WORLD_BOUNDS.maxX) {
      this.pos.x = WORLD_BOUNDS.maxX;
      this.vel.x = Math.min(0, this.vel.x);
    }
    if (this.pos.z < WORLD_BOUNDS.minZ) {
      this.pos.z = WORLD_BOUNDS.minZ;
      this.vel.z = Math.max(0, this.vel.z);
    } else if (this.pos.z > WORLD_BOUNDS.maxZ) {
      this.pos.z = WORLD_BOUNDS.maxZ;
      this.vel.z = Math.min(0, this.vel.z);
    }

    // Ground + Stunt Ramp height resolution
    const baseGround = sampleBaseTerrainHeight(this.pos.x, this.pos.z);
    const rampSample = sampleRampHeight(this.pos.x, this.pos.z, ramps);
    let groundY = baseGround;
    let onRamp = false;

    if (rampSample.ramp && prevY >= rampSample.height - 1.35) {
      groundY = Math.max(baseGround, rampSample.height);
      onRamp = true;
    }

    if (this.pos.y <= groundY + 0.04) {
      // Landing check
      if (this.airborne && this.activeRamp && this.airTime > 0.65) {
        callbacks?.onStuntLand?.(this.activeRamp);
      }
      if (!onRamp) {
        this.activeRamp = null;
      }

      this.pos.y = groundY;

      if (onRamp && rampSample.ramp) {
        const r = rampSample.ramp;
        const speedUpRamp = this.vel.x * r.dirX + this.vel.z * r.dirZ;
        if (speedUpRamp > 4) {
          const slope = r.height / r.length;
          this.vel.y = speedUpRamp * slope * 1.12;
          if (rampSample.progress > 0.78 && speedUpRamp > 18 && this.isPlayerDriven) {
            if (this.activeRamp !== r) {
              this.activeRamp = r;
              callbacks?.onStuntLaunch?.(r);
            }
          }
        } else {
          this.vel.y = 0;
        }
      } else {
        // Compute natural hill slope follow on Vinewood Hills
        const aheadY = sampleBaseTerrainHeight(this.pos.x + fwd.x * 2.0, this.pos.z + fwd.z * 2.0);
        const slopeDiff = (aheadY - baseGround) / 2.0;
        if (Math.abs(slopeDiff) < 0.55 && forwardVel > 1) {
          this.vel.y = Math.min(4, forwardVel * slopeDiff * 0.45);
        } else {
          this.vel.y = 0;
        }
      }

      this.airborne = false;
      this.airTime = 0;
    } else {
      this.airborne = true;
      this.airTime += dt;
    }

    // Building AABB collisions (only checked for player, cops & active nearby cars)
    if (!this.isTraffic) {
      this.resolveBuildingCollisions(colliders, effects, callbacks);
    }

    // Dynamic chassis suspension pitch & cornering roll!
    let targetRoll = 0;
    let targetPitch = 0;
    if (this.kind === 'bike') {
      // Sportbikes lean cleanly INTO corners!
      targetRoll = -this.steerAngle * Math.min(1, Math.abs(forwardVel) / 18) * 0.42;
      targetPitch = ctrl.throttle > 0.2 ? -0.05 : brakingVisual ? 0.06 : 0;
    } else {
      // Cars exhibit subtle outward body roll in sharp corners & squat under launch
      targetRoll = this.steerAngle * Math.min(1, Math.abs(forwardVel) / 22) * 0.065;
      targetPitch = brakingVisual ? 0.045 : ctrl.throttle > 0.2 ? -0.032 : 0;
    }

    if (this.airborne) {
      targetPitch = THREE.MathUtils.clamp(-this.vel.y * 0.025, -0.34, 0.34);
    } else if (onRamp && rampSample.ramp) {
      const r = rampSample.ramp;
      const align = fwd.x * r.dirX + fwd.z * r.dirZ;
      targetPitch = -Math.atan2(r.height, r.length) * align;
    } else if (this.pos.z < -234) {
      // Match Vinewood hill slope pitch
      const aheadY = sampleBaseTerrainHeight(this.pos.x + fwd.x * 2.4, this.pos.z + fwd.z * 2.4);
      targetPitch -= Math.atan2(aheadY - baseGround, 2.4) * 0.85;
    }

    this.bodyRoll = THREE.MathUtils.lerp(this.bodyRoll, targetRoll, Math.min(1, dt * 9));
    this.bodyPitch = THREE.MathUtils.lerp(this.bodyPitch, targetPitch, Math.min(1, dt * 9));

    // Wheel spin & front wheel steer visuals
    const spinDelta = (forwardVel / this.spec.wheelRadius) * dt;
    for (const w of this.rig.wheelMeshes) {
      w.rotation.x += spinDelta;
    }
    for (const fp of this.rig.frontSteerPivots) {
      fp.rotation.y = this.steerAngle * 0.52;
    }

    // Drift tire smoke & asphalt skid marks
    if (this.driftIntensity > 0.25 && !this.airborne && !this.destroyed) {
      this.skidTimer += dt;
      if (this.skidTimer > 0.045) {
        this.skidTimer = 0;
        const rearCenter = this.pos.clone().addScaledVector(fwd, -this.spec.halfLength * 0.64);
        if (this.kind === 'bike') {
          effects.spawnSkidMark(rearCenter, this.heading);
          effects.spawnTireSmoke(rearCenter);
        } else {
          const rwL = rearCenter.clone().addScaledVector(right, -this.spec.halfWidth * 0.85);
          const rwR = rearCenter.clone().addScaledVector(right, this.spec.halfWidth * 0.85);
          effects.spawnSkidMark(rwL, this.heading);
          effects.spawnSkidMark(rwR, this.heading);
          if (Math.random() < 0.7) effects.spawnTireSmoke(Math.random() < 0.5 ? rwL : rwR);
        }
      }
    }

    // Brake lights, headlights & LSPD lightbar flash
    if (!this.destroyed) {
      this.rig.brakeMat.color.setHex(
        brakingVisual ? 0xff2228 : nightFactor > 0.25 || this.isPlayerDriven ? 0x9e1118 : 0x5c0c10
      );
      this.rig.headlightMat.color.setHex(
        nightFactor > 0.2 || this.isPlayerDriven ? 0xfffbe6 : 0xcbd5e1
      );
      if (this.rig.headlightBeam) {
        const bm = this.rig.headlightBeam.material as THREE.MeshBasicMaterial;
        bm.opacity = this.airborne ? 0 : Math.max(0, (nightFactor - 0.18) * 1.15);
      }

      if (this.rig.sirenRedMat && this.rig.sirenBlueMat) {
        if (this.sirenOn) {
          this.sirenTimer += dt * 13;
          const phase = Math.sin(this.sirenTimer) > 0;
          this.rig.sirenRedMat.color.setHex(phase ? 0xff1f2d : 0x45080c);
          this.rig.sirenBlueMat.color.setHex(phase ? 0x091f4d : 0x248aff);
          if (this.rig.sirenLight) {
            this.rig.sirenLight.color.setHex(phase ? 0xff2233 : 0x2488ff);
            this.rig.sirenLight.intensity = 6.5;
          }
        } else {
          this.rig.sirenRedMat.color.setHex(0x6e1016);
          this.rig.sirenBlueMat.color.setHex(0x102d6e);
          if (this.rig.sirenLight) this.rig.sirenLight.intensity = 0;
        }
      }
    }

    // Engine damage smoke & fire
    this.tickDamageEffects(dt, fwd, effects, callbacks?.onExplode);

    this.syncTransform();
  }

  private updateHelicopter(
    dt: number,
    ctrl: VehicleControlInput,
    engineRunning: boolean,
    colliders: BuildingCollider[],
    effects: EffectsManager,
    callbacks?: {
      onCollision?: (intensity: number) => void;
      onExplode?: (v: Vehicle) => void;
    }
  ): void {
    const targetRotor = engineRunning ? 26 : 0;
    this.rotorSpin = THREE.MathUtils.lerp(this.rotorSpin, targetRotor, Math.min(1, dt * 2.8));
    if (this.rig.mainRotor) this.rig.mainRotor.rotation.y += this.rotorSpin * dt;
    if (this.rig.tailRotor) this.rig.tailRotor.rotation.x += this.rotorSpin * 1.6 * dt;

    const fwd = this.getForward();

    if (engineRunning && this.rotorSpin > 8) {
      // Yaw turn
      this.heading += ctrl.steer * this.spec.turnRate * dt;
      this.getForward(fwd);

      // Vertical climb/descent (max altitude 215m — plenty to soar above Maze Bank!)
      const targetVy = ctrl.ascend * 18;
      this.vel.y = THREE.MathUtils.lerp(this.vel.y, targetVy, Math.min(1, dt * 4.2));
      if (this.pos.y > 215 && this.vel.y > 0) this.vel.y = 0;

      // Forward/back cyclic pitch acceleration (only when slightly off ground)
      if (this.airborne || ctrl.ascend > 0.1) {
        this.vel.x += fwd.x * ctrl.throttle * this.spec.acceleration * dt;
        this.vel.z += fwd.z * ctrl.throttle * this.spec.acceleration * dt;
      }
      // Air drag
      this.vel.x *= Math.exp(-1.15 * dt);
      this.vel.z *= Math.exp(-1.15 * dt);

      const hSpd = Math.hypot(this.vel.x, this.vel.z);
      if (hSpd > this.spec.maxSpeed) {
        const s = this.spec.maxSpeed / hSpd;
        this.vel.x *= s;
        this.vel.z *= s;
      }

      // Authentic helicopter nose-down forward tilt & cornering bank!
      this.bodyPitch = THREE.MathUtils.lerp(this.bodyPitch, ctrl.throttle * 0.24, Math.min(1, dt * 5));
      this.bodyRoll = THREE.MathUtils.lerp(this.bodyRoll, -ctrl.steer * 0.28, Math.min(1, dt * 5));
    } else {
      // Unoccupied / powered-down helicopter settles gently to ground/helipad
      this.vel.y -= 14 * dt;
      this.vel.x *= Math.exp(-3 * dt);
      this.vel.z *= Math.exp(-3 * dt);
      this.bodyPitch = THREE.MathUtils.lerp(this.bodyPitch, 0, Math.min(1, dt * 6));
      this.bodyRoll = THREE.MathUtils.lerp(this.bodyRoll, 0, Math.min(1, dt * 6));
    }

    this.pos.addScaledVector(this.vel, dt);
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, WORLD_BOUNDS.minX - 60, WORLD_BOUNDS.maxX + 40);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, WORLD_BOUNDS.minZ - 35, WORLD_BOUNDS.maxZ + 40);

    // Compute floor: terrain OR skyscraper rooftop helipad!
    let floorY = Math.max(0, sampleBaseTerrainHeight(this.pos.x, this.pos.z));
    for (const b of colliders) {
      if (
        this.pos.x >= b.minX - 1.2 &&
        this.pos.x <= b.maxX + 1.2 &&
        this.pos.z >= b.minZ - 1.2 &&
        this.pos.z <= b.maxZ + 1.2
      ) {
        if (this.pos.y >= b.maxY - 2.2) {
          floorY = Math.max(floorY, b.maxY);
        } else {
          // Side push out of skyscraper wall
          this.pushOutOfBox(b, 2.2, effects, callbacks);
        }
      }
    }

    if (this.pos.y <= floorY + 0.05) {
      this.pos.y = floorY;
      if (this.vel.y < 0) this.vel.y = 0;
      this.vel.x *= 0.85;
      this.vel.z *= 0.85;
      this.airborne = false;
      this.bodyPitch *= 0.85;
      this.bodyRoll *= 0.85;
    } else {
      this.airborne = true;
    }

    this.speed = Math.hypot(this.vel.x, this.vel.z);
    this.driftIntensity = 0;
    this.tickDamageEffects(dt, fwd, effects, callbacks?.onExplode);
    this.syncTransform();
  }

  private resolveBuildingCollisions(
    colliders: BuildingCollider[],
    effects: EffectsManager,
    callbacks?: {
      onCollision?: (intensity: number) => void;
      onExplode?: (v: Vehicle) => void;
    }
  ): void {
    const r = Math.max(this.spec.halfWidth, this.spec.halfLength * 0.78);
    for (const b of colliders) {
      if (this.pos.y > b.maxY || this.pos.y + this.spec.height < b.minY) continue;
      if (
        this.pos.x + r > b.minX &&
        this.pos.x - r < b.maxX &&
        this.pos.z + r > b.minZ &&
        this.pos.z - r < b.maxZ
      ) {
        this.pushOutOfBox(b, r, effects, callbacks);
      }
    }
  }

  private pushOutOfBox(
    b: BuildingCollider,
    r: number,
    effects: EffectsManager,
    callbacks?: {
      onCollision?: (intensity: number) => void;
      onExplode?: (v: Vehicle) => void;
    }
  ): void {
    const cx = THREE.MathUtils.clamp(this.pos.x, b.minX, b.maxX);
    const cz = THREE.MathUtils.clamp(this.pos.z, b.minZ, b.maxZ);
    let dx = this.pos.x - cx;
    let dz = this.pos.z - cz;
    const distSq = dx * dx + dz * dz;
    if (distSq >= r * r) return;

    let nx = 0;
    let nz = 1;
    let pen = 0;

    if (distSq > 0.0001) {
      const dist = Math.sqrt(distSq);
      nx = dx / dist;
      nz = dz / dist;
      pen = r - dist;
    } else {
      // Inside AABB: push along shallowest face
      const dLeft = Math.abs(this.pos.x - b.minX);
      const dRight = Math.abs(b.maxX - this.pos.x);
      const dTop = Math.abs(this.pos.z - b.minZ);
      const dBot = Math.abs(b.maxZ - this.pos.z);
      const m = Math.min(dLeft, dRight, dTop, dBot);
      if (m === dLeft) { nx = -1; nz = 0; pen = dLeft + r; }
      else if (m === dRight) { nx = 1; nz = 0; pen = dRight + r; }
      else if (m === dTop) { nx = 0; nz = -1; pen = dTop + r; }
      else { nx = 0; nz = 1; pen = dBot + r; }
    }

    this.pos.x += nx * pen;
    this.pos.z += nz * pen;

    const vn = this.vel.x * nx + this.vel.z * nz;
    if (vn < 0) {
      const impact = -vn;
      this.vel.x -= nx * vn * 1.28;
      this.vel.z -= nz * vn * 1.28;
      // Scrub a bit of tangential speed
      this.vel.x *= 0.88;
      this.vel.z *= 0.88;

      if (impact > 6.5) {
        const intensity = Math.min(1, impact / 32);
        if (this.isPlayerDriven) {
          callbacks?.onCollision?.(intensity);
        }
        effects.spawnImpact(
          new THREE.Vector3(cx, this.pos.y + 0.65, cz),
          false
        );
        this.applyDamage(impact * 2.4, effects, callbacks?.onExplode);
      }
    }
  }

  private tickDamageEffects(
    dt: number,
    fwd: THREE.Vector3,
    effects: EffectsManager,
    onExplode?: (v: Vehicle) => void
  ): void {
    const hpRatio = this.health / this.maxHealth;
    if (hpRatio < 0.45 && !this.destroyed) {
      const burning = hpRatio < 0.18;
      this.smokeTimer += dt;
      if (this.smokeTimer > (burning ? 0.08 : 0.18)) {
        this.smokeTimer = 0;
        const hoodPos = this.pos
          .clone()
          .addScaledVector(fwd, this.spec.halfLength * 0.55)
          .add(new THREE.Vector3(0, 0.85, 0));
        effects.spawnDamageSmoke(hoodPos, burning);
      }
      if (burning) {
        this.burnTimer += dt;
        if (this.burnTimer > 5.5) {
          this.explode(effects, onExplode);
        }
      }
    }
  }

  public syncTransform(): void {
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = this.heading;
    this.rig.bodyGroup.rotation.set(this.bodyPitch, 0, this.bodyRoll);
  }
}
