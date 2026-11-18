import * as THREE from 'three';

export type GameMode =
  | 'title'
  | 'playing'
  | 'paused'
  | 'lscustoms'
  | 'ammunation'
  | 'wasted'
  | 'switching';

export type CharacterId = 'michael' | 'franklin' | 'trevor';

export interface CharacterProfile {
  id: CharacterId;
  name: string;
  fullName: string;
  color: string;
  hexColor: number;
  abilityName: string;
  abilityDesc: string;
  skinColor: number;
  hairColor: number;
  topColor: number;
  secondaryTopColor: number;
  pantsColor: number;
  shoeColor: number;
  hairStyle?: 'short' | 'long' | 'bald' | 'cap' | 'beanie' | 'ponytail' | 'afro' | 'mohawk';
  outfit?: 'tee' | 'hoodie' | 'jacket' | 'suit' | 'police' | 'athletic';
  bodyType?: 'slim' | 'average' | 'heavy' | 'athletic' | 'female';
  beard?: boolean;
  defaultSpawn: THREE.Vector3;
  defaultHeading: number;
  signatureVehicle: VehicleKind;
  signatureColor: number;
}

export type VehicleKind =
  | 'supercar'
  | 'muscle'
  | 'suv'
  | 'sedan'
  | 'police'
  | 'bike'
  | 'helicopter'
  | 'luxury'
  | 'vintage'
  | 'cab';

export interface VehicleSpec {
  kind: VehicleKind;
  name: string;
  brand: string;
  category: string;
  maxSpeed: number;       // m/s
  reverseSpeed: number;   // m/s
  acceleration: number;   // m/s^2
  braking: number;        // m/s^2
  turnRate: number;       // rad/s at optimal speed
  grip: number;           // lateral damping factor
  driftGrip: number;      // lateral damping when handbraking
  mass: number;
  maxHealth: number;
  halfWidth: number;
  halfLength: number;
  height: number;
  wheelRadius: number;
  colors: number[];
}

export type WeaponId =
  | 'unarmed'
  | 'pistol'
  | 'smg'
  | 'rifle'
  | 'shotgun'
  | 'rpg';

export interface WeaponSpec {
  id: WeaponId;
  name: string;
  category: string;
  damage: number;
  fireRate: number;       // shots per second
  range: number;
  spread: number;
  pellets: number;
  magSize: number;
  maxReserve: number;
  reloadTime: number;
  automatic: boolean;
  projectile?: boolean;
  price: number;
  ammoPrice: number;
  stats: {
    damage: number;       // 0-100
    fireRate: number;
    accuracy: number;
    range: number;
  };
}

export type RadioStationId =
  | 'gold_coast'
  | 'bhim_fm'
  | 'scatter_fm'
  | 'off';

export interface RadioStation {
  id: RadioStationId;
  name: string;
  shortLabel: string;
  genre: string;
  host: string;
  track: string;
  color: string;
  bpm: number;
}

export type TimePreset = 'golden' | 'noon' | 'sunset' | 'night';

export type WeatherKind = 'clear' | 'haze' | 'overcast';

export interface BuildingCollider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minY: number;
  maxY: number;
  label?: string;
}

export interface StuntRamp {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  width: number;
  length: number;
  height: number;
  dirX: number; // unit direction going UP the ramp
  dirZ: number;
  completed: boolean;
}

export interface Landmark {
  id: string;
  name: string;
  shortLabel: string;
  category: 'mission' | 'shop' | 'garage' | 'helipad' | 'hospital' | 'poi';
  color: string;
  x: number;
  y: number;
  z: number;
  description: string;
}

export interface MissionMarkerInfo {
  id: string;
  letter: string;
  title: string;
  giver: string;
  color: string;
  x: number;
  y: number;
  z: number;
  reward: number;
  completed: boolean;
}

export interface GameSettings {
  mouseSensitivity: number;
  gamepadSensitivity: number;
  gamepadDeadzone: number;
  gamepadVibration: boolean;
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  soundtrackOnFoot: boolean;
  invertY: boolean;
  autoTimeCycle: boolean;
  showSpeedometer: boolean;
  graphicsQuality: 'high' | 'medium';
  /** Groq AI-powered street talk & mission briefings */
  aiDialogue: boolean;
}

