import { RadioStationId } from '../types';

export type SoundtrackStyle =
  | 'roots_reggae'
  | 'dancehall_anthem'
  | 'afro_highlife'
  | 'gospel_trap'
  | 'gh_drill';

export type LeadInstrument =
  | 'brass'
  | 'organ'
  | 'guitar'
  | 'epiano'
  | 'choir'
  | 'dark_bell';

export interface SoundtrackSong {
  id: string;
  artist: string;
  title: string;
  vibe: string;
  station: Exclude<RadioStationId, 'off' | 'gold_coast'>;
  bpm: number;
  style: SoundtrackStyle;
  leadInstrument: LeadInstrument;
  /** 4-bar chord progression expressed as MIDI note arrays (around C4 = 60) */
  chords: [number[], number[], number[], number[]];
  /** 4-bar root bass MIDI notes (around C2 = 36 .. B2 = 47) */
  bassRoots: [number, number, number, number];
  /** 16-step primary melodic motif in semitone offsets from the bar's chord root (null = rest) */
  melodyA: Array<number | null>;
  /** Alternate 16-step response motif for bars 2 & 4 */
  melodyB: Array<number | null>;
  /** Swing ratio 0..0.2 for authentic reggae, dancehall, and Afrobeats pocket */
  swing: number;
  /** Lowercase tokens used to auto-bind user-imported MP3/M4A/WAV files */
  keywords: string[];
  /** Playback length in seconds before advancing when using the built-in instrumental */
  synthDuration: number;
  /** Optional bound real audio URL (from '+ Import MP3s' or public/music/manifest.json) */
  audioUrl?: string;
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Official 15-track soundtrack featuring Kweku Smoke, Stonebwoy, Kwesi Arthur
 * and Kofi Kinaata:
 * - Kweku Smoke: Sober, Faith, Survivor, Hallelujah
 * - Stonebwoy: People Dey, Run Go, Send Dem a Prayer, Hero, Jejereje
 * - Kwesi Arthur: Anthem, Grind Day, Baajo
 * - Kofi Kinaata: Things Fall Apart, Susuka, Behind the Scenes
 */
export const INITIAL_SOUNDTRACK: SoundtrackSong[] = [
  // ===================== KWEKU SMOKE — SCATTER DER 96.5 =====================
  {
    id: 'kweku-smoke-sober',
    artist: 'Kweku Smoke',
    title: 'Sober',
    vibe: 'Soulful GH Trap',
    station: 'scatter_fm',
    bpm: 130,
    style: 'gospel_trap',
    leadInstrument: 'epiano',
    // Introspective Fm7 - Dbmaj7 - Abmaj7 - Eb soulful piano & deep 808s
    chords: [
      [53, 56, 60, 63],
      [49, 53, 56, 60],
      [56, 60, 63, 67],
      [51, 55, 58, 63],
    ],
    bassRoots: [41, 37, 44, 39],
    melodyA: [12, null, 15, null, 19, null, null, 17, 15, null, 12, null, 10, null, null, null],
    melodyB: [12, null, 16, null, 19, null, 16, null, 14, null, 12, null, 11, null, 7, null],
    swing: 0.06,
    keywords: ['sober'],
    synthDuration: 120,
  },
  {
    id: 'kweku-smoke-faith',
    artist: 'Kweku Smoke',
    title: 'Faith',
    vibe: 'Street Gospel & Drill',
    station: 'scatter_fm',
    bpm: 136,
    style: 'gospel_trap',
    leadInstrument: 'choir',
    // Uplifting Dm7 - Bbmaj7 - Fmaj7 - C street-gospel choir & gliding 808 pocket
    chords: [
      [50, 53, 57, 60],
      [46, 50, 53, 57],
      [53, 57, 60, 64],
      [48, 52, 55, 60],
    ],
    bassRoots: [38, 34, 41, 36],
    melodyA: [12, null, null, 15, null, null, 19, null, 17, null, 15, null, 14, null, 12, null],
    melodyB: [19, null, null, 16, null, 14, 12, null, 14, null, 16, null, 12, null, null, null],
    swing: 0.05,
    keywords: ['faith'],
    synthDuration: 120,
  },
  {
    id: 'kweku-smoke-survivor',
    artist: 'Kweku Smoke',
    title: 'Survivor',
    vibe: 'GH Drill Anthem',
    station: 'scatter_fm',
    bpm: 140,
    style: 'gh_drill',
    leadInstrument: 'dark_bell',
    // Gritty resilient Cm7 - Abmaj7 - Fm7 - G7 GH drill with 3-3-2 hats & sliding 808s
    chords: [
      [48, 51, 55, 58],
      [56, 60, 63, 67],
      [53, 56, 60, 63],
      [55, 59, 62, 65],
    ],
    bassRoots: [36, 44, 41, 43],
    melodyA: [12, null, null, 15, null, 14, 12, null, 19, null, null, 15, null, 14, 12, null],
    melodyB: [12, null, 16, null, 19, null, 16, null, 14, null, null, 12, null, 11, null, null],
    swing: 0.04,
    keywords: ['survivor', 'survive'],
    synthDuration: 120,
  },
  {
    id: 'kweku-smoke-hallelujah',
    artist: 'Kweku Smoke',
    title: 'Hallelujah',
    vibe: 'Gospel Hip-Hop Anthem',
    station: 'scatter_fm',
    bpm: 132,
    style: 'gospel_trap',
    leadInstrument: 'choir',
    // Soaring Ebm7 - Bmaj7 - F#maj7 - Db triumphant gospel-chord hip-hop
    chords: [
      [51, 54, 58, 61],
      [47, 51, 54, 58],
      [54, 58, 61, 65],
      [49, 53, 56, 61],
    ],
    bassRoots: [39, 35, 42, 37],
    melodyA: [12, null, 15, 17, 19, null, null, 17, 15, null, 12, null, 15, null, null, null],
    melodyB: [19, null, 16, null, 14, null, 12, null, 16, null, 14, null, 12, null, null, null],
    swing: 0.06,
    keywords: ['hallelujah', 'halleluja'],
    synthDuration: 120,
  },

  // ===================== STONEBWOY — BHIM NATION 101.9 =====================
  {
    id: 'stonebwoy-people-dey',
    artist: 'Stonebwoy',
    title: 'People Dey',
    vibe: 'Dancehall Street Anthem',
    station: 'bhim_fm',
    bpm: 98,
    style: 'dancehall_anthem',
    leadInstrument: 'brass',
    // Iconic Gm - Eb - F - Gm militant street dancehall riddim
    chords: [
      [55, 58, 62],
      [51, 55, 58],
      [53, 57, 60],
      [55, 58, 62],
    ],
    bassRoots: [43, 39, 41, 43],
    melodyA: [12, null, 12, 15, null, null, 12, null, 17, null, 15, null, 12, null, 10, 12],
    melodyB: [19, null, 17, null, 15, null, 12, 15, 14, null, 12, null, 10, null, 12, null],
    swing: 0.12,
    keywords: ['people dey', 'peopledey'],
    synthDuration: 120,
  },
  {
    id: 'stonebwoy-run-go',
    artist: 'Stonebwoy',
    title: 'Run Go',
    vibe: 'Conscious Roots Reggae',
    station: 'bhim_fm',
    bpm: 88,
    style: 'roots_reggae',
    leadInstrument: 'brass',
    // Timeless C - G - Am7 - F one-drop reggae skank & warm Kingston horns
    chords: [
      [60, 64, 67],
      [55, 59, 62],
      [57, 60, 64, 67],
      [53, 57, 60, 64],
    ],
    bassRoots: [36, 43, 45, 41],
    melodyA: [12, null, 14, 16, null, null, 19, null, 16, null, 14, null, 12, null, null, null],
    melodyB: [12, null, 15, null, 17, null, 15, null, 12, null, 10, null, 12, null, 7, null],
    swing: 0.16,
    keywords: ['run go', 'rungo'],
    synthDuration: 120,
  },
  {
    id: 'stonebwoy-send-dem-a-prayer',
    artist: 'Stonebwoy',
    title: 'Send Dem a Prayer',
    vibe: 'Spiritual Roots Reggae',
    station: 'bhim_fm',
    bpm: 92,
    style: 'roots_reggae',
    leadInstrument: 'organ',
    // Deep spiritual F#m7 - Dmaj7 - A - E one-drop bubble organ & dub echo
    chords: [
      [54, 57, 61, 64],
      [50, 54, 57, 61],
      [57, 61, 64],
      [52, 56, 59, 64],
    ],
    bassRoots: [42, 38, 45, 40],
    melodyA: [12, null, null, 15, null, 17, 19, null, 17, null, 15, null, 12, null, 10, null],
    melodyB: [12, null, 14, null, 16, null, 19, null, null, 16, 14, null, 12, null, null, null],
    swing: 0.15,
    keywords: ['send dem a prayer', 'send them a prayer', 'send dem', 'prayer'],
    synthDuration: 120,
  },
  {
    id: 'stonebwoy-hero',
    artist: 'Stonebwoy',
    title: 'Hero',
    vibe: 'Reggae-Dancehall Anthem',
    station: 'bhim_fm',
    bpm: 102,
    style: 'dancehall_anthem',
    leadInstrument: 'brass',
    // Triumphant Em7 - Cmaj7 - G - D dancehall riddim with bold brass melody
    chords: [
      [52, 55, 59, 62],
      [48, 52, 55, 59],
      [55, 59, 62],
      [50, 54, 57, 62],
    ],
    bassRoots: [40, 36, 43, 38],
    melodyA: [12, null, 15, null, 19, null, 17, 15, 12, null, null, 15, 14, null, 12, null],
    melodyB: [19, null, 16, null, 14, null, 12, 14, 16, null, 14, null, 12, null, 11, null],
    swing: 0.13,
    keywords: ['hero'],
    synthDuration: 120,
  },
  {
    id: 'stonebwoy-jejereje',
    artist: 'Stonebwoy',
    title: 'Jejereje (feat. Ginton)',
    vibe: 'Afro-Highlife',
    station: 'bhim_fm',
    bpm: 114,
    style: 'afro_highlife',
    leadInstrument: 'guitar',
    // Infectious Am7 - Fmaj7 - C - G highlife electric guitar & log-drum bounce
    chords: [
      [57, 60, 64, 67],
      [53, 57, 60, 64],
      [60, 64, 67, 71],
      [55, 59, 62, 67],
    ],
    bassRoots: [45, 41, 36, 43],
    melodyA: [12, null, 15, 12, null, 19, null, 15, 17, null, 15, null, 12, null, 10, 12],
    melodyB: [12, null, 16, null, 19, null, 16, 14, 12, null, 14, null, 12, null, 7, null],
    swing: 0.14,
    keywords: ['jejereje', 'ginton'],
    synthDuration: 120,
  },

  // ===================== KWESI ARTHUR — GROUND UP 104.7 =====================
  {
    id: 'kwesi-arthur-anthem',
    artist: 'Kwesi Arthur',
    title: 'Anthem',
    vibe: 'Temani Afrobeats Anthem',
    station: 'ground_up_fm',
    bpm: 104,
    style: 'afro_highlife',
    leadInstrument: 'guitar',
    // Bright Fm7 - Dbmaj7 - Abmaj7 - Eb highlife guitar bounce
    chords: [
      [53, 56, 60, 63],
      [49, 53, 56, 60],
      [56, 60, 63, 67],
      [51, 55, 58, 63],
    ],
    bassRoots: [41, 37, 44, 39],
    melodyA: [12, null, null, 15, 12, null, 19, null, 15, 17, null, 15, null, 12, null, null],
    melodyB: [19, null, 15, null, 12, null, 15, null, 17, null, 19, null, 15, null, 12, null],
    swing: 0.13,
    keywords: ['anthem'],
    synthDuration: 120,
  },
  {
    id: 'kwesi-arthur-grind-day',
    artist: 'Kwesi Arthur',
    title: 'Grind Day',
    vibe: 'Motivational GH Street Rap',
    station: 'ground_up_fm',
    bpm: 98,
    style: 'afro_highlife',
    leadInstrument: 'epiano',
    // Hustler's Am7 - F - C - G loop with warm keys & rolling bass
    chords: [
      [57, 60, 64],
      [53, 57, 60],
      [60, 64, 67],
      [55, 59, 62],
    ],
    bassRoots: [45, 41, 36, 43],
    melodyA: [12, null, 15, null, 17, null, 12, null, 15, null, 19, null, 17, null, 15, null],
    melodyB: [12, null, 10, null, 12, null, 15, null, 12, null, 10, null, 7, null, 10, null],
    swing: 0.11,
    keywords: ['grind day', 'grindday', 'grind'],
    synthDuration: 120,
  },
  {
    id: 'kwesi-arthur-baajo',
    artist: 'Kwesi Arthur',
    title: 'Baajo (feat. Joeboy)',
    vibe: 'Smooth Afro-Fusion',
    station: 'ground_up_fm',
    bpm: 102,
    style: 'afro_highlife',
    leadInstrument: 'epiano',
    // Sunlit Cmaj7 - Am7 - Dm7 - G afro-swing with silky keys
    chords: [
      [60, 64, 67, 71],
      [57, 60, 64, 67],
      [62, 65, 69, 72],
      [55, 59, 62, 67],
    ],
    bassRoots: [36, 33, 38, 43],
    melodyA: [12, null, 14, 16, null, 19, null, null, 16, null, 14, null, 12, null, 11, null],
    melodyB: [16, null, 19, null, 21, null, 19, null, 16, null, 14, null, 12, null, null, null],
    swing: 0.15,
    keywords: ['baajo', 'joeboy'],
    synthDuration: 120,
  },

  // ===================== KOFI KINATA — EFFIAKUMA RADIO 89.1 =====================
  {
    id: 'kofi-kinaata-things-fall-apart',
    artist: 'Kofi Kinaata',
    title: 'Things Fall Apart',
    vibe: 'Fante Storytelling Highlife',
    station: 'kinaata_fm',
    bpm: 100,
    style: 'afro_highlife',
    leadInstrument: 'guitar',
    // Reflective F#m7 - D - A - E highlife guitar with rolling Fante flow
    chords: [
      [54, 57, 61, 64],
      [50, 54, 57],
      [57, 61, 64],
      [52, 56, 59],
    ],
    bassRoots: [42, 38, 45, 40],
    melodyA: [12, null, 15, null, 12, null, 17, null, 15, null, 12, null, 10, null, 12, null],
    melodyB: [15, null, 17, null, 19, null, 17, null, 15, null, 12, null, 15, null, null, null],
    swing: 0.12,
    keywords: ['things fall apart', 'thingsfallapart'],
    synthDuration: 120,
  },
  {
    id: 'kofi-kinaata-susuka',
    artist: 'Kofi Kinaata',
    title: 'Susuka',
    vibe: 'Grateful Highlife Groove',
    station: 'kinaata_fm',
    bpm: 96,
    style: 'afro_highlife',
    leadInstrument: 'organ',
    // Warm C#m7 - A - B - E highlife with gospel-tinged organ swells
    chords: [
      [49, 52, 56],
      [57, 61, 64],
      [59, 63, 66],
      [52, 56, 59],
    ],
    bassRoots: [37, 33, 35, 40],
    melodyA: [12, null, null, 15, null, 12, null, 17, 15, null, 12, null, null, 10, null, null],
    melodyB: [12, null, 15, 17, null, 19, null, 15, 12, null, 10, null, 12, null, 7, null],
    swing: 0.14,
    keywords: ['susuka'],
    synthDuration: 120,
  },
  {
    id: 'kofi-kinaata-behind-the-scenes',
    artist: 'Kofi Kinaata',
    title: 'Behind the Scenes',
    vibe: 'Smooth Fante Afro-Highlife',
    station: 'kinaata_fm',
    bpm: 104,
    style: 'afro_highlife',
    leadInstrument: 'epiano',
    // Laid-back Gm7 - Eb - Bb - F silky keys & talking-drum pocket
    chords: [
      [55, 58, 62],
      [51, 55, 58],
      [58, 62, 65],
      [53, 57, 60],
    ],
    bassRoots: [43, 39, 46, 41],
    melodyA: [12, null, 15, null, 17, null, 15, null, 12, null, 15, null, 19, null, 17, null],
    melodyB: [19, null, 17, null, 15, null, 12, null, 10, null, 12, null, 15, null, 12, null],
    swing: 0.13,
    keywords: ['behind the scenes', 'behindthescenes'],
    synthDuration: 120,
  },
];

/**
 * Alternating Stonebwoy, Kweku Smoke, Kwesi Arthur & Kofi Kinaata rotation on
 * Gold Coast FM covering all 15 tracks.
 */
export const GOLD_COAST_ROTATION_IDS: string[] = [
  'stonebwoy-people-dey',
  'kweku-smoke-sober',
  'kwesi-arthur-anthem',
  'kofi-kinaata-things-fall-apart',
  'stonebwoy-jejereje',
  'kweku-smoke-hallelujah',
  'kwesi-arthur-baajo',
  'kofi-kinaata-susuka',
  'stonebwoy-run-go',
  'kweku-smoke-faith',
  'stonebwoy-hero',
  'kwesi-arthur-grind-day',
  'kofi-kinaata-behind-the-scenes',
  'kweku-smoke-survivor',
  'stonebwoy-send-dem-a-prayer',
];
