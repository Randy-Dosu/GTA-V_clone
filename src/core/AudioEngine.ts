import { RadioStationId, RADIO_STATIONS, VehicleKind, WeaponId } from '../types';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  // Engine continuous nodes
  private engineOsc1: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;

  // Tire screech continuous nodes
  private screechGain: GainNode | null = null;
  private screechFilter: BiquadFilterNode | null = null;

  // Siren continuous nodes
  private sirenOsc: OscillatorNode | null = null;
  private sirenGain: GainNode | null = null;
  private sirenPhase = 0;

  // Radio sequencer
  public currentStation: RadioStationId = 'west_coast';
  private radioActive = false;
  private stepTimer = 0;
  private stepIndex = 0;

  // Volumes
  private masterVol = 0.65;
  private musicVol = 0.45;
  private sfxVol = 0.75;

  public unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.masterVol;
      this.masterGain.connect(this.ctx.destination);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxVol;
      this.sfxGain.connect(this.masterGain);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicVol;
      this.musicGain.connect(this.masterGain);

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

    // Engine synth
    this.engineOsc1 = this.ctx.createOscillator();
    this.engineOsc2 = this.ctx.createOscillator();
    this.engineOsc1.type = 'sawtooth';
    this.engineOsc2.type = 'triangle';
    this.engineOsc1.frequency.value = 55;
    this.engineOsc2.frequency.value = 110;

    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 260;
    this.engineFilter.Q.value = 2.4;

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;

    this.engineOsc1.connect(this.engineFilter);
    this.engineOsc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.sfxGain);

    this.engineOsc1.start();
    this.engineOsc2.start();

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
    if (this.musicGain) this.musicGain.gain.value = music;
    if (this.sfxGain) this.sfxGain.gain.value = sfx;
  }

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
    if (!this.ctx || !this.engineGain || !this.engineOsc1 || !this.engineOsc2 || !this.engineFilter) {
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
      const clamped = Math.min(1.2, Math.abs(speedRatio));
      // Simulated 5-speed transmission sawtooth RPM curve
      const gearProgress = (clamped * 4.2) % 1;
      const rpm = kind === 'helicopter'
        ? 0.45 + clamped * 0.55
        : 0.25 + gearProgress * 0.52 + clamped * 0.35 + Math.abs(throttle) * 0.12;

      let baseFreq = 48;
      let harmonic = 2.0;
      let filterBase = 240;
      if (kind === 'supercar') {
        baseFreq = 68;
        harmonic = 2.5;
        filterBase = 480;
      } else if (kind === 'muscle') {
        baseFreq = 40;
        harmonic = 1.5;
        filterBase = 310;
      } else if (kind === 'bike') {
        baseFreq = 82;
        harmonic = 2.0;
        filterBase = 560;
      } else if (kind === 'helicopter') {
        baseFreq = 32 + Math.sin(now * 44) * 8;
        harmonic = 1.5;
        filterBase = 210;
      }

      this.engineOsc1.frequency.setTargetAtTime(baseFreq * (0.8 + rpm * 1.9), now, 0.04);
      this.engineOsc2.frequency.setTargetAtTime(baseFreq * harmonic * (0.8 + rpm * 1.9), now, 0.04);
      this.engineFilter.frequency.setTargetAtTime(filterBase + rpm * 650, now, 0.05);
      const targetGain = 0.065 + Math.abs(throttle) * 0.045 + clamped * 0.03;
      this.engineGain.gain.setTargetAtTime(targetGain, now, 0.06);

      // Tire screech
      if (this.screechGain && this.screechFilter) {
        const sGain = kind === 'helicopter' ? 0 : Math.min(0.11, driftIntensity * 0.1);
        this.screechGain.gain.setTargetAtTime(sGain, now, 0.04);
        this.screechFilter.frequency.setTargetAtTime(1250 + driftIntensity * 450, now, 0.05);
      }

      // Radio sequencing
      this.radioActive = this.currentStation !== 'off';
      if (this.radioActive) {
        this.tickRadio(dt);
      }
    } else {
      this.engineGain.gain.setTargetAtTime(0, now, 0.08);
      this.screechGain?.gain.setTargetAtTime(0, now, 0.05);
      this.radioActive = false;
    }

    // Siren wail
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

  private tickRadio(dt: number): void {
    const station = RADIO_STATIONS.find((s) => s.id === this.currentStation);
    if (!station || station.bpm <= 0 || !this.ctx || !this.musicGain) return;

    const sixteenth = 60 / station.bpm / 4;
    this.stepTimer += dt;
    if (this.stepTimer < sixteenth) return;
    this.stepTimer -= sixteenth;

    const step = this.stepIndex % 16;
    const bar = Math.floor(this.stepIndex / 16) % 4;
    this.stepIndex++;

    const t = this.ctx.currentTime;

    if (this.currentStation === 'west_coast') {
      // Classic Los Santos G-Funk groove (94 BPM, A minor / F / G)
      if (step === 0 || step === 7 || step === 10) this.playDrumKick(t, 0.14);
      if (step === 4 || step === 12) this.playDrumSnare(t, 0.09);
      if (step % 2 === 0) this.playHiHat(t, 0.025);

      const bassNotes = [
        [55, 0, 0, 55, 0, 0, 65.4, 0, 73.4, 0, 65.4, 0, 0, 49, 0, 0],
        [43.65, 0, 0, 43.65, 0, 0, 55, 0, 65.4, 0, 0, 0, 49, 0, 51.9, 0],
      ][bar % 2];
      if (bassNotes[step]) this.playRadioNote(t, bassNotes[step], 'sawtooth', 0.22, 0.11, 320);

      // Iconic high West Coast sine whine on key beats
      const whine: Record<number, number> = bar % 2 === 0
        ? { 0: 880, 6: 784, 10: 659.25, 14: 784 }
        : { 2: 698.46, 8: 659.25, 12: 587.33 };
      if (whine[step]) this.playRadioNote(t, whine[step], 'sine', 0.36, 0.045, 2400);
    } else if (this.currentStation === 'mirror_park') {
      // Dreamy Los Santos synthwave (112 BPM)
      if (step % 4 === 0) this.playDrumKick(t, 0.12);
      if (step === 4 || step === 12) this.playDrumSnare(t, 0.075);
      if (step % 2 === 1) this.playHiHat(t, 0.022);

      const roots = [65.41, 49.0, 55.0, 43.65]; // C, G, Am, F
      const root = roots[bar];
      if (step % 2 === 0) {
        this.playRadioNote(t, root, 'sawtooth', 0.16, 0.085, 380);
      }
      const arpRatios = [4, 5, 6, 8, 6, 5, 4, 3];
      const freq = root * arpRatios[step % 8];
      this.playRadioNote(t, freq, 'triangle', 0.2, 0.048, 1800);
    } else if (this.currentStation === 'non_stop_pop') {
      // Upbeat dance-pop (124 BPM)
      if (step % 4 === 0) this.playDrumKick(t, 0.14);
      if (step === 4 || step === 12) this.playDrumSnare(t, 0.085);
      if (step % 4 === 2) this.playHiHat(t, 0.035);

      const chords = [
        [261.6, 329.6, 392.0],
        [293.7, 370.0, 440.0],
        [246.9, 311.1, 370.0],
        [220.0, 261.6, 329.6],
      ][bar];
      if (step === 0 || step === 3 || step === 6 || step === 10 || step === 14) {
        for (const f of chords) {
          this.playRadioNote(t, f, 'triangle', 0.15, 0.032, 1900);
        }
        this.playRadioNote(t, chords[0] * 0.25, 'sawtooth', 0.16, 0.085, 340);
      }
    } else if (this.currentStation === 'ls_rock') {
      // Driving California rock (118 BPM)
      if (step === 0 || step === 6 || step === 8 || step === 14) this.playDrumKick(t, 0.13);
      if (step === 4 || step === 12) this.playDrumSnare(t, 0.1);
      if (step % 2 === 0) this.playHiHat(t, 0.03);

      const roots = [82.41, 110.0, 146.83, 110.0]; // E, A, D, A
      const r = roots[bar];
      if (step % 2 === 0) {
        this.playRadioNote(t, r, 'sawtooth', 0.14, 0.075, 780);
        this.playRadioNote(t, r * 1.5, 'sawtooth', 0.14, 0.055, 1100);
      }
    }
  }

  private playRadioNote(
    t: number,
    freq: number,
    type: OscillatorType,
    dur: number,
    vol: number,
    cutoff: number
  ): void {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    const flt = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(cutoff, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(flt);
    flt.connect(g);
    g.connect(this.musicGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private playDrumKick(t: number, vol: number): void {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(135, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.11);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    osc.connect(g);
    g.connect(this.musicGain);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  private playDrumSnare(t: number, vol: number): void {
    if (!this.ctx || !this.musicGain || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'highpass';
    flt.frequency.value = 950;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    src.connect(flt);
    flt.connect(g);
    g.connect(this.musicGain);
    src.start(t);
    src.stop(t + 0.11);
  }

  private playHiHat(t: number, vol: number): void {
    if (!this.ctx || !this.musicGain || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'highpass';
    flt.frequency.value = 6200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    src.connect(flt);
    flt.connect(g);
    g.connect(this.musicGain);
    src.start(t);
    src.stop(t + 0.045);
  }

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

    // Gunshot noise burst + low punch
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
    // Iconic GTA V satellite zoom camera-flash thump
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
