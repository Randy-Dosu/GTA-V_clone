import {
  CharacterId,
  CHARACTER_PROFILES,
  GameMode,
  GameSettings,
  RadioStation,
  RADIO_STATIONS,
  RadioStationId,
  TimePreset,
  VehicleKind,
  WEAPON_SPECS,
  WeaponId,
} from '../types';
import { SoundtrackSong } from '../audio/SoundtrackData';
import { LANDMARKS, getDistrictAndStreet } from '../world/WorldData';
import { Player } from '../entities/Player';
import { PoliceSystem } from '../gameplay/PoliceSystem';
import { MissionSystem } from '../gameplay/MissionSystem';
import { AudioEngine } from '../core/AudioEngine';
import { GP, GamepadManager } from '../core/GamepadManager';
import { Minimap } from './Minimap';

export interface UICallbacks {
  onStartGame: () => void;
  onOpenPauseMap: () => void;
  onResumeGame: () => void;
  onSwitchCharacter: (id: CharacterId) => void;
  onDeliverVehicle: (kind: VehicleKind) => void;
  onSetWaypoint: (x: number, z: number, label: string) => void;
  onClearWaypoint: () => void;
  onSetTimePreset: (preset: TimePreset) => void;
  onClearWantedPaid: () => void;
  onTriggerPursuit: () => void;
  onCloseShop: () => void;
  onSettingsChanged: (settings: GameSettings) => void;
  onAbortMission: () => void;
}

const LSC_COLORS = [
  { name: 'Torino Red', hex: 0xd91e2b },
  { name: 'Race Yellow', hex: 0xf5b800 },
  { name: 'Ice White', hex: 0xf5f7fa },
  { name: 'Carbon Black', hex: 0x14171d },
  { name: 'Ultra Blue', hex: 0x1768e3 },
  { name: 'Lime Green', hex: 0x16b857 },
  { name: 'Sunrise Orange', hex: 0xff5a14 },
  { name: 'Schafter Purple', hex: 0x7c3aed },
  { name: 'Hot Pink', hex: 0xec4899 },
  { name: 'Dew Cyan', hex: 0x06b6d4 },
  { name: 'Brushed Gold', hex: 0xd4af37 },
  { name: 'Silver Steel', hex: 0x94a3b8 },
];

export class UIManager {
  private canvas: HTMLCanvasElement;
  private fxLayer: HTMLElement;
  private flashLayer: HTMLElement;

  private titleScreen: HTMLElement;
  private titleModal: HTMLElement;
  private titleModalHeading: HTMLElement;
  private titleModalBody: HTMLElement;

  private hud: HTMLElement;
  private contextPrompt: HTMLElement;
  private wantedEl: HTMLElement;
  private starEls: HTMLElement[];
  private cashEl: HTMLElement;
  private cashDeltaEl: HTMLElement;
  private ammoEl: HTMLElement;
  private ammoMagEl: HTMLElement;
  private ammoResEl: HTMLElement;
  private timerEl: HTMLElement;
  private reticleEl: HTMLElement;

  private barHealth: HTMLElement;
  private barArmor: HTMLElement;
  private barSpecial: HTMLElement;

  private objectiveBar: HTMLElement;
  private speedBox: HTMLElement;
  private speedVal: HTMLElement;
  private speedUnit: HTMLElement;

  private areaToast: HTMLElement;
  private toastVeh: HTMLElement;
  private toastStreet: HTMLElement;
  private toastDistrict: HTMLElement;

  private bigBanner: HTMLElement;
  private bannerTitle: HTMLElement;
  private bannerSub: HTMLElement;
  private bannerExtra: HTMLElement;

  private weaponWheel: HTMLElement;
  private weaponSlotsEl: HTMLElement;
  private radioWheel: HTMLElement;
  private radioSlotsEl: HTMLElement;
  private charWheel: HTMLElement;

  private phoneEl: HTMLElement;
  private phoneClockEl: HTMLElement;
  private phoneScreenEl: HTMLElement;
  public phoneOpen = false;
  private phoneView: 'home' | 'music' | 'mechanic' | 'gps' | 'contacts' | 'sky' = 'home';

  private nowPlayingEl: HTMLElement;
  private npDotEl: HTMLElement;
  private npStationEl: HTMLElement;
  private npTitleEl: HTMLElement;
  private npArtistEl: HTMLElement;
  private musicFileInput: HTMLInputElement;

  private shopDrawer: HTMLElement;
  private shopTitle: HTMLElement;
  private shopSub: HTMLElement;
  private shopItems: HTMLElement;

  private wastedScreen: HTMLElement;
  private pauseMenu: HTMLElement;

  // Timers & state
  private toastTimer = 0;
  private nowPlayingTimer = 0;
  private lastDistrict = '';
  private lastVehicleId = -1;
  private bannerTimer = 0;
  private cashDeltaTimer = 0;
  private hitMarkerTimer = 0;
  private damageFlashTimer = 0;
  private helpOverrideText: string | null = null;
  private helpOverrideTimer = 0;

  public weaponWheelOpen = false;
  public hoveredWeapon: WeaponId = 'unarmed';
  public radioWheelOpen = false;
  public hoveredStation: RadioStationId = 'gold_coast';
  public charWheelOpen = false;
  public hoveredChar: CharacterId = 'franklin';

  private activePauseTab: 'map' | 'missions' | 'radio' | 'controls' | 'settings' = 'map';
  private controlsSubTab: 'keyboard' | 'gamepad' = 'keyboard';
  private titleFocusIdx = 3; // defaults to STORY MODE
  private phoneFocusIdx = 0;
  private shopFocusIdx = 0;
  private pauseFocusIdx = -1;

  private callbacks: UICallbacks;
  private settings: GameSettings;
  private audio: AudioEngine;
  private gamepad: GamepadManager;

  constructor(
    canvas: HTMLCanvasElement,
    settings: GameSettings,
    audio: AudioEngine,
    gamepad: GamepadManager,
    callbacks: UICallbacks
  ) {
    this.canvas = canvas;
    this.settings = settings;
    this.audio = audio;
    this.gamepad = gamepad;
    this.callbacks = callbacks;

    const $ = (id: string) => document.getElementById(id)!;
    this.fxLayer = $('fx-layer');
    this.flashLayer = $('flash-layer');

    this.titleScreen = $('title-screen');
    this.titleModal = $('title-modal');
    this.titleModalHeading = $('title-modal-heading');
    this.titleModalBody = $('title-modal-body');

    this.hud = $('hud');
    this.contextPrompt = $('context-prompt');
    this.wantedEl = $('wanted-stars');
    this.starEls = Array.from(this.wantedEl.querySelectorAll('.star'));
    this.cashEl = $('hud-cash');
    this.cashDeltaEl = $('hud-cash-delta');
    this.ammoEl = $('hud-ammo');
    this.ammoMagEl = $('ammo-mag');
    this.ammoResEl = $('ammo-reserve');
    this.timerEl = $('hud-timer');
    this.reticleEl = $('reticle');

    this.barHealth = $('bar-health');
    this.barArmor = $('bar-armor');
    this.barSpecial = $('bar-special');

    this.objectiveBar = $('objective-bar');
    this.speedBox = $('speed-box');
    this.speedVal = $('speed-val');
    this.speedUnit = $('speed-unit');

    this.areaToast = $('area-toast');
    this.toastVeh = $('toast-vehicle');
    this.toastStreet = $('toast-street');
    this.toastDistrict = $('toast-district');

    this.nowPlayingEl = $('now-playing');
    this.npDotEl = $('np-dot');
    this.npStationEl = $('np-station');
    this.npTitleEl = $('np-title');
    this.npArtistEl = $('np-artist');
    this.musicFileInput = $('music-file-input') as HTMLInputElement;

    this.bigBanner = $('big-banner');
    this.bannerTitle = $('banner-title');
    this.bannerSub = $('banner-sub');
    this.bannerExtra = $('banner-extra');

    this.weaponWheel = $('weapon-wheel');
    this.weaponSlotsEl = $('weapon-slots');
    this.radioWheel = $('radio-wheel');
    this.radioSlotsEl = $('radio-slots');
    this.charWheel = $('char-wheel');

    this.phoneEl = $('ifruit-phone');
    this.phoneClockEl = $('phone-clock');
    this.phoneScreenEl = $('phone-screen');

    this.shopDrawer = $('shop-drawer');
    this.shopTitle = $('shop-title');
    this.shopSub = $('shop-sub');
    this.shopItems = $('shop-items');

    this.wastedScreen = $('wasted-screen');
    this.pauseMenu = $('pause-menu');

    this.bindUIEvents();
    this.buildWeaponWheelDOM();
    this.buildRadioWheelDOM();
    this.populateStaticPanels();
  }

