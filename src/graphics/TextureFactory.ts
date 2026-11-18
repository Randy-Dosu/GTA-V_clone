import * as THREE from 'three';

export interface FacadeTextureSet {
  map: THREE.CanvasTexture;
  emissiveMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
}

export class TextureFactory {
  private maxAniso: number;

  public roadNS!: THREE.CanvasTexture;
  public roadEW!: THREE.CanvasTexture;
  public roadIntersection!: THREE.CanvasTexture;
  public roadBump!: THREE.CanvasTexture;
  public sidewalk!: THREE.CanvasTexture;
  public vinewoodWalk!: THREE.CanvasTexture;
  public sand!: THREE.CanvasTexture;
  public hillGrass!: THREE.CanvasTexture;
  public boardwalk!: THREE.CanvasTexture;
  public helipad!: THREE.CanvasTexture;
  public plazaTile!: THREE.CanvasTexture;

  private facadeCache = new Map<string, FacadeTextureSet>();

  constructor(renderer: THREE.WebGLRenderer) {
    this.maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    this.initCoreTextures();
  }

  private finalize(
    canvas: HTMLCanvasElement,
    repeatX = 1,
    repeatY = 1,
    srgb = true
  ): THREE.CanvasTexture {
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.anisotropy = this.maxAniso;
    if (srgb) {
      tex.colorSpace = THREE.SRGBColorSpace;
    }
    tex.needsUpdate = true;
    return tex;
  }

  private initCoreTextures(): void {
    this.roadBump = this.buildAsphaltBump();
    this.roadNS = this.buildRoadSegment(false);
    this.roadEW = this.buildRoadSegment(true);
    this.roadIntersection = this.buildIntersection();
    this.sidewalk = this.buildSidewalk();
    this.vinewoodWalk = this.buildVinewoodWalk();
    this.sand = this.buildSand();
    this.hillGrass = this.buildHillGrass();
    this.boardwalk = this.buildBoardwalk();
    this.helipad = this.buildHelipad();
    this.plazaTile = this.buildPlazaTile();
  }

