import * as THREE from 'three';
import { BuildingCollider, GameMode } from '../types';
import { Player, lerpAngle } from '../entities/Player';
import { sampleBaseTerrainHeight } from '../world/WorldData';

type SwitchStage = {
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
  toHeading: number;
  timer: number;
  lastPulse: number;
  swapped: boolean;
  onSwap: () => void;
  onPulse: () => void;
  onComplete: () => void;
};

export class CameraController {
  public camera: THREE.PerspectiveCamera;

  // yaw = 0 looks toward -Z (North, straight at Vinewood Sign!); vehicle heading = PI moves -Z.
  // Relation: behind vehicle with heading H means camera looks along (sin H, 0, cos H),
  // and camera forward is (-sin yaw, *, -cos yaw), so targetYaw = -H + PI!
  public yaw = 0;
  public pitch = 0.18;

  private distanceMode = 1; // 0 = Close, 1 = Standard, 2 = Far
  private mouseIdleTimer = 2.0;

  private currentPos = new THREE.Vector3(-12, 48, 95);
  private currentLook = new THREE.Vector3(-30, 22, -65);
  private shakeIntensity = 0;
  private titleTime = 0;

  // Intro drop from skyline into character when clicking Play
  private introTimer = 0;
  private introStartPos = new THREE.Vector3();
  private introStartLook = new THREE.Vector3();

  // Stunt jump cinematic angle
  public stuntTimer = 0;
  private stuntCamOffset = new THREE.Vector3(12, 2.5, 8);

