import { Landmark } from '../types';
import { LANDMARKS, ROAD_COORDS, ROAD_WIDTH, computeGPSRoute } from '../world/WorldData';
import { MapFootprint } from '../world/CityBuilder';
import { Player } from '../entities/Player';
import { PoliceSystem } from '../gameplay/PoliceSystem';
import { MissionSystem } from '../gameplay/MissionSystem';
import { Vehicle } from '../entities/Vehicle';

export class Minimap {
  private radarCanvas: HTMLCanvasElement;
  private rctx: CanvasRenderingContext2D;

  private pauseCanvas: HTMLCanvasElement;
  private pctx: CanvasRenderingContext2D;

  // Pre-rendered crisp Los Santos base cartography tile (zero draw overhead every frame!)
  private baseMap: HTMLCanvasElement;
  private readonly mapMinX = -430;
  private readonly mapMaxX = 290;
  private readonly mapMinZ = -440;
  private readonly mapMaxZ = 280;
  private readonly baseSize = 1024;

  public customWaypoint: { x: number; z: number } | null = null;
  public mapCursor: { x: number; z: number } = { x: 0, z: 0 };
  public showMapCursor = false;
  private flashTimer = 0;

  constructor(
    radarCanvas: HTMLCanvasElement,
    pauseCanvas: HTMLCanvasElement,
    footprints: MapFootprint[],
    onWaypointChanged?: (wp: { x: number; z: number } | null) => void
  ) {
    this.radarCanvas = radarCanvas;
    this.rctx = radarCanvas.getContext('2d')!;
    this.pauseCanvas = pauseCanvas;
    this.pctx = pauseCanvas.getContext('2d')!;

    this.baseMap = document.createElement('canvas');
    this.baseMap.width = this.baseSize;
    this.baseMap.height = this.baseSize;
    this.bakeBaseMap(footprints);

    // Interactive click-to-set GTA V purple GPS waypoint on Pause Map!
    this.pauseCanvas.addEventListener('click', (e) => {
      const rect = this.pauseCanvas.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = (e.clientY - rect.top) / rect.height;
      const wx = this.mapMinX + nx * (this.mapMaxX - this.mapMinX);
      const wz = this.mapMinZ + ny * (this.mapMaxZ - this.mapMinZ);

      if (
        this.customWaypoint &&
        Math.hypot(this.customWaypoint.x - wx, this.customWaypoint.z - wz) < 24
      ) {
        this.customWaypoint = null;
      } else {
        this.customWaypoint = {
          x: Math.max(-390, Math.min(245, wx)),
          z: Math.max(-375, Math.min(245, wz)),
        };
      }
      onWaypointChanged?.(this.customWaypoint);
    });

    this.pauseCanvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.customWaypoint = null;
      onWaypointChanged?.(null);
    });
  }

  private worldToBase(wx: number, wz: number): { x: number; y: number } {
    return {
      x: ((wx - this.mapMinX) / (this.mapMaxX - this.mapMinX)) * this.baseSize,
      y: ((wz - this.mapMinZ) / (this.mapMaxZ - this.mapMinZ)) * this.baseSize,
    };
  }

  private scaleW(meters: number): number {
    return (meters / (this.mapMaxX - this.mapMinX)) * this.baseSize;
  }

  private bakeBaseMap(footprints: MapFootprint[]): void {
    const ctx = this.baseMap.getContext('2d')!;
    const S = this.baseSize;

    // 1. Deep Pacific Ocean (GTA V dark slate-navy water)
    ctx.fillStyle = '#122638';
    ctx.fillRect(0, 0, S, S);

    // 2. Los Santos city landmass
    const landTL = this.worldToBase(-254, -440);
    const landBR = this.worldToBase(290, 275);
    ctx.fillStyle = '#232830';
    ctx.fillRect(landTL.x, landTL.y, landBR.x - landTL.x, landBR.y - landTL.y);

    // 3. Vinewood Hills lush dark-olive terrain + contour lines
    const hillTL = this.worldToBase(-300, -440);
    const hillBR = this.worldToBase(290, -238);
    ctx.fillStyle = '#233326';
    ctx.fillRect(hillTL.x, hillTL.y, hillBR.x - hillTL.x, hillBR.y - hillTL.y);

    ctx.strokeStyle = 'rgba(130, 168, 125, 0.14)';
    ctx.lineWidth = 1.5;
    for (let cz = -265; cz >= -425; cz -= 24) {
      const p = this.worldToBase(0, cz);
      ctx.beginPath();
      ctx.moveTo(hillTL.x, p.y);
      ctx.bezierCurveTo(S * 0.4, p.y - 12, S * 0.7, p.y + 12, S, p.y - 4);
      ctx.stroke();
    }

    // 4. Vespucci Beach sand strip
    const sandTL = this.worldToBase(-312, -265);
    const sandBR = this.worldToBase(-252, 275);
    ctx.fillStyle = '#474236';
    ctx.fillRect(sandTL.x, sandTL.y, sandBR.x - sandTL.x, sandBR.y - sandTL.y);

    // 5. Building footprints & Legion Square Park + Del Perro Pier
    for (const fp of footprints) {
      const c = this.worldToBase(fp.x - fp.w * 0.5, fp.z - fp.d * 0.5);
      ctx.fillStyle = fp.color;
      ctx.fillRect(c.x, c.y, this.scaleW(fp.w), this.scaleW(fp.d));
    }

    // 6. Crisp GTA V road grid (light slate roads with dark casing)
    const drawRoad = (x1: number, z1: number, x2: number, z2: number, wMeters: number) => {
      const a = this.worldToBase(x1, z1);
      const b = this.worldToBase(x2, z2);
      ctx.lineCap = 'square';
      ctx.strokeStyle = '#14171c';
      ctx.lineWidth = this.scaleW(wMeters + 3);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();

      ctx.strokeStyle = '#6c7582';
      ctx.lineWidth = this.scaleW(wMeters);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    };

    for (const r of ROAD_COORDS) {
      drawRoad(r, -231, r, 231, ROAD_WIDTH);
      drawRoad(-231, r, 231, r, ROAD_WIDTH);
    }
    // Vinewood Observatory scenic road
    drawRoad(0, -220, 0, -356, 16);

    // Vespucci Helipad icon square
    const hp = this.worldToBase(-272, 185);
    const hs = this.scaleW(26);
    ctx.fillStyle = '#3b434f';
    ctx.fillRect(hp.x - hs * 0.5, hp.y - hs * 0.5, hs, hs);
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(hp.x - hs * 0.42, hp.y - hs * 0.42, hs * 0.84, hs * 0.84);
  }

  public updateRadar(
    dt: number,
    player: Player,
    cameraYaw: number,
    police: PoliceSystem,
    missions: MissionSystem,
    vehicles: Vehicle[]
  ): void {
    this.flashTimer += dt;

    // Auto-clear custom waypoint when player arrives within 14m!
    if (
      this.customWaypoint &&
      Math.hypot(player.pos.x - this.customWaypoint.x, player.pos.z - this.customWaypoint.z) < 14
    ) {
      this.customWaypoint = null;
    }

    const ctx = this.rctx;
    const W = this.radarCanvas.width;
    const H = this.radarCanvas.height;

    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#122638';
    ctx.fillRect(0, 0, W, H);

    // Zoom out smoothly when driving fast or flying helicopter (exact GTA V radar behavior!)
    const speed = player.currentVehicle ? Math.abs(player.currentVehicle.speed) : 0;
    const isHeli = player.currentVehicle?.kind === 'helicopter';
    const metersVisible = isHeli ? 290 : 165 + Math.min(95, speed * 1.8);
    const pxPerMeter = W / metersVisible;
    const basePxPerMeter = this.baseSize / (this.mapMaxX - this.mapMinX);
    const mapScale = pxPerMeter / basePxPerMeter;

    // Player sits slightly lower than vertical center (GTA V forward-biased radar!)
    const cx = W * 0.5;
    const cy = H * 0.6;

    // Camera looks along (-sin(yaw), -cos(yaw)); rotate map by +yaw so forward is UP (-Y)!
    const rot = cameraYaw;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);

    // Draw pre-baked Los Santos cartography
    const pBase = this.worldToBase(player.pos.x, player.pos.z);
    ctx.drawImage(
      this.baseMap,
      -pBase.x * mapScale,
      -pBase.y * mapScale,
      this.baseSize * mapScale,
      this.baseSize * mapScale
    );

    // Draw GPS Route: Custom Purple Waypoint & Active Mission Yellow Route (with dark GTA V casing)!
    const drawRoute = (tx: number, tz: number, color: string) => {
      const pts = computeGPSRoute(player.pos.x, player.pos.z, tx, tz);
      if (pts.length < 2) return;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      ctx.strokeStyle = 'rgba(10, 12, 16, 0.85)';
      ctx.lineWidth = 6.5;
      ctx.beginPath();
      pts.forEach((pt, idx) => {
        const rx = (pt.x - player.pos.x) * pxPerMeter;
        const ry = (pt.z - player.pos.z) * pxPerMeter;
        if (idx === 0) ctx.moveTo(rx, ry);
        else ctx.lineTo(rx, ry);
      });
      ctx.stroke();

      ctx.strokeStyle = color;
      ctx.lineWidth = 4.2;
      ctx.stroke();
    };

    if (this.customWaypoint) {
      drawRoute(this.customWaypoint.x, this.customWaypoint.z, '#b55cff');
    }
    const obj = missions.getActiveObjective();
    if (obj?.targetPos) {
      drawRoute(obj.targetPos.x, obj.targetPos.z, obj.targetColor);
    }

    // Draw Helicopter blips on radar
    for (const v of vehicles) {
      if (v.kind === 'helicopter' && !v.destroyed && !v.isPlayerDriven) {
        const rx = (v.pos.x - player.pos.x) * pxPerMeter;
        const ry = (v.pos.z - player.pos.z) * pxPerMeter;
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(rx, ry, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#0b0f14';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // Draw LSPD Cruisers + Directional Vision Cones!
    const redPhase = Math.sin(this.flashTimer * 12) > 0;
    for (const u of police.units) {
      if (u.cruiser.destroyed) continue;
      const rx = (u.cruiser.pos.x - player.pos.x) * pxPerMeter;
      const ry = (u.cruiser.pos.z - player.pos.z) * pxPerMeter;

      // Vision cone
      ctx.save();
      ctx.translate(rx, ry);
      const coneDir = Math.atan2(Math.sin(u.cruiser.heading), Math.cos(u.cruiser.heading));
      // Canvas angle: 0=+X, PI/2=+Y(+Z); heading 0=+Z -> PI/2 - heading
      const canvasAng = Math.PI * 0.5 - coneDir;
      ctx.fillStyle = redPhase ? 'rgba(239, 68, 68, 0.22)' : 'rgba(59, 130, 246, 0.22)';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 52 * pxPerMeter, canvasAng - 0.55, canvasAng + 0.55);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = redPhase ? '#ef4444' : '#3b82f6';
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore(); // back to unrotated radar screen space for crisp upright icons!

    // Helper: project world point onto radar screen space, optionally clamping to radar rim
    const drawBlip = (
      wx: number,
      wz: number,
      color: string,
      label: string | null,
      clampToEdge: boolean,
      size = 7.5
    ) => {
      const dx = (wx - player.pos.x) * pxPerMeter;
      const dz = (wz - player.pos.z) * pxPerMeter;
      const cosR = Math.cos(rot);
      const sinR = Math.sin(rot);
      let sx = cx + dx * cosR - dz * sinR;
      let sy = cy + dx * sinR + dz * cosR;

      const pad = 11;
      const outside = sx < pad || sx > W - pad || sy < pad || sy > H - pad;
      if (outside && !clampToEdge) return;
      if (outside) {
        sx = Math.max(pad, Math.min(W - pad, sx));
        sy = Math.max(pad, Math.min(H - pad, sy));
      }

      if (label) {
        ctx.font = '800 11px "Barlow Condensed", "Arial Narrow", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(8, 10, 14, 0.92)';
        ctx.strokeText(label, sx, sy);
        ctx.fillStyle = color;
        ctx.fillText(label, sx, sy);
      } else {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(sx, sy, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#0b0e13';
        ctx.stroke();
      }
    };

    // Shop icons (LS Customs & Ammu-Nation)
    drawBlip(82, 84, '#d8b4fe', 'LSC', false);
    drawBlip(28, 92, '#fca5a5', 'GUN', false);

    // Mission letter markers (when free-roaming) or active target dot (clamped to radar edge!)
    if (!missions.activeMission) {
      for (const m of missions.missions) {
        drawBlip(m.x, m.z, m.color, m.letter, true);
      }
    } else if (obj?.targetPos) {
      drawBlip(obj.targetPos.x, obj.targetPos.z, obj.targetColor, null, true, 6.2);
    }

    // Custom purple waypoint dot
    if (this.customWaypoint) {
      drawBlip(this.customWaypoint.x, this.customWaypoint.z, '#c084fc', null, true, 5.8);
    }

    // Police active pursuit red/blue edge vignette inside radar (pure GTA V detail!)
    if (police.wantedLevel > 0 && !police.evading) {
      ctx.strokeStyle = redPhase ? 'rgba(239, 68, 68, 0.55)' : 'rgba(59, 130, 246, 0.55)';
      ctx.lineWidth = 6;
      ctx.strokeRect(0, 0, W, H);
    }

    // North 'N' indicator pinned cleanly to the radar frame
    const nDx = 0;
    const nDz = -300;
    const nx = Math.max(10, Math.min(W - 10, cx + nDx * Math.cos(rot) - nDz * Math.sin(rot)));
    const ny = Math.max(10, Math.min(H - 10, cy + nDx * Math.sin(rot) + nDz * Math.cos(rot)));
    ctx.fillStyle = '#0b0d11';
    ctx.beginPath();
    ctx.arc(nx, ny, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f8fafc';
    ctx.font = '800 9.5px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', nx, ny + 0.5);

    // GTA V Helicopter Altimeter Ladder when flying
    if (isHeli) {
      const altRatio = Math.max(0, Math.min(1, player.pos.y / 180));
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(W - 10, 18);
      ctx.lineTo(W - 10, H - 18);
      ctx.stroke();
      const ay = H - 18 - altRatio * (H - 36);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(W - 16, ay - 2, 10, 4);
    }

    // Player crisp white GTA V arrow cursor (rotates relative to camera)
    const arrowRot = Math.PI - player.heading + cameraYaw;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(arrowRot);
    ctx.beginPath();
    ctx.moveTo(0, -8.5);
    ctx.lineTo(6.2, 6.8);
    ctx.lineTo(0, 3.5);
    ctx.lineTo(-6.2, 6.8);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = '#090b0f';
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }

  public renderFullPauseMap(player: Player, missions: MissionSystem): void {
    const ctx = this.pctx;
    const W = this.pauseCanvas.width;
    const H = this.pauseCanvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(this.baseMap, 0, 0, W, H);

    const toPx = (wx: number, wz: number) => ({
      x: ((wx - this.mapMinX) / (this.mapMaxX - this.mapMinX)) * W,
      y: ((wz - this.mapMinZ) / (this.mapMaxZ - this.mapMinZ)) * H,
    });

    // Subtle district labels
    ctx.font = '700 11px "Inter", Arial, sans-serif';
    ctx.fillStyle = 'rgba(226, 232, 240, 0.42)';
    ctx.textAlign = 'center';
    const districtLabels = [
      { name: 'VINEWOOD HILLS', x: 0, z: -315 },
      { name: 'ROCKFORD HILLS', x: -155, z: -110 },
      { name: 'DOWNTOWN LOS SANTOS', x: 0, z: -55 },
      { name: 'VESPUCCI BEACH', x: -285, z: -55 },
      { name: 'DEL PERRO PIER', x: -345, z: 72 },
      { name: 'STRAWBERRY', x: 85, z: 145 },
      { name: 'LA MESA', x: 195, z: 145 },
    ];
    for (const dl of districtLabels) {
      const p = toPx(dl.x, dl.z);
      ctx.fillText(dl.name, p.x, p.y);
    }

    // Draw GPS Routes
    const drawRoute = (tx: number, tz: number, color: string) => {
      const pts = computeGPSRoute(player.pos.x, player.pos.z, tx, tz);
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      pts.forEach((pt, i) => {
        const p = toPx(pt.x, pt.z);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
    };

    if (this.customWaypoint) {
      drawRoute(this.customWaypoint.x, this.customWaypoint.z, '#b55cff');
    }
    const obj = missions.getActiveObjective();
    if (obj?.targetPos) {
      drawRoute(obj.targetPos.x, obj.targetPos.z, obj.targetColor);
    }

    // Draw Landmarks
    for (const lm of LANDMARKS as Landmark[]) {
      const p = toPx(lm.x, lm.z);
      ctx.fillStyle = '#0f1318';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = lm.color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = lm.color;
      ctx.font = '800 8px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(lm.shortLabel.slice(0, 3), p.x, p.y + 0.5);
    }

    // Draw Mission Letters
    for (const m of missions.missions) {
      const p = toPx(m.x, m.z);
      ctx.fillStyle = '#0b0e13';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = m.color;
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.fillStyle = m.color;
      ctx.font = '900 13px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(m.letter, p.x, p.y + 0.5);
    }

    // Custom Waypoint Marker
    if (this.customWaypoint) {
      const wp = toPx(this.customWaypoint.x, this.customWaypoint.z);
      ctx.fillStyle = '#c084fc';
      ctx.beginPath();
      ctx.arc(wp.x, wp.y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Player Arrow
    const pp = toPx(player.pos.x, player.pos.z);
    ctx.save();
    ctx.translate(pp.x, pp.y);
    ctx.rotate(Math.PI - player.heading);
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(7, 8);
    ctx.lineTo(0, 4);
    ctx.lineTo(-7, 8);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#090b0f';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // GTA V Gamepad Map Crosshair Cursor
    if (this.showMapCursor) {
      const cp = toPx(this.mapCursor.x, this.mapCursor.z);
      ctx.save();
      ctx.translate(cp.x, cp.y);
      ctx.strokeStyle = 'rgba(9, 11, 15, 0.9)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.moveTo(-17, 0);
      ctx.lineTo(-6, 0);
      ctx.moveTo(6, 0);
      ctx.lineTo(17, 0);
      ctx.moveTo(0, -17);
      ctx.lineTo(0, -6);
      ctx.moveTo(0, 6);
      ctx.lineTo(0, 17);
      ctx.stroke();
      ctx.restore();
    }
  }

  public resetMapCursor(x: number, z: number): void {
    this.mapCursor.x = Math.max(-390, Math.min(245, x));
    this.mapCursor.z = Math.max(-375, Math.min(245, z));
  }

  public moveMapCursor(dx: number, dz: number): void {
    this.showMapCursor = true;
    this.mapCursor.x = Math.max(-390, Math.min(245, this.mapCursor.x + dx));
    this.mapCursor.z = Math.max(-375, Math.min(245, this.mapCursor.z + dz));
  }

  public toggleWaypointAtCursor(): { x: number; z: number } | null {
    if (
      this.customWaypoint &&
      Math.hypot(this.customWaypoint.x - this.mapCursor.x, this.customWaypoint.z - this.mapCursor.z) < 24
    ) {
      this.customWaypoint = null;
    } else {
      this.customWaypoint = { x: this.mapCursor.x, z: this.mapCursor.z };
    }
    return this.customWaypoint;
  }
}
