import * as THREE from 'three';
import {
  BuildingCollider,
  CharacterId,
  CHARACTER_PROFILES,
  StuntRamp,
  WeaponId,
  WeaponSpec,
  WEAPON_SPECS,
} from '../types';
import { CharacterRig } from './CharacterMesh';
import { Vehicle } from './Vehicle';
import { sampleBaseTerrainHeight, sampleRampHeight, WORLD_BOUNDS } from '../world/WorldData';

export interface WeaponInventorySlot {
  unlocked: boolean;
  inMag: number;
  reserve: number;
}

export class Player {
  public characterId: CharacterId = 'franklin';
  public rig: CharacterRig;

  public pos = new THREE.Vector3();
  public vel = new THREE.Vector3();
  public heading = 0;
  public grounded = true;
  public isSprinting = false;
  public isAiming = false;

  // Saved spots for all 3 GTA V protagonists so switching jumps across Los Santos!
  public savedSpots: Record<CharacterId, { pos: THREE.Vector3; heading: number }> = {
    franklin: {
      pos: CHARACTER_PROFILES.franklin.defaultSpawn.clone(),
      heading: CHARACTER_PROFILES.franklin.defaultHeading,
    },
    michael: {
      pos: CHARACTER_PROFILES.michael.defaultSpawn.clone(),
      heading: CHARACTER_PROFILES.michael.defaultHeading,
    },
    trevor: {
      pos: CHARACTER_PROFILES.trevor.defaultSpawn.clone(),
      heading: CHARACTER_PROFILES.trevor.defaultHeading,
    },
  };

  public health = 100;
  public maxHealth = 100;
  public armor = 65;
  public maxArmor = 100;
  public special = 100;
  public maxSpecial = 100;
  public specialActive = false;
  private timeSinceDamage = 10;

  public cash = 28500;
  public dead = false;

  public currentVehicle: Vehicle | null = null;
  public enterExitCooldown = 0;

  // Arsenal — give player a great starter kit right away + purchasable upgrades at Ammu-Nation
  public currentWeapon: WeaponId = 'unarmed';
  public weapons: Record<WeaponId, WeaponInventorySlot>;
  public fireCooldown = 0;
  public reloadTimer = 0;

  constructor(scene: THREE.Scene) {
    const p = CHARACTER_PROFILES[this.characterId];
    this.rig = new CharacterRig(
      {
        skin: p.skinColor,
        hair: p.hairColor,
        top: p.topColor,
        secondaryTop: p.secondaryTopColor,
        pants: p.pantsColor,
        shoes: p.shoeColor,
        hairStyle: p.hairStyle,
        outfit: p.outfit,
        bodyType: p.bodyType,
        beard: p.beard,
        detail: 'full',
      },
      true
    );

    this.pos.copy(p.defaultSpawn);
    this.heading = p.defaultHeading;
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = this.heading;
    scene.add(this.rig.root);

    this.weapons = {
      unarmed: { unlocked: true, inMag: 0, reserve: 0 },
      pistol: { unlocked: true, inMag: 12, reserve: 96 },
      smg: { unlocked: true, inMag: 30, reserve: 180 },
      rifle: { unlocked: true, inMag: 30, reserve: 180 },
      shotgun: { unlocked: true, inMag: 8, reserve: 40 },
      rpg: { unlocked: true, inMag: 1, reserve: 6 },
    };
  }

  public getWeaponSpec(id: WeaponId = this.currentWeapon): WeaponSpec {
    return WEAPON_SPECS.find((w) => w.id === id)!;
  }

  public equipWeapon(id: WeaponId): void {
    if (!this.weapons[id]?.unlocked) return;
    if (this.currentWeapon === id) return;
    this.currentWeapon = id;
    this.reloadTimer = 0;
    this.rig.setWeapon(id);
  }

