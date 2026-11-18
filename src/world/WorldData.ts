import * as THREE from 'three';
import { Landmark, StuntRamp } from '../types';

export const ROAD_COORDS = [-220, -110, 0, 110, 220];
export const ROAD_WIDTH = 22;
export const ROAD_HALF = ROAD_WIDTH * 0.5; // 11m
export const LANE_OFFSET = 5.2; // Right-hand US traffic lane center
export const SIDEWALK_Y = 0.14;

export const WORLD_BOUNDS = {
  minX: -410,
  maxX: 265,
  minZ: -395,
  maxZ: 265,
};

export const NS_STREET_NAMES: Record<number, string> = {
  [-220]: 'Palomino Ave',
  [-110]: 'Rockford Dr',
  [0]: 'Power Street',
  [110]: 'Strawberry Ave',
  [220]: 'Elgin Ave',
};

export const EW_STREET_NAMES: Record<number, string> = {
  [-220]: 'Vinewood Blvd',
  [-110]: 'San Andreas Ave',
  [0]: 'Vespucci Blvd',
  [110]: 'Innocence Blvd',
  [220]: 'Dutch London St',
};

export const LANDMARKS: Landmark[] = [
  {
    id: 'lsc',
    name: 'Los Santos Customs',
    shortLabel: 'LSC',
    category: 'garage',
    color: '#c084fc',
    x: 82,
    y: 0.14,
    z: 84,
    description: 'Repair, respray, install turbo & neon, clear wanted level.',
  },
  {
    id: 'ammunation',
    name: 'Ammu-Nation',
    shortLabel: 'GUN',
    category: 'shop',
    color: '#f87171',
    x: 28,
    y: 0.14,
    z: 92,
    description: 'Stock up on firearms, ammunition, and heavy body armor.',
  },
  {
    id: 'hospital',
    name: 'Pillbox Hill Medical',
    shortLabel: 'H+',
    category: 'hospital',
    color: '#4ade80',
    x: 28,
    y: 0.14,
    z: -18,
    description: 'Central Los Santos trauma and emergency medical center.',
  },
  {
    id: 'helipad_beach',
    name: 'Vespucci Helipad',
    shortLabel: 'HELI',
    category: 'helipad',
    color: '#38bdf8',
    x: -272,
    y: 0.16,
    z: 185,
    description: 'Buckingham Maverick helicopter ready for takeoff.',
  },
  {
    id: 'pier',
    name: 'Del Perro Pier',
    shortLabel: 'PIER',
    category: 'poi',
    color: '#fbbf24',
    x: -335,
    y: 3.2,
    z: 40,
    description: 'Iconic Vespucci oceanfront pier, Ferris Wheel & stunt jump.',
  },
  {
    id: 'maze_bank',
    name: 'Maze Bank Tower',
    shortLabel: 'MAZE',
    category: 'poi',
    color: '#e2e8f0',
    x: -55,
    y: 0.14,
    z: -55,
    description: 'Tallest skyscraper in Los Santos, downtown financial icon.',
  },
  {
    id: 'observatory',
    name: 'Vinewood Overlook',
    shortLabel: 'VIEW',
    category: 'poi',
    color: '#86efac',
    x: 0,
    y: 28.0,
    z: -354,
    description: 'Galileo Observatory & panoramic view beneath the VINEWOOD sign.',
  },
  {
    id: 'simeon',
    name: 'Premium Deluxe Motorsport',
    shortLabel: 'PDM',
    category: 'poi',
    color: '#60a5fa',
    x: 138,
    y: 0.14,
    z: 84,
    description: 'Simeon Yetarian\'s luxury exotic showroom.',
  },
];

export function createDefaultStuntRamps(): StuntRamp[] {
  return [
    {
      id: 'ramp_pier',
      name: 'Del Perro Pier Launch',
      x: -384,
      y: 3.2,
      z: 40,
      width: 7.5,
      length: 13,
      height: 3.2,
      dirX: -1,
      dirZ: 0,
      completed: false,
    },
    {
      id: 'ramp_vespucci',
      name: 'Vespucci Blvd Flyover',
      x: -165,
      y: 0,
      z: -5.2,
      width: 5.5,
      length: 12,
      height: 2.9,
      dirX: -1,
      dirZ: 0,
      completed: false,
    },
    {
      id: 'ramp_downtown',
      name: 'Maze Bank Plaza Jump',
      x: -18,
      y: 0.14,
      z: -24,
      width: 6.0,
      length: 11,
      height: 2.75,
      dirX: 0,
      dirZ: 1,
      completed: false,
    },
    {
      id: 'ramp_vinewood',
      name: 'Vinewood Skyline Leap',
      x: 14,
      y: 28.0,
      z: -342,
      width: 6.8,
      length: 12,
      height: 3.1,
      dirX: 0,
      dirZ: 1,
      completed: false,
    },
  ];
}