export const CHARACTER_PROFILES: Record<CharacterId, CharacterProfile> = {
  franklin: {
    id: 'franklin',
    name: 'Franklin',
    fullName: 'Franklin Clinton',
    color: '#5ec96f',
    hexColor: 0x5ec96f,
    abilityName: 'Driving Focus',
    abilityDesc: 'Slows time with razor-sharp cornering control while driving',
    skinColor: 0x6b442a,
    hairColor: 0x151313,
    topColor: 0x2c8599,
    secondaryTopColor: 0xf0f4f7,
    pantsColor: 0x26354a,
    shoeColor: 0xeaeef2,
    hairStyle: 'short',
    outfit: 'tee',
    bodyType: 'athletic',
    beard: false,
    defaultSpawn: new THREE.Vector3(-18, 0.14, 18),
    defaultHeading: Math.PI,
    signatureVehicle: 'supercar',
    signatureColor: 0xf4f6f9,
  },
  michael: {
    id: 'michael',
    name: 'Michael',
    fullName: 'Michael De Santa',
    color: '#59a9e6',
    hexColor: 0x59a9e6,
    abilityName: 'Bullet Time',
    abilityDesc: 'Slows combat time for surgical firearm precision',
    skinColor: 0xd9a684,
    hairColor: 0x2d241e,
    topColor: 0x2b3038,
    secondaryTopColor: 0xeceff4,
    pantsColor: 0x23272e,
    shoeColor: 0x17181a,
    hairStyle: 'short',
    outfit: 'suit',
    bodyType: 'average',
    beard: true,
    defaultSpawn: new THREE.Vector3(-126, 0.14, -92),
    defaultHeading: 0,
    signatureVehicle: 'sedan',
    signatureColor: 0x161b24,
  },
  trevor: {
    id: 'trevor',
    name: 'Trevor',
    fullName: 'Trevor Philips',
    color: '#f09446',
    hexColor: 0xf09446,
    abilityName: 'Red Mist',
    abilityDesc: 'Deals double damage and shrugs off incoming gunfire',
    skinColor: 0xcf9977,
    hairColor: 0x3b2f26,
    topColor: 0xd9d4c7,
    secondaryTopColor: 0xc2bcb0,
    pantsColor: 0x454a3d,
    shoeColor: 0x3d291a,
    hairStyle: 'long',
    outfit: 'jacket',
    bodyType: 'heavy',
    beard: true,
    defaultSpawn: new THREE.Vector3(126, 0.14, 126),
    defaultHeading: -Math.PI * 0.5,
    signatureVehicle: 'suv',
    signatureColor: 0x8a241b,
  },
};