  public cycleWeapon(dir: number): void {
    const order = WEAPON_SPECS.filter((w) => this.weapons[w.id].unlocked).map((w) => w.id);
    const idx = order.indexOf(this.currentWeapon);
    const next = order[(idx + dir + order.length) % order.length];
    this.equipWeapon(next);
  }

  public startReload(): boolean {
    const spec = this.getWeaponSpec();
    const slot = this.weapons[this.currentWeapon];
    if (spec.magSize === 0 || this.reloadTimer > 0) return false;
    if (slot.inMag >= spec.magSize || slot.reserve <= 0) return false;
    this.reloadTimer = spec.reloadTime;
    return true;
  }

  public switchCharacterModel(newId: CharacterId): void {
    // Save outgoing character position
    this.savedSpots[this.characterId] = {
      pos: this.pos.clone(),
      heading: this.heading,
    };
    if (this.currentVehicle) {
      this.exitVehicle();
    }

    this.characterId = newId;
    const p = CHARACTER_PROFILES[newId];
    this.rig.applyPalette({
      skin: p.skinColor,
      hair: p.hairColor,
      top: p.topColor,
      secondaryTop: p.secondaryTopColor,
      pants: p.pantsColor,
      shoes: p.shoeColor,
      beard: p.beard,
    });

    const spot = this.savedSpots[newId];
    this.pos.copy(spot.pos);
    this.heading = spot.heading;
    this.vel.set(0, 0, 0);
    this.health = 100;
    this.special = Math.max(75, this.special);
    this.specialActive = false;
    this.rig.root.visible = true;
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = this.heading;
  }

  public enterVehicle(v: Vehicle): void {
    if (v.destroyed || this.enterExitCooldown > 0) return;
    this.currentVehicle = v;
    v.isPlayerDriven = true;
    v.isTraffic = false;
    v.isPoliceUnit = false;
    this.isAiming = false;
    this.rig.root.visible = v.kind === 'bike'; // Rider visibly sits on motorcycle!
    this.enterExitCooldown = 0.45;
  }

  public exitVehicle(): Vehicle | null {
    const v = this.currentVehicle;
    if (!v) return null;
    v.isPlayerDriven = false;
    v.sirenOn = false;
    this.currentVehicle = null;
    this.rig.root.visible = true;
    this.rig.root.rotation.set(0, this.heading, 0);

    const door = v.getDriverDoorPos();
    const groundY = sampleBaseTerrainHeight(door.x, door.z);
    // Support exiting cleanly onto Maze Bank rooftop helipad too!
    this.pos.set(door.x, Math.max(groundY, v.pos.y), door.z);
    this.heading = v.heading;
    this.vel.set(v.vel.x * 0.25, 0, v.vel.z * 0.25);
    this.enterExitCooldown = 0.45;
    this.rig.root.position.copy(this.pos);
    return v;
  }