export function isOnRoad(x: number, z: number): boolean {
  if (x >= -232 && x <= 232 && z >= -232 && z <= 232) {
    for (const r of ROAD_COORDS) {
      if (Math.abs(x - r) <= ROAD_HALF || Math.abs(z - r) <= ROAD_HALF) {
        return true;
      }
    }
  }
  // Vinewood Observatory scenic road
  if (Math.abs(x) <= 9.5 && z < -220 && z >= -356) {
    return true;
  }
  return false;
}

/**
 * Smooth continuous terrain height function for all of Los Santos,
 * Vespucci Beach, Del Perro Pier, and Vinewood Hills.
 */
export function sampleBaseTerrainHeight(x: number, z: number): number {
  // Del Perro Pier deck & entrance ramp (z in [28, 52])
  if (z >= 28 && z <= 52 && x <= -234 && x >= -396) {
    if (x >= -266) {
      const t = THREE.MathUtils.clamp((-234 - x) / 32, 0, 1);
      return THREE.MathUtils.lerp(SIDEWALK_Y, 3.2, t);
    }
    return 3.2;
  }

  // Vinewood Hills (North of Vinewood Blvd, z < -234)
  if (z < -234) {
    const northDist = -234 - z; // 0 at edge, 120 at observatory, 180 at Vinewood Sign

    // Observatory road & summit plaza target height
    const roadClimb = THREE.MathUtils.clamp(northDist / 108, 0, 1);
    const smoothRoadY = roadClimb * roadClimb * (3 - 2 * roadClimb) * 28.0;

    // Natural California rolling mountain ridge
    let hillY = 0;
    if (z < -242) {
      const hd = -242 - z;
      const baseSlope = Math.pow(Math.min(hd, 260) / 170, 1.28) * 54;
      const ridge1 = Math.sin(x * 0.018 + 0.6) * 8.5 * Math.min(1, hd / 55);
      const ridge2 = Math.cos(x * 0.042 - z * 0.028) * 4.2 * Math.min(1, hd / 45);
      hillY = Math.max(0, baseSlope + ridge1 + ridge2);
    }

    // Blend cleanly into Observatory Drive (|x| <= 10, z in [-346, -234])
    if (z >= -346) {
      const dx = Math.abs(x);
      if (dx <= 10) return smoothRoadY;
      if (dx < 32) {
        const blend = THREE.MathUtils.smoothstep(dx, 10, 32);
        return THREE.MathUtils.lerp(smoothRoadY, hillY, blend);
      }
    }

    // Blend cleanly into Observatory Plaza (|x| <= 34, z in [-372, -340])
    if (z >= -388 && z < -340) {
      const dx = Math.max(0, Math.abs(x) - 34);
      const dz = z < -372 ? -372 - z : 0;
      const distFromPlaza = Math.hypot(dx, dz);
      if (distFromPlaza <= 0.01) return 28.0;
      if (distFromPlaza < 26) {
        const blend = THREE.MathUtils.smoothstep(distFromPlaza, 0, 26);
        return THREE.MathUtils.lerp(28.0, hillY, blend);
      }
    }

    // Beach transition on far northwest
    if (x < -252) {
      const westFade = THREE.MathUtils.clamp((-252 - x) / 62, 0, 1);
      return THREE.MathUtils.lerp(hillY, -0.45, westFade);
    }

    return hillY;
  }

  // Vespucci Helipad raised concrete pad
  if (x >= -288 && x <= -256 && z >= 169 && z <= 201) {
    return 0.16;
  }

  // Vespucci Beach & Pacific Shoreline (West of x = -244)
  if (x < -244) {
    if (x >= -254) {
      return SIDEWALK_Y; // Beachfront boardwalk
    }
    if (x >= -312) {
      const t = (-254 - x) / 58;
      return THREE.MathUtils.lerp(SIDEWALK_Y, -0.32, t);
    }
    // Shallow wading surf -> deeper water
    const deep = Math.min(1, (-312 - x) / 40);
    return THREE.MathUtils.lerp(-0.32, -1.05, deep);
  }

  // City grid roads at y = 0, sidewalks/blocks at y = 0.14
  if (isOnRoad(x, z)) {
    return 0.0;
  }
  return SIDEWALK_Y;
}

