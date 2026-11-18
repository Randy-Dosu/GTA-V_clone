import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CameraController } from '../src/core/CameraController';
import { Player } from '../src/entities/Player';
import { Vehicle } from '../src/entities/Vehicle';
import { VehicleFactory } from '../src/entities/VehicleFactory';
import { EffectsManager } from '../src/graphics/EffectsManager';
import { TextureFactory } from '../src/graphics/TextureFactory';
import { BuildingCollider } from '../src/types';
import { createDefaultStuntRamps } from '../src/world/WorldData';

function makeVehicleFactory(): VehicleFactory {
  const mockRenderer = {
    capabilities: { getMaxAnisotropy: () => 8 },
  } as unknown as THREE.WebGLRenderer;
  return new VehicleFactory(new TextureFactory(mockRenderer));
}

describe('Player, Vehicles, Helicopter & Camera Physics', () => {
  it('supports proportional analog walking, jogging, sprinting, and jumping on foot', () => {
    const scene = new THREE.Scene();
    const player = new Player(scene);
    const ramps = createDefaultStuntRamps();

    const measureDistance = (stickMag: number, sprint: boolean): number => {
      player.pos.set(0, 0.14, 0);
      player.vel.set(0, 0, 0);
      player.grounded = true;
      for (let i = 0; i < 30; i++) {
        player.updateOnFoot(1 / 60, stickMag, 0, sprint, false, false, 0, 0, [], ramps);
      }
      return Math.hypot(player.pos.x, player.pos.z);
    };

    const analogWalk = measureDistance(0.4, false);
    const fullJog = measureDistance(1.0, false);
    const fullSprint = measureDistance(1.0, true);

    expect(analogWalk).toBeGreaterThan(0.4);
    expect(fullJog).toBeGreaterThan(analogWalk * 1.6);
    expect(fullSprint).toBeGreaterThan(fullJog * 1.25);

    // Jump launches upward and gravity brings player back to ground
    player.pos.set(0, 0, 0);
    player.grounded = true;
    player.updateOnFoot(1 / 60, 0, 0, false, true, false, 0, 0, [], []);
    expect(player.grounded).toBe(false);
    expect(player.vel.y).toBeGreaterThan(4);

    for (let i = 0; i < 90; i++) {
      player.updateOnFoot(1 / 60, 0, 0, false, false, false, 0, 0, [], []);
    }
    expect(player.grounded).toBe(true);
    expect(player.pos.y).toBeCloseTo(0, 1);
  });

  it('handles weapons, reload cycle, armor/health damage, WASTED, hospital respawn, hero switch & specials', () => {
    const scene = new THREE.Scene();
    const player = new Player(scene);

    // Equip pistol, spend rounds, reload
    player.equipWeapon('pistol');
    expect(player.currentWeapon).toBe('pistol');
    const slot = player.weapons.pistol;
    const initialReserve = slot.reserve;
    slot.inMag -= 5;
    expect(player.startReload()).toBe(true);
    expect(player.reloadTimer).toBeGreaterThan(0);

    player.updateSpecialAndVitals(3.0);
    expect(player.reloadTimer).toBe(0);
    expect(slot.inMag).toBe(player.getWeaponSpec('pistol').magSize);
    expect(slot.reserve).toBe(initialReserve - 5);

    // Franklin's Driving Focus requires a vehicle; Michael & Trevor activate on foot
    expect(player.toggleSpecial()).toBe(false);
    player.pos.set(12, 0.14, 34);
    player.switchCharacterModel('michael');
    expect(player.characterId).toBe('michael');
    expect(player.savedSpots.franklin.pos.x).toBeCloseTo(12, 3);

    expect(player.toggleSpecial()).toBe(true);
    expect(player.specialActive).toBe(true);
    player.updateSpecialAndVitals(1.0);
    expect(player.special).toBeLessThan(100);
    player.toggleSpecial();
    expect(player.specialActive).toBe(false);

    player.switchCharacterModel('trevor');
    expect(player.characterId).toBe('trevor');
    expect(player.toggleSpecial()).toBe(true);
    player.toggleSpecial();

    // Damage consumes armor first, then health, then sets dead; hospital respawn restores vitals
    player.armor = 50;
    player.health = 100;
    player.takeDamage(30);
    expect(player.armor).toBeLessThan(50);
    player.takeDamage(500);
    expect(player.dead).toBe(true);
    expect(player.health).toBe(0);

    const cashBefore = player.cash;
    player.respawnAtHospital();
    expect(player.dead).toBe(false);
    expect(player.health).toBe(player.maxHealth);
    expect(player.cash).toBeLessThanOrEqual(cashBefore);
  });

  it('simulates proportional analog driving, steering, drifting, boost, collisions, LS Customs & explosions', () => {
    const scene = new THREE.Scene();
    const factory = makeVehicleFactory();
    const effects = new EffectsManager(scene);

    const measureTopSpeed = (throttle: number, boost: boolean): number => {
      const car = new Vehicle(factory, scene, 'supercar', 0, 0, 0, 0);
      car.isPlayerDriven = true;
      for (let i = 0; i < 60; i++) {
        car.update(
          1 / 60,
          { throttle, steer: 0, handbrake: false, boost, ascend: 0, focusGrip: false },
          [],
          [],
          effects,
          0
        );
      }
      return car.speed;
    };

    const halfThrottle = measureTopSpeed(0.45, false);
    const fullThrottle = measureTopSpeed(1.0, false);
    const boosted = measureTopSpeed(1.0, true);
    expect(halfThrottle).toBeGreaterThan(3);
    expect(fullThrottle).toBeGreaterThan(halfThrottle * 1.4);
    expect(boosted).toBeGreaterThan(fullThrottle);

    // Left steering (+1) increases heading; handbrake triggers drift intensity
    const driftCar = new Vehicle(factory, scene, 'muscle', 0, 0, 0, 0);
    driftCar.isPlayerDriven = true;
    for (let i = 0; i < 50; i++) {
      driftCar.update(
        1 / 60,
        { throttle: 1, steer: 0, handbrake: false, boost: false, ascend: 0, focusGrip: false },
        [],
        [],
        effects,
        0
      );
    }
    const h0 = driftCar.heading;
    for (let i = 0; i < 25; i++) {
      driftCar.update(
        1 / 60,
        { throttle: 0.8, steer: 1, handbrake: true, boost: false, ascend: 0, focusGrip: false },
        [],
        [],
        effects,
        0
      );
    }
    expect(driftCar.heading).toBeGreaterThan(h0);
    expect(driftCar.driftIntensity).toBeGreaterThan(0);

    // Collision detection against a solid wall invokes onCollision
    let collided = false;
    const wall: BuildingCollider[] = [{ minX: -10, maxX: 10, minZ: 5, maxZ: 12, minY: 0, maxY: 20 }];
    const crashCar = new Vehicle(factory, scene, 'sedan', 0, 0, 0, 0);
    crashCar.isPlayerDriven = true;
    crashCar.vel.set(0, 0, 22);
    crashCar.speed = 22;
    for (let i = 0; i < 30; i++) {
      crashCar.update(
        1 / 60,
        { throttle: 1, steer: 0, handbrake: false, boost: false, ascend: 0, focusGrip: false },
        wall,
        [],
        effects,
        0,
        { onCollision: () => (collided = true) }
      );
    }
    expect(collided).toBe(true);

    // LS Customs paint, neon, repair & lethal explosion
    crashCar.setPaintColor(0x12a854);
    expect(crashCar.colorHex).toBe(0x12a854);
    crashCar.setNeon(0x00f0ff);
    expect(crashCar.neonColor).toBe(0x00f0ff);
    crashCar.repair();
    expect(crashCar.health).toBe(crashCar.maxHealth);

    let exploded = false;
    crashCar.applyDamage(99999, effects, () => {
      exploded = true;
    });
    expect(crashCar.destroyed).toBe(true);
    expect(exploded).toBe(true);
  });

  it('flies and lands the Buckingham Maverick helicopter smoothly', () => {
    const scene = new THREE.Scene();
    const factory = makeVehicleFactory();
    const effects = new EffectsManager(scene);
    const heli = new Vehicle(factory, scene, 'helicopter', 0, 0, 0, 0);
    heli.isPlayerDriven = true;

    for (let i = 0; i < 90; i++) {
      heli.update(
        1 / 60,
        { throttle: 0.7, steer: 0.3, handbrake: false, boost: false, ascend: 1.0, focusGrip: false },
        [],
        [],
        effects,
        0.9
      );
    }
    expect(heli.pos.y).toBeGreaterThan(5);
    expect(heli.airborne).toBe(true);
    expect(Math.hypot(heli.pos.x, heli.pos.z)).toBeGreaterThan(2);

    // Enter/exit vehicle lifecycle with Player
    const player = new Player(scene);
    player.enterVehicle(heli);
    expect(player.currentVehicle).toBe(heli);
    const exited = player.exitVehicle();
    expect(exited).toBe(heli);
    expect(player.currentVehicle).toBeNull();
  });

  it('orients CameraController correctly behind entities (heading + PI) and runs satellite switch', () => {
    const scene = new THREE.Scene();
    const player = new Player(scene);
    player.heading = Math.PI * 0.5; // Facing East (+X)
    player.pos.set(0, 0, 0);

    const cam = new CameraController(16 / 9);
    cam.triggerIntroDrop(player);
    // Advance past intro drop so chase camera settles behind player (-X side looking toward +X)
    for (let i = 0; i < 160; i++) {
      cam.update(1 / 30, 'playing', player, [], false);
    }
    expect(cam.camera.position.x).toBeLessThan(player.pos.x - 2);

    // Cycle camera distance presets
    const firstPreset = cam.cycleDistance();
    expect(firstPreset.length).toBeGreaterThan(0);

    // GTA V satellite switch fires swap and completion callbacks cleanly
    let swapped = false;
    let completed = false;
    cam.startCharacterSwitch(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(-120, 0, -90),
      Math.PI,
      () => {},
      () => {
        swapped = true;
      },
      () => {
        completed = true;
      }
    );
    for (let i = 0; i < 240; i++) {
      cam.update(1 / 30, 'switching', player, [], false);
    }
    expect(swapped).toBe(true);
    expect(completed).toBe(true);
  });
});