export const VEHICLE_SPECS: Record<VehicleKind, VehicleSpec> = {
  supercar: {
    kind: 'supercar',
    name: 'Zentorno',
    brand: 'Pegassi',
    category: 'Super',
    maxSpeed: 54,
    reverseSpeed: 16,
    acceleration: 29,
    braking: 42,
    turnRate: 2.55,
    grip: 9.5,
    driftGrip: 2.3,
    mass: 1450,
    maxHealth: 1000,
    halfWidth: 1.08,
    halfLength: 2.35,
    height: 1.18,
    wheelRadius: 0.37,
    colors: [0xd91e2b, 0xf5b800, 0x12a854, 0xf4f6f9, 0x1768e3, 0xff5a14, 0x181b22],
  },
  muscle: {
    kind: 'muscle',
    name: 'Gauntlet',
    brand: 'Bravado',
    category: 'Muscle',
    maxSpeed: 47,
    reverseSpeed: 15,
    acceleration: 25,
    braking: 35,
    turnRate: 2.4,
    grip: 7.4,
    driftGrip: 1.85,
    mass: 1680,
    maxHealth: 1150,
    halfWidth: 1.05,
    halfLength: 2.38,
    height: 1.32,
    wheelRadius: 0.38,
    colors: [0xe85d12, 0x1c5fd4, 0xc71c28, 0x1b1e24, 0xe8c410, 0x259647],
  },
  suv: {
    kind: 'suv',
    name: 'Dubsta',
    brand: 'Benefactor',
    category: 'SUVs',
    maxSpeed: 39,
    reverseSpeed: 13,
    acceleration: 18,
    braking: 31,
    turnRate: 2.1,
    grip: 8.0,
    driftGrip: 2.6,
    mass: 2450,
    maxHealth: 1600,
    halfWidth: 1.14,
    halfLength: 2.48,
    height: 1.86,
    wheelRadius: 0.45,
    colors: [0x1a1d22, 0xdbe0e6, 0x3b4652, 0x7a221d, 0x274031, 0xc9b897],
  },
  sedan: {
    kind: 'sedan',
    name: 'Tailgater',
    brand: 'Obey',
    category: 'Sedans',
    maxSpeed: 42,
    reverseSpeed: 14,
    acceleration: 20,
    braking: 34,
    turnRate: 2.35,
    grip: 8.6,
    driftGrip: 2.2,
    mass: 1620,
    maxHealth: 1100,
    halfWidth: 1.02,
    halfLength: 2.34,
    height: 1.42,
    wheelRadius: 0.36,
    colors: [0x1c222d, 0xcfd5dd, 0x385778, 0x6e7681, 0x8f2929, 0xeae7df, 0x264b3e],
  },
  police: {
    kind: 'police',
    name: 'Police Cruiser',
    brand: 'Vapid',
    category: 'Emergency',
    maxSpeed: 48,
    reverseSpeed: 15,
    acceleration: 25,
    braking: 38,
    turnRate: 2.45,
    grip: 8.8,
    driftGrip: 2.1,
    mass: 1780,
    maxHealth: 1250,
    halfWidth: 1.04,
    halfLength: 2.42,
    height: 1.48,
    wheelRadius: 0.37,
    colors: [0x111418],
  },
  bike: {
    kind: 'bike',
    name: 'Bati 801',
    brand: 'Pegassi',
    category: 'Motorcycles',
    maxSpeed: 52,
    reverseSpeed: 9,
    acceleration: 31,
    braking: 40,
    turnRate: 3.0,
    grip: 10.2,
    driftGrip: 2.6,
    mass: 420,
    maxHealth: 650,
    halfWidth: 0.48,
    halfLength: 1.25,
    height: 1.15,
    wheelRadius: 0.34,
    colors: [0xd61f26, 0x16191f, 0x25b84b, 0xf2f5f8, 0x1c75e8],
  },
  helicopter: {
    kind: 'helicopter',
    name: 'Maverick',
    brand: 'Buckingham',
    category: 'Helicopters',
    maxSpeed: 58,
    reverseSpeed: 24,
    acceleration: 22,
    braking: 20,
    turnRate: 1.9,
    grip: 3.5,
    driftGrip: 3.5,
    mass: 2100,
    maxHealth: 1400,
    halfWidth: 1.45,
    halfLength: 4.2,
    height: 2.8,
    wheelRadius: 0.2,
    colors: [0x1b2430, 0xd8dee6],
  },
  luxury: {
    kind: 'luxury',
    name: 'Schafter',
    brand: 'Benefactor',
    category: 'Luxury',
    maxSpeed: 44,
    reverseSpeed: 14,
    acceleration: 19,
    braking: 33,
    turnRate: 2.3,
    grip: 8.4,
    driftGrip: 2.1,
    mass: 1750,
    maxHealth: 1150,
    halfWidth: 1.03,
    halfLength: 2.36,
    height: 1.45,
    wheelRadius: 0.37,
    colors: [0x1a1d22, 0xd8dee6, 0x5c1a1b, 0x1e3a5f, 0x2f4f2f, 0xc9b897],
  },
  vintage: {
    kind: 'vintage',
    name: 'Tornado',
    brand: 'Declasse',
    category: 'Classic',
    maxSpeed: 36,
    reverseSpeed: 12,
    acceleration: 13.5,
    braking: 26,
    turnRate: 2.0,
    grip: 6.8,
    driftGrip: 1.7,
    mass: 1500,
    maxHealth: 950,
    halfWidth: 1.0,
    halfLength: 2.3,
    height: 1.5,
    wheelRadius: 0.36,
    colors: [0x7a1f1f, 0x1f4d2e, 0x2c3e50, 0xc9a227, 0x5a4632, 0xe8e0d0],
  },
  cab: {
    kind: 'cab',
    name: 'Taxi',
    brand: 'Vapid',
    category: 'Service',
    maxSpeed: 40,
    reverseSpeed: 13,
    acceleration: 17,
    braking: 32,
    turnRate: 2.3,
    grip: 8.2,
    driftGrip: 2.0,
    mass: 1700,
    maxHealth: 1100,
    halfWidth: 1.03,
    halfLength: 2.35,
    height: 1.48,
    wheelRadius: 0.36,
    colors: [0xf5b800],
  },
};