export function sampleRampHeight(
  x: number,
  z: number,
  ramps: StuntRamp[]
): { height: number; ramp: StuntRamp | null; progress: number } {
  for (const r of ramps) {
    const rx = x - r.x;
    const rz = z - r.z;
    // Project onto ramp forward (dirX, dirZ) and right (-dirZ, dirX)
    const along = rx * r.dirX + rz * r.dirZ;
    const across = Math.abs(-rx * r.dirZ + rz * r.dirX);
    const halfLen = r.length * 0.5;
    if (along >= -halfLen && along <= halfLen && across <= r.width * 0.5) {
      const progress = (along + halfLen) / r.length; // 0 at base, 1 at launch lip
      return {
        height: r.y + progress * r.height,
        ramp: r,
        progress,
      };
    }
  }
  return { height: -999, ramp: null, progress: 0 };
}

export function getDistrictAndStreet(x: number, z: number): {
  district: string;
  street: string;
} {
  let district = 'Downtown Los Santos';
  if (z < -245) {
    district = 'Vinewood Hills';
  } else if (z < -165) {
    district = x < -60 ? 'West Vinewood' : 'Downtown Vinewood';
  } else if (x < -244) {
    district = z > 20 && z < 65 ? 'Del Perro Pier' : 'Vespucci Beach';
  } else if (x < -140) {
    district = z < 0 ? 'Del Perro' : 'Vespucci Canals';
  } else if (x < -55 && z < -20) {
    district = 'Rockford Hills';
  } else if (x >= -65 && x <= 65 && z >= -130 && z <= 65) {
    district = 'Pillbox Hill';
  } else if (x > 65 && z > 35) {
    district = x > 165 ? 'La Mesa' : 'Strawberry';
  } else if (z > 165) {
    district = 'La Puerta';
  } else if (x > 140) {
    district = 'Mirror Park';
  }

  // Nearest street
  let bestStreet = '';
  let bestDist = 999;
  if (z < -232 && Math.abs(x) < 40) {
    bestStreet = 'Baytree Canyon Rd';
  } else if (x < -252) {
    bestStreet = z >= 25 && z <= 55 ? 'Red Desert Pier' : 'Vespucci Boardwalk';
  } else {
    for (const rx of ROAD_COORDS) {
      const d = Math.abs(x - rx);
      if (d < bestDist) {
        bestDist = d;
        bestStreet = NS_STREET_NAMES[rx];
      }
    }
    for (const rz of ROAD_COORDS) {
      const d = Math.abs(z - rz);
      if (d < bestDist) {
        bestDist = d;
        bestStreet = EW_STREET_NAMES[rz];
      }
    }
  }

  return { district, street: bestStreet };
}

/**
 * Computes a GTA V street-following GPS polyline between two world coordinates
 * along the Los Santos road grid + Vinewood Observatory road.
 */
export function computeGPSRoute(
  startX: number,
  startZ: number,
  endX: number,
  endZ: number
): Array<{ x: number; z: number }> {
  const directDist = Math.hypot(endX - startX, endZ - startZ);
  if (directDist < 48) {
    return [
      { x: startX, z: startZ },
      { x: endX, z: endZ },
    ];
  }

  const snapRoad = (v: number): number => {
    let best = ROAD_COORDS[0];
    let bd = Math.abs(v - best);
    for (const r of ROAD_COORDS) {
      const d = Math.abs(v - r);
      if (d < bd) {
        bd = d;
        best = r;
      }
    }
    return best;
  };

  const pts: Array<{ x: number; z: number }> = [{ x: startX, z: startZ }];

  // Handle Vinewood Hills start or destination via (0, -220)
  const startInHills = startZ < -245;
  const endInHills = endZ < -245;

  let sx = startInHills ? 0 : snapRoad(startX);
  let sz = startInHills ? -220 : snapRoad(startZ);
  const ex = endInHills ? 0 : snapRoad(endX);
  const ez = endInHills ? -220 : snapRoad(endZ);

  if (startInHills) {
    pts.push({ x: 0, z: startZ });
    pts.push({ x: 0, z: -220 });
  } else {
    // Snap onto nearest road axis first
    if (Math.abs(startX - sx) < Math.abs(startZ - sz)) {
      pts.push({ x: sx, z: startZ });
    } else {
      pts.push({ x: startX, z: sz });
    }
    pts.push({ x: sx, z: sz });
  }

  // Manhattan L-path along the major Los Santos boulevards
  if (sx !== ex && sz !== ez) {
    // Choose intermediate corner closest to current direction
    pts.push({ x: ex, z: sz });
    sx = ex;
  }
  if (sx !== ex || sz !== ez) {
    pts.push({ x: ex, z: ez });
  }

  if (endInHills) {
    pts.push({ x: 0, z: -348 });
  } else {
    if (Math.abs(endX - ex) < Math.abs(endZ - ez)) {
      pts.push({ x: ex, z: endZ });
    } else {
      pts.push({ x: endX, z: ez });
    }
  }

  pts.push({ x: endX, z: endZ });
  return pts;
}
