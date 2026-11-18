import {
  GOLD_COAST_ROTATION_IDS,
  INITIAL_SOUNDTRACK,
  LeadInstrument,
  midiToFreq,
  SoundtrackSong,
} from '../audio/SoundtrackData';
import { GameMode, RadioStation, RadioStationId, RADIO_STATIONS, VehicleKind, WeaponId } from '../types';
import { MusicApi, MusicApiResult } from '../audio/MusicApi';

export interface ImportAudioResult {
  total: number;
  matched: number;
  added: number;
  firstSong: SoundtrackSong | null;
}

/**
 * Per-vehicle-family engine character: firing frequency at full revs,
 * harmonic order mix (firing saw / 2nd-order square / sub-harmonic sine),
 * brightness of the RPM-tracked lowpass, exhaust noise level & drive feel.
 */
const ENGINE_TUNE: Record<
  Exclude<VehicleKind, 'helicopter'>,
  { fire: number; bright: number; h1: number; h2: number; h3: number; noise: number }
> = {
  supercar: { fire: 118, bright: 1.55, h1: 0.55, h2: 0.44, h3: 0.16, noise: 1.3 }, // V10 flat-plane scream
  muscle: { fire: 56, bright: 0.8, h1: 0.6, h2: 0.26, h3: 0.52, noise: 1.05 }, // V8 burble & lobe
  sedan: { fire: 94, bright: 1.0, h1: 0.5, h2: 0.3, h3: 0.26, noise: 0.9 }, // everyday I4
  cab: { fire: 90, bright: 0.95, h1: 0.5, h2: 0.3, h3: 0.3, noise: 0.95 }, // hard-working I4
  police: { fire: 100, bright: 1.15, h1: 0.52, h2: 0.34, h3: 0.24, noise: 1.0 }, // pursuit V8
  luxury: { fire: 84, bright: 0.95, h1: 0.5, h2: 0.28, h3: 0.3, noise: 0.85 }, // refined V8
  suv: { fire: 66, bright: 0.72, h1: 0.58, h2: 0.24, h3: 0.44, noise: 1.0 }, // torquey diesel-ish
  vintage: { fire: 52, bright: 0.75, h1: 0.62, h2: 0.24, h3: 0.5, noise: 1.0 }, // old-school low-rev
  bike: { fire: 152, bright: 1.75, h1: 0.6, h2: 0.36, h3: 0.08, noise: 0.8 }, // rev-happy I4 rasp
};


