import * as THREE from 'three';
import { MissionMarkerInfo } from '../types';
import { Player } from '../entities/Player';
import { Vehicle } from '../entities/Vehicle';
import { TrafficAndPeds } from '../world/TrafficAndPeds';
import { PoliceSystem } from './PoliceSystem';
import { AudioEngine } from '../core/AudioEngine';
import { SIDEWALK_Y, sampleBaseTerrainHeight } from '../world/WorldData';

export interface ActiveObjective {
  missionTitle: string;
  subtitleHtml: string;
  targetPos: THREE.Vector3 | null;
  targetColor: string;
  timerSeconds: number | null;
}

export class MissionSystem {
  private scene: THREE.Scene;
  private traffic: TrafficAndPeds;
  private police: PoliceSystem;
  private audio: AudioEngine;

  public missions: MissionMarkerInfo[] = [
    {
      id: 'franklin_sprint',
      letter: 'F',
      title: 'Vespucci Sunset Sprint',
      giver: 'Hao — Street Race',
      color: '#5ec96f',
      x: -36,
      y: SIDEWALK_Y,
      z: 18,
      reward: 15000,
      completed: false,
    },
    {
      id: 'simeon_repo',
      letter: 'S',
      title: 'Repossession',
      giver: 'Simeon Yetarian',
      color: '#facc15',
      x: 148,
      y: SIDEWALK_Y,
      z: 96,
      reward: 12000,
      completed: false,
    },
    {
      id: 'lester_heist',
      letter: 'L',
      title: 'The Vinewood Job',
      giver: 'Lester Crest',
      color: '#60a5fa',
      x: -92,
      y: SIDEWALK_Y,
      z: -95,
      reward: 25000,
      completed: false,
    },
    {
      id: 'michael_chopper',
      letter: 'M',
      title: 'Maze Bank Skyfall',
      giver: 'Solomon Richards',
      color: '#38bdf8',
      x: -256,
      y: SIDEWALK_Y,
      z: 176,
      reward: 18000,
      completed: false,
    },
  ];

  private startCoronas = new Map<string, THREE.Group>();
  private objectiveBeacon: THREE.Group;
  private beaconMat: THREE.MeshBasicMaterial;

  public activeMission: MissionMarkerInfo | null = null;
  private stage = 0;
  private raceTimer = 0;
  private missionVehicle: Vehicle | null = null;
  private objective: ActiveObjective | null = null;
  private elapsed = 0;

  private sprintCheckpoints: THREE.Vector3[] = [
    new THREE.Vector3(-110, 0, -5),
    new THREE.Vector3(-220, 0, -5),
    new THREE.Vector3(-220, 0, -145),
    new THREE.Vector3(-110, 0, -220),
    new THREE.Vector3(0, 0, -155),
    new THREE.Vector3(0, 0, 0),
  ];