  private paintAsphaltBase(ctx: CanvasRenderingContext2D, size: number): void {
    ctx.fillStyle = '#2d3036';
    ctx.fillRect(0, 0, size, size);

    // Aggregate speckle for realistic sun-warmed Los Santos asphalt
    for (let i = 0; i < 18000; i++) {
      const x = (Math.random() * size) | 0;
      const y = (Math.random() * size) | 0;
      const v = 34 + ((Math.random() * 28) | 0);
      ctx.fillStyle = `rgb(${v},${v + 1},${v + 4})`;
      ctx.fillRect(x, y, 2, 2);
    }

    // Subtle tar cracks
    ctx.strokeStyle = 'rgba(18, 20, 24, 0.35)';
    ctx.lineWidth = 1.2;
    for (let c = 0; c < 10; c++) {
      let x = Math.random() * size;
      let y = Math.random() * size;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let s = 0; s < 6; s++) {
        x += (Math.random() - 0.5) * 36;
        y += (Math.random() - 0.5) * 36;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  private buildAsphaltBump(): THREE.CanvasTexture {
    const size = 256;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 14000; i++) {
      const v = 90 + ((Math.random() * 80) | 0);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
    }
    return this.finalize(c, 4, 4, false);
  }

  private buildRoadSegment(horizontal: boolean): THREE.CanvasTexture {
    const size = 512;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d')!;

    this.paintAsphaltBase(ctx, size);

    ctx.save();
    if (horizontal) {
      ctx.translate(size / 2, size / 2);
      ctx.rotate(Math.PI / 2);
      ctx.translate(-size / 2, -size / 2);
    }

    // Tire polish tracks in all 4 lanes
    const lanes = [0.16, 0.36, 0.64, 0.84];
    for (const lx of lanes) {
      const grad = ctx.createLinearGradient(lx * size - 28, 0, lx * size + 28, 0);
      grad.addColorStop(0, 'rgba(20,22,26,0)');
      grad.addColorStop(0.3, 'rgba(20,22,26,0.22)');
      grad.addColorStop(0.5, 'rgba(60,64,72,0.08)');
      grad.addColorStop(0.7, 'rgba(20,22,26,0.22)');
      grad.addColorStop(1, 'rgba(20,22,26,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(lx * size - 28, 0, 56, size);
    }

    // White shoulder lines + curb gutters
    ctx.fillStyle = '#3b3e45';
    ctx.fillRect(0, 0, 14, size);
    ctx.fillRect(size - 14, 0, 14, size);

    ctx.fillStyle = 'rgba(232, 234, 236, 0.8)';
    ctx.fillRect(18, 0, 5, size);
    ctx.fillRect(size - 23, 0, 5, size);

    // California double solid yellow center lines
    ctx.fillStyle = '#e3b129';
    ctx.fillRect(size * 0.5 - 8, 0, 5, size);
    ctx.fillRect(size * 0.5 + 3, 0, 5, size);

    // Dashed white lane dividers (2 lanes per direction)
    ctx.fillStyle = 'rgba(236, 239, 242, 0.82)';
    const dashCount = 4;
    const step = size / dashCount;
    for (let i = 0; i < dashCount; i++) {
      const y = i * step + step * 0.2;
      const h = step * 0.48;
      ctx.fillRect(size * 0.26 - 2.5, y, 5, h);
      ctx.fillRect(size * 0.74 - 2.5, y, 5, h);
    }

    ctx.restore();
    return this.finalize(c, 1, 1, true);
  }

  private buildIntersection(): THREE.CanvasTexture {
    const size = 512;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d')!;
    this.paintAsphaltBase(ctx, size);

    // Crosswalks on all 4 sides
    ctx.fillStyle = 'rgba(232, 235, 238, 0.78)';
    for (let rot = 0; rot < 4; rot++) {
      ctx.save();
      ctx.translate(size / 2, size / 2);
      ctx.rotate((rot * Math.PI) / 2);
      ctx.translate(-size / 2, -size / 2);

      // Stop line
      ctx.fillRect(size * 0.52, 6, size * 0.43, 7);
      // Zebra bars
      const stripeCount = 11;
      const margin = 34;
      const span = size - margin * 2;
      const sw = span / (stripeCount * 2 - 1);
      for (let i = 0; i < stripeCount; i++) {
        ctx.fillRect(margin + i * sw * 2, 20, sw, 40);
      }
      ctx.restore();
    }

    // Subtle manhole cover in center
    ctx.beginPath();
    ctx.arc(size * 0.5, size * 0.5, 16, 0, Math.PI * 2);
    ctx.fillStyle = '#3d4046';
    ctx.fill();
    ctx.strokeStyle = '#1e2024';
    ctx.lineWidth = 3;
    ctx.stroke();

    return this.finalize(c, 1, 1, true);
  }

  private buildSidewalk(): THREE.CanvasTexture {
    const size = 256;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d')!;

    ctx.fillStyle = '#c8c3b8';
    ctx.fillRect(0, 0, size, size);

    // Fine warm California concrete grain
    for (let i = 0; i < 6500; i++) {
      const v = 182 + ((Math.random() * 34) | 0);
      ctx.fillStyle = `rgb(${v},${v - 4},${v - 12})`;
      ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
    }

    // Concrete tile expansion joints (4x4 slabs)
    const step = size / 4;
    ctx.strokeStyle = 'rgba(95, 92, 85, 0.52)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(i * step, 0);
      ctx.lineTo(i * step, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * step);
      ctx.lineTo(size, i * step);
      ctx.stroke();
    }

    return this.finalize(c, 14, 14, true);
  }

  private buildVinewoodWalk(): THREE.CanvasTexture {
    const size = 256;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d')!;

    ctx.fillStyle = '#35343a';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#d4b36a';
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, size - 8, size - 8);

    // Walk of Fame coral-pink star with brass outline
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a1 = (i * 2 * Math.PI) / 5 - Math.PI / 2;
      const a2 = a1 + Math.PI / 5;
      const r1 = 68;
      const r2 = 28;
      if (i === 0) ctx.moveTo(Math.cos(a1) * r1, Math.sin(a1) * r1);
      else ctx.lineTo(Math.cos(a1) * r1, Math.sin(a1) * r1);
      ctx.lineTo(Math.cos(a2) * r2, Math.sin(a2) * r2);
    }
    ctx.closePath();
    ctx.fillStyle = '#e07b77';
    ctx.fill();
    ctx.strokeStyle = '#e6c575';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();

