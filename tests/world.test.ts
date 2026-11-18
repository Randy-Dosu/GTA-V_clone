import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { TextureFactory } from '../src/graphics/TextureFactory';
import { CHARACTER_PROFILES } from '../src/types';
import { CityBuilder } from '../src/world/CityBuilder';
import {
  computeGPSRoute,
  createDefaultStuntRamps,
  getDistrictAndStreet,
  isOnRoad,
  LANDMARKS,
  ROAD_COORDS,
  sampleBaseTerrainHeight,
  sampleRampHeight,
  WORLD_BOUNDS,
} from '../src/world/WorldData';

describe('Los Santos World, Terrain, GPS & 3D City Builder', () => {
  it('samples finite terrain heights across the entire world and models hills, roads, and ocean', () => {
    for (let x = WORLD_BOUNDS.minX; x <= WORLD_BOUNDS.maxX; x += 45) {
      for (let z = WORLD_BOUNDS.minZ; z <= WORLD_BOUNDS.maxZ; z += 45) {
        const h = sampleBaseTerrainHeight(x, z);
        expect(Number.isFinite(h)).toBe(true);
      }
    }

    // Downtown road intersections are flat at ground level
    for (const rx of ROAD_COORDS) {
      for (const rz of ROAD_COORDS) {
        expect(isOnRoad(rx, rz)).toBe(true);
        expect(Math.abs(sampleBaseTerrainHeight(rx, rz))).toBeLessThan(0.25);
      }
    }

    // Vinewood Hills in the north rise well above downtown street level
    expect(sampleBaseTerrainHeight(-55, -335)).toBeGreaterThan(15);

    // Pacific Ocean to the far west slopes below sea level
    expect(sampleBaseTerrainHeight(-400, 0)).toBeLessThan(0);
  });

  it('resolves non-empty Los Santos district and street names across regions', () => {
    const spots: Array<[number, number]> = [
      [0, 0],        // Downtown / Legion Square
      [-140, -110],  // Rockford Hills
      [-55, -330],   // Vinewood Hills
      [-310, 80],    // Vespucci Beach
      [150, 140],    // East Los Santos
    ];
    for (const [x, z] of spots) {
      const info = getDistrictAndStreet(x, z);
      expect(info.district.length).toBeGreaterThan(2);
      expect(info.street.length).toBeGreaterThan(2);
    }
  });

  it('computes valid road-snapped GPS routes between protagonists and key landmarks', () => {
    const franklin = CHARACTER_PROFILES.franklin.defaultSpawn;
    for (const lm of LANDMARKS) {
      const route = computeGPSRoute(franklin.x, franklin.z, lm.x, lm.z);
      expect(route.length).toBeGreaterThanOrEqual(2);
      for (const pt of route) {
        expect(Number.isFinite(pt.x)).toBe(true);
        expect(Number.isFinite(pt.z)).toBe(true);
      }
      const end = route[route.length - 1];
      expect(Math.hypot(end.x - lm.x, end.z - lm.z)).toBeLessThan(1e-3);
    }
  });

  it('evaluates stunt ramp elevation smoothly along ramp decks', () => {
    const ramps = createDefaultStuntRamps();
    expect(ramps.length).toBeGreaterThanOrEqual(3);
    for (const r of ramps) {
      const mid = sampleRampHeight(r.x, r.z, ramps);
      expect(mid.ramp).not.toBeNull();
      expect(mid.height).toBeGreaterThan(0.2);
    }
  });

  it('builds the entire 3D city with clear spawns for all protagonists, shops, and hospital', () => {
    const scene = new THREE.Scene();
    const mockRenderer = {
      capabilities: { getMaxAnisotropy: () => 8 },
    } as unknown as THREE.WebGLRenderer;
    const textures = new TextureFactory(mockRenderer);
    const ramps = createDefaultStuntRamps();
    const city = new CityBuilder(scene, textures, ramps);

    expect(city.colliders.length).toBeGreaterThan(25);
    expect(city.footprints.length).toBeGreaterThan(15);
    expect(city.explodables.length).toBeGreaterThan(0);

    // Every collider has valid non-inverted finite bounds
    for (const c of city.colliders) {
      expect(c.maxX).toBeGreaterThan(c.minX);
      expect(c.maxZ).toBeGreaterThan(c.minZ);
      expect(c.maxY).toBeGreaterThan(c.minY);
      expect(Number.isFinite(c.minX + c.maxX + c.minY + c.maxY + c.minZ + c.maxZ)).toBe(true);
    }

    const overlapsSolidAtGround = (x: number, z: number, y = 0.5, pad = 0.35) =>
      city.colliders.find(
        (c) =>
          y >= c.minY &&
          y <= c.maxY &&
          x > c.minX - pad &&
          x < c.maxX + pad &&
          z > c.minZ - pad &&
          z < c.maxZ + pad
      );

    // Franklin, Michael, Trevor spawns must never clip inside a building
    for (const id of ['franklin', 'michael', 'trevor'] as const) {
      const sp = CHARACTER_PROFILES[id].defaultSpawn;
      expect(overlapsSolidAtGround(sp.x, sp.z, sp.y + 0.5)).toBeUndefined();
    }

    // Ammu-Nation door (28, 92), LS Customs drive-in (82, 88), Hospital respawn (28, -15) are clear
    expect(overlapsSolidAtGround(28, 92, 0.6, 0.25)).toBeUndefined();
    expect(overlapsSolidAtGround(82, 88, 0.6, 0.25)).toBeUndefined();
    expect(overlapsSolidAtGround(28, -15, 0.6, 0.25)).toBeUndefined();

    // Dynamic city animation (Del Perro Ferris Wheel, night lamps, beacons) runs cleanly
    expect(() => city.update(0.016, 0.85, 12.5)).not.toThrow();
  });
});
