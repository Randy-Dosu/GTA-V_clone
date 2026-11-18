import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { AudioEngine } from '../src/core/AudioEngine';
import { Player } from '../src/entities/Player';
import { VehicleFactory } from '../src/entities/VehicleFactory';
import { MissionSystem } from '../src/gameplay/MissionSystem';
import { PoliceSystem } from '../src/gameplay/PoliceSystem';
import { EffectsManager } from '../src/graphics/EffectsManager';
import { TextureFactory } from '../src/graphics/TextureFactory';
import { createDefaultStuntRamps } from '../src/world/WorldData';
import { TrafficAndPeds } from '../src/world/TrafficAndPeds';

describe('Traffic, LSPD Police Pursuit & Story Missions', () => {
  const createSandbox = () => {
    const scene = new THREE.Scene();
    const mockRenderer = {
      capabilities: { getMaxAnisotropy: () => 8 },
    } as unknown as THREE.WebGLRenderer;
    const factory = new VehicleFactory(new TextureFactory(mockRenderer));
    const effects = new EffectsManager(scene);
    const ramps = createDefaultStuntRamps();
    const audio = new AudioEngine();
    const player = new Player(scene);
    const traffic = new TrafficAndPeds(scene, factory, []);
    const police = new PoliceSystem(scene, factory, traffic);
    const missions = new MissionSystem(scene, traffic, police, audio);
    return { scene, factory, effects, ramps, audio, player, traffic, police, missions };
  };

  it('spawns signature & traffic vehicles, pedestrians, and updates AI without NaNs', () => {
    const { traffic, player, effects, ramps } = createSandbox();

    expect(traffic.vehicles.length).toBeGreaterThan(8);
    expect(traffic.peds.length).toBeGreaterThan(10);

    // Spawn Franklin's parked Pegassi Zentorno beside his spawn and verify nearest-car lookup
    traffic.spawnParkedVehicle(
      'supercar',
      player.pos.x + 2.5,
      player.pos.y,
      player.pos.z,
      Math.PI,
      0xf4f6f9
    );
    const nearby = traffic.findNearestEnterableVehicle(player.pos);
    expect(nearby).not.toBeNull();
    expect(nearby!.kind).toBe('supercar');

    for (let i = 0; i < 20; i++) {
      traffic.update(1 / 30, player.pos, player, [], ramps, effects, 0.2, {
        onPlayerCollision: () => {},
        onPedKilledByPlayer: () => {},
        onVehicleExplode: () => {},
      });
    }
    for (const v of traffic.vehicles) {
      expect(Number.isFinite(v.pos.x + v.pos.y + v.pos.z)).toBe(true);
    }
  });

  it('keeps walking humans out of car bodies — peds and player cannot clip through vehicles', () => {
    const { traffic, player, effects, ramps } = createSandbox();

    // Park a sedan facing +Z in a quiet block, well clear of the road grid
    // so passing traffic doesn't jostle the test subjects
    const car = traffic.spawnParkedVehicle('sedan', -40, 0, -20, 0, 0xf4f6f9);
    const halfL = car.spec.halfLength;
    const halfW = car.spec.halfWidth;

    // Probe the OBB with a 0.30 margin — the resolver pushes with 0.34, so a
    // correctly-resolved character sits at least 4cm outside this probe.
    const insideOBB = (px: number, pz: number, radius: number): boolean => {
      const dx = px - car.pos.x;
      const dz = pz - car.pos.z;
      return Math.abs(dx) < halfW + radius && Math.abs(dz) < halfL + radius; // heading 0: fwd = +Z
    };

    // 1. A pedestrian placed INSIDE the chassis gets pushed fully out
    const ped = traffic.peds[0];
    ped.pos.set(car.pos.x, 0, car.pos.z);
    ped.pauseTimer = 99; // keep them still so only the pushout moves them
    for (let i = 0; i < 6; i++) {
      traffic.update(1 / 30, player.pos, player, [], ramps, effects, 0.2, {
        onPlayerCollision: () => {},
        onPedKilledByPlayer: () => {},
        onVehicleExplode: () => {},
      });
    }
    expect(insideOBB(ped.pos.x, ped.pos.z, 0.3)).toBe(false);

    // 2. Player walking into the car NOSE (the old leak) is blocked at the bumper
    player.pos.set(car.pos.x, 0.14, car.pos.z + halfL - 0.05);
    player.vel.set(0, 0, 5); // marching straight into the nose
    for (let i = 0; i < 10; i++) {
      player.updateOnFoot(1 / 30, 1, 0, false, false, false, Math.PI, 0, [], [], traffic.vehicles);
    }
    expect(insideOBB(player.pos.x, player.pos.z, 0.3)).toBe(false);

    // 3. Walking through the car SIDE is blocked too
    player.pos.set(car.pos.x + halfW - 0.05, 0.14, car.pos.z);
    player.vel.set(0, 0, 0);
    for (let i = 0; i < 10; i++) {
      player.updateOnFoot(1 / 30, 0, 1, false, false, false, Math.PI, 0, [], [], traffic.vehicles);
    }
    expect(insideOBB(player.pos.x, player.pos.z, 0.3)).toBe(false);
  });

  it('escalates LSPD wanted stars 1..5, dispatches cruisers, and clears wanted heat cleanly', () => {
    const { police, player, effects, ramps, audio } = createSandbox();
    expect(police.wantedLevel).toBe(0);

    police.reportCrime(15, 1);
    expect(police.wantedLevel).toBe(1);

    police.reportCrime(60, 3);
    expect(police.wantedLevel).toBeGreaterThanOrEqual(3);

    police.reportCrime(300, 5);
    expect(police.wantedLevel).toBe(5);

    // Update spawns active LSPD pursuit units and handles gunfire SFX
    for (let i = 0; i < 90; i++) {
      police.update(1 / 20, player, [], ramps, effects, audio, 0.5, () => {});
    }
    expect(police.units.length).toBeGreaterThan(0);

    // Lester / LS Customs clearWanted resets stars and pursuit state
    police.clearWanted();
    expect(police.wantedLevel).toBe(0);
    expect(police.crimeHeat).toBe(0);
    expect(police.evading).toBe(false);
  });

  it('starts, tracks objectives, and aborts all 6 Los Santos Story Missions cleanly', () => {
    const { missions, player, effects, ramps } = createSandbox();
    expect(missions.missions.length).toBe(6);
    expect(missions.missions.map((m) => m.id)).toEqual([
      'franklin_sprint',
      'simeon_repo',
      'lester_heist',
      'michael_chopper',
      'collector_run',
      'cab_fares',
    ]);

    for (const m of missions.missions) {
      expect(m.reward).toBeGreaterThan(0);
      expect(m.title.length).toBeGreaterThan(2);

      // Standing at the mission marker finds the trigger
      player.pos.set(m.x, 0.14, m.z);
      const found = missions.findNearbyMissionTrigger(player.pos);
      expect(found?.id).toBe(m.id);

      let bannerShown = false;
      missions.startMission(m, player, () => {
        bannerShown = true;
      });
      expect(bannerShown).toBe(true);
      expect(missions.activeMission?.id).toBe(m.id);

      const obj = missions.getActiveObjective();
      expect(obj).not.toBeNull();
      expect(obj!.subtitleHtml.length).toBeGreaterThan(4);

      // Simulate mission update frames safely
      for (let i = 0; i < 10; i++) {
        missions.update(
          1 / 30,
          player,
          [],
          ramps,
          effects,
          0.1,
          () => {},
          () => {},
          () => {}
        );
      }

      // Abort cleanly before testing the next mission
      let failedCalled = false;
      missions.abortMission('Cancelled', () => {
        failedCalled = true;
      });
      expect(failedCalled).toBe(true);
      expect(missions.activeMission).toBeNull();
      expect(missions.getActiveObjective()).toBeNull();
    }
  });
});
