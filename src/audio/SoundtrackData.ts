import { RadioStationId } from '../types';

export type SoundtrackStyle =
  | 'afro_dancehall'
  | 'afro_highlife'
  | 'afro_reggae'
  | 'dancehall_club'
  | 'gh_drill'
  | 'gh_trap'
  | 'melodic_trap'
  | 'tema_hiphop'
  | 'afro_fusion';

export type LeadInstrument =
  | 'marimba'
  | 'guitar'
  | 'synth_lead'
  | 'brass'
  | 'dark_bell'
  | 'epiano'
  | 'pluck';

export interface SoundtrackSong {
  id: string;
  artist: string;
  title: string;
  album: string;
  year: number;
  station: Exclude<RadioStationId, 'off' | 'gold_coast'>;
  bpm: number;
  style: SoundtrackStyle;
  leadInstrument: LeadInstrument;
  /** 4-bar chord progression expressed as MIDI note arrays (3-4 notes per bar, around C4=60) */
  chords: [number[], number[], number[], number[]];
  /** 4-bar root bass MIDI notes (around C2=36..B2=47) */
  bassRoots: [number, number, number, number];
  /** 16-step melodic motif in semitone offsets from the bar's chord root (null = rest) */
  melodyA: Array<number | null>;
  /** Alternate 16-step motif for bars 2 & 4 (call-and-response) */
  melodyB: Array<number | null>;
  /** Swing ratio 0..0.22 for authentic West African / dancehall bounce */
  swing: number;
  /** Keywords to auto-match user-imported local MP3/M4A/WAV files */
  keywords: string[];
  /** Default duration in seconds when playing the synthesized instrumental arrangement */
  synthDuration: number;
  /** Optional bound audio URL (blob URL from in-game import or /music/... from manifest) */
  audioUrl?: string;
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Curated soundtrack celebrating Stonebwoy, Kweku Smoke, and Kwesi Arthur.
 * Each track ships with a genre- and tempo-matched instrumental Web Audio arrangement
 * out of the box AND binds automatically to real local audio files imported in-game
 * or placed in `public/music/`.
 */
export const INITIAL_SOUNDTRACK: SoundtrackSong[] = [
  // ===================== STONEBWOY — BHIM NATION 101.9 =====================
  {
    id: 'stonebwoy-into-the-future',
    artist: 'Stonebwoy',
    title: 'Into the Future',
    album: '5th Dimension',
    year: 2023,
    station: 'bhim_fm',
    bpm: 100,
    style: 'afro_dancehall',
    leadInstrument: 'epiano',
    // Warm F#m7 - Dmaj7 - Amaj7 - E groove
    chords: [
      [54, 57, 61, 64],
      [50, 54, 57, 61],
      [57, 61, 64, 68],
      [52, 56, 59, 64],
    ],
    bassRoots: [42, 38, 45, 40],
    melodyA: [12, null, null, 15, null, null, 19, null, 17, null, 15, null, 12, null, 10, null],
    melodyB: [12, null, 14, null, 16, null, 19, null, null, 16, null, 14, 12, null, null, null],
    swing: 0.12,
    keywords: ['into the future', 'intothefuture', '5th dimension'],
    synthDuration: 54,
  },
  {
    id: 'stonebwoy-jejereje',
    artist: 'Stonebwoy',
    title: 'Jejereje (feat. Ginton)',
    album: 'UP & RUNNIN6',
    year: 2024,
    station: 'bhim_fm',
    bpm: 114,
    style: 'afro_highlife',
    leadInstrument: 'guitar',
    // Infectious Am7 - Fmaj7 - C - G highlife-Afrobeats pocket
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
    keywords: ['jejereje', 'ginton', 'up and runnin'],
    synthDuration: 52,
  },
  {
    id: 'stonebwoy-therapy',
    artist: 'Stonebwoy',
    title: 'Therapy',
    album: '5th Dimension',
    year: 2023,
    station: 'bhim_fm',
    bpm: 104,
    style: 'afro_dancehall',
    leadInstrument: 'marimba',
    // Silky Em7 - Cmaj7 - G - D Afro-dancehall bounce
    chords: [
      [52, 55, 59, 62],
      [48, 52, 55, 59],
      [55, 59, 62, 66],
      [50, 54, 57, 62],
    ],
    bassRoots: [40, 36, 43, 38],
    melodyA: [12, null, null, 19, null, 17, 15, null, 12, null, 15, null, 10, null, null, null],
    melodyB: [12, null, 14, null, 16, null, 19, null, 16, null, 14, null, 12, null, 11, null],
    swing: 0.13,
    keywords: ['therapy'],
    synthDuration: 52,
  },
  {
    id: 'stonebwoy-putuu',
    artist: 'Stonebwoy',
    title: 'Putuu (Freestyle)',
    album: 'BHIM Originals',
    year: 2020,
    station: 'bhim_fm',
    bpm: 122,
    style: 'dancehall_club',
    leadInstrument: 'synth_lead',
    // High-energy Gm - Eb - F - Gm street dancehall riddim
    chords: [
      [55, 58, 62],
      [51, 55, 58],
      [53, 57, 60],
      [55, 58, 62],
    ],
    bassRoots: [43, 39, 41, 43],
    melodyA: [12, 12, null, 15, null, 12, 17, null, 15, null, 12, 15, null, 10, 12, null],
    melodyB: [19, null, 17, 15, null, 12, 15, null, 14, null, 12, 10, null, 10, 12, null],
    swing: 0.08,
    keywords: ['putuu', 'pray'],
    synthDuration: 48,
  },
  {
    id: 'stonebwoy-bawasaba',
    artist: 'Stonebwoy',
    title: 'Bawasaba',
    album: 'Epistles of Mama',
    year: 2017,
    station: 'bhim_fm',
    bpm: 98,
    style: 'afro_reggae',
    leadInstrument: 'brass',
    // Sunlit C - G - Am7 - F Afro-reggae classic
    chords: [
      [60, 64, 67],
      [55, 59, 62],
      [57, 60, 64],
      [53, 57, 60],
    ],
    bassRoots: [36, 43, 45, 41],
    melodyA: [12, null, 14, 16, null, null, 19, null, 16, null, 14, null, 12, null, null, null],
    melodyB: [12, null, 15, null, 17, null, 15, null, 12, null, 10, null, 12, null, 7, null],
    swing: 0.15,
    keywords: ['bawasaba', 'epistles of mama'],
    synthDuration: 52,
  },

  // ===================== KWEKU SMOKE — SCATTER DER 96.5 =====================
  {
    id: 'kweku-smoke-holy-ghost',
    artist: 'Kweku Smoke',
    title: 'Holy Ghost',
    album: 'Born in Hell',
    year: 2024,
    station: 'scatter_fm',
    bpm: 142,
    style: 'gh_drill',
    leadInstrument: 'epiano',
    // Dark anthemic Cm - Abmaj7 - Fm7 - G GH drill with gliding 808s
    chords: [
      [48, 51, 55, 58],
      [56, 60, 63, 67],
      [53, 56, 60, 63],
      [55, 59, 62, 65],
    ],
    bassRoots: [36, 44, 41, 43],
    melodyA: [12, null, null, 15, null, null, 14, null, 12, null, null, 10, null, null, 7, null],
    melodyB: [19, null, null, 15, null, null, 14, null, 15, null, null, 12, null, 11, null, null],
    swing: 0.04,
    keywords: ['holy ghost', 'holyghost', 'born in hell'],
    synthDuration: 52,
  },
  {
    id: 'kweku-smoke-yedin',
    artist: 'Kweku Smoke',
    title: 'Yedin (feat. Sarkodie)',
    album: 'Snoop Forever',
    year: 2020,
    station: 'scatter_fm',
    bpm: 136,
    style: 'gh_trap',
    leadInstrument: 'dark_bell',
    // Heavy Dm - Bb - Gm - A Ghanaian street trap anthem
    chords: [
      [50, 53, 57],
      [46, 50, 53],
      [55, 58, 62],
      [57, 61, 64],
    ],
    bassRoots: [38, 34, 43, 45],
    melodyA: [12, null, 13, null, 12, null, 7, null, 12, null, 15, null, 13, null, 12, null],
    melodyB: [12, null, 15, null, 19, null, 15, null, 13, null, 12, null, 11, null, null, null],
    swing: 0.03,
    keywords: ['yedin', 'sarkodie'],
    synthDuration: 50,
  },
  {
    id: 'kweku-smoke-scatter',
    artist: 'Kweku Smoke',
    title: 'Scatter (feat. Atown TSB)',
    album: 'Snoop Forever',
    year: 2020,
    station: 'scatter_fm',
    bpm: 140,
    style: 'gh_drill',
    leadInstrument: 'pluck',
    // Relentless Fm - Db - Bbm - C Asakaa/GH drill with sliding 808 subs
    chords: [
      [53, 56, 60],
      [49, 53, 56],
      [46, 49, 53],
      [48, 52, 55],
    ],
    bassRoots: [41, 37, 34, 36],
    melodyA: [12, null, null, 12, 15, null, 13, null, 12, null, null, 7, null, 8, null, null],
    melodyB: [19, null, 17, null, 15, null, 13, null, 12, null, null, 11, null, 12, null, null],
    swing: 0.04,
    keywords: ['scatter', 'atown'],
    synthDuration: 50,
  },
  {
    id: 'kweku-smoke-young-boy',
    artist: 'Kweku Smoke',
    title: 'Young Boy',
    album: 'Kwekuee',
    year: 2024,
    station: 'scatter_fm',
    bpm: 128,
    style: 'melodic_trap',
    leadInstrument: 'epiano',
    // Soulful Ebm7 - Bmaj7 - F# - Db street-gospel melodic trap
    chords: [
      [51, 54, 58, 61],
      [47, 51, 54, 58],
      [54, 58, 61, 66],
      [49, 53, 56, 61],
    ],
    bassRoots: [39, 35, 42, 37],
    melodyA: [12, null, 15, null, 19, null, 17, null, 15, null, null, 14, 12, null, null, null],
    melodyB: [12, null, 16, null, 19, null, null, 16, 14, null, 12, null, 11, null, null, null],
    swing: 0.06,
    keywords: ['young boy', 'youngboy', 'kwekuee'],
    synthDuration: 52,
  },
  {
    id: 'kweku-smoke-dis-side',
    artist: 'Kweku Smoke',
    title: 'Dis Side',
    album: 'Snoop Forever',
    year: 2020,
    station: 'scatter_fm',
    bpm: 138,
    style: 'gh_trap',
    leadInstrument: 'pluck',
    // Nocturnal Gm - Eb - Cm7 - D hip-hop night-drive beat
    chords: [
      [55, 58, 62],
      [51, 55, 58],
      [48, 51, 55, 58],
      [50, 54, 57],
    ],
    bassRoots: [43, 39, 36, 38],
    melodyA: [12, null, 15, null, 19, null, 15, null, 14, null, 15, null, 12, null, 7, null],
    melodyB: [12, null, 15, null, 17, null, 15, null, 14, null, 12, null, 11, null, 7, null],
    swing: 0.04,
    keywords: ['dis side', 'disside', 'this side'],
    synthDuration: 50,
  },

  // ===================== KWESI ARTHUR — GROUND UP 99.7 =====================
  {
    id: 'kwesi-arthur-grind-day',
    artist: 'Kwesi Arthur',
    title: 'Grind Day',
    album: 'Live from Nkrumah Krom',
    year: 2017,
    station: 'ground_up',
    bpm: 126,
    style: 'tema_hiphop',
    leadInstrument: 'dark_bell',
    // Iconic C#m - Amaj7 - F#m7 - G#m Tema breakthrough anthem
    chords: [
      [49, 52, 56, 59],
      [57, 61, 64, 68],
      [54, 57, 61, 64],
      [56, 59, 63, 66],
    ],
    bassRoots: [37, 45, 42, 44],
    melodyA: [12, null, null, 15, null, 19, null, null, 17, null, 15, null, 12, null, 10, null],
    melodyB: [12, null, null, 16, null, 19, null, 16, 14, null, 12, null, 10, null, null, null],
    swing: 0.07,
    keywords: ['grind day', 'grindday', 'nkrumah krom'],
    synthDuration: 54,
  },
  {
    id: 'kwesi-arthur-baajo',
    artist: 'Kwesi Arthur',
    title: 'Baajo (feat. Joeboy)',
    album: 'Son of Jacob',
    year: 2022,
    station: 'ground_up',
    bpm: 106,
    style: 'afro_fusion',
    leadInstrument: 'guitar',
    // Golden-hour Fmaj7 - C - Dm7 - Bbmaj7 Afro-fusion groove
    chords: [
      [53, 57, 60, 64],
      [48, 52, 55, 59],
      [50, 53, 57, 60],
      [46, 50, 53, 57],
    ],
    bassRoots: [41, 36, 38, 34],
    melodyA: [12, null, 16, null, 19, null, 16, 14, 12, null, null, 14, 16, null, 12, null],
    melodyB: [12, null, 15, null, 17, null, 15, null, 12, null, 10, null, 12, null, null, null],
    swing: 0.14,
    keywords: ['baajo', 'joeboy'],
    synthDuration: 52,
  },
  {
    id: 'kwesi-arthur-winning',
    artist: 'Kwesi Arthur',
    title: 'Winning (feat. Vic Mensa)',
    album: 'Son of Jacob',
    year: 2022,
    station: 'ground_up',
    bpm: 134,
    style: 'melodic_trap',
    leadInstrument: 'brass',
    // Triumphant Bm7 - Gmaj7 - Em7 - F# anthem
    chords: [
      [59, 62, 66, 69],
      [55, 59, 62, 66],
      [52, 55, 59, 62],
      [54, 58, 61, 64],
    ],
    bassRoots: [35, 43, 40, 42],
    melodyA: [12, null, 12, 15, null, null, 19, null, 17, null, 15, null, 14, null, 12, null],
    melodyB: [19, null, null, 16, null, 14, 12, null, 14, null, 16, null, 12, null, null, null],
    swing: 0.05,
    keywords: ['winning', 'vic mensa'],
    synthDuration: 50,
  },
  {
    id: 'kwesi-arthur-celebrate',
    artist: 'Kwesi Arthur',
    title: 'Celebrate (feat. Teni)',
    album: 'Son of Jacob',
    year: 2022,
    station: 'ground_up',
    bpm: 110,
    style: 'afro_highlife',
    leadInstrument: 'marimba',
    // Joyful G - D - Em7 - Cmaj7 coastal Afrobeats celebration
    chords: [
      [55, 59, 62, 66],
      [50, 54, 57, 62],
      [52, 55, 59, 62],
      [48, 52, 55, 59],
    ],
    bassRoots: [43, 38, 40, 36],
    melodyA: [12, null, 14, null, 16, 19, null, 16, 14, null, 12, null, 16, null, 14, null],
    melodyB: [12, null, 15, null, 19, null, 17, 15, 12, null, 10, null, 12, null, null, null],
    swing: 0.14,
    keywords: ['celebrate', 'teni'],
    synthDuration: 52,
  },
  {
    id: 'kwesi-arthur-nobody',
    artist: 'Kwesi Arthur',
    title: 'Nobody (feat. Mr Eazi)',
    album: 'Live from Nkrumah Krom II',
    year: 2019,
    station: 'ground_up',
    bpm: 102,
    style: 'afro_fusion',
    leadInstrument: 'guitar',
    // Breezy Amaj7 - E - F#m7 - Dmaj7 sunset cruiser
    chords: [
      [57, 61, 64, 68],
      [52, 56, 59, 63],
      [54, 57, 61, 64],
      [50, 54, 57, 61],
    ],
    bassRoots: [45, 40, 42, 38],
    melodyA: [12, null, null, 16, 14, null, 12, null, 19, null, 16, null, 14, null, 12, null],
    melodyB: [12, null, 15, null, 17, null, 15, 12, null, 10, 12, null, null, null, null, null],
    swing: 0.13,
    keywords: ['nobody', 'mr eazi', 'mreazi'],
    synthDuration: 52,
  },
];

/**
 * Interleaved All-Stars rotation order for Gold Coast FM so players immediately hear
 * Stonebwoy, Kweku Smoke, and Kwesi Arthur back-to-back as they explore Los Santos.
 */
export const GOLD_COAST_ROTATION_IDS: string[] = [
  'stonebwoy-jejereje',
  'kweku-smoke-holy-ghost',
  'kwesi-arthur-grind-day',
  'stonebwoy-into-the-future',
  'kweku-smoke-yedin',
  'kwesi-arthur-baajo',
  'stonebwoy-therapy',
  'kweku-smoke-scatter',
  'kwesi-arthur-winning',
  'stonebwoy-putuu',
  'kweku-smoke-young-boy',
  'kwesi-arthur-celebrate',
  'stonebwoy-bawasaba',
  'kweku-smoke-dis-side',
  'kwesi-arthur-nobody',
];