export const WEAPON_SPECS: WeaponSpec[] = [
  {
    id: 'unarmed',
    name: 'Unarmed',
    category: 'Melee',
    damage: 28,
    fireRate: 2.1,
    range: 2.6,
    spread: 0,
    pellets: 1,
    magSize: 0,
    maxReserve: 0,
    reloadTime: 0,
    automatic: false,
    price: 0,
    ammoPrice: 0,
    stats: { damage: 18, fireRate: 35, accuracy: 80, range: 8 },
  },
  {
    id: 'pistol',
    name: 'Combat Pistol',
    category: 'Handguns',
    damage: 34,
    fireRate: 4.2,
    range: 85,
    spread: 0.012,
    pellets: 1,
    magSize: 12,
    maxReserve: 144,
    reloadTime: 1.15,
    automatic: false,
    price: 0,
    ammoPrice: 65,
    stats: { damage: 32, fireRate: 44, accuracy: 74, range: 45 },
  },
  {
    id: 'smg',
    name: 'Micro SMG',
    category: 'Submachine Guns',
    damage: 22,
    fireRate: 11.5,
    range: 75,
    spread: 0.032,
    pellets: 1,
    magSize: 30,
    maxReserve: 270,
    reloadTime: 1.35,
    automatic: true,
    price: 450,
    ammoPrice: 110,
    stats: { damage: 24, fireRate: 88, accuracy: 54, range: 40 },
  },
  {
    id: 'rifle',
    name: 'Carbine Rifle',
    category: 'Assault Rifles',
    damage: 36,
    fireRate: 8.8,
    range: 145,
    spread: 0.015,
    pellets: 1,
    magSize: 30,
    maxReserve: 300,
    reloadTime: 1.55,
    automatic: true,
    price: 1200,
    ammoPrice: 160,
    stats: { damage: 52, fireRate: 76, accuracy: 82, range: 82 },
  },
  {
    id: 'shotgun',
    name: 'Pump Shotgun',
    category: 'Shotguns',
    damage: 21,
    fireRate: 1.25,
    range: 42,
    spread: 0.075,
    pellets: 7,
    magSize: 8,
    maxReserve: 64,
    reloadTime: 1.8,
    automatic: false,
    price: 850,
    ammoPrice: 120,
    stats: { damage: 84, fireRate: 22, accuracy: 42, range: 26 },
  },
  {
    id: 'rpg',
    name: 'RPG',
    category: 'Heavy Weapons',
    damage: 420,
    fireRate: 0.55,
    range: 180,
    spread: 0.006,
    pellets: 1,
    magSize: 1,
    maxReserve: 12,
    reloadTime: 2.1,
    automatic: false,
    projectile: true,
    price: 2500,
    ammoPrice: 350,
    stats: { damage: 100, fireRate: 12, accuracy: 65, range: 92 },
  },
];

export const RADIO_STATIONS: RadioStation[] = [
  {
    id: 'gold_coast',
    name: 'Gold Coast FM',
    shortLabel: 'GOLD',
    genre: 'Stonebwoy & Kweku Smoke Mix',
    host: 'All 9 Anthems',
    track: 'Stonebwoy — People Dey',
    color: '#fbbf24',
    bpm: 98,
  },
  {
    id: 'bhim_fm',
    name: 'BHIM Nation 101.9',
    shortLabel: 'BHIM',
    genre: 'Reggae, Dancehall & Afro-Highlife',
    host: 'Stonebwoy Radio',
    track: 'Stonebwoy — People Dey',
    color: '#22c55e',
    bpm: 98,
  },
  {
    id: 'scatter_fm',
    name: 'Scatter Der 96.5',
    shortLabel: 'SMKE',
    genre: 'Soul Trap, Street Gospel & GH Drill',
    host: 'Kweku Smoke Radio',
    track: 'Kweku Smoke — Sober',
    color: '#f87171',
    bpm: 130,
  },
  {
    id: 'off',
    name: 'Radio Off',
    shortLabel: 'OFF',
    genre: 'City & Engine Audio Only',
    host: '',
    track: '',
    color: '#8e99a6',
    bpm: 0,
  },
];
