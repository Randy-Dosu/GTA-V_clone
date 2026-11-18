import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  GOLD_COAST_ROTATION_IDS,
  INITIAL_SOUNDTRACK,
  midiToFreq,
} from '../src/audio/SoundtrackData';
import { AudioEngine } from '../src/core/AudioEngine';
import { GP, GamepadManager } from '../src/core/GamepadManager';
import { Player } from '../src/entities/Player';
import { Vehicle } from '../src/entities/Vehicle';
import { VehicleFactory } from '../src/entities/VehicleFactory';
import { MissionSystem } from '../src/gameplay/MissionSystem';
import { PoliceSystem } from '../src/gameplay/PoliceSystem';
import { TextureFactory } from '../src/graphics/TextureFactory';
import { GameSettings, RADIO_STATIONS } from '../src/types';
import { Minimap } from '../src/ui/Minimap';
import { UIManager } from '../src/ui/UIManager';
import { TrafficAndPeds } from '../src/world/TrafficAndPeds';
import { WORLD_BOUNDS } from '../src/world/WorldData';

describe('Stonebwoy & Kweku Smoke Soundtrack, AudioEngine & Full GTA V UI', () => {
  // ===================== Music API test double =====================
  const originalFetch = globalThis.fetch;
  const ITUNES_FIXTURES = [
    {
      trackName: 'Sober',
      artistName: 'Kweku Smoke',
      collectionName: 'Sober - Single',
      previewUrl: 'https://audio-ssl.itunes.apple.com/preview/kweku-smoke-sober.m4a',
      artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/sober/100x100bb.jpg',
      primaryGenreName: 'Ghanaian Pop',
      releaseDate: '2023-05-12T07:00:00Z',
    },
    {
      trackName: 'Hero',
      artistName: 'Stonebwoy',
      collectionName: 'Hero - Single',
      previewUrl: 'https://audio-ssl.itunes.apple.com/preview/stonebwoy-hero.m4a',
      artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/hero/100x100bb.jpg',
      primaryGenreName: 'Reggae',
      releaseDate: '2021-03-05T07:00:00Z',
    },
    {
      // Karaoke noise that the matcher must reject
      trackName: 'Survivor (Karaoke Version)',
      artistName: 'Studio Union',
      previewUrl: 'https://audio-ssl.itunes.apple.com/preview/karaoke-survivor.m4a',
      artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/karaoke/100x100bb.jpg',
      primaryGenreName: 'Karaoke',
      releaseDate: '2020-01-01T07:00:00Z',
    },
  ];
  let apiCallCount = 0;

  /** Mock global fetch: iTunes Search API shaped responses, everything else unreachable */
  const installApiMock = (mode: 'none' | 'fixture' | 'fail'): void => {
    apiCallCount = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('itunes.apple.com')) {
        apiCallCount++;
        if (mode === 'fail') throw new Error('music api unreachable');
        return {
          ok: true,
          status: 200,
          json: async () => ({ results: mode === 'fixture' ? ITUNES_FIXTURES : [] }),
        } as unknown as Response;
      }
      throw new Error('offline in tests');
    }) as typeof fetch;
  };

  beforeEach(() => installApiMock('none'));
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('contains the exact 15 requested songs by Stonebwoy, Kweku Smoke, Kwesi Arthur & Kofi Kinaata', () => {
    expect(INITIAL_SOUNDTRACK.length).toBe(15);

    const kwekuTitles = INITIAL_SOUNDTRACK.filter((s) => s.artist === 'Kweku Smoke').map(
      (s) => s.title
    );
    expect(kwekuTitles).toEqual(['Sober', 'Faith', 'Survivor', 'Hallelujah']);

    const stonebwoyTitles = INITIAL_SOUNDTRACK.filter((s) => s.artist === 'Stonebwoy').map(
      (s) => s.title
    );
    expect(stonebwoyTitles).toEqual([
      'People Dey',
      'Run Go',
      'Send Dem a Prayer',
      'Hero',
      'Jejereje (feat. Ginton)',
    ]);

    const kwesiTitles = INITIAL_SOUNDTRACK.filter((s) => s.artist === 'Kwesi Arthur').map(
      (s) => s.title
    );
    expect(kwesiTitles).toEqual(['Anthem', 'Grind Day', 'Baajo (feat. Joeboy)']);

    const kinaataTitles = INITIAL_SOUNDTRACK.filter((s) => s.artist === 'Kofi Kinaata').map(
      (s) => s.title
    );
    expect(kinaataTitles).toEqual(['Things Fall Apart', 'Susuka', 'Behind the Scenes']);

    // Gold Coast FM alternates through all 15 unique song IDs across all four artists
    expect(new Set(GOLD_COAST_ROTATION_IDS).size).toBe(15);
    const idSet = new Set(INITIAL_SOUNDTRACK.map((s) => s.id));
    for (const id of GOLD_COAST_ROTATION_IDS) {
      expect(idSet.has(id)).toBe(true);
    }

    // Musical data integrity
    expect(midiToFreq(69)).toBeCloseTo(440, 5);
    for (const song of INITIAL_SOUNDTRACK) {
      expect(song.bpm).toBeGreaterThanOrEqual(80);
      expect(song.bpm).toBeLessThanOrEqual(160);
      expect(song.chords.length).toBe(4);
      expect(song.bassRoots.length).toBe(4);
      expect(song.melodyA.length).toBe(16);
      expect(song.melodyB.length).toBe(16);
    }
  });

  it('sequences every song across all modes, skips tracks, switches stations, and auto-matches imported MP3s', () => {
    const audio = new AudioEngine();
    audio.unlock();

    expect(audio.currentStation).toBe('gold_coast');
    expect(audio.getStationTracks('bhim_fm').length).toBe(5);
    expect(audio.getStationTracks('scatter_fm').length).toBe(4);
    expect(audio.getStationTracks('ground_up_fm').length).toBe(3);
    expect(audio.getStationTracks('kinaata_fm').length).toBe(3);
    expect(audio.getStationTracks('gold_coast').length).toBe(15);

    // Step the procedural sequencer across every single song & style without error
    for (const song of audio.catalog) {
      audio.playSongById(song.id, song.station, false);
      expect(audio.getCurrentSong()?.id).toBe(song.id);
      for (let i = 0; i < 24; i++) {
        audio.updateSoundtrack('playing', i % 2 === 0, true, 0.05);
      }
    }

    // Test pause ducking, on-foot toggle, and wasted silence
    audio.updateSoundtrack('paused', false, true, 0.05);
    audio.updateSoundtrack('playing', false, false, 0.05);
    audio.updateSoundtrack('wasted', false, true, 0.05);

    // Track skip forward & backward wraps cleanly
    audio.setStation('scatter_fm', false);
    const first = audio.getCurrentSong()!;
    const second = audio.nextTrack(1, false)!;
    expect(second.id).not.toBe(first.id);
    const back = audio.nextTrack(-1, false)!;
    expect(back.id).toBe(first.id);

    // SFX suite executes cleanly
    for (const w of ['unarmed', 'pistol', 'smg', 'rifle', 'shotgun', 'rpg'] as const) {
      audio.playWeaponSound(w);
    }
    audio.playExplosion(12);
    audio.playCollision(0.8);
    audio.playHorn();
    audio.playSwitchPulse();
    audio.playMissionPassed();
    audio.playCashPickup();
    audio.playWasted();
    audio.updateVehicleAudio(true, 'supercar', 0.7, 1, 0.5, 0.6, 0.016, false);

    // Combustion engine model: audible in-vehicle, silent on foot, per-family character
    audio.updateVehicleAudio(false, null, 0, 0, 0, 0, 0.016, false);
    expect((audio as unknown as { engineGain: { gain: { value: number } } }).engineGain.gain.value).toBe(0);
    // Rev the engine up over a few frames (real RPM inertia — no instant jump)
    for (let i = 0; i < 40; i++) {
      audio.updateVehicleAudio(true, 'muscle', 0.45, 0.9, 0, 0, 0.016, false);
    }
    const audioInternals = audio as unknown as {
      engineGain: { gain: { value: number } };
      engineOsc1: { frequency: { value: number } };
      engineOsc2: { frequency: { value: number } };
      engineOsc3: { frequency: { value: number } };
      engineNoiseGain: { gain: { value: number } };
      engineGear: number;
      engineRpm: number;
    };
    expect(audioInternals.engineGain.gain.value).toBeGreaterThan(0.05);
    expect(audioInternals.engineOsc1.frequency.value).toBeGreaterThan(30);
    expect(audioInternals.engineOsc1.frequency.value).toBeLessThan(200);
    // V8 sub-harmonic burble & exhaust roar are active
    expect(audioInternals.engineOsc3.frequency.value).toBeCloseTo(audioInternals.engineOsc1.frequency.value * 0.5, 5);
    expect(audioInternals.engineNoiseGain.gain.value).toBeGreaterThan(0.02);
    // Sustained speed climbs through gears (RPM dip on shift, gear state advances)
    for (let i = 0; i < 90; i++) {
      audio.updateVehicleAudio(true, 'muscle', 0.02 * i * 0.012 + 0.5, 0.8, 0, 0, 0.016, false);
    }
    expect(audioInternals.engineGear).toBeGreaterThan(0);
    audio.updateVehicleAudio(true, 'helicopter', 0.6, 0.5, 0, 0, 0.016, false);
    expect(audioInternals.engineOsc1.frequency.value).toBeGreaterThan(150); // turbine whine
    audio.updateVehicleAudio(false, null, 0, 0, 0, 0, 0.016, false);
    expect(audioInternals.engineGain.gain.value).toBe(0);

    // Smart MP3 file importer binds exact requested hits AND routes extra artist files
    const soberFile = new File(['audio'], 'Kweku Smoke - Sober.mp3', { type: 'audio/mpeg' });
    const prayerFile = new File(['audio'], 'Stonebwoy - Send Dem a Prayer.mp3', {
      type: 'audio/mpeg',
    });
    const res = audio.importLocalAudioFiles([soberFile, prayerFile]);
    expect(res.total).toBe(2);
    expect(res.matched).toBe(2);
    expect(audio.getRealAudioCount()).toBe(2);
    expect(res.firstSong?.id).toBe('kweku-smoke-sober');
    audio.updateSoundtrack('playing', true, true, 0.05);
  });

  it('mounts index.html DOM, UIManager, Minimap, Radio deck, iFruit Phone, Shops & GLSL shaders cleanly', () => {
    const rootDir = path.resolve(__dirname, '..');
    const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
    document.documentElement.innerHTML = html;

    // Verify no duplicate element IDs in index.html
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);

    const scene = new THREE.Scene();
    const mockRenderer = {
      capabilities: { getMaxAnisotropy: () => 8 },
    } as unknown as THREE.WebGLRenderer;
    const factory = new VehicleFactory(new TextureFactory(mockRenderer));
    const audio = new AudioEngine();
    const gamepad = new GamepadManager();
    const player = new Player(scene);
    const traffic = new TrafficAndPeds(scene, factory, []);
    const police = new PoliceSystem(scene, factory, traffic);
    const missions = new MissionSystem(scene, traffic, police, audio);

    const radarCanvas = document.getElementById('radar-canvas') as HTMLCanvasElement;
    const pauseCanvas = document.getElementById('pause-map-canvas') as HTMLCanvasElement;
    const minimap = new Minimap(radarCanvas, pauseCanvas, []);

    // Minimap cursor clamping & waypoint toggling
    minimap.resetMapCursor(0, 0);
    minimap.moveMapCursor(99999, -99999);
    expect(minimap.mapCursor.x).toBeLessThanOrEqual(WORLD_BOUNDS.maxX);
    expect(minimap.mapCursor.z).toBeGreaterThanOrEqual(WORLD_BOUNDS.minZ);
    expect(minimap.toggleWaypointAtCursor()).not.toBeNull();
    expect(minimap.toggleWaypointAtCursor()).toBeNull();

    const settings: GameSettings = {
      mouseSensitivity: 1,
      gamepadSensitivity: 1.15,
      gamepadDeadzone: 0.14,
      gamepadVibration: true,
      masterVolume: 0.65,
      musicVolume: 0.52,
      sfxVolume: 0.75,
      soundtrackOnFoot: true,
      invertY: false,
      autoTimeCycle: true,
      showSpeedometer: true,
      graphicsQuality: 'high',
      aiDialogue: true,
    };

    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    const ui = new UIManager(canvas, settings, audio, gamepad, {
      onStartGame: () => {},
      onOpenPauseMap: () => {},
      onResumeGame: () => {},
      onSwitchCharacter: () => {},
      onSpawnVehicle: () => {},
      onSetWaypoint: (x, z) => {
        minimap.customWaypoint = { x, z };
      },
      onClearWaypoint: () => {
        minimap.customWaypoint = null;
      },
      onSetTimePreset: () => {},
      onClearWantedPaid: () => {},
      onTriggerPursuit: () => {},
      onAbortMission: () => {},
      onCloseShop: () => {},
      onSettingsChanged: () => {},
    });

    // Mode transitions: Title -> Playing -> Paused (Map, Brief, Radio, Controls, Settings) -> Shops -> Wasted
    ui.setMode('playing', player, missions, minimap, 16.5);
    ui.triggerNowPlaying(audio.getCurrentSong(), audio.getStation());
    expect(document.getElementById('np-title')!.textContent).toBe('People Dey');
    expect(document.getElementById('np-artist')!.textContent).toBe('Stonebwoy');

    // Radial wheels (Weapon, Radio, Character)
    ui.setWeaponWheel(true, player);
    ui.updateWeaponWheelCursor(120, 0, player);
    ui.setWeaponWheel(false, player);

    ui.setRadioWheel(true);
    expect(RADIO_STATIONS.length).toBe(6); // 5 stations + Radio Off
    ui.updateRadioWheelCursor(120, 0); // East slot with 6 stations rounds to index 2 (Scatter Der)
    expect(audio.currentStation).toBe('scatter_fm');
    ui.setRadioWheel(false);
    audio.setStation('gold_coast', false); // back to Gold Coast FM (all 9 tracks)

    ui.setCharWheel(true, player);
    ui.updateCharWheelStick(-0.8, 0);
    expect(ui.hoveredChar).toBe('michael');
    ui.updateCharWheelStick(0.8, 0);
    expect(ui.hoveredChar).toBe('trevor');
    ui.updateCharWheelStick(0, -0.9);
    expect(ui.hoveredChar).toBe('franklin');
    ui.setCharWheel(false, player);

    // iFruit Phone + iFruit Music app
    ui.togglePhone(true, 16.5);
    expect(ui.phoneOpen).toBe(true);
    const firstApp = document.querySelector<HTMLButtonElement>('.phone-app-btn')!;
    expect(firstApp.textContent).toContain('iFruit Music');
    firstApp.click();
    expect(document.getElementById('phone-screen')!.textContent).toContain('People Dey');
    expect(document.getElementById('phone-screen')!.textContent).toContain('Sober');
    ui.togglePhone(false);

    // Pause menu + Radio tab renders all 15 tracks
    ui.setMode('paused', player, missions, minimap, 17.0);
    ui.selectPauseTab('radio');
    const radioTracks = document.querySelectorAll('#pause-radio-content .radio-track-btn');
    expect(radioTracks.length).toBe(15);
    ui.selectPauseTab('controls');
    ui.selectPauseTab('settings');

    // LS Customs (while in vehicle) & Ammu-Nation
    const car = new Vehicle(factory, scene, 'supercar', 82, 0.2, 88, 0);
    player.enterVehicle(car);
    ui.setMode('lscustoms', player, missions, minimap, 17.0);
    expect(document.querySelectorAll('#shop-items button').length).toBeGreaterThan(5);
    player.exitVehicle();
    ui.setMode('ammunation', player, missions, minimap, 17.0);
    expect(document.querySelectorAll('#shop-items button').length).toBeGreaterThan(4);

    // HUD & radar frame update
    ui.setMode('playing', player, missions, minimap, 17.2);
    ui.updateHUD(0.016, 'playing', player, police, missions, 'Press F to enter');
    minimap.updateRadar(0.016, player, 0, police, missions, traffic.vehicles);

    // Groq AI speech bubble renders & hides
    ui.showSpeech('Lester Crest', 'The package is real. Move before the heat shows up.', 60);
    expect(document.getElementById('speech-bubble')!.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('speech-name')!.textContent).toBe('Lester Crest');
    expect(document.getElementById('speech-text')!.textContent).toContain('package is real');
    ui.hideSpeech();
    expect(document.getElementById('speech-bubble')!.classList.contains('hidden')).toBe(true);

    // Gamepad press check unused-import sanity
    expect(GP.START).toBe(9);

    // Verify manifest.json & GLSL shader source integrity
    const manifest = JSON.parse(
      fs.readFileSync(path.join(rootDir, 'public/music/manifest.json'), 'utf8')
    );
    expect(typeof manifest.files).toBe('object');

    const shaderSrc = fs.readFileSync(path.join(rootDir, 'src/graphics/SkyAndOcean.ts'), 'utf8');
    expect(shaderSrc).toContain('gl_Position');
    expect(shaderSrc).toContain('gl_FragColor');
  });

  it('resolves songs from the music API and streams the real song the moment it is selected', async () => {
    installApiMock('fixture');
    const audio = new AudioEngine();
    audio.unlock();

    const sober = audio.catalog.find((s) => s.id === 'kweku-smoke-sober')!;
    expect(sober.audioUrl).toBeUndefined();

    // Direct resolution binds the real streaming preview + metadata
    const result = await audio.ensureApiAudio(sober);
    expect(result).not.toBeNull();
    expect(result!.source).toBe('apple-music-api');
    expect(result!.previewUrl).toBe('https://audio-ssl.itunes.apple.com/preview/kweku-smoke-sober.m4a');
    expect(sober.audioUrl).toBe(result!.previewUrl);
    expect(audio.getApiTrack(sober.id)?.album).toBe('Sober - Single');
    expect(audio.getApiTrack(sober.id)?.genre).toBe('Ghanaian Pop');

    // Cached lookups make no extra network call
    const callsBefore = apiCallCount;
    await audio.ensureApiAudio(sober);
    expect(apiCallCount).toBe(callsBefore);

    // Selecting a track via the radio path triggers the same resolution & stream binding
    const hero = audio.catalog.find((s) => s.id === 'stonebwoy-hero')!;
    audio.playSongById(hero.id, hero.station, false);
    await audio.ensureApiAudio(hero); // same in-flight promise (deduped)
    expect(hero.audioUrl).toBe('https://audio-ssl.itunes.apple.com/preview/stonebwoy-hero.m4a');

    // Covers/karaoke noise is rejected: no confident match -> instrumental fallback stays
    const survivor = audio.catalog.find((s) => s.id === 'kweku-smoke-survivor')!;
    const missed = await audio.ensureApiAudio(survivor);
    expect(missed).toBeNull();
    expect(survivor.audioUrl).toBeUndefined();
    expect(audio.getApiTrack(survivor.id)).toBeNull();

    // Network failure degrades cleanly to the built-in instrumental engine
    installApiMock('fail');
    const offline = new AudioEngine();
    const faith = offline.catalog.find((s) => s.id === 'kweku-smoke-faith')!;
    const failed = await offline.ensureApiAudio(faith);
    expect(failed).toBeNull();
    expect(faith.audioUrl).toBeUndefined();
    expect(offline.getStationTracks('gold_coast').length).toBe(15);
  });
});