export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private musicFilter: BiquadFilterNode | null = null;
  private delayNode: DelayNode | null = null;
  private delaySend: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  // Engine continuous nodes
  private engineOsc1: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineOsc3: OscillatorNode | null = null;
  private engineOsc1Gain: GainNode | null = null;
  private engineOsc2Gain: GainNode | null = null;
  private engineOsc3Gain: GainNode | null = null;
  private engineShaper: WaveShaperNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;
  private engineNoiseFilter: BiquadFilterNode | null = null;
  private engineNoiseGain: GainNode | null = null;
  private tireNoiseGain: GainNode | null = null;
  private windNoiseGain: GainNode | null = null;
  private rotorLfo: OscillatorNode | null = null;
  private rotorLfoDepth: GainNode | null = null;

  // Tire screech continuous nodes
  private screechGain: GainNode | null = null;
  private screechFilter: BiquadFilterNode | null = null;

  // Siren continuous nodes
  private sirenOsc: OscillatorNode | null = null;
  private sirenGain: GainNode | null = null;
  private sirenPhase = 0;

  // Soundtrack & Radio playlist state
  private _currentStation: RadioStationId = 'gold_coast';
  public readonly catalog: SoundtrackSong[] = INITIAL_SOUNDTRACK.map((s) => ({ ...s }));
  private customGoldCoastIds: string[] = [];
  private stationTrackCursor: Record<Exclude<RadioStationId, 'off'>, number> = {
    gold_coast: 0,
    bhim_fm: 0,
    scatter_fm: 0,
  };
  private stepTimer = 0;
  private stepIndex = 0;
  private songElapsed = 0;
  private pausedByUser = false;

  // Combustion engine simulation state (gear shifts, rev inertia, pops)
  private engineRpm = 0.2;
  private engineGear = 0;
  private shiftDip = 0;
  private lastVehicleThrottle = 0;
  private backfireCooldown = 0;

  // HTMLAudioElement for real studio audio files (imported in-game, via public/music/manifest.json, or the music API)
  private htmlAudio: HTMLAudioElement | null = null;
  private htmlAudioSongId: string | null = null;
  private htmlAudioFailed = new Set<string>();
  private manifestLoaded = false;

  // Music API (iTunes / Apple Music Search) resolution for real song streams
  private musicApi = new MusicApi();
  private apiTracks = new Map<string, MusicApiResult>();
  /** Song ids bound to LOCAL audio files (manifest or user import) — excludes API streams */
  private localAudioIds = new Set<string>();

  // Callback whenever station or track changes
  public onTrackChange?: (song: SoundtrackSong | null, station: RadioStation) => void;

  // Volumes
  private masterVol = 0.65;
  private musicVol = 0.5;
  private sfxVol = 0.75;
  private currentDuck = 1.0;

  constructor() {
    this.loadManifest();
  }

  public get currentStation(): RadioStationId {
    return this._currentStation;
  }

  public set currentStation(id: RadioStationId) {
    this.setStation(id, true);
  }

  public get isMusicPaused(): boolean {
    return this.pausedByUser;
  }

  public toggleMusicPause(): boolean {
    this.pausedByUser = !this.pausedByUser;
    if (this.pausedByUser && this.htmlAudio && !this.htmlAudio.paused) {
      this.htmlAudio.pause();
    }
    return this.pausedByUser;
  }

  public getStation(id: RadioStationId = this._currentStation): RadioStation {
    return RADIO_STATIONS.find((s) => s.id === id) || RADIO_STATIONS[0];
  }

  public getStationTracks(station: RadioStationId = this._currentStation): SoundtrackSong[] {
    if (station === 'off') return [];
    if (station === 'gold_coast') {
      const ordered: SoundtrackSong[] = [];
      const seen = new Set<string>();
      for (const id of [...this.customGoldCoastIds, ...GOLD_COAST_ROTATION_IDS]) {
        const s = this.catalog.find((t) => t.id === id);
        if (s && !seen.has(s.id)) {
          ordered.push(s);
          seen.add(s.id);
        }
      }
      for (const s of this.catalog) {
        if (!seen.has(s.id)) ordered.push(s);
      }
      return ordered;
    }
    return this.catalog.filter((s) => s.station === station);
  }

  public getCurrentSong(station: RadioStationId = this._currentStation): SoundtrackSong | null {
    if (station === 'off') return null;
    const tracks = this.getStationTracks(station);
    if (tracks.length === 0) return null;
    const idx = ((this.stationTrackCursor[station] % tracks.length) + tracks.length) % tracks.length;
    return tracks[idx];
  }

  public getRealAudioCount(): number {
    return this.catalog.filter((s) => !!s.audioUrl && !this.htmlAudioFailed.has(s.id)).length;
  }

  /** Count of songs bound to locally provided audio files (manifest + user imports) */
  public getImportedAudioCount(): number {
    return this.localAudioIds.size;
  }

  /** Music API metadata (album, artwork, genre) resolved for a catalog song, if any */
  public getApiTrack(songId: string): MusicApiResult | null {
    return this.apiTracks.get(songId) ?? null;
  }

  /**
   * Resolve a catalog song through the music API and bind its real streaming
   * preview. Called whenever a song is selected; if the resolved song is the
   * one currently playing, playback hot-swaps from the instrumental to the
   * API stream on the next frame. Failures leave the instrumental untouched.
   */
  public async ensureApiAudio(song: SoundtrackSong): Promise<MusicApiResult | null> {
    // Local files (manifest / user import) always win over the API stream
    if (song.audioUrl) return this.apiTracks.get(song.id) ?? null;
    const result = await this.musicApi.resolveTrack(song.id, song.artist, song.title);
    if (result?.previewUrl) {
      if (!song.audioUrl) song.audioUrl = result.previewUrl;
      this.apiTracks.set(song.id, result);
      this.htmlAudioFailed.delete(song.id);
      // Hot-swap when this exact song is what the player is listening to
      if (!this.pausedByUser && this.getCurrentSong(this._currentStation)?.id === song.id) {
        this.stopHtmlAudio();
        this.htmlAudioSongId = null;
        this.resetSynthTransport();
        this.syncDelayToCurrentSong();
        this.onTrackChange?.(song, this.getStation(this._currentStation));
      }
    }
    return result;
  }

  public setStation(id: RadioStationId, notify = true): void {
    const changed = this._currentStation !== id;
    this._currentStation = id;
    this.pausedByUser = false;
    if (changed) {
      this.resetSynthTransport();
      this.stopHtmlAudio();
      this.syncDelayToCurrentSong();
    }
    const station = this.getStation(id);
    const song = this.getCurrentSong(id);
    if (song) {
      station.track = `${song.artist} — ${song.title}`;
      station.bpm = song.bpm;
      void this.ensureApiAudio(song).catch(() => {});
    }
    if (notify && changed) {
      this.onTrackChange?.(song, station);
    }
  }

  public nextTrack(dir: 1 | -1 = 1, notify = true): SoundtrackSong | null {
    if (this._currentStation === 'off') {
      this.setStation('gold_coast', notify);
      return this.getCurrentSong();
    }
    const st = this._currentStation;
    const tracks = this.getStationTracks(st);
    if (tracks.length === 0) return null;
    this.stationTrackCursor[st] =
      (this.stationTrackCursor[st] + dir + tracks.length) % tracks.length;
    this.pausedByUser = false;
    this.resetSynthTransport();
    this.stopHtmlAudio();
    this.syncDelayToCurrentSong();

    const song = this.getCurrentSong(st);
    const station = this.getStation(st);
    if (song) {
      station.track = `${song.artist} — ${song.title}`;
      station.bpm = song.bpm;
      void this.ensureApiAudio(song).catch(() => {});
    }
    if (notify) {
      this.onTrackChange?.(song, station);
    }
    return song;
  }

  public playSongById(
    songId: string,
    preferredStation?: Exclude<RadioStationId, 'off'>,
    notify = true
  ): SoundtrackSong | null {
    const song = this.catalog.find((s) => s.id === songId);
    if (!song) return null;
    const targetStation: Exclude<RadioStationId, 'off'> =
      preferredStation ??
      (this._currentStation === 'gold_coast' ? 'gold_coast' : song.station);
    const tracks = this.getStationTracks(targetStation);
    const idx = tracks.findIndex((t) => t.id === song.id);
    this._currentStation = targetStation;
    this.stationTrackCursor[targetStation] = Math.max(0, idx);
    this.pausedByUser = false;
    this.resetSynthTransport();
    this.stopHtmlAudio();
    this.syncDelayToCurrentSong();

    const station = this.getStation(targetStation);
    station.track = `${song.artist} — ${song.title}`;
    station.bpm = song.bpm;
    // Fetch the real song from the music API (cached) and stream it when selected
    void this.ensureApiAudio(song).catch(() => {});
    if (notify) {
      this.onTrackChange?.(song, station);
    }
    return song;
  }

  private async loadManifest(): Promise<void> {
    if (this.manifestLoaded || typeof fetch === 'undefined') return;
    this.manifestLoaded = true;
    try {
      const res = await fetch('/music/manifest.json', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { files?: Record<string, string> };
      if (!data?.files || typeof data.files !== 'object') return;
      for (const [key, url] of Object.entries(data.files)) {
        if (typeof url !== 'string' || !url.trim()) continue;
        const exact = this.catalog.find((s) => s.id === key);
        if (exact) {
          exact.audioUrl = url.trim();
          this.localAudioIds.add(exact.id);
          this.htmlAudioFailed.delete(exact.id);
        } else {
          this.bindAudioByLabel(key, url.trim());
        }
      }
    } catch {
      // Manifest is optional; synthesized soundtrack plays seamlessly by default
    }
  }

  /**
   * Bind local user-selected MP3 / M4A / WAV / OGG / FLAC files directly into the
   * Stonebwoy, Kweku Smoke & Kwesi Arthur radio stations.
   */
  public importLocalAudioFiles(fileList: FileList | File[]): ImportAudioResult {
    const files = Array.from(fileList).filter(
      (f) => f.type.startsWith('audio/') || /\.(mp3|m4a|ogg|opus|wav|flac|aac|webm)$/i.test(f.name)
    );
    let matched = 0;
    let added = 0;
    let firstSong: SoundtrackSong | null = null;

    for (const file of files) {
      const blobUrl = URL.createObjectURL(file);
      const rawLabel = file.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();
      const outcome = this.bindAudioByLabel(rawLabel, blobUrl);
      if (outcome.wasExisting) matched++;
      else added++;
      if (!firstSong) firstSong = outcome.song;
    }

    if (firstSong) {
      this.unlock();
      this.playSongById(firstSong.id, firstSong.station, true);
    }

    return { total: files.length, matched, added, firstSong };
  }

  private bindAudioByLabel(
    rawLabel: string,
    url: string
  ): { song: SoundtrackSong; wasExisting: boolean } {
    const norm = rawLabel.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

    // 1. Try matching an existing curated Stonebwoy / Kweku Smoke / Kwesi Arthur hit
    for (const song of this.catalog) {
      const hitKeyword = song.keywords.some((kw) => norm.includes(kw));
      if (hitKeyword) {
        song.audioUrl = url;
        this.localAudioIds.add(song.id);
        this.htmlAudioFailed.delete(song.id);
        return { song, wasExisting: true };
      }
    }

    // 2. Otherwise detect Stonebwoy vs Kweku Smoke -> route to their dedicated station + Gold Coast FM!
    let artist = 'Custom Track';
    let station: Exclude<RadioStationId, 'off' | 'gold_coast'> = 'bhim_fm';
    let title = rawLabel;

    if (
      norm.includes('kweku smoke') ||
      norm.includes('kwekusmoke') ||
      norm.includes('playman') ||
      norm.includes('scatter')
    ) {
      artist = 'Kweku Smoke';
      station = 'scatter_fm';
    } else if (norm.includes('stonebwoy') || norm.includes('bhim') || norm.includes('1gad')) {
      artist = 'Stonebwoy';
      station = 'bhim_fm';
    } else if (rawLabel.includes(' - ')) {
      const parts = rawLabel.split(' - ');
      artist = parts[0].trim();
      title = parts.slice(1).join(' - ').trim();
    }

    // Clean redundant artist prefix from title if present
    const dashParts = rawLabel.split(/\s*[-–—]\s*/);
    if (dashParts.length >= 2 && dashParts[0].toLowerCase().includes(artist.toLowerCase())) {
      title = dashParts.slice(1).join(' - ').trim() || rawLabel;
    }

    const template = this.catalog.find((s) => s.station === station) || this.catalog[0];
    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newSong: SoundtrackSong = {
      ...template,
      id,
      artist,
      title,
      vibe: 'Imported Audio',
      station,
      keywords: [norm],
      audioUrl: url,
    };
    this.catalog.unshift(newSong);
    this.localAudioIds.add(id);
    this.customGoldCoastIds.unshift(id);
    return { song: newSong, wasExisting: false };
  }

  private resetSynthTransport(): void {
    this.stepTimer = 0;
    this.stepIndex = 0;
    this.songElapsed = 0;
  }

  private stopHtmlAudio(): void {
    if (this.htmlAudio) {
      this.htmlAudio.pause();
      this.htmlAudio.currentTime = 0;
    }
    this.htmlAudioSongId = null;
  }

  private ensureHtmlAudio(): HTMLAudioElement {
    if (!this.htmlAudio) {
      const el = new Audio();
      el.preload = 'auto';
      el.addEventListener('ended', () => {
        this.nextTrack(1, true);
      });
      el.addEventListener('error', () => {
        if (this.htmlAudioSongId) {
          this.htmlAudioFailed.add(this.htmlAudioSongId);
          this.htmlAudioSongId = null;
        }
      });
      this.htmlAudio = el;
    }
    return this.htmlAudio;
  }

  private syncDelayToCurrentSong(): void {
    if (!this.ctx || !this.delayNode) return;
    const song = this.getCurrentSong();
    if (!song) return;
    const effectiveBpm = song.bpm >= 126 ? song.bpm * 0.5 : song.bpm;
    const dottedEighth = Math.min(0.65, Math.max(0.14, (60 / effectiveBpm) * 0.75));
    this.delayNode.delayTime.setTargetAtTime(dottedEighth, this.ctx.currentTime, 0.04);
  }

  public unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.masterVol;
      this.masterGain.connect(this.ctx.destination);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxVol;
      this.sfxGain.connect(this.masterGain);

      // Warm studio soundtrack bus: musicBus -> lowpass (pause muffle) -> soft compressor -> musicGain
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicVol;
      this.musicGain.connect(this.masterGain);

      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 18;
      comp.ratio.value = 3.2;
      comp.attack.value = 0.008;
      comp.release.value = 0.16;
      comp.connect(this.musicGain);

      this.musicFilter = this.ctx.createBiquadFilter();
      this.musicFilter.type = 'lowpass';
      this.musicFilter.frequency.value = 16500;
      this.musicFilter.Q.value = 0.7;
      this.musicFilter.connect(comp);

      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 1.0;
      this.musicBus.connect(this.musicFilter);

      // Lush tempo-synced Afrobeats / dub echo bus for guitars, marimbas, bells & chords
      this.delaySend = this.ctx.createGain();
      this.delaySend.gain.value = 0.24;
      this.delayNode = this.ctx.createDelay(1.0);
      this.delayNode.delayTime.value = 0.34;
      const delayFb = this.ctx.createGain();
      delayFb.gain.value = 0.28;
      const delayTone = this.ctx.createBiquadFilter();
      delayTone.type = 'bandpass';
      delayTone.frequency.value = 1450;
      delayTone.Q.value = 0.9;

      this.delaySend.connect(this.delayNode);
      this.delayNode.connect(delayTone);
      delayTone.connect(this.musicFilter);
      delayTone.connect(delayFb);
      delayFb.connect(this.delayNode);
      this.syncDelayToCurrentSong();

      // Shared white noise buffer
      const length = this.ctx.sampleRate * 2;
      this.noiseBuffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      this.setupContinuousNodes();
    } catch {
      // Ignore audio failures gracefully
    }
  }

  private setupContinuousNodes(): void {
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer) return;

    // ============ Combustion engine synth ============
    // Harmonic stack: firing-order saw + crank 2nd-order square + sub-harmonic
    // sine (V8 burble), soft-clipped by load, band-limited by RPM — then
    // layered with exhaust roar, tire roll, wind rush & rotor thump.
    const makeOsc = (type: OscillatorType, freq: number): OscillatorNode => {
      const o = this.ctx!.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      return o;
    };
    this.engineOsc1 = makeOsc('sawtooth', 80); // firing frequency
    this.engineOsc2 = makeOsc('square', 162); // 2nd-order crank harmonic
    this.engineOsc3 = makeOsc('sine', 40); // sub-harmonic burble

    const softClipCurve = new Float32Array(257);
    for (let i = 0; i < 257; i++) {
      const x = (i / 256) * 2 - 1;
      softClipCurve[i] = Math.tanh(x * 2.2) * 0.85;
    }

    this.engineShaper = this.ctx.createWaveShaper();
    this.engineShaper.curve = softClipCurve;
    this.engineOsc1Gain = this.ctx.createGain();
    this.engineOsc1Gain.gain.value = 0.5;
    this.engineOsc2Gain = this.ctx.createGain();
    this.engineOsc2Gain.gain.value = 0.3;
    this.engineOsc3Gain = this.ctx.createGain();
    this.engineOsc3Gain.gain.value = 0.35;

    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 420;
    this.engineFilter.Q.value = 1.1;

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;

    this.engineOsc1.connect(this.engineOsc1Gain);
    this.engineOsc2.connect(this.engineOsc2Gain);
    this.engineOsc3.connect(this.engineOsc3Gain);
    this.engineOsc1Gain.connect(this.engineShaper);
    this.engineOsc2Gain.connect(this.engineShaper);
    this.engineOsc3Gain.connect(this.engineShaper);
    this.engineShaper.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.sfxGain);

    this.engineOsc1.start();
    this.engineOsc2.start();
    this.engineOsc3.start();

    // Exhaust / intake roar (band-passed noise follows RPM + throttle)
    const engineNoiseSrc = this.ctx.createBufferSource();
    engineNoiseSrc.buffer = this.noiseBuffer;
    engineNoiseSrc.loop = true;
    this.engineNoiseFilter = this.ctx.createBiquadFilter();
    this.engineNoiseFilter.type = 'bandpass';
    this.engineNoiseFilter.frequency.value = 700;
    this.engineNoiseFilter.Q.value = 0.9;
    this.engineNoiseGain = this.ctx.createGain();
    this.engineNoiseGain.gain.value = 0;
    engineNoiseSrc.connect(this.engineNoiseFilter);
    this.engineNoiseFilter.connect(this.engineNoiseGain);
    this.engineNoiseGain.connect(this.sfxGain);
    engineNoiseSrc.start();

    // Tire rolling noise & wind rush (speed-dependent ambience)
    const tireSrc = this.ctx.createBufferSource();
    tireSrc.buffer = this.noiseBuffer;
    tireSrc.loop = true;
    const tireFilter = this.ctx.createBiquadFilter();
    tireFilter.type = 'bandpass';
    tireFilter.frequency.value = 480;
    tireFilter.Q.value = 0.55;
    this.tireNoiseGain = this.ctx.createGain();
    this.tireNoiseGain.gain.value = 0;
    tireSrc.connect(tireFilter);
    tireFilter.connect(this.tireNoiseGain);
    this.tireNoiseGain.connect(this.sfxGain);
    tireSrc.start();

    const windSrc = this.ctx.createBufferSource();
    windSrc.buffer = this.noiseBuffer;
    windSrc.loop = true;
    const windFilter = this.ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 240;
    windFilter.Q.value = 0.4;
    this.windNoiseGain = this.ctx.createGain();
    this.windNoiseGain.gain.value = 0;
    windSrc.connect(windFilter);
    windFilter.connect(this.windNoiseGain);
    this.windNoiseGain.connect(this.sfxGain);
    windSrc.start();

    // Helicopter rotor blade thump: LFO modulating the engine bus gain
    this.rotorLfo = this.ctx.createOscillator();
    this.rotorLfo.type = 'sine';
    this.rotorLfo.frequency.value = 12;
    this.rotorLfoDepth = this.ctx.createGain();
    this.rotorLfoDepth.gain.value = 0;
    this.rotorLfo.connect(this.rotorLfoDepth);
    this.rotorLfoDepth.connect(this.engineGain.gain);
    this.rotorLfo.start();

    // Tire screech loop
    const screechSrc = this.ctx.createBufferSource();
    screechSrc.buffer = this.noiseBuffer;
    screechSrc.loop = true;

    this.screechFilter = this.ctx.createBiquadFilter();
    this.screechFilter.type = 'bandpass';
    this.screechFilter.frequency.value = 1450;
    this.screechFilter.Q.value = 9;

    this.screechGain = this.ctx.createGain();
    this.screechGain.gain.value = 0;

    screechSrc.connect(this.screechFilter);
    this.screechFilter.connect(this.screechGain);
    this.screechGain.connect(this.sfxGain);
    screechSrc.start();

    // Police siren
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 680;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.sfxGain);
    this.sirenOsc.start();
  }

  public setVolumes(master: number, music: number, sfx: number): void {
    this.masterVol = master;
    this.musicVol = music;
    this.sfxVol = sfx;
    if (this.masterGain) this.masterGain.gain.value = master;
    if (this.musicGain) this.musicGain.gain.value = music * this.currentDuck;
    if (this.sfxGain) this.sfxGain.gain.value = sfx;
    if (this.htmlAudio) {
      this.htmlAudio.volume = Math.max(0, Math.min(1, master * music * this.currentDuck));
    }
  }

  /**
   * Master frame update for the Stonebwoy / Kweku Smoke / Kwesi Arthur soundtrack.
   * Plays continuously across Title, On-Foot (configurable), Vehicles, Shops, and softly
   * low-passed in the GTA V Pause Menu.
   */
  public updateSoundtrack(
    mode: GameMode,
    inVehicle: boolean,
    soundtrackOnFoot: boolean,
    dt: number
  ): void {
    const song = this.getCurrentSong();
    const shouldPlay =
      !!song &&
      this._currentStation !== 'off' &&
      !this.pausedByUser &&
      this.musicVol > 0.005 &&
      this.masterVol > 0.005 &&
      mode !== 'wasted' &&
      (mode !== 'playing' || inVehicle || soundtrackOnFoot);

    // Determine mix gain & low-pass tone per GTA V scene
    let targetDuck = 0;
    let targetCutoff = 16500;
    if (shouldPlay) {
      if (mode === 'playing') {
        targetDuck = inVehicle ? 1.0 : 0.78;
        targetCutoff = inVehicle ? 17500 : 14500;
      } else if (mode === 'title') {
        targetDuck = 0.76;
        targetCutoff = 15000;
      } else if (mode === 'lscustoms' || mode === 'ammunation') {
        targetDuck = 0.74;
        targetCutoff = 5400;
      } else if (mode === 'paused') {
        targetDuck = 0.42;
        targetCutoff = 1550;
      } else if (mode === 'switching') {
        targetDuck = 0.48;
        targetCutoff = 2600;
      }
    }

    this.currentDuck = targetDuck;
    if (this.ctx && this.musicGain && this.musicFilter) {
      const now = this.ctx.currentTime;
      this.musicGain.gain.setTargetAtTime(this.musicVol * targetDuck, now, 0.08);
      this.musicFilter.frequency.setTargetAtTime(targetCutoff, now, 0.1);
    }

    if (!shouldPlay || !song) {
      if (this.htmlAudio && !this.htmlAudio.paused) {
        this.htmlAudio.pause();
      }
      return;
    }

    // Path A: Stream real studio audio if an MP3/M4A/OGG/WAV is linked for this song
    if (song.audioUrl && !this.htmlAudioFailed.has(song.id)) {
      const el = this.ensureHtmlAudio();
      if (this.htmlAudioSongId !== song.id) {
        this.htmlAudioSongId = song.id;
        el.src = song.audioUrl;
        el.currentTime = 0;
      }
      el.volume = Math.max(0, Math.min(1, this.masterVol * this.musicVol * targetDuck));
      if (el.paused && this.ctx && this.ctx.state === 'running') {
        el.play().catch(() => {});
      }
      return;
    }

    // Path B: Genre-authentic Web Audio Afro-Dancehall / GH Drill / Afro-Fusion arrangement
    if (this.htmlAudio && !this.htmlAudio.paused) {
      this.htmlAudio.pause();
    }
    if (!this.ctx || this.ctx.state !== 'running' || !this.musicBus) return;

    this.songElapsed += dt;
    if (this.songElapsed >= song.synthDuration) {
      this.nextTrack(1, true);
      return;
    }

    this.tickSoundtrackSequencer(song, dt);
  }

  private tickSoundtrackSequencer(song: SoundtrackSong, dt: number): void {
    if (!this.ctx || !this.musicBus) return;

    // Half-time pocket for Kweku Smoke's soulful GH Trap & Drill (>= 125 BPM)
    const halfTime = song.style === 'gh_drill' || song.style === 'gospel_trap';

    const baseSixteenth = 60 / song.bpm / (halfTime ? 2 : 4);
    const isOffStep = this.stepIndex % 2 === 1;
    const stepDur = baseSixteenth * (isOffStep ? 1 - song.swing : 1 + song.swing);

    this.stepTimer += dt;
    if (this.stepTimer < stepDur) return;
    this.stepTimer = Math.min(this.stepTimer - stepDur, baseSixteenth * 0.5);

    const step = this.stepIndex % 16;
    const totalBar = Math.floor(this.stepIndex / 16);
    const bar = totalBar % 4;
    const section = Math.floor(totalBar / 4) % 3; // 0 = verse+hook, 1 = full chorus, 2 = dub/808 bridge
    this.stepIndex++;

    const t = this.ctx.currentTime + 0.005;
    const chord = song.chords[bar];
    const rootMidi = song.bassRoots[bar];
    const nextRootMidi = song.bassRoots[(bar + 1) % 4];
    const melody = bar % 2 === 0 ? song.melodyA : song.melodyB;

    // ===================== 1. DRUMS, SKANK & BASS =====================
    if (song.style === 'roots_reggae') {
      // Stonebwoy — Run Go & Send Dem a Prayer (authentic conscious one-drop reggae + bubble organ)
      if (step === 8 || (bar === 3 && step === 14)) {
        this.playAfroKick(t, 0.22);
      }
      if (step === 8 || (bar % 2 === 1 && step === 15)) {
        this.playRimshot(t, step === 8 ? 0.13 : 0.075, 800);
      }
      if (step % 2 === 0) {
        this.playHiHat(t, step === 2 || step === 6 || step === 10 || step === 14 ? 0.034 : 0.018, 0.032);
      }

      // Offbeat reggae guitar skank on '&' of every beat (steps 2, 6, 10, 14) + warm organ bubble
      if (step === 2 || step === 6 || step === 10 || step === 14) {
        for (const m of chord) {
          this.playInstrument(t, midiToFreq(m + 12), 'guitar', 0.1, 0.038, true);
        }
      } else if (step === 3 || step === 7 || step === 11 || step === 15) {
        this.playInstrument(t, midiToFreq(chord[0]), 'organ', 0.09, 0.032, false);
      }

      // Deep round singing roots reggae bassline
      const regBass: Record<number, number> = { 0: 0, 3: 0, 6: 7, 10: 5, 12: 7, 14: 0 };
      if (regBass[step] !== undefined) {
        this.playLogDrum(t, midiToFreq(rootMidi + regBass[step]), 0.32, 0.21);
      }
    } else if (song.style === 'dancehall_anthem') {
      // Stonebwoy — People Dey & Hero (militant roots-dancehall dembow & brass riddim)
      if (step === 0 || step === 6 || step === 8 || (bar % 2 === 1 && step === 14)) {
        this.playAfroKick(t, 0.22);
      }
      // Classic 3-3-2 dancehall snare/rimshot pocket
      if (step === 3 || step === 6 || step === 11 || step === 14) {
        this.playRimshot(t, 0.115, step === 6 || step === 14 ? 900 : 760);
        if (step === 6 || step === 14) this.playTrapSnare(t, 0.075);
      }
      if (step % 2 === 0) this.playShaker(t, step % 4 === 2 ? 0.034 : 0.02);

      // Crisp dancehall chord stab on steps 0, 6, 12
      if (step === 0 || step === 6 || step === 12) {
        for (const m of chord) {
          this.playInstrument(t, midiToFreq(m), 'epiano', 0.18, 0.032, true);
        }
      }

      if (step === 0) this.playLogDrum(t, midiToFreq(rootMidi), 0.34, 0.23);
      if (step === 6) this.playLogDrum(t, midiToFreq(rootMidi), 0.25, 0.2);
      if (step === 10) this.playLogDrum(t, midiToFreq(rootMidi + 7), 0.22, 0.16);
      if (step === 14) this.playLogDrum(t, midiToFreq(nextRootMidi), 0.22, 0.18);
    } else if (song.style === 'afro_highlife') {
      // Stonebwoy — Jejereje (infectious Ghanaian highlife guitar + shaker + log-drum bounce)
      if (step === 0 || step === 4 || step === 8 || step === 12) {
        this.playAfroKick(t, step % 8 === 0 ? 0.2 : 0.14);
      }
      if (step === 3 || step === 6 || step === 10 || step === 12 || step === 15) {
        this.playRimshot(t, 0.088, step === 10 ? 1040 : 820);
      }
      this.playShaker(t, step % 4 === 2 ? 0.038 : step % 2 === 1 ? 0.016 : 0.022);

      if (step === 0) this.playLogDrum(t, midiToFreq(rootMidi), 0.32, 0.22);
      if (step === 3) this.playLogDrum(t, midiToFreq(rootMidi), 0.2, 0.17);
      if (step === 7) this.playLogDrum(t, midiToFreq(rootMidi + 12), 0.16, 0.12);
      if (step === 10) this.playLogDrum(t, midiToFreq(rootMidi), 0.26, 0.19);
      if (step === 14) this.playLogDrum(t, midiToFreq(nextRootMidi), 0.2, 0.15);
    } else if (song.style === 'gh_drill') {
      // Kweku Smoke — Survivor (resilient 3-3-2 GH drill hi-hats + octave-gliding 808s)
      if (step === 0 || step === 10 || (bar % 2 === 1 && step === 7)) {
        this.playAfroKick(t, 0.24);
      }
      if (step === 4 || step === 12 || (bar === 3 && step === 15)) {
        this.playTrapSnare(t, 0.14);
      }
      const drillHats =
        step === 0 || step === 3 || step === 6 || step === 8 || step === 11 || step === 14;
      if (drillHats) {
        this.playHiHat(t, 0.048, 0.042);
      } else if (step === 7 || step === 15) {
        this.playHiHat(t, 0.028, 0.025);
        this.playHiHat(t + baseSixteenth * 0.5, 0.032, 0.025);
      }

      if (step === 0) {
        this.playDrill808(t, midiToFreq(rootMidi), midiToFreq(rootMidi), 0.55, 0.24);
      } else if (step === 6) {
        this.playDrill808(t, midiToFreq(rootMidi), midiToFreq(rootMidi + 12), 0.26, 0.19);
      } else if (step === 10) {
        this.playDrill808(t, midiToFreq(rootMidi), midiToFreq(rootMidi + 7), 0.34, 0.21);
      } else if (step === 14 && bar % 2 === 1) {
        this.playDrill808(t, midiToFreq(rootMidi + 12), midiToFreq(nextRootMidi), 0.28, 0.2);
      }
    } else {
      // Kweku Smoke — Sober, Faith & Hallelujah (soulful street-gospel choir + crisp trap + gliding 808s)
      if (step === 0 || step === 6 || step === 10 || (bar === 3 && step === 14)) {
        this.playAfroKick(t, 0.23);
      }
      if (step === 4 || step === 12) {
        this.playTrapSnare(t, 0.135);
      }
      this.playHiHat(t, step % 2 === 0 ? 0.038 : 0.022, 0.032);
      if (step === 11 || (bar % 2 === 1 && step === 15)) {
        this.playHiHat(t + baseSixteenth * 0.33, 0.028, 0.022);
        this.playHiHat(t + baseSixteenth * 0.66, 0.032, 0.022);
      }

      // Warm gospel piano/organ chord swells on steps 0 and 8
      if (step === 8) {
        for (const m of chord) {
          this.playInstrument(t, midiToFreq(m), 'epiano', baseSixteenth * 7.2, 0.028, true);
        }
      }

      if (step === 0) {
        this.playDrill808(t, midiToFreq(rootMidi), midiToFreq(rootMidi), 0.5, 0.23);
      } else if (step === 6) {
        this.playDrill808(t, midiToFreq(rootMidi), midiToFreq(rootMidi), 0.34, 0.19);
      } else if (step === 10) {
        const glideTo = bar % 2 === 1 ? rootMidi + 7 : rootMidi;
        this.playDrill808(t, midiToFreq(rootMidi), midiToFreq(glideTo), 0.4, 0.21);
      }
    }

    // ===================== 2. WARM CHORD PADS & HARMONIES =====================
    if (step === 0) {
      const barDur = baseSixteenth * 15.5;
      const padVol = song.style === 'gospel_trap' ? 0.042 : 0.033;
      for (const m of chord) {
        this.playPadVoice(t, midiToFreq(m), barDur, padVol);
      }
    }
    if (section === 1 && (step === 6 || step === 12) && song.style !== 'roots_reggae') {
      for (const m of chord) {
        this.playInstrument(t, midiToFreq(m), 'epiano', 0.24, 0.026, true);
      }
    }

    // ===================== 3. SIGNATURE SONG MELODY / HOOK =====================
    const semi = melody[step];
    if (semi !== null && semi !== undefined && (section !== 2 || step % 4 === 0)) {
      const noteMidi = chord[0] + semi;
      const dur = baseSixteenth * (halfTime ? 2.6 : 2.9);
      const gain = section === 1 ? 0.078 : 0.064;
      this.playInstrument(t, midiToFreq(noteMidi), song.leadInstrument, dur, gain, true);
      if (section === 1 && step === 0) {
        this.playInstrument(
          t,
          midiToFreq(noteMidi + 12),
          song.leadInstrument,
          dur * 1.1,
          0.024,
          true
        );
      }
    }
  }

  private playAfroKick(t: number, vol: number): void {
    if (!this.ctx || !this.musicBus) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(148, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.095);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(g);
    g.connect(this.musicBus);
    osc.start(t);
    osc.stop(t + 0.17);
  }

  private playLogDrum(t: number, freq: number, dur: number, vol: number): void {
    if (!this.ctx || !this.musicBus) return;
    // Deep sub + woody harmonic knock (classic Afrobeats / Amapiano log drum)
    const sub = this.ctx.createOscillator();
    const knock = this.ctx.createOscillator();
    const flt = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();

    sub.type = 'sine';
    sub.frequency.setValueAtTime(freq * 1.75, t);
    sub.frequency.exponentialRampToValueAtTime(freq, t + 0.042);

    knock.type = 'triangle';
    knock.frequency.setValueAtTime(freq * 3.0, t);
    knock.frequency.exponentialRampToValueAtTime(freq * 2.0, t + 0.03);

    const knockGain = this.ctx.createGain();
    knockGain.gain.setValueAtTime(vol * 0.42, t);
    knockGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.075);

    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(520, t);
    flt.frequency.exponentialRampToValueAtTime(160, t + dur);

    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    sub.connect(flt);
    knock.connect(knockGain);
    knockGain.connect(flt);
    flt.connect(g);
    g.connect(this.musicBus);

    sub.start(t);
    knock.start(t);
    sub.stop(t + dur + 0.02);
    knock.stop(t + 0.09);
  }

  private playDrill808(
    t: number,
    startFreq: number,
    endFreq: number,
    dur: number,
    vol: number
  ): void {
    if (!this.ctx || !this.musicBus) return;
    const osc = this.ctx.createOscillator();
    const harm = this.ctx.createOscillator();
    const flt = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();

    osc.type = 'sine';
    harm.type = 'sawtooth';

    osc.frequency.setValueAtTime(startFreq * 1.35, t);
    osc.frequency.exponentialRampToValueAtTime(startFreq, t + 0.025);
    if (Math.abs(endFreq - startFreq) > 1) {
      osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur * 0.68);
    }

    harm.frequency.setValueAtTime(startFreq, t);
    if (Math.abs(endFreq - startFreq) > 1) {
      harm.frequency.exponentialRampToValueAtTime(endFreq, t + dur * 0.68);
    }

    const harmGain = this.ctx.createGain();
    harmGain.gain.value = 0.24;

    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(280, t);
    flt.frequency.exponentialRampToValueAtTime(125, t + dur);

    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc.connect(g);
    harm.connect(harmGain);
    harmGain.connect(flt);
    flt.connect(g);
    g.connect(this.musicBus);

    osc.start(t);
    harm.start(t);
    osc.stop(t + dur + 0.02);
    harm.stop(t + dur + 0.02);
  }

  private playRimshot(t: number, vol: number, pitch = 860): void {
    if (!this.ctx || !this.musicBus || !this.noiseBuffer) return;
    // Woody Afrobeats / dancehall rim click
    const osc = this.ctx.createOscillator();
    const og = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(pitch, t);
    osc.frequency.exponentialRampToValueAtTime(pitch * 0.58, t + 0.028);
    og.gain.setValueAtTime(vol, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.042);
    osc.connect(og);
    og.connect(this.musicBus);
    osc.start(t);
    osc.stop(t + 0.048);

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2200;
    bp.Q.value = 3.2;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(vol * 0.55, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.032);
    src.connect(bp);
    bp.connect(ng);
    ng.connect(this.musicBus);
    src.start(t);
    src.stop(t + 0.038);
  }

  private playShaker(t: number, vol: number): void {
    if (!this.ctx || !this.musicBus || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 5400;
    bp.Q.value = 2.0;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.042);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.musicBus);
    src.start(t);
    src.stop(t + 0.048);
  }

  private playTrapSnare(t: number, vol: number): void {
    if (!this.ctx || !this.musicBus || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'highpass';
    flt.frequency.value = 1150;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.115);
    src.connect(flt);
    flt.connect(g);
    g.connect(this.musicBus);
    src.start(t);
    src.stop(t + 0.125);

    const body = this.ctx.createOscillator();
    const bg = this.ctx.createGain();
    body.type = 'triangle';
    body.frequency.setValueAtTime(220, t);
    body.frequency.exponentialRampToValueAtTime(130, t + 0.045);
    bg.gain.setValueAtTime(vol * 0.55, t);
    bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);
    body.connect(bg);
    bg.connect(this.musicBus);
    body.start(t);
    body.stop(t + 0.06);
  }

  private playHiHat(t: number, vol: number, dur = 0.036): void {
    if (!this.ctx || !this.musicBus || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'highpass';
    flt.frequency.value = 7200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt);
    flt.connect(g);
    g.connect(this.musicBus);
    src.start(t);
    src.stop(t + dur + 0.008);
  }

  private playPadVoice(t: number, freq: number, dur: number, vol: number): void {
    if (!this.ctx || !this.musicBus) return;
    const osc = this.ctx.createOscillator();
    const flt = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(920, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + Math.min(0.18, dur * 0.2));
    g.gain.setValueAtTime(vol * 0.85, t + dur * 0.72);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(flt);
    flt.connect(g);
    g.connect(this.musicBus);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  private playInstrument(
    t: number,
    freq: number,
    inst: LeadInstrument,
    dur: number,
    vol: number,
    sendEcho: boolean
  ): void {
    if (!this.ctx || !this.musicBus) return;
    const osc = this.ctx.createOscillator();
    const flt = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    flt.type = 'lowpass';

    let attack = 0.008;
    let release = dur;

    if (inst === 'guitar') {
      // Bright Ghanaian highlife electric guitar & crisp reggae skank
      osc.type = 'sawtooth';
      flt.frequency.setValueAtTime(2800, t);
      flt.frequency.exponentialRampToValueAtTime(680, t + Math.min(0.22, dur));
      flt.Q.value = 1.6;
      attack = 0.004;
      release = Math.min(dur, 0.34);
    } else if (inst === 'organ') {
      // Warm Hammond / roots-reggae bubble organ (Send Dem a Prayer, Run Go)
      osc.type = 'sine';
      flt.frequency.setValueAtTime(1850, t);
      attack = 0.01;
      release = dur * 1.1;
      const drawbar = this.ctx.createOscillator();
      const dg = this.ctx.createGain();
      drawbar.type = 'sine';
      drawbar.frequency.setValueAtTime(freq * 2, t);
      dg.gain.setValueAtTime(vol * 0.45, t);
      dg.gain.exponentialRampToValueAtTime(0.0001, t + release);
      drawbar.connect(dg);
      dg.connect(this.musicBus);
      drawbar.start(t);
      drawbar.stop(t + release + 0.02);
    } else if (inst === 'choir') {
      // Soulful street-gospel choir voice (Hallelujah, Faith)
      osc.type = 'sawtooth';
      flt.type = 'bandpass';
      flt.frequency.setValueAtTime(980, t);
      flt.Q.value = 2.1;
      attack = 0.038;
      release = dur * 1.35;
      const detuned = this.ctx.createOscillator();
      detuned.type = 'triangle';
      detuned.frequency.setValueAtTime(freq * 1.004, t);
      detuned.connect(flt);
      detuned.start(t);
      detuned.stop(t + release + 0.025);
    } else if (inst === 'epiano') {
      // Warm Fender Rhodes electric piano (Sober)
      osc.type = 'triangle';
      flt.frequency.setValueAtTime(1950, t);
      flt.frequency.exponentialRampToValueAtTime(820, t + dur);
      attack = 0.01;
      release = dur * 1.15;
    } else if (inst === 'brass') {
      // Warm Kingston/Accra reggae-dancehall horn section (People Dey, Run Go, Hero)
      osc.type = 'sawtooth';
      flt.frequency.setValueAtTime(620, t);
      flt.frequency.linearRampToValueAtTime(2150, t + 0.045);
      flt.frequency.exponentialRampToValueAtTime(950, t + dur);
      attack = 0.018;
      release = dur * 1.05;
    } else {
      // Moody GH drill bell (Survivor)
      osc.type = 'sine';
      flt.frequency.setValueAtTime(3200, t);
      attack = 0.004;
      release = dur * 1.25;
      const bellHarm = this.ctx.createOscillator();
      const bg = this.ctx.createGain();
      bellHarm.type = 'sine';
      bellHarm.frequency.setValueAtTime(freq * 2.0, t);
      bg.gain.setValueAtTime(vol * 0.36, t);
      bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      bellHarm.connect(bg);
      bg.connect(this.musicBus);
      bellHarm.start(t);
      bellHarm.stop(t + 0.15);
    }

    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + release);

    osc.connect(flt);
    flt.connect(g);
    g.connect(this.musicBus);
    if (sendEcho && this.delaySend) {
      g.connect(this.delaySend);
    }
    osc.start(t);
    osc.stop(t + release + 0.025);
  }

  // ===================== VEHICLE ENGINE, DRIFT & LSPD SIREN SFX =====================
  public updateVehicleAudio(
    inVehicle: boolean,
    kind: VehicleKind | null,
    speedRatio: number,
    throttle: number,
    driftIntensity: number,
    sirenIntensity: number,
    dt: number,
    muted: boolean
  ): void {
    if (
      !this.ctx ||
      !this.engineGain ||
      !this.engineOsc1 ||
      !this.engineOsc2 ||
      !this.engineOsc3 ||
      !this.engineFilter ||
      !this.engineNoiseGain
    ) {
      return;
    }
    const now = this.ctx.currentTime;

    if (muted) {
      this.engineGain.gain.setTargetAtTime(0, now, 0.06);
      this.screechGain?.gain.setTargetAtTime(0, now, 0.05);
      this.sirenGain?.gain.setTargetAtTime(0, now, 0.06);
      return;
    }

    if (inVehicle && kind) {
      const sr = Math.min(1.12, Math.abs(speedRatio));
      const thr = Math.abs(throttle);
      this.backfireCooldown = Math.max(0, this.backfireCooldown - dt);

      if (kind === 'helicopter') {
        // Turbine whine + rotor blade-pass thump
        const rotor = 0.55 + sr * 0.45;
        const whine = 185 + rotor * 175;
        this.engineOsc1!.frequency.setTargetAtTime(whine, now, 0.08);
        this.engineOsc2!.frequency.setTargetAtTime(whine * 2.72, now, 0.08);
        this.engineOsc3!.frequency.setTargetAtTime(21, now, 0.1);
        this.engineOsc1Gain!.gain.setTargetAtTime(0.42, now, 0.1);
        this.engineOsc2Gain!.gain.setTargetAtTime(0.16, now, 0.1);
        this.engineOsc3Gain!.gain.setTargetAtTime(0.6, now, 0.1);
        this.engineFilter!.frequency.setTargetAtTime(650 + rotor * 900, now, 0.1);
        this.engineNoiseFilter!.frequency.setTargetAtTime(850 + rotor * 1500, now, 0.1);
        this.engineNoiseGain!.gain.setTargetAtTime(0.05 + rotor * 0.05, now, 0.1);
        this.engineGain.gain.setTargetAtTime(0.075 + rotor * 0.05, now, 0.1);
        // Blade-pass frequency rises with rotor RPM
        this.rotorLfo!.frequency.setTargetAtTime(10.5 + rotor * 8.5, now, 0.15);
        this.rotorLfoDepth!.gain.setTargetAtTime(0.45, now, 0.15);
        this.tireNoiseGain?.gain.setTargetAtTime(0, now, 0.1);
        this.windNoiseGain?.gain.setTargetAtTime(Math.min(0.05, sr * 0.06), now, 0.1);
      } else {
        // ===================== Combustion engine =====================
        // Gear model: RPM climbs within each gear, dips on upshift
        const gears = kind === 'supercar' || kind === 'bike' ? 6 : 5;
        const gearPos = sr * gears;
        const gear = Math.min(gears - 1, Math.floor(gearPos));
        const within = gearPos - gear;
        if (gear !== this.engineGear) {
          this.shiftDip = gear > this.engineGear ? 0.2 : 0.05;
          this.engineGear = gear;
        }
        this.shiftDip = Math.max(0, this.shiftDip - dt * 1.35);

        // Launch revving + idle lumpiness (irregular combustion at low rpm)
        const launchRev = sr < 0.1 ? thr * 0.42 : 0;
        let targetRpm =
          0.17 + within * 0.74 * (0.6 + 0.4 * thr) + launchRev - this.shiftDip;
        targetRpm += Math.sin(now * 29) * 0.014 * Math.max(0, 1 - sr * 6);
        // Engine inertia: revs build & fall with real mass
        this.engineRpm += (targetRpm - this.engineRpm) * Math.min(1, dt * 5.5);
        const rpm = Math.max(0.08, this.engineRpm);

        // Per-vehicle-family firing frequency & harmonic character
        const tune = ENGINE_TUNE[kind] ?? ENGINE_TUNE.sedan;
        const fire = tune.fire * (0.22 + rpm * 1.5);
        this.engineOsc1!.frequency.setTargetAtTime(fire, now, 0.035);
        this.engineOsc2!.frequency.setTargetAtTime(fire * 2.015, now, 0.035); // slight detune = beating
        this.engineOsc3!.frequency.setTargetAtTime(fire * 0.5, now, 0.035);
        this.engineOsc1Gain!.gain.setTargetAtTime(tune.h1, now, 0.08);
        this.engineOsc2Gain!.gain.setTargetAtTime(tune.h2 * (0.6 + thr * 0.7), now, 0.08);
        this.engineOsc3Gain!.gain.setTargetAtTime(tune.h3, now, 0.08);
        this.engineFilter!.frequency.setTargetAtTime(300 + rpm * 2400 * tune.bright, now, 0.05);
        this.engineNoiseFilter!.frequency.setTargetAtTime(450 + rpm * 2100, now, 0.06);
        this.engineNoiseGain!.gain.setTargetAtTime((0.012 + thr * 0.05) * tune.noise, now, 0.06);
        this.engineGain.gain.setTargetAtTime(
          Math.min(0.15, 0.055 + thr * 0.05 + sr * 0.04),
          now,
          0.06
        );
        this.rotorLfoDepth!.gain.setTargetAtTime(0, now, 0.1);

        // Tire roll & wind rush grow with speed
        this.tireNoiseGain?.gain.setTargetAtTime(Math.min(0.05, sr * 0.055), now, 0.1);
        this.windNoiseGain?.gain.setTargetAtTime(Math.min(0.045, sr * sr * 0.055), now, 0.1);

        // Exhaust backfire crackle on hard throttle lift at high RPM
        if (
          this.lastVehicleThrottle > 0.6 &&
          throttle < 0.2 &&
          rpm > 0.45 &&
          this.backfireCooldown <= 0 &&
          Math.random() < 0.4
        ) {
          this.playBackfire();
          this.backfireCooldown = 0.45;
        }
        this.lastVehicleThrottle = throttle;
      }

      if (this.screechGain && this.screechFilter) {
        const sGain = kind === 'helicopter' ? 0 : Math.min(0.11, driftIntensity * 0.1);
        this.screechGain.gain.setTargetAtTime(sGain, now, 0.04);
        this.screechFilter.frequency.setTargetAtTime(1250 + driftIntensity * 450, now, 0.05);
      }
    } else {
      this.engineGain?.gain.setTargetAtTime(0, now, 0.08);
      this.engineNoiseGain?.gain.setTargetAtTime(0, now, 0.08);
      this.tireNoiseGain?.gain.setTargetAtTime(0, now, 0.08);
      this.windNoiseGain?.gain.setTargetAtTime(0, now, 0.08);
      this.rotorLfoDepth?.gain.setTargetAtTime(0, now, 0.1);
      this.screechGain?.gain.setTargetAtTime(0, now, 0.05);
    }

    if (this.sirenOsc && this.sirenGain) {
      if (sirenIntensity > 0.02) {
        this.sirenPhase += dt * 2.1;
        const wail = 640 + Math.sin(this.sirenPhase) * 240;
        this.sirenOsc.frequency.setTargetAtTime(wail, now, 0.03);
        this.sirenGain.gain.setTargetAtTime(Math.min(0.085, sirenIntensity * 0.085), now, 0.06);
      } else {
        this.sirenGain.gain.setTargetAtTime(0, now, 0.08);
      }
    }
  }

  /** Exhaust backfire crackle: sharp gas expansion pop with a low thump tail */
  private playBackfire(): void {
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer) return;
    const t = this.ctx.currentTime;

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'bandpass';
    flt.frequency.setValueAtTime(240, t);
    flt.frequency.exponentialRampToValueAtTime(90, t + 0.09);
    flt.Q.value = 1.6;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.24, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    src.connect(flt);
    flt.connect(g);
    g.connect(this.sfxGain);
    src.start(t, Math.random() * 0.8);
    src.stop(t + 0.12);

    const thump = this.ctx.createOscillator();
    const tg = this.ctx.createGain();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(64, t);
    thump.frequency.exponentialRampToValueAtTime(38, t + 0.11);
    tg.gain.setValueAtTime(0.16, t);
    tg.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    thump.connect(tg);
    tg.connect(this.sfxGain);
    thump.start(t);
    thump.stop(t + 0.14);
  }

  // ===================== COMBAT, WORLD & UI SFX =====================
  public playWeaponSound(weapon: WeaponId): void {
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer) return;
    const t = this.ctx.currentTime;

    if (weapon === 'unarmed') {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.frequency.setValueAtTime(160, t);
      osc.frequency.exponentialRampToValueAtTime(55, t + 0.09);
      g.gain.setValueAtTime(0.22, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      osc.connect(g);
      g.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.11);
      return;
    }

    if (weapon === 'rpg') {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const flt = this.ctx.createBiquadFilter();
      flt.type = 'bandpass';
      flt.frequency.setValueAtTime(420, t);
      flt.frequency.linearRampToValueAtTime(1100, t + 0.35);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.32, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
      src.connect(flt);
      flt.connect(g);
      g.connect(this.sfxGain);
      src.start(t);
      src.stop(t + 0.44);
      return;
    }

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'lowpass';

    let dur = 0.14;
    let vol = 0.28;
    let cutoff = 2800;
    let punchFreq = 190;

    if (weapon === 'smg') {
      dur = 0.09;
      vol = 0.2;
      cutoff = 3400;
      punchFreq = 230;
    } else if (weapon === 'rifle') {
      dur = 0.16;
      vol = 0.32;
      cutoff = 3100;
      punchFreq = 165;
    } else if (weapon === 'shotgun') {
      dur = 0.28;
      vol = 0.42;
      cutoff = 1900;
      punchFreq = 115;
    }

    flt.frequency.setValueAtTime(cutoff, t);
    flt.frequency.exponentialRampToValueAtTime(320, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);

    src.connect(flt);
    flt.connect(g);
    g.connect(this.sfxGain);
    src.start(t);
    src.stop(t + dur + 0.02);

    const osc = this.ctx.createOscillator();
    const og = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(punchFreq, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.08);
    og.gain.setValueAtTime(vol * 0.85, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    osc.connect(og);
    og.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  public playEnemyShot(distance: number): void {
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer) return;
    const att = Math.max(0, 1 - distance / 95);
    if (att <= 0.03) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'bandpass';
    flt.frequency.value = 1600;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.16 * att, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    src.connect(flt);
    flt.connect(g);
    g.connect(this.sfxGain);
    src.start(t);
    src.stop(t + 0.12);
  }

  public playExplosion(distance = 10): void {
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer) return;
    const att = Math.max(0.12, 1 - distance / 160);
    const t = this.ctx.currentTime;

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(920, t);
    flt.frequency.exponentialRampToValueAtTime(85, t + 1.15);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.55 * att, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.25);
    src.connect(flt);
    flt.connect(g);
    g.connect(this.sfxGain);
    src.start(t);
    src.stop(t + 1.3);

    const sub = this.ctx.createOscillator();
    const sg = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(95, t);
    sub.frequency.exponentialRampToValueAtTime(24, t + 0.7);
    sg.gain.setValueAtTime(0.5 * att, t);
    sg.gain.exponentialRampToValueAtTime(0.001, t + 0.75);
    sub.connect(sg);
    sg.connect(this.sfxGain);
    sub.start(t);
    sub.stop(t + 0.8);
  }

  public playCollision(intensity: number): void {
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer) return;
    const vol = Math.min(0.35, Math.max(0.04, intensity * 0.3));
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = 650 + intensity * 600;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    src.connect(flt);
    flt.connect(g);
    g.connect(this.sfxGain);
    src.start(t);
    src.stop(t + 0.18);
  }

  public playHorn(): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    for (const freq of [392, 493.88]) {
      const osc = this.ctx.createOscillator();
      const flt = this.ctx.createBiquadFilter();
      const g = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      flt.type = 'lowpass';
      flt.frequency.value = 1400;
      g.gain.setValueAtTime(0.08, t);
      g.gain.setValueAtTime(0.08, t + 0.24);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
      osc.connect(flt);
      flt.connect(g);
      g.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.34);
    }
  }

  public playSwitchPulse(): void {
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.22);
    g.gain.setValueAtTime(0.38, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.26);

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'bandpass';
    flt.frequency.value = 2200;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.12, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    src.connect(flt);
    flt.connect(ng);
    ng.connect(this.sfxGain);
    src.start(t);
    src.stop(t + 0.09);
  }

  public playWasted(): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(360, t);
    flt.frequency.exponentialRampToValueAtTime(65, t + 1.6);
    osc.frequency.setValueAtTime(82.4, t);
    osc.frequency.exponentialRampToValueAtTime(36, t + 1.6);
    g.gain.setValueAtTime(0.36, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.75);
    osc.connect(flt);
    flt.connect(g);
    g.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 1.8);
  }

  public playMissionPassed(): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const notes = [220, 261.63, 329.63, 392.0, 440.0, 523.25];
    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.sfxGain) return;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      const st = t + idx * 0.11;
      osc.frequency.setValueAtTime(freq, st);
      g.gain.setValueAtTime(0.001, st);
      g.gain.linearRampToValueAtTime(0.15, st + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, st + 0.85);
      osc.connect(g);
      g.connect(this.sfxGain);
      osc.start(st);
      osc.stop(st + 0.9);
    });
  }

  public playCashPickup(): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    [880, 1318.5].forEach((f, i) => {
      if (!this.ctx || !this.sfxGain) return;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t + i * 0.055);
      g.gain.setValueAtTime(0.12, t + i * 0.055);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.055 + 0.18);
      osc.connect(g);
      g.connect(this.sfxGain);
      osc.start(t + i * 0.055);
      osc.stop(t + i * 0.055 + 0.2);
    });
  }

  public playUiClick(pitch = 620): void {
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(pitch, t);
    g.gain.setValueAtTime(0.06, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.05);
  }
}