  private bindUIEvents(): void {
    document.getElementById('btn-start-story')!.addEventListener('click', () => {
      this.audio.unlock();
      this.audio.playUiClick(740);
      this.callbacks.onStartGame();
    });

    document.getElementById('btn-title-radio')!.addEventListener('click', () => {
      this.audio.unlock();
      this.audio.playUiClick();
      this.titleModalHeading.textContent = 'RADIO';
      this.mountRadioDOM(this.titleModalBody);
      this.titleModal.classList.remove('hidden');
      this.pauseFocusIdx = 0;
    });

    document.getElementById('btn-title-controls')!.addEventListener('click', () => {
      this.audio.unlock();
      this.audio.playUiClick();
      this.controlsSubTab = this.gamepad.connected ? 'gamepad' : 'keyboard';
      this.titleModalHeading.textContent = 'CONTROLS';
      this.mountControlsDOM(this.titleModalBody);
      this.titleModal.classList.remove('hidden');
      this.pauseFocusIdx = 0;
    });

    document.getElementById('btn-title-settings')!.addEventListener('click', () => {
      this.audio.unlock();
      this.audio.playUiClick();
      this.titleModalHeading.textContent = 'SETTINGS';
      this.titleModalBody.innerHTML = '';
      this.titleModalBody.appendChild(this.buildSettingsDOM());
      this.titleModal.classList.remove('hidden');
      this.pauseFocusIdx = 0;
    });

    document.getElementById('btn-title-modal-close')!.addEventListener('click', () => {
      this.titleModal.classList.add('hidden');
    });

    // Pause tabs
    document.querySelectorAll('.pause-tab[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = (btn as HTMLElement).dataset.tab!;
        this.audio.playUiClick();
        this.selectPauseTab(tab);
      });
    });

    document.getElementById('btn-resume')!.addEventListener('click', () => {
      this.audio.playUiClick(740);
      this.callbacks.onResumeGame();
    });

    document.getElementById('btn-clear-waypoint')!.addEventListener('click', () => {
      this.audio.playUiClick();
      this.callbacks.onClearWaypoint();
    });

    // Character switch wheel slots
    this.charWheel.querySelectorAll('.char-slot[data-char]').forEach((el) => {
      el.addEventListener('click', () => {
        const cid = (el as HTMLElement).dataset.char as CharacterId;
        this.charWheelOpen = false;
        this.charWheel.classList.add('hidden');
        this.callbacks.onSwitchCharacter(cid);
      });
    });

    // iFruit close
    document.getElementById('phone-close')!.addEventListener('click', () => {
      this.togglePhone(false);
    });

    // Clicking radar opens the full Los Santos GPS Map
    document.getElementById('radar-wrap')!.addEventListener('click', () => {
      this.audio.playUiClick();
      this.callbacks.onOpenPauseMap();
    });

    // Shop close
    document.getElementById('shop-exit')!.addEventListener('click', () => {
      this.audio.playUiClick();
      this.callbacks.onCloseShop();
    });

    // Local MP3 / M4A / WAV soundtrack file importer
    this.musicFileInput.addEventListener('change', () => {
      const files = this.musicFileInput.files;
      if (files && files.length > 0) {
        const res = this.audio.importLocalAudioFiles(files);
        this.refreshRadioPanels();
        if (this.phoneOpen && this.phoneView === 'music') {
          this.renderPhoneScreen();
        }
        if (res.total > 0 && res.firstSong) {
          this.showHelpToast(
            `Loaded <b>${res.total}</b> audio track${res.total > 1 ? 's' : ''} — playing <b>${res.firstSong.artist} — ${res.firstSong.title}</b>.`,
            4.2
          );
        }
      }
      this.musicFileInput.value = '';
    });
  }

  public openMusicFilePicker(): void {
    this.musicFileInput.click();
  }

  public selectPauseTab(tab: string): void {
    this.activePauseTab = tab as 'map' | 'missions' | 'radio' | 'controls' | 'settings';
    this.pauseFocusIdx = tab === 'map' ? -1 : 0;
    document.querySelectorAll('.pause-tab[data-tab]').forEach((b) => {
      b.classList.toggle('active', (b as HTMLElement).dataset.tab === tab);
    });
    document.querySelectorAll('.pause-panel').forEach((p) => {
      p.classList.toggle('active', p.id === `tab-${tab}`);
    });
    if (tab === 'radio') {
      this.refreshRadioPanels();
    } else if (tab === 'controls') {
      this.refreshControlsPanels();
    } else if (tab === 'settings') {
      const setHost = document.getElementById('pause-settings-content')!;
      setHost.innerHTML = '';
      setHost.appendChild(this.buildSettingsDOM());
      if (this.gamepad.usingGamepad) this.applyFocusList(setHost, '.setting-row', this.pauseFocusIdx);
    }
  }

  public refreshRadioPanels(): void {
    const pauseHost = document.getElementById('pause-radio-content');
    if (pauseHost && this.activePauseTab === 'radio') {
      this.mountRadioDOM(pauseHost);
      if (this.gamepad.usingGamepad) {
        this.applyFocusList(pauseHost, '[data-radio-nav]', this.pauseFocusIdx);
      }
    }
    if (
      !this.titleModal.classList.contains('hidden') &&
      this.titleModalHeading.textContent === 'RADIO'
    ) {
      this.mountRadioDOM(this.titleModalBody);
      if (this.gamepad.usingGamepad) {
        this.applyFocusList(this.titleModalBody, '[data-radio-nav]', this.pauseFocusIdx);
      }
    }
    if (this.radioWheelOpen) {
      this.refreshRadioWheelVisuals();
    }
    if (this.phoneOpen && this.phoneView === 'music') {
      this.renderPhoneScreen();
    }
  }

  private mountRadioDOM(container: HTMLElement): void {
    container.innerHTML = '';
    const deck = document.createElement('div');
    deck.className = 'radio-deck';

    const st = this.audio.getStation();
    const song = this.audio.getCurrentSong();
    const mp3Count = this.audio.getImportedAudioCount();

    // 1. Live Now Playing bar + Transport + Import MP3
    const nowCard = document.createElement('div');
    nowCard.className = 'radio-now-card';
    nowCard.style.setProperty('--st-color', st.color);

    const meta = document.createElement('div');
    meta.className = 'radio-now-meta';
    const nowApi = song ? this.audio.getApiTrack(song.id) : null;
    meta.innerHTML = `
      <div class="radio-now-station">${st.name}${st.host ? ` &bull; ${st.host}` : ''}</div>
      <div class="radio-now-title" ${nowApi ? `title="${nowApi.album} &bull; ${nowApi.genre}"` : ''}>${
        song ? `${song.artist} &mdash; ${song.title}` : 'Soundtrack Muted (Radio Off)'
      }</div>
      <div class="radio-now-sub">${
        song
          ? `${song.vibe} &bull; ${song.bpm} BPM &bull; ${
              nowApi
                ? 'Apple Music API Stream'
                : song.audioUrl
                  ? 'Original Audio Streaming'
                  : 'In-Game Instrumental Riddim'
            }`
          : 'Select any station or song below to resume the soundtrack'
      }</div>
    `;

    const transport = document.createElement('div');
    transport.className = 'radio-transport';

    const mkBtn = (label: string, extraCls: string, onClick: () => void) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `radio-ctrl-btn ${extraCls}`.trim();
      b.dataset.radioNav = '1';
      b.textContent = label;
      b.addEventListener('click', () => {
        this.audio.unlock();
        this.audio.playUiClick(620);
        onClick();
      });
      return b;
    };

    transport.append(
      mkBtn('Prev', '', () => {
        this.audio.nextTrack(-1, true);
        this.mountRadioDOM(container);
      }),
      mkBtn(this.audio.isMusicPaused ? 'Play' : 'Pause', '', () => {
        this.audio.toggleMusicPause();
        this.mountRadioDOM(container);
      }),
      mkBtn('Next', '', () => {
        this.audio.nextTrack(1, true);
        this.mountRadioDOM(container);
      }),
      mkBtn(
        mp3Count > 0 ? `+ Import MP3s (${mp3Count})` : '+ Import MP3s',
        'import-btn',
        () => this.openMusicFilePicker()
      )
    );

    nowCard.append(meta, transport);
    deck.appendChild(nowCard);

    // 2. Station Pills (Gold Coast FM, BHIM Nation, Scatter Der, Ground Up, Off)
    const strip = document.createElement('div');
    strip.className = 'radio-station-strip';
    for (const s of RADIO_STATIONS) {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = `radio-st-pill ${s.id === st.id ? 'active' : ''}`;
      pill.dataset.radioNav = '1';
      pill.style.setProperty('--st-color', s.color);
      pill.textContent = s.name;
      pill.addEventListener('click', () => {
        this.audio.unlock();
        this.audio.playUiClick(640);
        this.audio.setStation(s.id, true);
        this.mountRadioDOM(container);
      });
      strip.appendChild(pill);
    }
    deck.appendChild(strip);

    // 3. Tracklist for active station (or full catalog when Off)
    const tracks =
      st.id === 'off' ? this.audio.getStationTracks('gold_coast') : this.audio.getStationTracks(st.id);
    const list = document.createElement('div');
    list.className = 'radio-tracklist';
    for (const tr of tracks) {
      const isPlaying = !!song && song.id === tr.id && st.id !== 'off' && !this.audio.isMusicPaused;
      const apiTr = this.audio.getApiTrack(tr.id);
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `radio-track-btn ${isPlaying ? 'playing' : ''}`;
      row.dataset.radioNav = '1';
      if (apiTr) {
        row.title = `${apiTr.album ? `${apiTr.album} • ` : ''}${
          apiTr.genre ? `${apiTr.genre} • ` : ''
        }streamed via Apple Music API`;
      }
      const badgeCls = isPlaying ? 'live' : apiTr || tr.audioUrl ? 'mp3' : '';
      const badgeTxt = isPlaying ? 'PLAYING' : apiTr ? 'LIVE' : tr.audioUrl ? 'AUDIO' : `${tr.bpm} BPM`;
      row.innerHTML = `
        <span class="rt-info">
          <span class="rt-title">${tr.title}</span>
          <span class="rt-artist">${tr.artist} &bull; ${tr.vibe}</span>
        </span>
        <span class="rt-badge ${badgeCls}">${badgeTxt}</span>
      `;
      row.addEventListener('click', () => {
        this.audio.unlock();
        this.audio.playUiClick(680);
        const pref = st.id === 'off' ? 'gold_coast' : st.id;
        this.audio.playSongById(tr.id, pref, true);
        this.mountRadioDOM(container);
      });
      list.appendChild(row);
    }
    deck.appendChild(list);

    const note = document.createElement('div');
    note.className = 'radio-footnote';
    note.textContent =
      'Every song is resolved through the Apple Music (iTunes Search) API and streams the moment you select it — LIVE rows are real API streams. Without internet, the built-in Reggae, Dancehall, Afro-Highlife, Gospel Trap & GH Drill instrumentals play automatically. Click "+ Import MP3s" anytime to use your own audio files (auto-matched by song title).';
    deck.appendChild(note);

    container.appendChild(deck);
  }

  public refreshControlsPanels(): void {
    const pauseCtrl = document.getElementById('pause-controls-content');
    if (pauseCtrl) this.mountControlsDOM(pauseCtrl);
    if (!this.titleModal.classList.contains('hidden') && this.titleModalHeading.textContent === 'CONTROLS') {
      this.mountControlsDOM(this.titleModalBody);
    }
  }

  private mountControlsDOM(container: HTMLElement): void {
    const gp = this.gamepad;
    const statusHtml = gp.connected
      ? `<div class="gp-status-banner"><span><b>${gp.controllerName}</b> connected</span><span>${gp.style === 'playstation' ? 'PlayStation Layout' : 'Xbox / Standard Layout'}</span></div>`
      : `<div class="gp-status-banner disconnected"><span>No controller detected yet</span><span>Connect any Xbox, PlayStation, or Bluetooth gamepad &amp; press a button</span></div>`;

    const subTabsHtml = `
      <div class="ctrl-subtabs">
        <button type="button" class="ctrl-subtab ${this.controlsSubTab === 'keyboard' ? 'active' : ''}" data-csub="keyboard">KEYBOARD &amp; MOUSE</button>
        <button type="button" class="ctrl-subtab ${this.controlsSubTab === 'gamepad' ? 'active' : ''}" data-csub="gamepad">GAMEPAD</button>
      </div>
    `;

    const bodyHtml =
      this.controlsSubTab === 'gamepad' ? this.renderGamepadControlsHTML() : this.renderKeyboardControlsHTML();

    container.innerHTML = statusHtml + subTabsHtml + bodyHtml;
    container.querySelectorAll('.ctrl-subtab').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.audio.playUiClick();
        this.controlsSubTab = (btn as HTMLElement).dataset.csub as 'keyboard' | 'gamepad';
        this.mountControlsDOM(container);
      });
    });
  }

  private renderKeyboardControlsHTML(): string {
    return `
      <div class="controls-grid">
        <div class="ctrl-group">
          <h4>On Foot &amp; Combat</h4>
          <div class="ctrl-row"><span>Move</span><span><b class="keycap">W</b><b class="keycap">A</b><b class="keycap">S</b><b class="keycap">D</b></span></div>
          <div class="ctrl-row"><span>Sprint / Jump</span><span><b class="keycap">SHIFT</b> / <b class="keycap">SPACE</b></span></div>
          <div class="ctrl-row"><span>Enter Vehicle</span><span><b class="keycap">F</b> or <b class="keycap">E</b></span></div>
          <div class="ctrl-row"><span>Aim / Fire</span><span><b class="keycap">RMB</b> / <b class="keycap">LMB</b></span></div>
          <div class="ctrl-row"><span>Weapon Wheel</span><span>Hold <b class="keycap">TAB</b> / <b class="keycap">Scroll</b></span></div>
          <div class="ctrl-row"><span>Reload</span><span><b class="keycap">R</b></span></div>
        </div>
        <div class="ctrl-group">
          <h4>Vehicles &amp; Los Santos</h4>
          <div class="ctrl-row"><span>Drive / Handbrake</span><span><b class="keycap">WASD</b> / <b class="keycap">SPACE</b></span></div>
          <div class="ctrl-row"><span>Turbo / Horn &amp; Siren</span><span><b class="keycap">SHIFT</b> / <b class="keycap">H</b></span></div>
          <div class="ctrl-row"><span>Chopper Lift / Drop</span><span><b class="keycap">SPACE</b> / <b class="keycap">SHIFT</b></span></div>
          <div class="ctrl-row"><span>Radio Wheel / Next Song</span><span>Hold <b class="keycap">Q</b> / <b class="keycap">N</b></span></div>
          <div class="ctrl-row"><span>Character Switch</span><span>Hold <b class="keycap">ALT</b> or <b class="keycap">F1-F3</b></span></div>
          <div class="ctrl-row"><span>Special Ability</span><span><b class="keycap">X</b></span></div>
          <div class="ctrl-row"><span>iFruit Phone / Map</span><span><b class="keycap">P</b> / <b class="keycap">M</b></span></div>
          <div class="ctrl-row"><span>Camera View / Rear</span><span><b class="keycap">V</b> / <b class="keycap">C</b></span></div>
        </div>
      </div>
    `;
  }

  private renderGamepadControlsHTML(): string {
    const b = (k: Parameters<GamepadManager['badge']>[0]) => this.gamepad.badge(k);
    return `
      <div class="controls-grid">
        <div class="ctrl-group">
          <h4>On Foot &amp; Combat</h4>
          <div class="ctrl-row"><span>Move / Camera</span><span>${b('ls')} / ${b('rs')}</span></div>
          <div class="ctrl-row"><span>Sprint / Jump</span><span>Hold ${b('south')} / ${b('west')}</span></div>
          <div class="ctrl-row"><span>Enter Vehicle</span><span>${b('north')}</span></div>
          <div class="ctrl-row"><span>Aim / Fire</span><span>${b('lt')} / ${b('rt')}</span></div>
          <div class="ctrl-row"><span>Weapon Wheel</span><span>Hold ${b('lb')} + ${b('rs')}</span></div>
          <div class="ctrl-row"><span>Reload / Interact</span><span>${b('east')} / ${b('dpad_right')}</span></div>
          <div class="ctrl-row"><span>Special Ability</span><span>${b('l3')} + ${b('r3')}</span></div>
        </div>
        <div class="ctrl-group">
          <h4>Vehicles &amp; Los Santos</h4>
          <div class="ctrl-row"><span>Throttle / Brake</span><span>${b('rt')} / ${b('lt')}</span></div>
          <div class="ctrl-row"><span>Steer / Handbrake</span><span>${b('ls')} / ${b('rb')} or ${b('south')}</span></div>
          <div class="ctrl-row"><span>Turbo / Horn &amp; Siren</span><span>${b('west')} / ${b('l3')}</span></div>
          <div class="ctrl-row"><span>Chopper Lift / Drop</span><span>${b('rt')} / ${b('lt')}</span></div>
          <div class="ctrl-row"><span>Radio Wheel / Next Song</span><span>Hold / Tap ${b('dpad_left')}</span></div>
          <div class="ctrl-row"><span>Character Switch</span><span>Hold ${b('dpad_down')} + ${b('rs')}</span></div>
          <div class="ctrl-row"><span>iFruit Phone / Pause</span><span>${b('dpad_up')} / ${b('start')}</span></div>
          <div class="ctrl-row"><span>Camera / Look Back</span><span>${b('select')} / ${b('r3')}</span></div>
        </div>
      </div>
    `;
  }

  private buildSettingsDOM(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'settings-list';

    const addRange = (
      label: string,
      val: number,
      min: number,
      max: number,
      step: number,
      onChange: (v: number) => void
    ) => {
      const row = document.createElement('div');
      row.className = 'setting-row';
      const span = document.createElement('span');
      span.textContent = label;
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.value = String(val);
      input.addEventListener('input', () => {
        onChange(parseFloat(input.value));
        this.callbacks.onSettingsChanged(this.settings);
      });
      row.append(span, input);
      wrap.appendChild(row);
    };

    const addCheck = (label: string, val: boolean, onChange: (v: boolean) => void) => {
      const row = document.createElement('div');
      row.className = 'setting-row';
      const span = document.createElement('span');
      span.textContent = label;
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = val;
      input.addEventListener('change', () => {
        onChange(input.checked);
        this.callbacks.onSettingsChanged(this.settings);
      });
      row.append(span, input);
      wrap.appendChild(row);
    };

    addRange('Master Volume', this.settings.masterVolume, 0, 1, 0.05, (v) => (this.settings.masterVolume = v));
    addRange('Soundtrack Volume', this.settings.musicVolume, 0, 1, 0.05, (v) => (this.settings.musicVolume = v));
    addRange('SFX Volume', this.settings.sfxVolume, 0, 1, 0.05, (v) => (this.settings.sfxVolume = v));
    addCheck('Play Soundtrack On Foot', this.settings.soundtrackOnFoot, (v) => (this.settings.soundtrackOnFoot = v));
    addRange('Mouse Sensitivity', this.settings.mouseSensitivity, 0.3, 2.2, 0.1, (v) => (this.settings.mouseSensitivity = v));
    addRange('Controller Sensitivity', this.settings.gamepadSensitivity, 0.4, 2.4, 0.1, (v) => (this.settings.gamepadSensitivity = v));
    addRange('Controller Deadzone', this.settings.gamepadDeadzone, 0.05, 0.35, 0.02, (v) => (this.settings.gamepadDeadzone = v));
    addCheck('Controller Vibration', this.settings.gamepadVibration, (v) => (this.settings.gamepadVibration = v));
    addCheck('Invert Camera Y-Axis', this.settings.invertY, (v) => (this.settings.invertY = v));
    addCheck('Dynamic Day / Night Cycle', this.settings.autoTimeCycle, (v) => (this.settings.autoTimeCycle = v));
    addCheck('Speedometer HUD', this.settings.showSpeedometer, (v) => (this.settings.showSpeedometer = v));

    const qRow = document.createElement('div');
    qRow.className = 'setting-row';
    qRow.innerHTML = '<span>Shadow & Render Quality</span>';
    const sel = document.createElement('select');
    sel.innerHTML = `
      <option value="high" ${this.settings.graphicsQuality === 'high' ? 'selected' : ''}>Ultra (2048 Shadows)</option>
      <option value="medium" ${this.settings.graphicsQuality === 'medium' ? 'selected' : ''}>Performance (1024)</option>
    `;
    sel.addEventListener('change', () => {
      this.settings.graphicsQuality = sel.value as 'high' | 'medium';
      this.callbacks.onSettingsChanged(this.settings);
    });
    qRow.appendChild(sel);
    wrap.appendChild(qRow);

    return wrap;
  }

  private populateStaticPanels(): void {
    this.mountControlsDOM(document.getElementById('pause-controls-content')!);
    const setHost = document.getElementById('pause-settings-content')!;
    setHost.innerHTML = '';
    setHost.appendChild(this.buildSettingsDOM());

    const poiList = document.getElementById('map-poi-list')!;
    poiList.innerHTML = '';
    for (const lm of LANDMARKS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'poi-item';
      btn.innerHTML = `<span class="poi-dot" style="background:${lm.color}"></span><span>${lm.name}</span>`;
      btn.addEventListener('click', () => {
        this.audio.playUiClick();
        this.callbacks.onSetWaypoint(lm.x, lm.z, lm.name);
      });
      poiList.appendChild(btn);
    }
  }

  private buildWeaponWheelDOM(): void {
    this.weaponSlotsEl.innerHTML = '';
    const R = 142;
    const svgs: Record<WeaponId, string> = {
      unarmed: `<svg viewBox="0 0 64 36" class="wep-svg"><path d="M20 28 V15 a3 3 0 0 1 6 0 v4 V13 a3 3 0 0 1 6 0 v6 V14 a3 3 0 0 1 6 0 v6 V16 a3 3 0 0 1 6 0 v12 c0 4-4 6-12 6 s-12-2-12-6z" fill="currentColor"/></svg>`,
      pistol: `<svg viewBox="0 0 64 36" class="wep-svg"><path d="M12 10 h38 v8 H28 l-4 13 h-9 l3-13 h-6 z" fill="currentColor"/><rect x="26" y="18" width="8" height="4" fill="none" stroke="currentColor" stroke-width="2"/></svg>`,
      smg: `<svg viewBox="0 0 64 36" class="wep-svg"><path d="M10 11 h38 v3 h6 v3 h-6 v3 H34 v12 h-5 V20 h-6 l-3 11 h-7 l2-11 H10 z" fill="currentColor"/></svg>`,
      rifle: `<svg viewBox="0 0 64 36" class="wep-svg"><path d="M4 13 l11 1 v-3 h29 v2 h15 v3 H44 v3 h-6 l2 11 h-5 l-2-11 h-8 l-2 10 h-6 l2-10 l-15 2 z" fill="currentColor"/></svg>`,
      shotgun: `<svg viewBox="0 0 64 36" class="wep-svg"><path d="M4 17 l12-3 h44 v4 H36 v3 H24 v-2 l-4 2 l-14 4 z" fill="currentColor"/></svg>`,
      rpg: `<svg viewBox="0 0 64 36" class="wep-svg"><path d="M5 15 h41 l8-4 l7 6 l-7 6 l-8-4 H32 l-2 10 h-5 l1-10 H18 l-2 9 h-5 l1-9 H5 z" fill="currentColor"/></svg>`,
    };
    WEAPON_SPECS.forEach((w, idx) => {
      const ang = (idx / WEAPON_SPECS.length) * Math.PI * 2 - Math.PI * 0.5;
      const x = 195 + Math.cos(ang) * R;
      const y = 195 + Math.sin(ang) * R;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wheel-slot';
      btn.dataset.weapon = w.id;
      btn.style.left = `${x}px`;
      btn.style.top = `${y}px`;
      btn.innerHTML = `
        ${svgs[w.id]}
        <span class="wheel-slot-meta" id="wslot-ammo-${w.id}"></span>
      `;
      btn.addEventListener('mouseenter', () => this.selectWheelWeapon(w.id));
      btn.addEventListener('click', () => {
        this.selectWheelWeapon(w.id);
      });
      this.weaponSlotsEl.appendChild(btn);
    });
  }

  private buildRadioWheelDOM(): void {
    this.radioSlotsEl.innerHTML = '';
    const R = 138;
    RADIO_STATIONS.forEach((st, idx) => {
      const ang = (idx / RADIO_STATIONS.length) * Math.PI * 2 - Math.PI * 0.5;
      const x = 195 + Math.cos(ang) * R;
      const y = 195 + Math.sin(ang) * R;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wheel-slot';
      btn.dataset.station = st.id;
      btn.style.left = `${x}px`;
      btn.style.top = `${y}px`;
      const meta =
        st.id === 'gold_coast'
          ? 'All 9 Hits'
          : st.id === 'bhim_fm'
          ? 'Stonebwoy'
          : st.id === 'scatter_fm'
          ? 'Kweku Smoke'
          : 'Mute';
      btn.innerHTML = `
        <span class="wheel-slot-icon" style="color:${st.color}">${st.shortLabel}</span>
        <span class="wheel-slot-meta">${meta}</span>
      `;
      btn.addEventListener('mouseenter', () => this.selectWheelStation(st.id));
      btn.addEventListener('click', () => this.selectWheelStation(st.id));
      this.radioSlotsEl.appendChild(btn);
    });
  }

  public updateWeaponWheelCursor(dx: number, dy: number, player: Player): void {
    if (Math.hypot(dx, dy) > 28) {
      let ang = Math.atan2(dy, dx) + Math.PI * 0.5;
      if (ang < 0) ang += Math.PI * 2;
      const idx = Math.round((ang / (Math.PI * 2)) * WEAPON_SPECS.length) % WEAPON_SPECS.length;
      const w = WEAPON_SPECS[idx];
      if (w.id !== this.hoveredWeapon) {
        this.audio.playUiClick(520);
        this.hoveredWeapon = w.id;
      }
    }
    this.refreshWeaponWheelVisuals(player);
  }

  private selectWheelWeapon(id: WeaponId): void {
    if (this.hoveredWeapon !== id) {
      this.audio.playUiClick(520);
      this.hoveredWeapon = id;
    }
  }

  public refreshWeaponWheelVisuals(player: Player): void {
    WEAPON_SPECS.forEach((w) => {
      const slot = player.weapons[w.id];
      const metaEl = document.getElementById(`wslot-ammo-${w.id}`);
      if (metaEl) {
        metaEl.textContent = w.magSize === 0 ? 'Melee' : `${slot.inMag}/${slot.reserve}`;
      }
    });

    this.weaponSlotsEl.querySelectorAll('.wheel-slot').forEach((el) => {
      el.classList.toggle('selected', (el as HTMLElement).dataset.weapon === this.hoveredWeapon);
    });

    const spec = player.getWeaponSpec(this.hoveredWeapon);
    const inv = player.weapons[this.hoveredWeapon];
    document.getElementById('wheel-wep-name')!.textContent = spec.name.toUpperCase();
    document.getElementById('wheel-wep-ammo')!.textContent =
      spec.magSize === 0 ? spec.category.toUpperCase() : `${inv.inMag} / ${inv.reserve} ROUNDS`;
    document.getElementById('st-dmg')!.style.width = `${spec.stats.damage}%`;
    document.getElementById('st-rof')!.style.width = `${spec.stats.fireRate}%`;
    document.getElementById('st-acc')!.style.width = `${spec.stats.accuracy}%`;
    document.getElementById('st-rng')!.style.width = `${spec.stats.range}%`;
  }

  public updateRadioWheelCursor(dx: number, dy: number): void {
    if (Math.hypot(dx, dy) > 28) {
      let ang = Math.atan2(dy, dx) + Math.PI * 0.5;
      if (ang < 0) ang += Math.PI * 2;
      const idx =
        Math.round((ang / (Math.PI * 2)) * RADIO_STATIONS.length) % RADIO_STATIONS.length;
      const st = RADIO_STATIONS[idx];
      this.selectWheelStation(st.id);
    }
    this.refreshRadioWheelVisuals();
  }

  private selectWheelStation(id: RadioStationId): void {
    if (this.hoveredStation !== id) {
      this.audio.playUiClick(640);
      this.hoveredStation = id;
      this.audio.currentStation = id;
    }
  }

  public refreshRadioWheelVisuals(): void {
    this.radioSlotsEl.querySelectorAll('.wheel-slot').forEach((el) => {
      el.classList.toggle('selected', (el as HTMLElement).dataset.station === this.hoveredStation);
    });
    const st = RADIO_STATIONS.find((s) => s.id === this.hoveredStation)!;
    const song = this.audio.getCurrentSong(this.hoveredStation);
    document.getElementById('wheel-radio-name')!.textContent = st.name.toUpperCase();
    document.getElementById('wheel-radio-track')!.textContent = song
      ? `${song.artist} — ${song.title}`
      : st.genre;
    const hint = document.getElementById('wheel-radio-hint');
    if (hint) {
      hint.innerHTML =
        st.id === 'off'
          ? ''
          : this.gamepad.usingGamepad
          ? `Press ${this.gamepad.badge('rb')} for next song`
          : 'Press <span class="keycap">N</span> for next song';
    }
  }

  public setMode(mode: GameMode, player: Player, missions: MissionSystem, minimap: Minimap, timeOfDay: number): void {
    this.titleScreen.classList.toggle('hidden', mode !== 'title');
    this.hud.classList.toggle(
      'hidden',
      mode === 'title' || mode === 'paused' || mode === 'wasted' || mode === 'switching'
    );
    this.pauseMenu.classList.toggle('hidden', mode !== 'paused');
    this.wastedScreen.classList.toggle('hidden', mode !== 'wasted');
    this.shopDrawer.classList.toggle('hidden', mode !== 'lscustoms' && mode !== 'ammunation');

    if (mode !== 'playing') {
      this.setWeaponWheel(false, player);
      this.setRadioWheel(false);
      this.setCharWheel(false, player);
      this.togglePhone(false);
    }

    if (mode === 'paused') {
      if (this.gamepad.connected) this.controlsSubTab = 'gamepad';
      const prof = CHARACTER_PROFILES[player.characterId];
      document.getElementById('pause-char-name')!.textContent = prof.fullName;
      document.getElementById('pause-cash')!.textContent = `$${player.cash.toLocaleString()}`;
      document.getElementById('pause-time')!.textContent = `LOS SANTOS ${this.formatClock(timeOfDay)}`;
      const caption = this.pauseMenu.querySelector('.map-caption') as HTMLElement | null;
      if (caption) {
        caption.innerHTML = this.gamepad.usingGamepad
          ? `${this.gamepad.badge('ls')} Pan &nbsp;&bull;&nbsp; ${this.gamepad.badge('south')} Waypoint &nbsp;&bull;&nbsp; ${this.gamepad.badge('west')} Clear &nbsp;&bull;&nbsp; ${this.gamepad.badge('lb')}${this.gamepad.badge('rb')} Tabs`
          : 'Click anywhere on Los Santos to set a GPS Waypoint';
      }
      minimap.showMapCursor = this.gamepad.usingGamepad;
      minimap.resetMapCursor(player.pos.x, player.pos.z);
      minimap.renderFullPauseMap(player, missions);
      this.renderMissionsTab(missions);
      this.refreshRadioPanels();
      this.refreshControlsPanels();
    }

    if (mode === 'lscustoms') {
      this.shopFocusIdx = 0;
      this.renderLSCustoms(player);
    } else if (mode === 'ammunation') {
      this.shopFocusIdx = 0;
      this.renderAmmuNation(player);
    }
  }

  private renderMissionsTab(missions: MissionSystem): void {
    const el = document.getElementById('missions-list')!;
    el.innerHTML = '';

    if (missions.activeMission) {
      const card = document.createElement('div');
      card.className = 'mission-card';
      card.innerHTML = `
        <div class="mission-card-top">
          <span class="mission-badge" style="color:${missions.activeMission.color}">ACTIVE MISSION</span>
          <span class="mission-reward">$${missions.activeMission.reward.toLocaleString()}</span>
        </div>
        <h4>${missions.activeMission.title}</h4>
        <p>${missions.getActiveObjective()?.subtitleHtml ?? ''}</p>
      `;
      const abortBtn = document.createElement('button');
      abortBtn.type = 'button';
      abortBtn.className = 'ghost-btn';
      abortBtn.textContent = 'CANCEL ACTIVE MISSION';
      abortBtn.addEventListener('click', () => {
        this.callbacks.onAbortMission();
        this.renderMissionsTab(missions);
      });
      card.appendChild(abortBtn);
      el.appendChild(card);
    }

    for (const m of missions.missions) {
      const card = document.createElement('div');
      card.className = 'mission-card';
      card.innerHTML = `
        <div class="mission-card-top">
          <span class="mission-badge" style="color:${m.color}">${m.letter}</span>
          <span class="mission-reward">${m.completed ? 'COMPLETED • ' : ''}$${m.reward.toLocaleString()}</span>
        </div>
        <h4>${m.title}</h4>
        <p>${m.giver}</p>
      `;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ghost-btn';
      btn.textContent = 'SET GPS ROUTE';
      btn.addEventListener('click', () => {
        this.audio.playUiClick();
        this.callbacks.onSetWaypoint(m.x, m.z, m.title);
        this.callbacks.onResumeGame();
      });
      card.appendChild(btn);
      el.appendChild(card);
    }
  }

  private renderLSCustoms(player: Player): void {
    const v = player.currentVehicle;
    if (!v) return;
    this.shopTitle.textContent = 'LOS SANTOS CUSTOMS';
    this.shopSub.textContent = `${v.spec.brand} ${v.spec.name}  •  Cash: $${player.cash.toLocaleString()}`;
    this.shopItems.innerHTML = '';

    const addAction = (label: string, price: number, action: () => void) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'shop-row';
      row.innerHTML = `<span>${label}</span><span class="shop-price">${price === 0 ? 'INSTALLED' : `$${price.toLocaleString()}`}</span>`;
      row.addEventListener('click', () => {
        if (price > 0 && player.cash < price) {
          this.showHelpToast('Insufficient cash.');
          return;
        }
        if (price > 0) {
          player.cash -= price;
          this.showCashDelta(-price);
        }
        this.audio.playCashPickup();
        action();
        this.renderLSCustoms(player);
      });
      this.shopItems.appendChild(row);
    };

    const dmg = Math.ceil((v.maxHealth - v.health) * 0.4);
    addAction('Full Chassis & Engine Repair', Math.max(150, dmg), () => v.repair());
    addAction(
      v.turboInstalled ? 'EMS Stage 4 Twin-Turbo' : 'Install Twin-Turbo Tuning',
      v.turboInstalled ? 0 : 2400,
      () => {
        v.turboInstalled = true;
      }
    );
    addAction('Respray Plates (Clear Wanted)', 400, () => {
      this.callbacks.onClearWantedPaid();
    });

    const paintLbl = document.createElement('div');
    paintLbl.className = 'shop-section-label';
    paintLbl.textContent = 'Metallic Clearcoat Respray ($350)';
    this.shopItems.appendChild(paintLbl);

    const grid = document.createElement('div');
    grid.className = 'swatch-grid';
    for (const col of LSC_COLORS) {
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.className = 'color-swatch';
      sw.title = col.name;
      sw.style.background = `#${col.hex.toString(16).padStart(6, '0')}`;
      sw.addEventListener('click', () => {
        if (player.cash < 350) return;
        player.cash -= 350;
        this.showCashDelta(-350);
        v.setPaintColor(col.hex);
        this.callbacks.onClearWantedPaid();
        this.audio.playUiClick(820);
        this.renderLSCustoms(player);
      });
      grid.appendChild(sw);
    }
    this.shopItems.appendChild(grid);

    const neonLbl = document.createElement('div');
    neonLbl.className = 'shop-section-label';
    neonLbl.textContent = 'Street Neon Underglow Kit ($500)';
    this.shopItems.appendChild(neonLbl);

    for (const [label, hex] of [
      ['Electric Purple Neon', 0xa855f7],
      ['Miami Cyan Neon', 0x06b6d4],
      ['Vinewood Green Neon', 0x22c55e],
      ['Crimson Red Neon', 0xef4444],
      ['Remove Neon Kit', null],
    ] as Array<[string, number | null]>) {
      addAction(label, hex === null ? 0 : 500, () => v.setNeon(hex));
    }
  }

  private renderAmmuNation(player: Player): void {
    this.shopTitle.textContent = 'AMMU-NATION';
    this.shopSub.textContent = `Protecting Your Rights  •  Cash: $${player.cash.toLocaleString()}`;
    this.shopItems.innerHTML = '';

    const addItem = (label: string, price: number, onBuy: () => void) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'shop-row';
      row.innerHTML = `<span>${label}</span><span class="shop-price">$${price.toLocaleString()}</span>`;
      row.addEventListener('click', () => {
        if (player.cash < price) return;
        player.cash -= price;
        this.showCashDelta(-price);
        this.audio.playCashPickup();
        onBuy();
        this.renderAmmuNation(player);
      });
      this.shopItems.appendChild(row);
    };

    addItem('Super Heavy Body Armor (100%)', 500, () => {
      player.armor = player.maxArmor;
    });
    addItem('First Aid Medkit (Full Health)', 250, () => {
      player.health = player.maxHealth;
    });

    for (const w of WEAPON_SPECS) {
      if (w.magSize === 0) continue;
      const slot = player.weapons[w.id];
      addItem(`${w.name} — Full Ammo (${w.maxReserve})`, w.ammoPrice, () => {
        slot.unlocked = true;
        slot.inMag = w.magSize;
        slot.reserve = w.maxReserve;
        player.equipWeapon(w.id);
      });
    }
  }

  public togglePhone(open?: boolean, timeOfDay = 16.5): void {
    const next = open ?? !this.phoneOpen;
    this.phoneOpen = next;
    this.phoneEl.classList.toggle('hidden', !next);
    if (next) {
      this.audio.playUiClick(760);
      this.phoneView = 'home';
      this.phoneFocusIdx = 0;
      this.phoneClockEl.textContent = this.formatClock(timeOfDay);
      this.renderPhoneScreen();
    }
  }

  private renderPhoneScreen(): void {
    this.phoneScreenEl.innerHTML = '';

    const addBack = (title: string) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'phone-list-btn';
      btn.innerHTML = `<span>&larr; ${title}</span><small>Home</small>`;
      btn.addEventListener('click', () => {
        this.audio.playUiClick();
        this.phoneView = 'home';
        this.renderPhoneScreen();
      });
      this.phoneScreenEl.appendChild(btn);
    };

    if (this.phoneView === 'home') {
      const grid = document.createElement('div');
      grid.className = 'phone-grid';
      const apps: Array<{ label: string; badge: string; color: string; action: () => void }> = [
        {
          label: 'iFruit Music',
          badge: 'GH',
          color: '#fbbf24',
          action: () => {
            this.phoneView = 'music';
            this.renderPhoneScreen();
          },
        },
        {
          label: 'Mechanic',
          badge: 'CAR',
          color: '#facc15',
          action: () => {
            this.phoneView = 'mechanic';
            this.renderPhoneScreen();
          },
        },
        {
          label: 'Quick GPS',
          badge: 'GPS',
          color: '#c084fc',
          action: () => {
            this.phoneView = 'gps';
            this.renderPhoneScreen();
          },
        },
        {
          label: 'Switch Hero',
          badge: 'MFT',
          color: '#5ec96f',
          action: () => {
            this.phoneView = 'contacts';
            this.renderPhoneScreen();
          },
        },
        {
          label: 'Time & Sky',
          badge: 'SUN',
          color: '#38bdf8',
          action: () => {
            this.phoneView = 'sky';
            this.renderPhoneScreen();
          },
        },
        {
          label: 'Lester (Evade)',
          badge: '0★',
          color: '#4ade80',
          action: () => {
            this.callbacks.onClearWantedPaid();
            this.togglePhone(false);
          },
        },
        {
          label: '3★ Heat',
          badge: 'LSPD',
          color: '#f87171',
          action: () => {
            this.callbacks.onTriggerPursuit();
            this.togglePhone(false);
          },
        },
      ];

      for (const a of apps) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'phone-app-btn';
        b.innerHTML = `<span class="app-badge" style="background:${a.color}">${a.badge}</span><span>${a.label}</span>`;
        b.addEventListener('click', () => {
          this.audio.playUiClick();
          a.action();
        });
        grid.appendChild(b);
      }
      this.phoneScreenEl.appendChild(grid);
      return;
    }

    if (this.phoneView === 'music') {
      addBack('iFruit Music');
      const st = this.audio.getStation();
      const cur = this.audio.getCurrentSong();

      const nowBox = document.createElement('div');
      nowBox.className = 'phone-music-now';
      nowBox.style.borderLeftColor = st.color;
      nowBox.innerHTML = `
        <div class="phone-music-title">${cur ? cur.title : 'Radio Off'}</div>
        <div class="phone-music-sub">${cur ? `${cur.artist} • ${st.name}` : 'Pick a station or hit'}</div>
      `;
      this.phoneScreenEl.appendChild(nowBox);

      const addPhoneAction = (label: string, right: string, fn: () => void) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'phone-list-btn';
        b.innerHTML = `<span>${label}</span><small>${right}</small>`;
        b.addEventListener('click', () => {
          this.audio.unlock();
          this.audio.playUiClick(620);
          fn();
        });
        this.phoneScreenEl.appendChild(b);
      };

      addPhoneAction('Next Track', 'SKIP', () => {
        this.audio.nextTrack(1, true);
        this.renderPhoneScreen();
      });
      addPhoneAction('Switch Station', st.shortLabel, () => {
        const idx = RADIO_STATIONS.findIndex((x) => x.id === st.id);
        const nxt = RADIO_STATIONS[(idx + 1) % RADIO_STATIONS.length];
        this.audio.setStation(nxt.id, true);
        this.renderPhoneScreen();
      });
      addPhoneAction('Import MP3 Files', '+AUDIO', () => {
        this.openMusicFilePicker();
      });

      const list =
        st.id === 'off' ? this.audio.getStationTracks('gold_coast') : this.audio.getStationTracks(st.id);
      for (const s of list) {
        const active = cur && cur.id === s.id && st.id !== 'off';
        const shortArtist =
          s.artist === 'Stonebwoy'
            ? 'BHIM'
            : s.artist === 'Kweku Smoke'
            ? 'SMOKE'
            : 'MP3';
        addPhoneAction(s.title, active ? 'LIVE' : shortArtist, () => {
          const pref = st.id === 'off' ? 'gold_coast' : st.id;
          this.audio.playSongById(s.id, pref, true);
          this.renderPhoneScreen();
        });
      }
      return;
    }

    if (this.phoneView === 'mechanic') {
      addBack('LS Mechanic');
      const list: Array<[string, string, VehicleKind]> = [
        ['Pegassi Zentorno', 'Super', 'supercar'],
        ['Bravado Gauntlet', 'Muscle', 'muscle'],
        ['Pegassi Bati 801', 'Sportbike', 'bike'],
        ['Benefactor Dubsta', 'SUV', 'suv'],
        ['Benefactor Schafter', 'Luxury', 'luxury'],
        ['Declasse Tornado', 'Classic', 'vintage'],
        ['Vapid Taxi', 'Service', 'cab'],
        ['LSPD Interceptor', 'Emergency', 'police'],
        ['Buckingham Maverick', 'Helicopter', 'helicopter'],
      ];
      for (const [name, cat, kind] of list) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'phone-list-btn';
        b.innerHTML = `<span>${name}</span><small>${cat}</small>`;
        b.addEventListener('click', () => {
          this.audio.playCashPickup();
          this.callbacks.onDeliverVehicle(kind);
          this.togglePhone(false);
        });
        this.phoneScreenEl.appendChild(b);
      }
    } else if (this.phoneView === 'gps') {
      addBack('Quick GPS');
      for (const lm of LANDMARKS) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'phone-list-btn';
        b.innerHTML = `<span>${lm.name}</span><small>${lm.shortLabel}</small>`;
        b.addEventListener('click', () => {
          this.audio.playUiClick();
          this.callbacks.onSetWaypoint(lm.x, lm.z, lm.name);
          this.togglePhone(false);
        });
        this.phoneScreenEl.appendChild(b);
      }
    } else if (this.phoneView === 'contacts') {
      addBack('Protagonists');
      for (const cid of ['franklin', 'michael', 'trevor'] as CharacterId[]) {
        const pr = CHARACTER_PROFILES[cid];
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'phone-list-btn';
        b.innerHTML = `<span style="color:${pr.color}">${pr.fullName}</span><small>${pr.abilityName}</small>`;
        b.addEventListener('click', () => {
          this.togglePhone(false);
          this.callbacks.onSwitchCharacter(cid);
        });
        this.phoneScreenEl.appendChild(b);
      }
    } else if (this.phoneView === 'sky') {
      addBack('Los Santos Sky');
      const presets: Array<[string, string, TimePreset]> = [
        ['Golden Hour', '16:40', 'golden'],
        ['California Noon', '12:35', 'noon'],
        ['Vespucci Sunset', '18:25', 'sunset'],
        ['Downtown Night', '22:30', 'night'],
      ];
      for (const [label, hr, p] of presets) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'phone-list-btn';
        b.innerHTML = `<span>${label}</span><small>${hr}</small>`;
        b.addEventListener('click', () => {
          this.audio.playUiClick();
          this.callbacks.onSetTimePreset(p);
          this.togglePhone(false);
        });
        this.phoneScreenEl.appendChild(b);
      }
    }
  }

  public setWeaponWheel(open: boolean, player: Player): void {
    this.weaponWheelOpen = open;
    this.weaponWheel.classList.toggle('hidden', !open);
    if (open) {
      this.hoveredWeapon = player.currentWeapon;
      this.refreshWeaponWheelVisuals(player);
    }
  }

  public setRadioWheel(open: boolean): void {
    this.radioWheelOpen = open;
    this.radioWheel.classList.toggle('hidden', !open);
    if (open) {
      this.hoveredStation = this.audio.currentStation;
      this.refreshRadioWheelVisuals();
    }
  }

  public setCharWheel(open: boolean, player: Player): void {
    this.charWheelOpen = open;
    this.charWheel.classList.toggle('hidden', !open);
    if (open) {
      this.hoveredChar = player.characterId;
      this.refreshCharWheelVisuals();
    }
  }

  public updateCharWheelStick(rx: number, ry: number): void {
    if (Math.hypot(rx, ry) < 0.35) return;
    let pick: CharacterId = this.hoveredChar;
    if (ry < -0.45 && Math.abs(rx) < 0.65) {
      pick = 'franklin'; // top slot
    } else if (rx < -0.35) {
      pick = 'michael';  // left slot
    } else if (rx > 0.35) {
      pick = 'trevor';   // right slot
    }
    if (pick !== this.hoveredChar) {
      this.hoveredChar = pick;
      this.audio.playUiClick(580);
      this.refreshCharWheelVisuals();
    }
  }

  private refreshCharWheelVisuals(): void {
    this.charWheel.querySelectorAll('.char-slot[data-char]').forEach((el) => {
      el.classList.toggle('active', (el as HTMLElement).dataset.char === this.hoveredChar);
    });
    const hint = this.charWheel.querySelector('.char-hint') as HTMLElement | null;
    if (hint) {
      hint.textContent = this.gamepad.usingGamepad ? 'RS Select' : '1 / 2 / 3';
    }
  }

  // ===================== CONSOLE-GRADE GAMEPAD UI NAVIGATION =====================
  private applyFocusList(
    root: ParentNode,
    selector: string,
    index: number
  ): HTMLElement[] {
    const items = Array.from(root.querySelectorAll<HTMLElement>(selector));
    items.forEach((el, i) => {
      const focused = i === index;
      el.classList.toggle('gp-focus', focused);
      if (focused) {
        el.scrollIntoView({ block: 'nearest' });
      }
    });
    return items;
  }

  private adjustSettingRow(row: HTMLElement | undefined, dir: -1 | 1): void {
    if (!row) return;
    const range = row.querySelector<HTMLInputElement>('input[type="range"]');
    if (range) {
      const step = parseFloat(range.step) || 0.05;
      const min = parseFloat(range.min) || 0;
      const max = parseFloat(range.max) || 1;
      const next = Math.max(min, Math.min(max, parseFloat(range.value) + dir * step));
      range.value = String(Number(next.toFixed(3)));
      range.dispatchEvent(new Event('input'));
      this.audio.playUiClick(560);
      return;
    }
    const check = row.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (check) {
      check.checked = !check.checked;
      check.dispatchEvent(new Event('change'));
      this.audio.playUiClick(600);
      return;
    }
    const sel = row.querySelector<HTMLSelectElement>('select');
    if (sel && sel.options.length > 0) {
      sel.selectedIndex = (sel.selectedIndex + dir + sel.options.length) % sel.options.length;
      sel.dispatchEvent(new Event('change'));
      this.audio.playUiClick(600);
    }
  }

  private navigateRadioDeckGamepad(host: HTMLElement): void {
    const gp = this.gamepad;
    const items = this.applyFocusList(
      host,
      '[data-radio-nav]',
      gp.usingGamepad ? this.pauseFocusIdx : -1
    );
    if (items.length === 0) return;
    this.pauseFocusIdx = Math.max(0, Math.min(items.length - 1, this.pauseFocusIdx));
    if (gp.navDown || gp.navRight) {
      this.pauseFocusIdx = (this.pauseFocusIdx + 1) % items.length;
      this.audio.playUiClick(540);
      this.applyFocusList(host, '[data-radio-nav]', this.pauseFocusIdx);
    } else if (gp.navUp || gp.navLeft) {
      this.pauseFocusIdx = (this.pauseFocusIdx - 1 + items.length) % items.length;
      this.audio.playUiClick(540);
      this.applyFocusList(host, '[data-radio-nav]', this.pauseFocusIdx);
    } else if (gp.wasPressed(GP.SOUTH)) {
      const idx = this.pauseFocusIdx;
      items[idx]?.click();
      this.pauseFocusIdx = idx;
      this.applyFocusList(host, '[data-radio-nav]', this.pauseFocusIdx);
    }
  }

  public handleTitleGamepad(): void {
    const gp = this.gamepad;
    if (!gp.connected) return;

    const modalOpen = !this.titleModal.classList.contains('hidden');
    if (modalOpen) {
      if (gp.wasPressed(GP.EAST) || gp.wasPressed(GP.START)) {
        this.audio.playUiClick(480);
        this.titleModal.classList.add('hidden');
        return;
      }
      if (this.titleModalHeading.textContent === 'RADIO') {
        this.navigateRadioDeckGamepad(this.titleModalBody);
      } else if (this.titleModalHeading.textContent === 'CONTROLS') {
        if (gp.navLeft || gp.navRight || gp.wasPressed(GP.LB) || gp.wasPressed(GP.RB)) {
          this.audio.playUiClick();
          this.controlsSubTab = this.controlsSubTab === 'gamepad' ? 'keyboard' : 'gamepad';
          this.mountControlsDOM(this.titleModalBody);
        }
      } else {
        const rows = this.applyFocusList(
          this.titleModalBody,
          '.setting-row',
          gp.usingGamepad ? this.pauseFocusIdx : -1
        );
        if (rows.length > 0) {
          if (gp.navDown) {
            this.pauseFocusIdx = (this.pauseFocusIdx + 1) % rows.length;
            this.audio.playUiClick(520);
            this.applyFocusList(this.titleModalBody, '.setting-row', this.pauseFocusIdx);
          } else if (gp.navUp) {
            this.pauseFocusIdx = (this.pauseFocusIdx - 1 + rows.length) % rows.length;
            this.audio.playUiClick(520);
            this.applyFocusList(this.titleModalBody, '.setting-row', this.pauseFocusIdx);
          } else if (gp.navLeft) {
            this.adjustSettingRow(rows[this.pauseFocusIdx], -1);
          } else if (gp.navRight || gp.wasPressed(GP.SOUTH)) {
            this.adjustSettingRow(rows[this.pauseFocusIdx], 1);
          }
        }
      }
      return;
    }

    const tabs = Array.from(this.titleScreen.querySelectorAll<HTMLButtonElement>('.title-tab'));
    if (gp.usingGamepad) {
      tabs.forEach((t, i) => t.classList.toggle('gp-focus', i === this.titleFocusIdx));
    } else {
      tabs.forEach((t) => t.classList.remove('gp-focus'));
    }

    if (gp.navLeft) {
      this.titleFocusIdx = (this.titleFocusIdx - 1 + tabs.length) % tabs.length;
      this.audio.unlock();
      this.audio.playUiClick(540);
    } else if (gp.navRight) {
      this.titleFocusIdx = (this.titleFocusIdx + 1) % tabs.length;
      this.audio.unlock();
      this.audio.playUiClick(540);
    } else if (gp.wasPressed(GP.START)) {
      this.audio.unlock();
      this.audio.playUiClick(740);
      this.callbacks.onStartGame();
    } else if (gp.wasPressed(GP.SOUTH)) {
      tabs[this.titleFocusIdx]?.click();
    }
  }

  public handlePhoneGamepad(): void {
    const gp = this.gamepad;
    if (!this.phoneOpen || !gp.connected) return;

    const selector = this.phoneView === 'home' ? '.phone-app-btn' : '.phone-list-btn';
    const items = Array.from(this.phoneScreenEl.querySelectorAll<HTMLButtonElement>(selector));
    if (items.length === 0) return;
    this.phoneFocusIdx = Math.max(0, Math.min(items.length - 1, this.phoneFocusIdx));

    if (this.phoneView === 'home') {
      // 2-column app grid navigation
      if (gp.navRight) {
        this.phoneFocusIdx = (this.phoneFocusIdx + 1) % items.length;
        this.audio.playUiClick(540);
      } else if (gp.navLeft) {
        this.phoneFocusIdx = (this.phoneFocusIdx - 1 + items.length) % items.length;
        this.audio.playUiClick(540);
      } else if (gp.navDown) {
        this.phoneFocusIdx = (this.phoneFocusIdx + 2) % items.length;
        this.audio.playUiClick(540);
      } else if (gp.navUp) {
        this.phoneFocusIdx = (this.phoneFocusIdx - 2 + items.length) % items.length;
        this.audio.playUiClick(540);
      }
    } else {
      if (gp.navDown) {
        this.phoneFocusIdx = (this.phoneFocusIdx + 1) % items.length;
        this.audio.playUiClick(540);
      } else if (gp.navUp) {
        this.phoneFocusIdx = (this.phoneFocusIdx - 1 + items.length) % items.length;
        this.audio.playUiClick(540);
      }
    }

    if (gp.usingGamepad) {
      this.applyFocusList(this.phoneScreenEl, selector, this.phoneFocusIdx);
    }

    if (gp.wasPressed(GP.SOUTH)) {
      const target = items[this.phoneFocusIdx];
      this.phoneFocusIdx = 0;
      target?.click();
    } else if (gp.wasPressed(GP.EAST)) {
      this.audio.playUiClick(480);
      if (this.phoneView !== 'home') {
        this.phoneView = 'home';
        this.phoneFocusIdx = 0;
        this.renderPhoneScreen();
      } else {
        this.togglePhone(false);
      }
    }
  }

  public handleShopGamepad(): void {
    const gp = this.gamepad;
    if (!gp.connected) return;

    if (gp.wasPressed(GP.EAST) || gp.wasPressed(GP.START)) {
      this.audio.playUiClick(480);
      this.callbacks.onCloseShop();
      return;
    }

    const items = Array.from(
      this.shopItems.querySelectorAll<HTMLButtonElement>('.shop-row, .color-swatch')
    );
    if (items.length === 0) return;
    this.shopFocusIdx = Math.max(0, Math.min(items.length - 1, this.shopFocusIdx));

    if (gp.navDown || gp.navRight) {
      this.shopFocusIdx = (this.shopFocusIdx + 1) % items.length;
      this.audio.playUiClick(540);
    } else if (gp.navUp || gp.navLeft) {
      this.shopFocusIdx = (this.shopFocusIdx - 1 + items.length) % items.length;
      this.audio.playUiClick(540);
    }

    if (gp.usingGamepad) {
      this.applyFocusList(this.shopItems, '.shop-row, .color-swatch', this.shopFocusIdx);
    }

    if (gp.wasPressed(GP.SOUTH)) {
      items[this.shopFocusIdx]?.click();
      if (this.gamepad.usingGamepad) {
        this.applyFocusList(this.shopItems, '.shop-row, .color-swatch', this.shopFocusIdx);
      }
    }
  }

  public handlePauseGamepad(
    dt: number,
    player: Player,
    missions: MissionSystem,
    minimap: Minimap
  ): void {
    const gp = this.gamepad;
    if (!gp.connected) return;

    if (gp.wasPressed(GP.EAST) || gp.wasPressed(GP.START)) {
      this.audio.playUiClick(720);
      this.callbacks.onResumeGame();
      return;
    }

    // LB / RB switch GTA V pause header tabs cleanly
    const tabOrder: Array<'map' | 'missions' | 'radio' | 'controls' | 'settings'> = [
      'map',
      'missions',
      'radio',
      'controls',
      'settings',
    ];
    if (gp.wasPressed(GP.RB)) {
      const next = tabOrder[(tabOrder.indexOf(this.activePauseTab) + 1) % tabOrder.length];
      this.audio.playUiClick(620);
      this.selectPauseTab(next);
      return;
    }
    if (gp.wasPressed(GP.LB)) {
      const prev =
        tabOrder[(tabOrder.indexOf(this.activePauseTab) - 1 + tabOrder.length) % tabOrder.length];
      this.audio.playUiClick(620);
      this.selectPauseTab(prev);
      return;
    }

    if (this.activePauseTab === 'map') {
      // Smooth Left-Stick crosshair panning across Los Santos map!
      if (Math.hypot(gp.leftX, gp.leftY) > 0.08) {
        this.pauseFocusIdx = -1;
        this.applyFocusList(document.getElementById('tab-map')!, '.poi-item', -1);
        const panSpeed = 340;
        minimap.moveMapCursor(gp.leftX * panSpeed * dt, gp.leftY * panSpeed * dt);
        minimap.renderFullPauseMap(player, missions);
      }

      // D-Pad Up/Down jumps cleanly through Points of Interest!
      const poiRoot = document.getElementById('tab-map')!;
      const pois = Array.from(poiRoot.querySelectorAll<HTMLButtonElement>('.poi-item'));
      if (gp.wasPressed(GP.DPAD_DOWN) && pois.length > 0) {
        this.pauseFocusIdx = (this.pauseFocusIdx + 1) % pois.length;
        this.audio.playUiClick(540);
        this.applyFocusList(poiRoot, '.poi-item', this.pauseFocusIdx);
        const lm = LANDMARKS[this.pauseFocusIdx];
        if (lm) {
          minimap.showMapCursor = true;
          minimap.resetMapCursor(lm.x, lm.z);
          minimap.renderFullPauseMap(player, missions);
        }
      } else if (gp.wasPressed(GP.DPAD_UP) && pois.length > 0) {
        this.pauseFocusIdx =
          this.pauseFocusIdx <= 0 ? pois.length - 1 : this.pauseFocusIdx - 1;
        this.audio.playUiClick(540);
        this.applyFocusList(poiRoot, '.poi-item', this.pauseFocusIdx);
        const lm = LANDMARKS[this.pauseFocusIdx];
        if (lm) {
          minimap.showMapCursor = true;
          minimap.resetMapCursor(lm.x, lm.z);
          minimap.renderFullPauseMap(player, missions);
        }
      }

      if (gp.wasPressed(GP.SOUTH)) {
        if (this.pauseFocusIdx >= 0 && pois[this.pauseFocusIdx]) {
          pois[this.pauseFocusIdx].click();
        } else {
          minimap.showMapCursor = true;
          minimap.toggleWaypointAtCursor();
          this.audio.playUiClick(680);
          minimap.renderFullPauseMap(player, missions);
        }
      } else if (gp.wasPressed(GP.WEST)) {
        this.audio.playUiClick(480);
        this.callbacks.onClearWaypoint();
        minimap.renderFullPauseMap(player, missions);
      }
    } else if (this.activePauseTab === 'missions') {
      const mRoot = document.getElementById('tab-missions')!;
      const btns = this.applyFocusList(
        mRoot,
        '.ghost-btn',
        gp.usingGamepad ? this.pauseFocusIdx : -1
      );
      if (btns.length > 0) {
        if (gp.navDown) {
          this.pauseFocusIdx = (this.pauseFocusIdx + 1) % btns.length;
          this.audio.playUiClick(540);
          this.applyFocusList(mRoot, '.ghost-btn', this.pauseFocusIdx);
        } else if (gp.navUp) {
          this.pauseFocusIdx = (this.pauseFocusIdx - 1 + btns.length) % btns.length;
          this.audio.playUiClick(540);
          this.applyFocusList(mRoot, '.ghost-btn', this.pauseFocusIdx);
        } else if (gp.wasPressed(GP.SOUTH)) {
          btns[this.pauseFocusIdx]?.click();
        }
      }
    } else if (this.activePauseTab === 'radio') {
      const rRoot = document.getElementById('pause-radio-content')!;
      this.navigateRadioDeckGamepad(rRoot);
    } else if (this.activePauseTab === 'controls') {
      if (gp.navLeft || gp.navRight) {
        this.audio.playUiClick(560);
        this.controlsSubTab = this.controlsSubTab === 'gamepad' ? 'keyboard' : 'gamepad';
        this.refreshControlsPanels();
      }
    } else if (this.activePauseTab === 'settings') {
      const sRoot = document.getElementById('pause-settings-content')!;
      const rows = this.applyFocusList(
        sRoot,
        '.setting-row',
        gp.usingGamepad ? this.pauseFocusIdx : -1
      );
      if (rows.length > 0) {
        if (gp.navDown) {
          this.pauseFocusIdx = (this.pauseFocusIdx + 1) % rows.length;
          this.audio.playUiClick(520);
          this.applyFocusList(sRoot, '.setting-row', this.pauseFocusIdx);
        } else if (gp.navUp) {
          this.pauseFocusIdx = (this.pauseFocusIdx - 1 + rows.length) % rows.length;
          this.audio.playUiClick(520);
          this.applyFocusList(sRoot, '.setting-row', this.pauseFocusIdx);
        } else if (gp.navLeft) {
          this.adjustSettingRow(rows[this.pauseFocusIdx], -1);
        } else if (gp.navRight || gp.wasPressed(GP.SOUTH)) {
          this.adjustSettingRow(rows[this.pauseFocusIdx], 1);
        }
      }
    }
  }

  public showBanner(title: string, sub: string, extra = '', isFail = false, duration = 4.2): void {
    this.bannerTitle.textContent = title;
    this.bannerTitle.classList.toggle('fail', isFail);
    this.bannerSub.textContent = sub;
    this.bannerExtra.textContent = extra;
    this.bigBanner.classList.remove('hidden');
    this.bannerTimer = duration;
  }

  public showCashDelta(delta: number): void {
    if (delta === 0) return;
    const sign = delta > 0 ? '+' : '-';
    this.cashDeltaEl.textContent = `${sign}$${Math.abs(delta).toLocaleString()}`;
    this.cashDeltaEl.classList.toggle('neg', delta < 0);
    this.cashDeltaEl.classList.remove('hidden');
    this.cashDeltaTimer = 2.8;
  }

  public showHelpToast(html: string, duration = 3.2): void {
    this.helpOverrideText = html;
    this.helpOverrideTimer = duration;
  }

  public triggerHitMarker(): void {
    this.hitMarkerTimer = 0.14;
  }

  public triggerDamageFlash(): void {
    this.damageFlashTimer = 0.28;
  }

  public triggerWhitePulse(): void {
    this.flashLayer.style.transition = 'none';
    this.flashLayer.style.opacity = '0.52';
    requestAnimationFrame(() => {
      this.flashLayer.style.transition = 'opacity 0.28s ease-out';
      this.flashLayer.style.opacity = '0';
    });
  }

  public triggerNowPlaying(song: SoundtrackSong | null, station: RadioStation): void {
    this.refreshRadioPanels();
    if (!song || station.id === 'off') {
      this.nowPlayingEl.classList.add('hidden');
      this.nowPlayingTimer = 0;
      return;
    }
    this.nowPlayingEl.style.borderRightColor = station.color;
    this.npDotEl.style.background = station.color;
    this.npDotEl.style.color = station.color;
    this.npStationEl.textContent = station.name.toUpperCase();
    this.npTitleEl.textContent = song.title;
    this.npArtistEl.textContent = song.artist;
    this.nowPlayingEl.classList.remove('hidden');
    this.nowPlayingEl.style.opacity = '1';
    this.nowPlayingTimer = 4.2;
  }

  public triggerAreaReadout(vehicleLabel: string, x: number, z: number): void {
    const loc = getDistrictAndStreet(x, z);
    this.toastVeh.textContent = vehicleLabel;
    this.toastStreet.textContent = loc.street;
    this.toastDistrict.textContent = loc.district;
    this.areaToast.classList.remove('hidden');
    this.areaToast.style.opacity = '1';
    this.toastTimer = 3.6;
  }

  public updateHUD(
    realDt: number,
    mode: GameMode,
    player: Player,
    police: PoliceSystem,
    missions: MissionSystem,
    contextPromptHtml: string | null
  ): void {
    // Canvas cinematic filter grading
    this.canvas.className = '';
    this.fxLayer.className = '';

    if (mode === 'wasted') {
      this.canvas.classList.add('fx-wasted');
      return;
    }
    if (this.weaponWheelOpen || this.radioWheelOpen) {
      this.canvas.classList.add('fx-wheel');
    } else if (player.specialActive) {
      this.canvas.classList.add(`fx-${player.characterId}`);
      this.fxLayer.classList.add(`ability-${player.characterId}`);
    }

    if (this.damageFlashTimer > 0) {
      this.damageFlashTimer -= realDt;
      this.fxLayer.classList.add('damage');
    }

    if (mode !== 'playing') return;

    // 1. Health / Armor / Special Ability radar bars
    const hpPct = Math.max(0, Math.min(100, (player.health / player.maxHealth) * 100));
    this.barHealth.style.width = `${hpPct}%`;
    this.barHealth.classList.toggle('low', hpPct < 26);
    this.barArmor.style.width = `${(player.armor / player.maxArmor) * 100}%`;
    this.barSpecial.style.width = `${(player.special / player.maxSpecial) * 100}%`;

    // 2. Wanted stars (hidden cleanly at 0 stars!)
    if (police.wantedLevel > 0) {
      this.wantedEl.classList.remove('hidden');
      this.wantedEl.classList.toggle('evading', police.evading);
      this.starEls.forEach((s, i) => {
        s.classList.toggle('active', i < police.wantedLevel);
      });
    } else {
      this.wantedEl.classList.add('hidden');
    }

    // 3. Cash & cash delta
    this.cashEl.textContent = `$${player.cash.toLocaleString()}`;
    if (this.cashDeltaTimer > 0) {
      this.cashDeltaTimer -= realDt;
      if (this.cashDeltaTimer <= 0) this.cashDeltaEl.classList.add('hidden');
    }

    // 4. Weapon ammo (shown cleanly when armed on foot)
    const spec = player.getWeaponSpec();
    if (!player.currentVehicle && spec.magSize > 0) {
      const slot = player.weapons[player.currentWeapon];
      this.ammoEl.classList.remove('hidden');
      if (player.reloadTimer > 0) {
        this.ammoMagEl.textContent = 'RELOADING';
        this.ammoResEl.textContent = '';
      } else {
        this.ammoMagEl.textContent = String(slot.inMag);
        this.ammoResEl.textContent = ` / ${slot.reserve}`;
      }
    } else {
      this.ammoEl.classList.add('hidden');
    }

    // 5. Center aim reticle
    const showReticle =
      !player.currentVehicle &&
      !this.weaponWheelOpen &&
      !this.phoneOpen &&
      (player.isAiming || player.currentWeapon !== 'unarmed');
    this.reticleEl.classList.toggle('hidden', !showReticle);
    if (this.hitMarkerTimer > 0) {
      this.hitMarkerTimer -= realDt;
      this.reticleEl.classList.add('hit');
    } else {
      this.reticleEl.classList.remove('hit');
    }

    // 6. Contextual Top-Left GTA V prompt (zero clutter when idle!)
    if (this.helpOverrideTimer > 0) {
      this.helpOverrideTimer -= realDt;
      if (this.helpOverrideTimer <= 0) this.helpOverrideText = null;
    }
    const activeHelp = contextPromptHtml ?? this.helpOverrideText;
    if (activeHelp) {
      this.contextPrompt.innerHTML = activeHelp;
      this.contextPrompt.classList.remove('hidden');
    } else {
      this.contextPrompt.classList.add('hidden');
    }

    // 7. Mission Objective Subtitle & Race Countdown
    const obj = missions.getActiveObjective();
    if (obj) {
      this.objectiveBar.innerHTML = obj.subtitleHtml;
      this.objectiveBar.classList.remove('hidden');
      if (obj.timerSeconds !== null) {
        const mins = Math.floor(obj.timerSeconds / 60);
        const secs = Math.floor(obj.timerSeconds % 60);
        this.timerEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        this.timerEl.classList.remove('hidden');
      } else {
        this.timerEl.classList.add('hidden');
      }
    } else {
      this.objectiveBar.classList.add('hidden');
      this.timerEl.classList.add('hidden');
    }

    // 8. Speedometer & Ephemeral GTA V Street / District / Vehicle Callout!
    const veh = player.currentVehicle;
    if (veh && this.settings.showSpeedometer) {
      const mph = Math.round(Math.abs(veh.speed) * 2.237);
      this.speedVal.textContent = String(mph);
      this.speedUnit.textContent = veh.kind === 'helicopter' ? 'KTS' : 'MPH';
      this.speedBox.classList.remove('hidden');
    } else {
      this.speedBox.classList.add('hidden');
    }

    const curLoc = getDistrictAndStreet(player.pos.x, player.pos.z);
    const curVehId = veh ? veh.id : -1;
    if (veh && curVehId !== this.lastVehicleId) {
      this.lastVehicleId = curVehId;
      this.lastDistrict = curLoc.district;
      this.triggerAreaReadout(
        `${veh.spec.brand} ${veh.spec.name}, ${veh.spec.category}`,
        player.pos.x,
        player.pos.z
      );
    } else if (!veh && this.lastVehicleId !== -1) {
      this.lastVehicleId = -1;
    } else if (curLoc.district !== this.lastDistrict) {
      this.lastDistrict = curLoc.district;
      this.triggerAreaReadout('', player.pos.x, player.pos.z);
    }

    if (this.toastTimer > 0) {
      this.toastTimer -= realDt;
      if (this.toastTimer < 0.6) {
        this.areaToast.style.opacity = String(Math.max(0, this.toastTimer / 0.6));
      }
      if (this.toastTimer <= 0) {
        this.areaToast.classList.add('hidden');
      }
    }

    if (this.nowPlayingTimer > 0) {
      this.nowPlayingTimer -= realDt;
      if (this.nowPlayingTimer < 0.7) {
        this.nowPlayingEl.style.opacity = String(Math.max(0, this.nowPlayingTimer / 0.7));
      }
      if (this.nowPlayingTimer <= 0) {
        this.nowPlayingEl.classList.add('hidden');
      }
    }

    // 9. Big Accolade Banner auto-fade
    if (this.bannerTimer > 0) {
      this.bannerTimer -= realDt;
      if (this.bannerTimer <= 0) {
        this.bigBanner.classList.add('hidden');
      }
    }
  }

  private formatClock(hours: number): string {
    const wrapped = ((hours % 24) + 24) % 24;
    const h = Math.floor(wrapped);
    const m = Math.floor((wrapped - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}