  public takeDamage(amount: number): void {
    if (this.dead) return;
    // Trevor's Red Mist reduces damage by 80%!
    const actual =
      this.specialActive && this.characterId === 'trevor' ? amount * 0.2 : amount;

    this.timeSinceDamage = 0;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, actual * 0.75);
      this.armor = Math.max(0, this.armor - absorbed);
      this.health = Math.max(0, this.health - (actual - absorbed));
    } else {
      this.health = Math.max(0, this.health - actual);
    }

    if (this.health <= 0) {
      this.dead = true;
      this.specialActive = false;
      if (this.currentVehicle) {
        this.exitVehicle();
      }
      this.rig.updateAnimation(0.016, 0, false, true, false, 0, true);
    }
  }

  public respawnAtHospital(): void {
    this.dead = false;
    this.health = 100;
    this.specialActive = false;
    this.reloadTimer = 0;
    // Deduct modest GTA V hospital bill
    const fee = Math.min(500, Math.floor(this.cash * 0.05));
    this.cash = Math.max(0, this.cash - fee);
    // Outside Pillbox Hill Medical Center
    this.pos.set(28, 0.14, -15);
    this.heading = 0;
    this.vel.set(0, 0, 0);
    this.rig.root.visible = true;
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.set(0, this.heading, 0);
    this.rig.updateAnimation(0.016, 0, false, true, false, 0, false);
  }

  public toggleSpecial(): boolean {
    if (this.specialActive) {
      this.specialActive = false;
      return false;
    }
    if (this.special < 18) return false;
    // Franklin's ability works in vehicles; Michael & Trevor work on foot (or anywhere for fun!)
    if (this.characterId === 'franklin' && !this.currentVehicle) return false;
    this.specialActive = true;
    return true;
  }

  public updateSpecialAndVitals(realDt: number): void {
    if (this.dead) return;
    if (this.enterExitCooldown > 0) {
      this.enterExitCooldown = Math.max(0, this.enterExitCooldown - realDt);
    }

    if (this.specialActive) {
      if (this.characterId === 'franklin' && !this.currentVehicle) {
        this.specialActive = false;
      } else {
        this.special = Math.max(0, this.special - realDt * 13);
        if (this.special <= 0) this.specialActive = false;
      }
    } else {
      // Gently recharge special ability while driving fast or moving
      const speedBonus = this.currentVehicle
        ? Math.min(4.5, Math.abs(this.currentVehicle.speed) * 0.1)
        : 1.4;
      this.special = Math.min(this.maxSpecial, this.special + realDt * speedBonus);
    }

    // Authentic GTA V health regeneration back up to 50% when out of combat!
    this.timeSinceDamage += realDt;
    if (this.timeSinceDamage > 5.0 && this.health < 55) {
      this.health = Math.min(55, this.health + realDt * 6.5);
    }

    // Weapon cooldown & reload
    if (this.fireCooldown > 0) this.fireCooldown = Math.max(0, this.fireCooldown - realDt);
    if (this.reloadTimer > 0) {
      this.reloadTimer -= realDt;
      if (this.reloadTimer <= 0) {
        this.reloadTimer = 0;
        const spec = this.getWeaponSpec();
        const slot = this.weapons[this.currentWeapon];
        const needed = spec.magSize - slot.inMag;
        const take = Math.min(needed, slot.reserve);
        slot.inMag += take;
        slot.reserve -= take;
      }
    }
  }

  public updateOnFoot(
    dt: number,
    moveForward: number,
    moveRight: number,
    sprint: boolean,
    jump: boolean,
    aiming: boolean,
    cameraYaw: number,
    cameraPitch: number,
    colliders: BuildingCollider[],
    ramps: StuntRamp[]
  ): void {
    if (this.dead) return;

    if (this.currentVehicle) {
      this.pos.copy(this.currentVehicle.pos);
      this.heading = this.currentVehicle.heading;
      if (this.currentVehicle.kind === 'bike') {
        // Position rider cleanly on Pegassi Bati 801 saddle & lean with bike!
        this.rig.root.position.set(this.pos.x, this.pos.y + 0.12, this.pos.z);
        this.rig.root.rotation.set(0, this.heading, this.currentVehicle.bodyRoll);
        this.rig.hips.position.y = 0.8;
        this.rig.torso.rotation.x = 0.48;
        this.rig.leftArm.rotation.x = -0.95;
        this.rig.rightArm.rotation.x = -0.95;
        this.rig.leftLeg.rotation.x = -0.55;
        this.rig.rightLeg.rotation.x = -0.55;
      }
      return;
    }

    this.isAiming = aiming;
    const inputLen = Math.hypot(moveForward, moveRight);
    this.isSprinting = sprint && inputLen > 0.1 && !aiming;

    // Camera-relative forward & right vectors in XZ plane
    // Camera looks along (-sin(yaw), *, -cos(yaw))
    const camFwdX = -Math.sin(cameraYaw);
    const camFwdZ = -Math.cos(cameraYaw);
    const camRightX = Math.cos(cameraYaw);
    const camRightZ = -Math.sin(cameraYaw);

    let wishX = camFwdX * moveForward + camRightX * moveRight;
    let wishZ = camFwdZ * moveForward + camRightZ * moveRight;
    const wLen = Math.hypot(wishX, wishZ);
    if (wLen > 1) {
      wishX /= wLen;
      wishZ /= wLen;
    }

    const targetMaxSpeed = aiming ? 3.8 : this.isSprinting ? 8.6 : 5.2;
    const targetVx = wishX * targetMaxSpeed;
    const targetVz = wishZ * targetMaxSpeed;

    const accel = this.grounded ? 14 : 4;
    this.vel.x = THREE.MathUtils.lerp(this.vel.x, targetVx, Math.min(1, dt * accel));
    this.vel.z = THREE.MathUtils.lerp(this.vel.z, targetVz, Math.min(1, dt * accel));

    if (jump && this.grounded) {
      this.vel.y = 7.6;
      this.grounded = false;
    }

    this.vel.y -= 20.5 * dt;
    const prevY = this.pos.y;
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.pos.z += this.vel.z * dt;

    // Bounds clamp (keep swimmer near Vespucci surf)
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -328, WORLD_BOUNDS.maxX);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, WORLD_BOUNDS.minZ, WORLD_BOUNDS.maxZ);

    // Floor: terrain + stunt ramps + skyscraper rooftops (e.g. after landing chopper on Maze Bank!)
    let floorY = Math.max(-0.65, sampleBaseTerrainHeight(this.pos.x, this.pos.z));
    const ramp = sampleRampHeight(this.pos.x, this.pos.z, ramps);
    if (ramp.ramp && prevY >= ramp.height - 0.8) {
      floorY = Math.max(floorY, ramp.height);
    }

    const r = 0.42;
    for (const b of colliders) {
      const inXZ =
        this.pos.x + r > b.minX &&
        this.pos.x - r < b.maxX &&
        this.pos.z + r > b.minZ &&
        this.pos.z - r < b.maxZ;
      if (!inXZ) continue;

      if (prevY >= b.maxY - 0.5) {
        floorY = Math.max(floorY, b.maxY);
      } else if (this.pos.y < b.maxY && this.pos.y + 1.8 > b.minY) {
        // Smooth circle-vs-AABB pushout
        const cx = THREE.MathUtils.clamp(this.pos.x, b.minX, b.maxX);
        const cz = THREE.MathUtils.clamp(this.pos.z, b.minZ, b.maxZ);
        const dx = this.pos.x - cx;
        const dz = this.pos.z - cz;
        const d = Math.hypot(dx, dz);
        if (d > 0.0001 && d < r) {
          this.pos.x += (dx / d) * (r - d);
          this.pos.z += (dz / d) * (r - d);
        } else if (d <= 0.0001) {
          this.pos.z = b.maxZ + r;
        }
      }
    }

    if (this.pos.y <= floorY) {
      // High fall damage (e.g. jumping off Maze Bank!)
      if (this.vel.y < -22) {
        this.takeDamage((Math.abs(this.vel.y) - 20) * 4.5);
      }
      this.pos.y = floorY;
      this.vel.y = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }

    // Smooth character rotation: face camera forward when aiming, face travel direction otherwise!
    if (aiming) {
      const aimHeading = Math.atan2(camFwdX, camFwdZ);
      this.heading = lerpAngle(this.heading, aimHeading, Math.min(1, dt * 18));
    } else if (wLen > 0.08) {
      const moveHeading = Math.atan2(wishX, wishZ);
      this.heading = lerpAngle(this.heading, moveHeading, Math.min(1, dt * 11));
    }

    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.set(0, this.heading, 0);

    const hSpeed = Math.hypot(this.vel.x, this.vel.z);
    this.rig.updateAnimation(
      dt,
      hSpeed,
      this.isSprinting,
      this.grounded,
      aiming,
      -cameraPitch,
      this.dead
    );
  }
}

export function lerpAngle(a: number, b: number, t: number): number {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}