  // GTA V 3-step satellite character switch
  private switchState: SwitchStage | null = null;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(58, aspect, 0.25, 1900);
    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLook);
  }

  public resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  public cycleDistance(): string {
    this.distanceMode = (this.distanceMode + 1) % 3;
    return ['Close', 'Standard', 'Far'][this.distanceMode];
  }

  public addShake(amount: number): void {
    this.shakeIntensity = Math.min(1.2, Math.max(this.shakeIntensity, amount));
  }

  public triggerIntroDrop(player: Player): void {
    this.introStartPos.copy(this.camera.position);
    this.introStartLook.copy(this.currentLook);
    this.introTimer = 1.35;
    this.yaw = player.heading + Math.PI;
    this.pitch = 0.16;
  }

  public triggerStuntCam(vehiclePos: THREE.Vector3, dirX: number, dirZ: number): void {
    this.stuntTimer = 2.1;
    // Low dramatic side-front camera showcasing the car soaring over Los Santos!
    const sideX = -dirZ;
    const sideZ = dirX;
    this.stuntCamOffset.set(
      vehiclePos.x + dirX * 14 + sideX * 12,
      vehiclePos.y + 2.4,
      vehiclePos.z + dirZ * 14 + sideZ * 12
    );
  }

  public startCharacterSwitch(
    fromPos: THREE.Vector3,
    toPos: THREE.Vector3,
    toHeading: number,
    onSwap: () => void,
    onPulse: () => void,
    onComplete: () => void
  ): void {
    this.switchState = {
      fromPos: fromPos.clone(),
      toPos: toPos.clone(),
      toHeading,
      timer: 0,
      lastPulse: -1,
      swapped: false,
      onSwap,
      onPulse,
      onComplete,
    };
    onPulse();
  }

  public isSwitching(): boolean {
    return this.switchState !== null;
  }

  public applyMouseLook(
    dx: number,
    dy: number,
    sensitivity: number,
    invertY: boolean
  ): void {
    if (dx === 0 && dy === 0) return;
    const scale = 0.0022 * sensitivity;
    this.yaw -= dx * scale;
    this.pitch += dy * scale * (invertY ? -1 : 1);
    this.pitch = THREE.MathUtils.clamp(this.pitch, -0.52, 1.05);
    this.mouseIdleTimer = 0;
  }

  public getAimRay(): { origin: THREE.Vector3; dir: THREE.Vector3 } {
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    return { origin: this.camera.position.clone(), dir };
  }

  public update(
    dt: number,
    mode: GameMode,
    player: Player,
    colliders: BuildingCollider[],
    lookBack: boolean
  ): void {
    // 1. Title screen sweeping cinematic over Los Santos (Maze Bank, Palms, Ocean & Vinewood Sign!)
    if (mode === 'title') {
      this.titleTime += dt;
      const sway = Math.sin(this.titleTime * 0.14);
      const sway2 = Math.cos(this.titleTime * 0.11);
      const camX = -12 + sway * 58;
      const camY = 32 + sway2 * 6;
      const camZ = 92 + sway2 * 22;
      this.currentPos.set(camX, camY, camZ);
      this.currentLook.set(-28 + sway * 18, 28, -95);
      this.camera.fov = 54;
      this.camera.updateProjectionMatrix();
      this.camera.position.copy(this.currentPos);
      this.camera.lookAt(this.currentLook);
      return;
    }

    // 2. GTA V 3-step satellite character switch animation!
    if (this.switchState) {
      const s = this.switchState;
      s.timer += dt;
      const t = s.timer;

      // Timeline:
      // 0.00 - 0.90: 3 discrete upward snap steps (55m, 145m, 255m)
      // 0.90 - 1.95: smooth satellite glide from old character to new character
      // 1.95 - 2.75: 3 discrete downward snap steps (155m, 58m, street level)
      let x = s.fromPos.x;
      let z = s.fromPos.z;
      let alt = 58;
      let pulseIdx = 0;

      if (t < 0.3) {
        alt = 58;
        pulseIdx = 0;
      } else if (t < 0.6) {
        alt = 148;
        pulseIdx = 1;
      } else if (t < 0.9) {
        alt = 255;
        pulseIdx = 2;
      } else if (t < 1.95) {
        pulseIdx = 2;
        const p = THREE.MathUtils.smoothstep((t - 0.9) / 1.05, 0, 1);
        x = THREE.MathUtils.lerp(s.fromPos.x, s.toPos.x, p);
        z = THREE.MathUtils.lerp(s.fromPos.z, s.toPos.z, p);
        alt = 255;
        if (p > 0.5 && !s.swapped) {
          s.swapped = true;
          s.onSwap();
        }
      } else if (t < 2.25) {
        if (!s.swapped) {
          s.swapped = true;
          s.onSwap();
        }
        x = s.toPos.x;
        z = s.toPos.z;
        alt = 145;
        pulseIdx = 3;
      } else if (t < 2.55) {
        x = s.toPos.x;
        z = s.toPos.z;
        alt = 52;
        pulseIdx = 4;
      } else {
        this.yaw = s.toHeading + Math.PI;
        this.pitch = 0.18;
        const done = s.onComplete;
        const pulse = s.onPulse;
        this.switchState = null;
        pulse();
        done();
        return;
      }

      if (pulseIdx !== s.lastPulse) {
        s.lastPulse = pulseIdx;
        s.onPulse();
      }

      this.currentPos.set(x, s.toPos.y + alt, z + 14);
      this.currentLook.set(x, s.toPos.y, z);
      this.camera.position.copy(this.currentPos);
      this.camera.lookAt(this.currentLook);
      this.camera.fov = 58;
      this.camera.updateProjectionMatrix();
      return;
    }

    // 3. WASTED slow rising dramatic camera
    if (mode === 'wasted') {
      this.currentPos.y += dt * 2.2;
      this.yaw += dt * 0.25;
      this.currentLook.lerp(player.pos.clone().add(new THREE.Vector3(0, 0.6, 0)), dt * 4);
      this.camera.position.copy(this.currentPos);
      this.camera.lookAt(this.currentLook);
      return;
    }

    // 4. Los Santos Customs showroom turntable orbit around player's car!
    if (mode === 'lscustoms' && player.currentVehicle) {
      this.titleTime += dt;
      const v = player.currentVehicle;
      const ang = v.heading + 0.65 + Math.sin(this.titleTime * 0.45) * 0.55;
      const targetPos = new THREE.Vector3(
        v.pos.x + Math.sin(ang) * 6.4,
        v.pos.y + 2.05,
        v.pos.z + Math.cos(ang) * 6.4
      );
      const targetLook = new THREE.Vector3(v.pos.x, v.pos.y + 0.75, v.pos.z);
      this.currentPos.lerp(targetPos, Math.min(1, dt * 6));
      this.currentLook.lerp(targetLook, Math.min(1, dt * 8));
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, 48, dt * 6);
      this.camera.updateProjectionMatrix();
      this.camera.position.copy(this.currentPos);
      this.camera.lookAt(this.currentLook);
      return;
    }

    // 5. Cinematic Stunt Jump camera!
    if (this.stuntTimer > 0 && player.currentVehicle) {
      this.stuntTimer = Math.max(0, this.stuntTimer - dt);
      if (!player.currentVehicle.airborne && this.stuntTimer < 1.5) {
        this.stuntTimer = 0;
      } else {
        this.camera.position.lerp(this.stuntCamOffset, Math.min(1, dt * 9));
        this.camera.lookAt(
          player.currentVehicle.pos.x,
          player.currentVehicle.pos.y + 0.9,
          player.currentVehicle.pos.z
        );
        this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, 46, dt * 6);
        this.camera.updateProjectionMatrix();
        return;
      }
    }

    // 6. Standard GTA V Gameplay Camera (On-Foot, ADS, Car, Motorcycle, Helicopter)
    this.mouseIdleTimer += dt;
    const veh = player.currentVehicle;
    const distScale = [0.78, 1.0, 1.32][this.distanceMode];

    let desiredDist = 5.2 * distScale;
    let pivotHeight = 1.55;
    let shoulderRight = 0.42;
    let targetFov = 58;

    if (veh) {
      shoulderRight = 0;
      if (veh.kind === 'helicopter') {
        desiredDist = 13.5 * distScale;
        pivotHeight = 2.6;
        targetFov = 64;
      } else {
        const spdRatio = Math.min(1, Math.abs(veh.speed) / 48);
        desiredDist = (veh.kind === 'suv' ? 8.2 : veh.kind === 'bike' ? 6.2 : 7.3) * distScale + spdRatio * 1.45;
        pivotHeight = veh.kind === 'suv' ? 2.05 : 1.55;
        targetFov = 58 + spdRatio * 15;
      }

      // Smooth GTA V auto-follow behind moving vehicle when user isn't actively turning mouse
      if (this.mouseIdleTimer > 0.85 && (Math.abs(veh.speed) > 1.5 || veh.kind === 'helicopter')) {
        const revOffset = veh.speed < -2.5 && veh.kind !== 'helicopter' ? Math.PI : 0;
        const desiredYaw = veh.heading + Math.PI + revOffset;
        this.yaw = lerpAngle(this.yaw, desiredYaw, Math.min(1, dt * 4.8));
        const desiredPitch = veh.kind === 'helicopter' ? 0.22 : 0.155;
        this.pitch = THREE.MathUtils.lerp(this.pitch, desiredPitch, Math.min(1, dt * 3.4));
      }
    } else if (player.isAiming) {
      // Crisp over-the-right-shoulder GTA V combat camera
      desiredDist = 2.45;
      pivotHeight = 1.58;
      shoulderRight = 0.68;
      targetFov = 45;
    } else if (player.isSprinting) {
      desiredDist = 5.6 * distScale;
      targetFov = 64;
    }

    const activeYaw = lookBack ? this.yaw + Math.PI : this.yaw;
    const cosPitch = Math.cos(this.pitch);
    const sinPitch = Math.sin(this.pitch);

    // Camera stands behind anchor along (+sin yaw, +sin pitch, +cos yaw)
    const anchor = (veh ? veh.pos : player.pos).clone();
    anchor.y += pivotHeight;

    const rightX = Math.cos(activeYaw);
    const rightZ = -Math.sin(activeYaw);
    anchor.x += rightX * shoulderRight;
    anchor.z += rightZ * shoulderRight;

    const backX = Math.sin(activeYaw) * cosPitch;
    const backY = sinPitch;
    const backZ = Math.cos(activeYaw) * cosPitch;

    // Pull camera in smoothly if a building sits between anchor and desired camera pos
    let safeDist = desiredDist;
    const steps = 6;
    for (let s = 1; s <= steps; s++) {
      const testD = (desiredDist * s) / steps;
      const tx = anchor.x + backX * testD;
      const ty = anchor.y + backY * testD;
      const tz = anchor.z + backZ * testD;
      let blocked = false;
      for (const b of colliders) {
        if (
          ty < b.maxY &&
          ty > b.minY &&
          tx > b.minX - 0.45 &&
          tx < b.maxX + 0.45 &&
          tz > b.minZ - 0.45 &&
          tz < b.maxZ + 0.45
        ) {
          blocked = true;
          break;
        }
      }
      if (blocked) {
        safeDist = Math.max(1.4, (desiredDist * (s - 1)) / steps);
        break;
      }
    }

    const targetPos = new THREE.Vector3(
      anchor.x + backX * safeDist,
      anchor.y + backY * safeDist,
      anchor.z + backZ * safeDist
    );

    // Prevent camera from dipping below ground/road surface
    const groundAtCam = sampleBaseTerrainHeight(targetPos.x, targetPos.z);
    targetPos.y = Math.max(targetPos.y, groundAtCam + 0.65);

    const lookDist = 28;
    const targetLook = new THREE.Vector3(
      anchor.x - backX * lookDist,
      anchor.y - backY * lookDist,
      anchor.z - backZ * lookDist
    );

    // Intro seamless camera swoop from Title Screen down to protagonist
    if (this.introTimer > 0) {
      this.introTimer = Math.max(0, this.introTimer - dt);
      const p = 1 - this.introTimer / 1.35;
      const ease = 1 - Math.pow(1 - p, 3);
      this.currentPos.lerpVectors(this.introStartPos, targetPos, ease);
      this.currentLook.lerpVectors(this.introStartLook, targetLook, ease);
    } else {
      const followRate = player.isAiming || lookBack ? 26 : 15;
      this.currentPos.lerp(targetPos, Math.min(1, dt * followRate));
      this.currentLook.copy(targetLook);
    }

    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, Math.min(1, dt * 8));
    this.camera.updateProjectionMatrix();

    // Screen shake on explosions / gunfire / heavy impacts
    this.camera.position.copy(this.currentPos);
    if (this.shakeIntensity > 0.005) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeIntensity * 0.6;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeIntensity * 0.6;
      this.shakeIntensity *= Math.pow(0.015, dt);
    } else {
      this.shakeIntensity = 0;
    }

    this.camera.lookAt(this.currentLook);
  }
}
