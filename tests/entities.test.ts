import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CameraController } from '../src/core/CameraController';
import { CharacterRig } from '../src/entities/CharacterMesh';
import { Player } from '../src/entities/Player';
import { Vehicle } from '../src/entities/Vehicle';
import { VehicleFactory } from '../src/entities/VehicleFactory';
import { EffectsManager } from '../src/graphics/EffectsManager';
import { TextureFactory } from '../src/graphics/TextureFactory';
import { BuildingCollider, VEHICLE_SPECS, VehicleKind } from '../src/types';
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

  it('builds luxury, vintage and cab vehicles with sane specs and drivable physics', () => {
    const scene = new THREE.Scene();
    const factory = makeVehicleFactory();
    const effects = new EffectsManager(scene);
    const kinds: VehicleKind[] = ['luxury', 'vintage', 'cab'];

    for (const kind of kinds) {
      const spec = VEHICLE_SPECS[kind];
      expect(spec).toBeDefined();
      expect(spec.maxSpeed).toBeGreaterThan(20);
      expect(spec.maxSpeed).toBeLessThan(50); // street cars, not hypercars
      expect(spec.colors.length).toBeGreaterThan(0);

      const car = new Vehicle(factory, scene, kind, 0, 0, 0, 0);
      car.isPlayerDriven = true;
      expect(car.rig).toBeDefined();
      expect(car.rig.root).toBeDefined();
      expect(scene.children.length).toBeGreaterThan(0);

      for (let i = 0; i < 30; i++) {
        car.update(
          1 / 60,
          { throttle: 0.8, steer: 0.2, handbrake: false, boost: false, ascend: 0, focusGrip: false },
          [],
          [],
          effects,
          0
        );
      }
      expect(Number.isNaN(car.pos.x)).toBe(false);
      expect(Number.isNaN(car.pos.z)).toBe(false);
      expect(car.speed).toBeGreaterThan(4);
      scene.clear();
    }

    // Cabs always come in the signature taxi yellow
    expect(VEHICLE_SPECS.cab.colors).toEqual([0xf5b800]);
  });

  it('animates a stride-locked walk cycle with visible leg swings at real speeds', () => {
    const scene = new THREE.Scene();
    const player = new Player(scene);

    // Walking pace (~1.4 m/s): legs must sweep visibly (>= 0.28 rad) — no more moonwalk glide
    player.rig.walkPhase = 0;
    let minLeg = Infinity;
    let maxLeg = -Infinity;
    for (let i = 0; i < 120; i++) {
      player.rig.updateAnimation(1 / 60, 1.4, false, true, false);
      const a = player.rig.leftLeg.rotation.x;
      minLeg = Math.min(minLeg, a);
      maxLeg = Math.max(maxLeg, a);
    }
    expect(maxLeg - minLeg).toBeGreaterThan(0.28);

    // Sprint pace: even bigger sweep
    minLeg = Infinity;
    maxLeg = -Infinity;
    for (let i = 0; i < 120; i++) {
      player.rig.updateAnimation(1 / 60, 8.0, true, true, false);
      const a = player.rig.leftLeg.rotation.x;
      minLeg = Math.min(minLeg, a);
      maxLeg = Math.max(maxLeg, a);
    }
    expect(maxLeg - minLeg).toBeGreaterThan(0.6);

    // Idle: legs settle near zero with subtle weight-shift sway (not frozen, not walking)
    for (let i = 0; i < 90; i++) {
      player.rig.updateAnimation(1 / 60, 0, false, true, false);
    }
    expect(Math.abs(player.rig.leftLeg.rotation.x)).toBeLessThan(0.09);
    expect(Math.abs(player.rig.rightLeg.rotation.x)).toBeLessThan(0.09);
    // Idle arms keep a natural bend rather than snapping straight
    expect(player.rig.leftElbow.rotation.x).toBeLessThan(-0.05);
  });

  it('smooths vehicle steering and spins the wheels proportionally to speed', () => {
    const scene = new THREE.Scene();
    const factory = makeVehicleFactory();
    const effects = new EffectsManager(scene);
    const car = new Vehicle(factory, scene, 'sedan', 0, 0, 0, 0);
    car.isPlayerDriven = true;

    // First frame: steering must interpolate (not snap) toward the input
    car.update(
      1 / 60,
      { throttle: 0.6, steer: 1, handbrake: false, boost: false, ascend: 0, focusGrip: false },
      [],
      [],
      effects,
      0
    );
    expect(car.steerAngle).toBeGreaterThan(0.05);
    expect(car.steerAngle).toBeLessThan(0.95);

    // Sustained input converges to full lock
    for (let i = 0; i < 45; i++) {
      car.update(
        1 / 60,
        { throttle: 0.6, steer: 1, handbrake: false, boost: false, ascend: 0, focusGrip: false },
        [],
        [],
        effects,
        0
      );
    }
    expect(car.steerAngle).toBeGreaterThan(0.97);

    // Wheels spin forward with speed (visible rolling, not sliding)
    const wheel = car.rig.wheelMeshes[0];
    expect(wheel).toBeDefined();
    const spinBefore = wheel.rotation.x;
    car.update(
      1 / 60,
      { throttle: 0.8, steer: 0, handbrake: false, boost: false, ascend: 0, focusGrip: false },
      [],
      [],
      effects,
      0
    );
    expect(wheel.rotation.x).toBeGreaterThan(spinBefore);

    // Body visibly rolls into sustained cornering (suspension behaviour)
    for (let i = 0; i < 60; i++) {
      car.update(
        1 / 60,
        { throttle: 0.7, steer: 0.9, handbrake: false, boost: false, ascend: 0, focusGrip: false },
        [],
        [],
        effects,
        0
      );
    }
    expect(Math.abs(car.bodyRoll)).toBeGreaterThan(0.01);
  });

  it('renders female builds with distinct proportions, pelvis yaw & dynamic spine lean', () => {
    const scene = new THREE.Scene();
    const male = new CharacterRig({ skin: 0xa78168, hair: 0x1c1410, top: 0x2a2f38, pants: 0x1f2937, shoes: 0x111318 });
    const female = new CharacterRig({
      skin: 0x8a5a3b, hair: 0x2a1a10, top: 0x7f1d3a, pants: 0x1f2937, shoes: 0x111318, bodyType: 'female',
    });
    scene.add(male.root, female.root);

    // Female builds stand lower (1.76 m vs 1.82 m total height)
    male.updateAnimation(0.016, 0, false, true, false);
    female.updateAnimation(0.016, 0, false, true, false);
    expect(female.hips.position.y).toBeLessThan(male.hips.position.y - 0.03);
    expect(female.hips.position.y).toBeGreaterThan(0.8);

    // Pelvis yaw counter-rotates against the shoulders during the gait
    female.hips.rotation.y = 0;
    let maxPelvisYaw = 0;
    for (let i = 0; i < 45; i++) {
      female.updateAnimation(1 / 60, 1.4, false, true, false);
      maxPelvisYaw = Math.max(maxPelvisYaw, Math.abs(female.hips.rotation.y));
    }
    expect(maxPelvisYaw).toBeGreaterThan(0.01);

    // Spine leans forward under acceleration and into turns
    for (let i = 0; i < 60; i++) {
      female.updateAnimation(1 / 60, 4.5, false, true, false, 0, false, false, 7, 0);
    }
    expect(female.torso.rotation.x).toBeGreaterThan(0.08);
    for (let i = 0; i < 60; i++) {
      female.updateAnimation(1 / 60, 4.5, false, true, false, 0, false, false, 0, 2.2);
    }
    expect(Math.abs(female.torso.rotation.z)).toBeGreaterThan(0.05);
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

describe('Physics: swimming, water drag & solid-body collisions', () => {
  it('floats and swims at the surf line instead of sinking to the seabed', () => {
    const scene = new THREE.Scene();
    const player = new Player(scene);
    // Deep Pacific surf west of Vespucci Beach (terrain ≈ -0.6)
    player.pos.set(-325, 0.2, 0);
    player.vel.set(0, 0, 0);
    player.grounded = false;

    for (let i = 0; i < 90; i++) {
      player.updateOnFoot(1 / 60, 0, 0, false, false, false, 0, 0, [], [], []);
    }
    expect(player.swimming).toBe(true);
    // Buoyancy holds the body at the surface, well above the seabed
    expect(player.pos.y).toBeGreaterThan(-0.5);
    expect(player.pos.y).toBeLessThan(0.35);

    // Swimming forward moves the player through the water
    const startX = player.pos.x;
    for (let i = 0; i < 60; i++) {
      player.updateOnFoot(1 / 60, 1, 0, false, false, false, Math.PI * 0.5, 0, [], [], []);
    }
    expect(Math.abs(player.pos.x - startX)).toBeGreaterThan(0.5);
  });

  it('applies water drag so cars slow down and sink in the surf', () => {
    const scene = new THREE.Scene();
    const factory = makeVehicleFactory();
    const effects = new EffectsManager(scene);
    const car = new Vehicle(factory, scene, 'sedan', -325, 0, 0, 0);
    car.isPlayerDriven = true;
    car.vel.set(0, 0, 18);
    car.speed = 18;

    for (let i = 0; i < 60; i++) {
      car.update(1 / 60, { throttle: 0, steer: 0, handbrake: false, boost: false, ascend: 0 }, [], [], effects, 0);
    }
    // Water resistance bleeds speed far faster than dry rolling resistance
    expect(car.speed).toBeLessThan(8);
    expect(car.pos.y).toBeLessThan(0.2);
  });

  it('blocks the on-foot player from walking through vehicles', () => {
    const scene = new THREE.Scene();
    const factory = makeVehicleFactory();
    const player = new Player(scene);
    const car = new Vehicle(factory, scene, 'sedan', 0, 0, 0, 0);
    car.isPlayerDriven = false;

    // Walk straight into the parked car's side
    player.pos.set(-2.5, 0.14, 0);
    player.vel.set(0, 0, 0);
    player.grounded = true;
    for (let i = 0; i < 120; i++) {
      player.updateOnFoot(1 / 60, 0, 1, false, false, false, 0, 0, [], [], [car]);
    }
    // The car body keeps the player out — never reaches the center
    expect(Math.hypot(player.pos.x - car.pos.x, player.pos.z - car.pos.z)).toBeGreaterThan(0.9);
  });

  it('resolves traffic-car building collisions instead of clipping through', () => {
    const scene = new THREE.Scene();
    const factory = makeVehicleFactory();
    const effects = new EffectsManager(scene);
    const wall: BuildingCollider[] = [{ minX: -10, maxX: 10, minZ: 5, maxZ: 12, minY: 0, maxY: 20 }];
    const car = new Vehicle(factory, scene, 'sedan', 0, 0, 0, 0);
    car.isTraffic = true;
    car.vel.set(0, 0, 14);
    car.speed = 14;

    for (let i = 0; i < 60; i++) {
      car.update(1 / 60, { throttle: 1, steer: 0, handbrake: false, boost: false, ascend: 0 }, wall, [], effects, 0);
    }
    // The car is pushed out of the wall volume instead of passing through it
    expect(car.pos.z).toBeLessThan(5);
  });
});