    return this.finalize(c, 24, 2, true);
  }

  private buildPlazaTile(): THREE.CanvasTexture {
    const size = 256;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#d6cfc2';
    ctx.fillRect(0, 0, size, size);

    const tile = 32;
    for (let y = 0; y < size; y += tile) {
      for (let x = 0; x < size; x += tile) {
        const alt = ((x / tile + y / tile) % 2) === 0;
        ctx.fillStyle = alt ? '#d8d1c4' : '#cbc3b4';
        ctx.fillRect(x + 1, y + 1, tile - 2, tile - 2);
      }
    }
    return this.finalize(c, 8, 8, true);
  }

  private buildSand(): THREE.CanvasTexture {
    const size = 256;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d')!;

    ctx.fillStyle = '#e7cf9b';
    ctx.fillRect(0, 0, size, size);

    // Soft wind ripples
    for (let y = 0; y < size; y += 6) {
      ctx.fillStyle = y % 12 === 0 ? 'rgba(255,245,220,0.22)' : 'rgba(195,165,112,0.18)';
      ctx.fillRect(0, y, size, 3);
    }
    for (let i = 0; i < 9000; i++) {
      const r = 212 + ((Math.random() * 34) | 0);
      const g = 186 + ((Math.random() * 32) | 0);
      const b = 136 + ((Math.random() * 28) | 0);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
    }

    return this.finalize(c, 18, 42, true);
  }

  private buildHillGrass(): THREE.CanvasTexture {
    const size = 256;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d')!;

    // Authentic Southern California chaparral green-gold blend
    ctx.fillStyle = '#627944';
    ctx.fillRect(0, 0, size, size);

    for (let i = 0; i < 800; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = 6 + Math.random() * 18;
      const dry = Math.random() > 0.58;
      ctx.fillStyle = dry ? 'rgba(148, 134, 78, 0.2)' : 'rgba(68, 98, 48, 0.24)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 7000; i++) {
      const g = 92 + ((Math.random() * 44) | 0);
      ctx.fillStyle = `rgb(${(g * 0.84) | 0},${g},${(g * 0.52) | 0})`;
      ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
    }

    return this.finalize(c, 24, 16, true);
  }

  private buildBoardwalk(): THREE.CanvasTexture {
    const size = 256;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d')!;

    const planks = 16;
    const ph = size / planks;
    for (let i = 0; i < planks; i++) {
      const shade = 132 + ((Math.random() * 28) | 0);
      ctx.fillStyle = `rgb(${shade},${(shade * 0.74) | 0},${(shade * 0.5) | 0})`;
      ctx.fillRect(0, i * ph, size, ph - 1.5);
      ctx.fillStyle = '#3b291a';
      ctx.fillRect(0, (i + 1) * ph - 1.5, size, 1.5);
    }
    return this.finalize(c, 16, 4, true);
  }

  private buildHelipad(): THREE.CanvasTexture {
    const size = 512;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d')!;

    this.paintAsphaltBase(ctx, size);

    // Outer hazard border
    ctx.strokeStyle = '#f0be2b';
    ctx.lineWidth = 12;
    ctx.strokeRect(24, 24, size - 48, size - 48);

    // Circle
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 175, 0, Math.PI * 2);
    ctx.lineWidth = 18;
    ctx.strokeStyle = '#f2c230';
    ctx.stroke();

    // Crisp H
    ctx.fillStyle = '#f5f6f8';
    ctx.fillRect(size / 2 - 78, size / 2 - 96, 30, 192);
    ctx.fillRect(size / 2 + 48, size / 2 - 96, 30, 192);
    ctx.fillRect(size / 2 - 78, size / 2 - 15, 156, 30);

    return this.finalize(c, 1, 1, true);
  }

  public getSkyscraperFacade(
    key: string,
    frameColor: string,
    glassTop: string,
    glassBottom: string,
    cols = 8,
    rows = 16
  ): FacadeTextureSet {
    const cached = this.facadeCache.get(key);
    if (cached) return cached;

    const w = 512;
    const h = 1024;
    const albedo = document.createElement('canvas');
    albedo.width = w;
    albedo.height = h;
    const ctx = albedo.getContext('2d')!;

    const emissive = document.createElement('canvas');
    emissive.width = w;
    emissive.height = h;
    const ectx = emissive.getContext('2d')!;

    const bump = document.createElement('canvas');
    bump.width = w;
    bump.height = h;
    const bctx = bump.getContext('2d')!;

    ctx.fillStyle = frameColor;
    ctx.fillRect(0, 0, w, h);
    ectx.fillStyle = '#000000';
    ectx.fillRect(0, 0, w, h);
    bctx.fillStyle = '#d0d0d0';
    bctx.fillRect(0, 0, w, h);

    const cw = w / cols;
    const rh = h / rows;

    // Seeded pseudo-random so textures look deterministic & architecturally balanced
    let seed = 0;
    for (let i = 0; i < key.length; i++) seed = (seed * 31 + key.charCodeAt(i)) % 99991;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    for (let r = 0; r < rows; r++) {
      // Spandrel band between floors
      ctx.fillStyle = frameColor;
      ctx.fillRect(0, r * rh, w, rh * 0.22);
      const floorLitBias = rand() > 0.45 ? 0.45 : 0.14;

      for (let c = 0; c < cols; c++) {
        const px = c * cw + 4;
        const py = r * rh + rh * 0.22;
        const pw = cw - 8;
        const ph = rh * 0.72;

        const g = ctx.createLinearGradient(px, py, px, py + ph);
        g.addColorStop(0, glassTop);
        g.addColorStop(1, glassBottom);
        ctx.fillStyle = g;
        ctx.fillRect(px, py, pw, ph);

        // Subtle interior blinds/sky reflection
        const v = rand();
        if (v < 0.28) {
          ctx.fillStyle = 'rgba(235, 224, 198, 0.22)';
          ctx.fillRect(px + 2, py + 2, pw - 4, ph * (0.35 + rand() * 0.4));
        } else if (v > 0.72) {
          ctx.fillStyle = 'rgba(180, 215, 245, 0.18)';
          ctx.fillRect(px, py, pw, ph * 0.5);
        }

        // Emissive window glow for sunset & night skyline
        if (rand() < floorLitBias) {
          const warm = rand() > 0.32;
          ectx.fillStyle = warm ? '#ffd899' : '#b8e0ff';
          ectx.fillRect(px + 2, py + 2, pw - 4, ph - 4);
        }

        // Recessed glass in bump map
        bctx.fillStyle = '#505050';
        bctx.fillRect(px, py, pw, ph);
      }
    }

    const set: FacadeTextureSet = {
      map: this.finalize(albedo, 1, 1, true),
      emissiveMap: this.finalize(emissive, 1, 1, true),
      bumpMap: this.finalize(bump, 1, 1, false),
    };
    this.facadeCache.set(key, set);
    return set;
  }

  public getMidriseFacade(
    key: string,
    wallColor: string,
    trimColor: string,
    awningColor: string,
    cols = 6,
    rows = 5
  ): FacadeTextureSet {
    const cached = this.facadeCache.get(key);
    if (cached) return cached;

    const w = 512;
    const h = 512;
    const albedo = document.createElement('canvas');
    albedo.width = w;
    albedo.height = h;
    const ctx = albedo.getContext('2d')!;

    const emissive = document.createElement('canvas');
    emissive.width = w;
    emissive.height = h;
    const ectx = emissive.getContext('2d')!;

    const bump = document.createElement('canvas');
    bump.width = w;
    bump.height = h;
    const bctx = bump.getContext('2d')!;

    ctx.fillStyle = wallColor;
    ctx.fillRect(0, 0, w, h);
    ectx.fillStyle = '#000000';
    ectx.fillRect(0, 0, w, h);
    bctx.fillStyle = '#b8b8b8';
    bctx.fillRect(0, 0, w, h);

    // Warm California stucco texture
    for (let i = 0; i < 5000; i++) {
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,250,240,0.06)' : 'rgba(30,25,20,0.06)';
      ctx.fillRect(Math.random() * w, Math.random() * h, 3, 3);
    }

    // Roofline cornice
    ctx.fillStyle = trimColor;
    ctx.fillRect(0, 0, w, 18);
    ctx.fillRect(0, 22, w, 6);

    const cw = w / cols;
    const rh = (h - 32) / rows;

    for (let r = 0; r < rows; r++) {
      const isGround = r === rows - 1;
      const baseY = 32 + r * rh;

      // Floor molding
      ctx.fillStyle = trimColor;
      ctx.fillRect(0, baseY, w, 5);

      for (let c = 0; c < cols; c++) {
        const px = c * cw + cw * 0.16;
        const pw = cw * 0.68;
        const py = baseY + (isGround ? rh * 0.24 : rh * 0.2);
        const ph = isGround ? rh * 0.72 : rh * 0.56;

        // Window frame
        ctx.fillStyle = trimColor;
        ctx.fillRect(px - 3, py - 3, pw + 6, ph + 6);

        // Glass
        const g = ctx.createLinearGradient(px, py, px, py + ph);
        g.addColorStop(0, isGround ? '#35485c' : '#4a6882');
        g.addColorStop(1, isGround ? '#1f2833' : '#263545');
        ctx.fillStyle = g;
        ctx.fillRect(px, py, pw, ph);

        // Storefront awning on ground floor
        if (isGround) {
          ctx.fillStyle = awningColor;
          ctx.fillRect(px - 5, py - 10, pw + 10, 14);
          ctx.fillStyle = 'rgba(255,255,255,0.28)';
          for (let s = 0; s < pw + 8; s += 12) {
            ctx.fillRect(px - 4 + s, py - 10, 5, 14);
          }
          ectx.fillStyle = '#ffe1a8';
          ectx.fillRect(px + 3, py + 8, pw - 6, ph - 12);
        } else if ((r * 7 + c * 13 + key.length) % 5 < 2) {
          ectx.fillStyle = '#ffd591';
          ectx.fillRect(px + 2, py + 2, pw - 4, ph - 4);
        }

        bctx.fillStyle = '#484848';
        bctx.fillRect(px, py, pw, ph);
      }
    }

    const set: FacadeTextureSet = {
      map: this.finalize(albedo, 1, 1, true),
      emissiveMap: this.finalize(emissive, 1, 1, true),
      bumpMap: this.finalize(bump, 1, 1, false),
    };
    this.facadeCache.set(key, set);
    return set;
  }

  public createSignTexture(
    title: string,
    subtitle: string,
    bgColor: string,
    textColor: string,
    accentColor: string,
    width = 512,
    height = 160
  ): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d')!;

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);

    // Accent strip & border
    ctx.fillStyle = accentColor;
    ctx.fillRect(0, 0, width, 10);
    ctx.fillRect(0, height - 10, width, 10);

    ctx.fillStyle = textColor;
    const titleSize = subtitle ? Math.min(62, Math.floor((width * 1.25) / Math.max(7, title.length))) : 72;
    ctx.font = `900 ${titleSize}px "Arial Black", Impact, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, width / 2, subtitle ? height * 0.43 : height * 0.52, width - 36);

    if (subtitle) {
      ctx.fillStyle = accentColor;
      ctx.font = `700 22px Arial, Helvetica, sans-serif`;
      ctx.fillText(subtitle, width / 2, height * 0.77, width - 40);
    }

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.maxAniso;
    return tex;
  }

  public createPoliceDoorTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 160;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#f4f6f9';
    ctx.fillRect(0, 0, 512, 160);

    // Gold/navy LSPD shield emblem
    ctx.fillStyle = '#d4af37';
    ctx.beginPath();
    ctx.arc(92, 82, 42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#14223b';
    ctx.beginPath();
    ctx.arc(92, 82, 30, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#11151c';
    ctx.font = '900 66px "Arial Black", Impact, sans-serif';
    ctx.fillText('POLICE', 155, 92);
    ctx.font = '700 21px Arial, sans-serif';
    ctx.fillStyle = '#253247';
    ctx.fillText('OBEY & SURVIVE  •  LSPD', 158, 128);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.maxAniso;
    return tex;
  }
}