  constructor(
    scene: THREE.Scene,
    traffic: TrafficAndPeds,
    police: PoliceSystem,
    audio: AudioEngine
  ) {
    this.scene = scene;
    this.traffic = traffic;
    this.police = police;
    this.audio = audio;

    // Build start corona markers for all 4 missions
    for (const m of this.missions) {
      const g = new THREE.Group();
      const col = new THREE.Color(m.color);
      const cyl = new THREE.Mesh(
        new THREE.CylinderGeometry(2.1, 2.1, 1.5, 24, 1, true),
        new THREE.MeshBasicMaterial({
          color: col,
          transparent: true,
          opacity: 0.48,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      cyl.position.y = 0.75;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(1.85, 2.25, 28).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide })
      );
      ring.position.y = 0.05;
      g.add(cyl, ring);
      g.position.set(m.x, m.y, m.z);
      this.scene.add(g);
      this.startCoronas.set(m.id, g);
    }

    // Tall glowing GTA V yellow active checkpoint/destination beacon
    this.objectiveBeacon = new THREE.Group();
    this.beaconMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(3.8, 3.8, 16, 28, 1, true),
      this.beaconMat
    );
    beam.position.y = 8;
    const baseRing = new THREE.Mesh(
      new THREE.RingGeometry(3.4, 4.1, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide })
    );
    baseRing.position.y = 0.08;
    this.objectiveBeacon.add(beam, baseRing);
    this.objectiveBeacon.visible = false;
    this.scene.add(this.objectiveBeacon);
  }

  public getActiveObjective(): ActiveObjective | null {
    return this.objective;
  }

  public findNearbyMissionTrigger(playerPos: THREE.Vector3): MissionMarkerInfo | null {
    if (this.activeMission) return null;
    for (const m of this.missions) {
      const d = Math.hypot(playerPos.x - m.x, playerPos.z - m.z);
      if (d < 4.2 && Math.abs(playerPos.y - m.y) < 3) {
        return m;
      }
    }
    return null;
  }

  public startMission(
    m: MissionMarkerInfo,
    player: Player,
    onBanner: (title: string, subtitle: string) => void
  ): void {
    if (this.activeMission) return;
    this.activeMission = m;
    this.stage = 0;
    this.audio.playUiClick(780);

    // Hide mission start triggers while on a mission
    for (const c of this.startCoronas.values()) c.visible = false;

    onBanner(m.title, m.giver);

    if (m.id === 'franklin_sprint') {
      this.raceTimer = 95;
      const needCar = !player.currentVehicle;
      const cp = this.sprintCheckpoints[0];
      this.objective = {
        missionTitle: m.title,
        subtitleHtml: needCar
          ? 'Get in a <span class="hl-blue">vehicle</span> and race to the <span class="hl-yellow">first checkpoint</span>.'
          : 'Race through the <span class="hl-yellow">Vespucci checkpoints</span> before time runs out (1/6).',
        targetPos: cp.clone(),
        targetColor: '#facc15',
        timerSeconds: this.raceTimer,
      };
    } else if (m.id === 'simeon_repo') {
      // Spawn target exotic electric-blue Pegassi Zentorno in Rockford Hills!
      this.missionVehicle = this.traffic.spawnParkedVehicle(
        'supercar',
        -128,
        SIDEWALK_Y,
        -98,
        Math.PI * 0.5,
        0x1768e3
      );
      this.missionVehicle.isMissionTarget = true;
      this.objective = {
        missionTitle: m.title,
        subtitleHtml:
          'Steal the <span class="hl-blue">Pegassi Zentorno</span> in <span class="hl-yellow">Rockford Hills</span>.',
        targetPos: this.missionVehicle.pos.clone(),
        targetColor: '#60a5fa',
        timerSeconds: null,
      };
    } else if (m.id === 'lester_heist') {
      const pickup = new THREE.Vector3(-68, SIDEWALK_Y, -124);
      this.objective = {
        missionTitle: m.title,
        subtitleHtml:
          'Collect the <span class="hl-green">heist package</span> outside the <span class="hl-yellow">Union Depository</span>.',
        targetPos: pickup,
        targetColor: '#facc15',
        timerSeconds: null,
      };
    } else if (m.id === 'michael_chopper') {
      this.objective = {
        missionTitle: m.title,
        subtitleHtml:
          'Board the <span class="hl-blue">Buckingham Maverick</span> on the <span class="hl-yellow">Vespucci Helipad</span>.',
        targetPos: new THREE.Vector3(-272, 0.16, 185),
        targetColor: '#38bdf8',
        timerSeconds: null,
      };
    }
  }

  public abortMission(reason?: string, onFail?: (msg: string) => void): void {
    if (!this.activeMission) return;
    if (this.missionVehicle) {
      this.missionVehicle.isMissionTarget = false;
      this.missionVehicle = null;
    }
    this.activeMission = null;
    this.objective = null;
    this.objectiveBeacon.visible = false;
    for (const c of this.startCoronas.values()) c.visible = true;
    if (reason && onFail) onFail(reason);
  }

  private completeMission(
    player: Player,
    onPassed: (title: string, reward: number) => void
  ): void {
    const m = this.activeMission;
    if (!m) return;
    m.completed = true;
    player.cash += m.reward;
    if (this.missionVehicle) {
      this.missionVehicle.isMissionTarget = false;
      this.missionVehicle = null;
    }
    this.activeMission = null;
    this.objective = null;
    this.objectiveBeacon.visible = false;
    for (const c of this.startCoronas.values()) c.visible = true;
    this.audio.playMissionPassed();
    onPassed(m.title, m.reward);
  }

  public update(
    dt: number,
    player: Player,
    callbacks: {
      onPassed: (title: string, reward: number) => void;
      onFailed: (reason: string) => void;
      onCashDelta: (delta: number) => void;
    }
  ): void {
    this.elapsed += dt;
    const pulse = 0.34 + Math.sin(this.elapsed * 4.2) * 0.12;
    this.beaconMat.opacity = pulse;

    if (!this.activeMission || !this.objective) {
      this.objectiveBeacon.visible = false;
      return;
    }

    if (player.dead) {
      this.abortMission('MISSION FAILED — You died.', callbacks.onFailed);
      return;
    }

    const id = this.activeMission.id;

    if (id === 'franklin_sprint') {
      this.raceTimer -= dt;
      this.objective.timerSeconds = Math.max(0, this.raceTimer);
      if (this.raceTimer <= 0) {
        this.abortMission('MISSION FAILED — Out of time.', callbacks.onFailed);
        return;
      }
      const cp = this.sprintCheckpoints[this.stage];
      if (player.pos.distanceTo(cp) < 11.5) {
        this.audio.playCashPickup();
        this.stage++;
        if (this.stage >= this.sprintCheckpoints.length) {
          this.completeMission(player, (t, r) => {
            callbacks.onCashDelta(r);
            callbacks.onPassed(t, r);
          });
          return;
        }
        const nextCp = this.sprintCheckpoints[this.stage];
        this.objective.targetPos = nextCp.clone();
        this.objective.subtitleHtml = `Race through the <span class="hl-yellow">checkpoint</span> (${this.stage + 1}/${this.sprintCheckpoints.length}).`;
      }
    } else if (id === 'simeon_repo') {
      if (this.missionVehicle?.destroyed) {
        this.abortMission('MISSION FAILED — The Zentorno was destroyed.', callbacks.onFailed);
        return;
      }
      if (this.stage === 0) {
        if (this.missionVehicle) {
          this.objective.targetPos = this.missionVehicle.pos.clone();
          if (player.currentVehicle === this.missionVehicle) {
            this.stage = 1;
            this.police.reportCrime(40, 2);
            this.objective.subtitleHtml =
              'Lose the <span class="hl-red">Cops</span> or respray at <span class="hl-yellow">Los Santos Customs</span>.';
            this.objective.targetPos = null;
          }
        }
      } else if (this.stage === 1) {
        if (this.police.wantedLevel === 0) {
          this.stage = 2;
          this.objective.targetPos = new THREE.Vector3(144, SIDEWALK_Y, 94);
          this.objective.targetColor = '#facc15';
          this.objective.subtitleHtml =
            'Deliver the <span class="hl-blue">Zentorno</span> to <span class="hl-yellow">Simeon\'s Dealership</span>.';
        }
      } else if (this.stage === 2) {
        if (player.currentVehicle !== this.missionVehicle && this.missionVehicle) {
          this.objective.subtitleHtml = 'Get back in the <span class="hl-blue">Zentorno</span>.';
          this.objective.targetPos = this.missionVehicle.pos.clone();
        } else {
          const drop = new THREE.Vector3(144, SIDEWALK_Y, 94);
          this.objective.targetPos = drop;
          this.objective.subtitleHtml =
            'Deliver the <span class="hl-blue">Zentorno</span> to <span class="hl-yellow">Simeon\'s Dealership</span>.';
          if (player.pos.distanceTo(drop) < 8.5) {
            this.completeMission(player, (t, r) => {
              callbacks.onCashDelta(r);
              callbacks.onPassed(t, r);
            });
            return;
          }
        }
      }
    } else if (id === 'lester_heist') {
      if (this.stage === 0) {
        const pickup = this.objective.targetPos!;
        if (player.pos.distanceTo(pickup) < 7.5) {
          this.stage = 1;
          this.audio.playCashPickup();
          this.police.reportCrime(82, 3);
          this.objective.targetPos = new THREE.Vector3(0, sampleBaseTerrainHeight(0, -352), -352);
          this.objective.subtitleHtml =
            'Escape up to the <span class="hl-yellow">Vinewood Observatory</span> with the package.';
        }
      } else if (this.stage === 1) {
        const obs = this.objective.targetPos!;
        if (player.pos.distanceTo(obs) < 12) {
          this.stage = 2;
          this.audio.playCashPickup();
          if (this.police.wantedLevel === 0) {
            this.completeMission(player, (t, r) => {
              callbacks.onCashDelta(r);
              callbacks.onPassed(t, r);
            });
            return;
          }
          this.objective.targetPos = null;
          this.objective.subtitleHtml =
            'Lose the <span class="hl-red">LSPD</span> — take the <span class="hl-blue">Maverick helicopter</span> or outrun them!';
        }
      } else if (this.stage === 2) {
        if (this.police.wantedLevel === 0) {
          this.completeMission(player, (t, r) => {
            callbacks.onCashDelta(r);
            callbacks.onPassed(t, r);
          });
          return;
        }
      }
    } else if (id === 'michael_chopper') {
      if (this.stage === 0) {
        if (player.currentVehicle?.kind === 'helicopter') {
          this.stage = 1;
          this.objective.targetPos = new THREE.Vector3(-55, 143.4, -55);
          this.objective.targetColor = '#facc15';
          this.objective.subtitleHtml =
            'Fly to Downtown and touch down on the <span class="hl-yellow">Maze Bank Tower Helipad</span>.';
        }
      } else if (this.stage === 1) {
        const roof = this.objective.targetPos!;
        if (player.pos.distanceTo(roof) < 12.5 && Math.abs(player.pos.y - 143.4) < 5.5) {
          this.stage = 2;
          this.audio.playCashPickup();
          this.objective.targetPos = new THREE.Vector3(-355, 14, 40);
          this.objective.subtitleHtml =
            'Soar west over the ocean to <span class="hl-yellow">Del Perro Pier</span> for the final shot.';
        }
      } else if (this.stage === 2) {
        const pier = this.objective.targetPos!;
        if (Math.hypot(player.pos.x - pier.x, player.pos.z - pier.z) < 18) {
          this.completeMission(player, (t, r) => {
            callbacks.onCashDelta(r);
            callbacks.onPassed(t, r);
          });
          return;
        }
      }
    }

    // Update 3D yellow objective beacon position
    if (this.objective?.targetPos) {
      this.objectiveBeacon.visible = true;
      this.objectiveBeacon.position.copy(this.objective.targetPos);
    } else {
      this.objectiveBeacon.visible = false;
    }
  }
}
