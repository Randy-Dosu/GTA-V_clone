import * as THREE from 'three';
import { WeaponId } from '../types';

export type HairStyle =
  | 'short'
  | 'long'
  | 'bald'
  | 'cap'
  | 'beanie'
  | 'ponytail'
  | 'afro'
  | 'mohawk';

export type OutfitStyle = 'tee' | 'hoodie' | 'jacket' | 'suit' | 'police' | 'athletic';

export type BodyType = 'slim' | 'average' | 'heavy' | 'athletic' | 'female';

export interface CharacterColors {
  skin: number;
  hair: number;
  top: number;
  secondaryTop?: number;
  pants: number;
  shoes: number;
  isPolice?: boolean;
  hasSunglasses?: boolean;
  baldTop?: boolean;
  hairStyle?: HairStyle;
  outfit?: OutfitStyle;
  bodyType?: BodyType;
  beard?: boolean;
  detail?: 'full' | 'simple';
}

const BODY_SCALES: Record<BodyType, { torso: number; limbs: number; shoulders: number; hips: number }> = {
  slim: { torso: 0.84, limbs: 0.8, shoulders: 0.88, hips: 0.9 },
  average: { torso: 1.0, limbs: 1.0, shoulders: 1.0, hips: 1.0 },
  heavy: { torso: 1.24, limbs: 1.08, shoulders: 1.06, hips: 1.18 },
  athletic: { torso: 1.06, limbs: 1.0, shoulders: 1.12, hips: 0.98 },
  female: { torso: 0.8, limbs: 0.92, shoulders: 0.86, hips: 1.12 },
};

/** Paint a human face onto a canvas texture (face centered at u = 0.25 → +Z front of sphere). */
function makeFaceTexture(skinHex: number, beard: boolean, female = false): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const skin = new THREE.Color(skinHex);
  const css = (col: THREE.Color, mul: number) =>
    `rgb(${(col.r * 255 * mul) | 0},${(col.g * 255 * mul) | 0},${(col.b * 255 * mul) | 0})`;

  // Base skin with soft vertical shading (forehead lighter, jaw slightly darker)
  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, css(skin, 1.06));
  grad.addColorStop(0.55, css(skin, 1.0));
  grad.addColorStop(1, css(skin, 0.88));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Subtle skin noise
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,235,220,0.05)' : 'rgba(40,20,10,0.05)';
    ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }

  const fx = size * 0.25; // face center on sphere front
  const eyeY = size * 0.44;
  const eyeDX = size * 0.115;
  const mouthY = size * 0.72;

  // Cheek blush / warmth
  for (const s of [-1, 1]) {
    const blush = ctx.createRadialGradient(
      fx + s * eyeDX * 1.5, eyeY + size * 0.1, 2,
      fx + s * eyeDX * 1.5, eyeY + size * 0.1, size * 0.09
    );
    blush.addColorStop(0, 'rgba(200,110,90,0.16)');
    blush.addColorStop(1, 'rgba(200,110,90,0)');
    ctx.fillStyle = blush;
    ctx.fillRect(0, 0, size, size);
  }

  // Beard / stubble (jaw + upper lip)
  if (beard) {
    ctx.fillStyle = 'rgba(35,26,20,0.5)';
    ctx.beginPath();
    ctx.ellipse(fx, mouthY + size * 0.09, size * 0.16, size * 0.11, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 500; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random();
      const bx = fx + Math.cos(a) * size * 0.16 * r;
      const by = mouthY + size * 0.09 + Math.sin(a) * size * 0.11 * r;
      if (by > mouthY - 4) {
        ctx.fillStyle = 'rgba(25,18,14,0.55)';
        ctx.fillRect(bx, by, 2, 2);
      }
    }
    // Mustache
    ctx.fillStyle = 'rgba(30,22,17,0.75)';
    ctx.beginPath();
    ctx.ellipse(fx, mouthY - size * 0.035, size * 0.075, size * 0.022, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Eyebrows — thinner, higher-arched and softly shaded for female faces
  ctx.strokeStyle = female ? 'rgba(45,30,20,0.78)' : 'rgba(30,22,16,0.9)';
  ctx.lineWidth = size * (female ? 0.015 : 0.022);
  ctx.lineCap = 'round';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(fx + s * eyeDX - size * 0.055, eyeY - size * (female ? 0.08 : 0.085));
    ctx.quadraticCurveTo(
      fx + s * eyeDX,
      eyeY - size * (female ? 0.125 : 0.115),
      fx + s * eyeDX + size * 0.055,
      eyeY - size * (female ? 0.075 : 0.08)
    );
    ctx.stroke();
  }

  // Soft cheekbone shading & smile creases — reads as real facial structure
  ctx.fillStyle = 'rgba(70,40,26,0.14)';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(fx + s * size * 0.11, eyeY + size * 0.13, size * 0.07, size * 0.045, s * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(60,35,24,0.16)';
  ctx.lineWidth = size * 0.008;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(fx + s * size * 0.085, mouthY - size * 0.045);
    ctx.quadraticCurveTo(fx + s * size * 0.105, mouthY - size * 0.01, fx + s * size * 0.09, mouthY + size * 0.02);
    ctx.stroke();
  }

  // Eyes (sclera, iris, pupil, highlight, upper lid line)
  for (const s of [-1, 1]) {
    const ex = fx + s * eyeDX;
    if (female) {
      // Smoky eyeshadow above the lid line
      ctx.fillStyle = 'rgba(88,58,44,0.4)';
      ctx.beginPath();
      ctx.ellipse(ex, eyeY - size * 0.032, size * 0.05, size * 0.028, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#f4efe8';
    ctx.beginPath();
    ctx.ellipse(ex, eyeY, size * 0.042, size * 0.026, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4a3220';
    ctx.beginPath();
    ctx.arc(ex, eyeY, size * 0.016, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#14100c';
    ctx.beginPath();
    ctx.arc(ex, eyeY, size * 0.008, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(ex - size * 0.005, eyeY - size * 0.005, size * 0.004, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,26,18,0.85)';
    ctx.lineWidth = size * 0.008;
    ctx.beginPath();
    ctx.moveTo(ex - size * 0.045, eyeY - size * 0.012);
    ctx.quadraticCurveTo(ex, eyeY - size * 0.035, ex + size * 0.045, eyeY - size * 0.012);
    ctx.stroke();
  }

  // Nose (soft shadow + highlight bridge)
  ctx.fillStyle = 'rgba(60,35,22,0.28)';
  ctx.beginPath();
  ctx.ellipse(fx, eyeY + size * 0.11, size * 0.028, size * 0.055, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,240,225,0.22)';
  ctx.beginPath();
  ctx.ellipse(fx - size * 0.012, eyeY + size * 0.07, size * 0.012, size * 0.045, 0, 0, Math.PI * 2);
  ctx.fill();

  // Mouth (lips) — fuller, rosier for female faces
  ctx.fillStyle = female ? 'rgba(178,88,84,0.92)' : 'rgba(150,80,75,0.85)';
  ctx.beginPath();
  ctx.ellipse(fx, mouthY, size * (female ? 0.07 : 0.062), size * (female ? 0.026 : 0.02), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(70,35,30,0.9)';
  ctx.lineWidth = size * 0.01;
  ctx.beginPath();
  ctx.moveTo(fx - size * 0.06, mouthY);
  ctx.quadraticCurveTo(fx, mouthY + size * 0.014, fx + size * 0.06, mouthY);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export class CharacterRig {
  public root = new THREE.Group();
  public hips = new THREE.Group();
  public torso = new THREE.Group();
  public head = new THREE.Group();
  public leftArm = new THREE.Group();
  public rightArm = new THREE.Group();
  public leftLeg = new THREE.Group();
  public rightLeg = new THREE.Group();
  public handSocket = new THREE.Group();
  public leftElbow = new THREE.Group();
  public rightElbow = new THREE.Group();
  public leftKnee = new THREE.Group();
  public rightKnee = new THREE.Group();

  private skinMat: THREE.MeshStandardMaterial;
  private hairMat: THREE.MeshStandardMaterial;
  private topMat: THREE.MeshStandardMaterial;
  private subTopMat: THREE.MeshStandardMaterial;
  private pantsMat: THREE.MeshStandardMaterial;
  private shoeMat: THREE.MeshStandardMaterial;
  private faceMat: THREE.MeshStandardMaterial;
  private beard: boolean;
  private skinHex: number;
  /** Female builds run slightly shorter with a distinct walk style */
  private isFemale = false;
  private baseHipY = 0.92;

  private weaponMeshes: Partial<Record<WeaponId, THREE.Object3D>> = {};
  private currentWeapon: WeaponId = 'unarmed';
  private walkPhase = Math.random() * Math.PI * 2;
  private punchTimer = 0;
  private recoilTimer = 0;
  /** Smoothed acceleration lean (spine pitch) & turn lean (spine roll) */
  private leanSmooth = 0;
  private turnSmooth = 0;

  constructor(colors: CharacterColors, withWeapons = false) {
    const body = BODY_SCALES[colors.bodyType ?? 'average'];
    const full = (colors.detail ?? 'full') === 'full';
    const outfit: OutfitStyle = colors.isPolice ? 'police' : (colors.outfit ?? 'tee');
    const hairStyle: HairStyle = colors.baldTop ? 'bald' : (colors.hairStyle ?? 'short');
    this.beard = colors.beard ?? false;
    this.skinHex = colors.skin;

    this.skinMat = new THREE.MeshStandardMaterial({ color: colors.skin, roughness: 0.62 });
    this.hairMat = new THREE.MeshStandardMaterial({ color: colors.hair, roughness: 0.85 });
    this.topMat = new THREE.MeshStandardMaterial({ color: colors.top, roughness: 0.78 });
    this.subTopMat = new THREE.MeshStandardMaterial({
      color: colors.secondaryTop ?? colors.top,
      roughness: 0.72,
    });
    this.pantsMat = new THREE.MeshStandardMaterial({ color: colors.pants, roughness: 0.84 });
    this.shoeMat = new THREE.MeshStandardMaterial({ color: colors.shoes, roughness: 0.55 });
    this.isFemale = (colors.bodyType ?? 'average') === 'female';
    this.baseHipY = this.isFemale ? 0.87 : 0.92;
    this.faceMat = new THREE.MeshStandardMaterial({
      map: makeFaceTexture(colors.skin, this.beard, this.isFemale),
      roughness: 0.6,
    });

    // Ground contact shadow blob for crisp grounded feel even outside shadow cascade
    const contactShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.42, 16).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.34,
        depthWrite: false,
      })
    );
    contactShadow.position.y = 0.025;
    this.root.add(contactShadow);

    // Hips at base height (1.82 m male standing height, 1.76 m female)
    this.hips.position.y = this.baseHipY;
    this.root.add(this.hips);

    // Pelvis — tapered cylinder reads as hips rather than a box
    const pelvis = new THREE.Mesh(
      new THREE.CylinderGeometry(0.19 * body.hips, 0.17 * body.hips, 0.22, 10),
      this.pantsMat
    );
    pelvis.castShadow = true;
    this.hips.add(pelvis);

    // Torso — tapered cylinder: waist narrower than shoulders
    this.torso.position.y = 0.1;
    const shoulderW = 0.21 * body.shoulders;
    const chest = new THREE.Mesh(
      new THREE.CylinderGeometry(shoulderW, 0.155 * body.torso, 0.56, 12),
      this.topMat
    );
    chest.position.y = 0.28;
    chest.castShadow = true;
    this.torso.add(chest);

    if (this.isFemale) {
      // Subtle contoured chest form under the top
      const form = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), this.topMat);
      form.scale.set(1.55, 0.72, 0.95);
      form.position.set(0, 0.34, 0.1 * body.torso);
      this.torso.add(form);
    }

    // Inner shirt / undershirt front panel
    const innerShirt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.185 * body.shoulders, 0.145 * body.torso, 0.5, 10, 1, true, -0.55, 1.1),
      this.subTopMat
    );
    innerShirt.position.y = 0.28;
    this.torso.add(innerShirt);

    // Collar ring
    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(0.105 * body.shoulders, 0.022, 6, 14).rotateX(Math.PI / 2),
      this.subTopMat
    );
    collar.position.y = 0.56;
    this.torso.add(collar);

    if (outfit === 'suit') {
      // Tie + white shirt front
      const tie = new THREE.Mesh(
        new THREE.BoxGeometry(0.055, 0.34, 0.02),
        new THREE.MeshStandardMaterial({ color: 0x7f1d2d, roughness: 0.5 })
      );
      tie.position.set(0, 0.38, 0.185 * body.shoulders);
      tie.rotation.x = 0.06;
      const shirtFront = new THREE.Mesh(
        new THREE.CylinderGeometry(0.19 * body.shoulders, 0.15 * body.torso, 0.52, 10, 1, true, -0.5, 1.0),
        new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.7 })
      );
      shirtFront.position.y = 0.28;
      this.torso.add(shirtFront, tie);
    }

    if (outfit === 'jacket') {
      // Open jacket front panels
      const jacketMat = new THREE.MeshStandardMaterial({ color: colors.top, roughness: 0.7 });
      for (const s of [-1, 1]) {
        const panel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.2 * body.shoulders, 0.155 * body.torso, 0.54, 8, 1, true, s > 0 ? -0.15 : Math.PI - 0.75, 0.75),
          jacketMat
        );
        panel.position.y = 0.28;
        this.torso.add(panel);
      }
    }

    if (outfit === 'hoodie') {
      // Hood bump resting on upper back
      const hood = new THREE.Mesh(
        new THREE.SphereGeometry(0.11 * body.shoulders, 10, 8),
        this.topMat
      );
      hood.scale.set(1.2, 0.7, 0.8);
      hood.position.set(0, 0.52, -0.14 * body.shoulders);
      this.torso.add(hood);
    }

    if (colors.isPolice) {
      // Gold LSPD chest badge & utility belt
      const badge = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.07, 0.02),
        new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.8, roughness: 0.2 })
      );
      badge.position.set(-0.1 * body.shoulders, 0.42, 0.17 * body.shoulders);
      const belt = new THREE.Mesh(
        new THREE.CylinderGeometry(0.175 * body.torso, 0.175 * body.torso, 0.07, 12),
        new THREE.MeshStandardMaterial({ color: 0x111317, roughness: 0.4 })
      );
      belt.position.y = 0.02;
      this.torso.add(badge, belt);
    }

    this.hips.add(this.torso);

    // Head, neck, face, hair, aviators
    this.head.position.y = 0.58;
    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.065, 0.12, 8),
      this.skinMat
    );
    neck.position.y = 0.02;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.125, 18, 14), this.faceMat);
    skull.scale.set(0.92, 1.06, 0.98);
    skull.position.y = 0.17;
    skull.castShadow = true;
    this.head.add(neck, skull);

    if (full) {
      // Ears
      for (const s of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), this.skinMat);
        ear.scale.set(0.5, 1.0, 0.7);
        ear.position.set(s * 0.115, 0.17, 0);
        this.head.add(ear);
      }
    }

    this.buildHair(hairStyle, body);

    if (colors.isPolice) {
      // LSPD peaked patrol cap
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.125, 0.075, 14), this.topMat);
      cap.position.y = 0.27;
      const visor = new THREE.Mesh(
        new THREE.BoxGeometry(0.19, 0.02, 0.11),
        new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2 })
      );
      visor.position.set(0, 0.235, 0.12);
      this.head.add(cap, visor);
    } else if (colors.hasSunglasses) {
      const shades = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.05, 0.03),
        new THREE.MeshStandardMaterial({ color: 0x111318, metalness: 0.8, roughness: 0.15 })
      );
      shades.position.set(0, 0.19, 0.115);
      this.head.add(shades);
    }

    this.torso.add(this.head);

    // Articulated arms: shoulder pivot → upper arm → elbow pivot → forearm + hand
    const buildArm = (side: -1 | 1): { arm: THREE.Group; elbow: THREE.Group } => {
      const arm = new THREE.Group();
      arm.position.set(side * 0.24 * body.shoulders, 0.5, 0);
      // Deltoid cap so the arm reads as connected at the shoulder joint
      const deltoid = new THREE.Mesh(new THREE.SphereGeometry(0.062 * body.limbs, 10, 8), this.topMat);
      deltoid.castShadow = true;
      arm.add(deltoid);
      const upperLen = 0.27;
      const upper = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055 * body.limbs, 0.05 * body.limbs, upperLen, 8),
        outfit === 'tee' || outfit === 'athletic' ? this.topMat : this.topMat
      );
      upper.position.y = -upperLen * 0.5;
      upper.castShadow = true;
      arm.add(upper);

      const elbow = new THREE.Group();
      elbow.position.y = -upperLen;
      const foreLen = 0.25;
      const forearm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.047 * body.limbs, 0.04 * body.limbs, foreLen, 8),
        outfit === 'tee' || outfit === 'athletic' ? this.skinMat : this.topMat
      );
      forearm.position.y = -foreLen * 0.5;
      forearm.castShadow = true;
      // Palm + thumb reads as a real hand, not a blob
      const palm = new THREE.Mesh(new THREE.BoxGeometry(0.07 * body.limbs, 0.095, 0.048), this.skinMat);
      palm.position.y = -foreLen - 0.045;
      const thumb = new THREE.Mesh(new THREE.SphereGeometry(0.02 * body.limbs, 6, 5), this.skinMat);
      thumb.scale.set(0.8, 1.3, 0.8);
      thumb.position.set(-side * 0.036 * body.limbs, -foreLen - 0.02, 0.018);
      elbow.add(forearm, palm, thumb);
      arm.add(elbow);
      return { arm, elbow };
    };

    // Local +Z is forward, +Y is up => character's left is +X, right is -X
    const left = buildArm(1);
    const right = buildArm(-1);
    this.leftArm = left.arm;
    this.leftElbow = left.elbow;
    this.rightArm = right.arm;
    this.rightElbow = right.elbow;
    this.handSocket.position.set(0, -0.56, 0.06);
    this.rightElbow.add(this.handSocket);
    this.torso.add(this.leftArm, this.rightArm);

    // Articulated legs: hip pivot → thigh → knee pivot → shin + shoe
    const buildLeg = (side: -1 | 1): { leg: THREE.Group; knee: THREE.Group } => {
      const leg = new THREE.Group();
      leg.position.set(side * 0.105 * body.hips, -0.06, 0);
      const thighLen = 0.4;
      const thigh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.075 * body.limbs, 0.06 * body.limbs, thighLen, 8),
        this.pantsMat
      );
      thigh.position.y = -thighLen * 0.5;
      thigh.castShadow = true;
      leg.add(thigh);

      const knee = new THREE.Group();
      knee.position.y = -thighLen;
      const shinLen = 0.4;
      const shin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055 * body.limbs, 0.045 * body.limbs, shinLen, 8),
        this.pantsMat
      );
      shin.position.y = -shinLen * 0.5;
      shin.castShadow = true;
      // Two-tone sneaker: upper + darker sole & toe cap
      const shoeUpper = new THREE.Mesh(
        new THREE.BoxGeometry(0.095 * body.limbs, 0.075, 0.23),
        this.shoeMat
      );
      shoeUpper.position.set(0, -shinLen - 0.02, 0.05);
      shoeUpper.castShadow = true;
      const sole = new THREE.Mesh(
        new THREE.BoxGeometry(0.1 * body.limbs, 0.038, 0.26),
        new THREE.MeshStandardMaterial({ color: 0x17181c, roughness: 0.6 })
      );
      sole.position.set(0, -shinLen - 0.072, 0.055);
      knee.add(shin, shoeUpper, sole);
      leg.add(knee);
      return { leg, knee };
    };

    const leftLeg = buildLeg(1);
    const rightLeg = buildLeg(-1);
    this.leftLeg = leftLeg.leg;
    this.leftKnee = leftLeg.knee;
    this.rightLeg = rightLeg.leg;
    this.rightKnee = rightLeg.knee;
    this.hips.add(this.leftLeg, this.rightLeg);

    if (withWeapons) {
      this.buildWeaponModels();
    }
  }

  private buildHair(style: HairStyle, body: { shoulders: number }): void {
    const r = 0.128;
    const add = (mesh: THREE.Mesh) => {
      mesh.castShadow = true;
      this.head.add(mesh);
    };

    switch (style) {
      case 'bald':
        break;
      case 'cap': {
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.132, 0.128, 0.09, 14), this.hairMat);
        cap.position.y = 0.26;
        const brim = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.018, 0.12), this.hairMat);
        brim.position.set(0, 0.225, 0.14);
        add(cap);
        add(brim);
        break;
      }
      case 'beanie': {
        const beanie = new THREE.Mesh(new THREE.SphereGeometry(r * 1.02, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), this.hairMat);
        beanie.scale.set(0.95, 0.8, 1.0);
        beanie.position.y = 0.19;
        const band = new THREE.Mesh(new THREE.TorusGeometry(r * 0.98, 0.022, 6, 16).rotateX(Math.PI / 2), this.hairMat);
        band.position.y = 0.235;
        add(beanie);
        add(band);
        break;
      }
      case 'afro': {
        const afro = new THREE.Mesh(new THREE.SphereGeometry(r * 1.35, 14, 10), this.hairMat);
        afro.scale.set(1.0, 0.85, 1.0);
        afro.position.y = 0.24;
        add(afro);
        break;
      }
      case 'mohawk': {
        const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.09, 0.26), this.hairMat);
        ridge.position.set(0, 0.3, -0.01);
        add(ridge);
        break;
      }
      case 'long': {
        const top = new THREE.Mesh(new THREE.SphereGeometry(r * 1.03, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), this.hairMat);
        top.scale.set(0.95, 0.85, 1.0);
        top.position.y = 0.19;
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.07), this.hairMat);
        back.position.set(0, 0.08, -0.09);
        const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.16), this.hairMat);
        sideL.position.set(-0.11, 0.1, 0);
        const sideR = sideL.clone();
        sideR.position.x = 0.11;
        add(top);
        add(back);
        add(sideL);
        add(sideR);
        break;
      }
      case 'ponytail': {
        const top = new THREE.Mesh(new THREE.SphereGeometry(r * 1.03, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), this.hairMat);
        top.scale.set(0.95, 0.85, 1.0);
        top.position.y = 0.19;
        const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.055, 0.3, 8), this.hairMat);
        tail.position.set(0, 0.12, -0.14);
        tail.rotation.x = 0.35;
        add(top);
        add(tail);
        break;
      }
      case 'short':
      default: {
        const crop = new THREE.Mesh(new THREE.SphereGeometry(r * 1.03, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), this.hairMat);
        crop.scale.set(0.95, 0.8, 1.0);
        crop.position.y = 0.2;
        add(crop);
        break;
      }
    }
    void body;
  }

  public applyPalette(colors: CharacterColors): void {
    this.skinMat.color.setHex(colors.skin);
    this.hairMat.color.setHex(colors.hair);
    this.topMat.color.setHex(colors.top);
    this.subTopMat.color.setHex(colors.secondaryTop ?? colors.top);
    this.pantsMat.color.setHex(colors.pants);
    this.shoeMat.color.setHex(colors.shoes);
    if (colors.skin !== this.skinHex) {
      this.skinHex = colors.skin;
      this.beard = colors.beard ?? this.beard;
      const old = this.faceMat.map;
      this.faceMat.map = makeFaceTexture(colors.skin, this.beard, this.isFemale);
      this.faceMat.needsUpdate = true;
      old?.dispose();
    }
  }

  private buildWeaponModels(): void {
    const gunMetal = new THREE.MeshStandardMaterial({ color: 0x1e2228, metalness: 0.78, roughness: 0.28 });
    const gripMat = new THREE.MeshStandardMaterial({ color: 0x2c2520, roughness: 0.8 });
    const oliveMat = new THREE.MeshStandardMaterial({ color: 0x45523b, roughness: 0.65 });

    // Pistol (extends along -Y when arm hangs down; when arm raises -PI/2 around X, points +Z forward!)
    const makeGun = (barrelLen: number, thickness: number, stock = false, rpg = false) => {
      const g = new THREE.Group();
      // Rotate so local +Z aligns with forward when rightArm.rotation.x = -PI/2
      g.rotation.x = Math.PI * 0.5;
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(thickness, thickness * 1.15, barrelLen),
        rpg ? oliveMat : gunMetal
      );
      body.position.set(0, 0.04, barrelLen * 0.42);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(thickness * 0.85, 0.14, 0.07), gripMat);
      grip.position.set(0, -0.04, 0.02);
      g.add(body, grip);
      if (stock) {
        const st = new THREE.Mesh(new THREE.BoxGeometry(thickness * 0.8, 0.11, 0.24), gripMat);
        st.position.set(0, 0.02, -0.14);
        g.add(st);
      }
      if (rpg) {
        const warhead = new THREE.Mesh(
          new THREE.ConeGeometry(0.085, 0.26, 8).rotateX(Math.PI / 2),
          oliveMat
        );
        warhead.position.set(0, 0.04, barrelLen + 0.08);
        g.add(warhead);
      }
      g.visible = false;
      this.handSocket.add(g);
      return g;
    };

    this.weaponMeshes.pistol = makeGun(0.26, 0.055, false, false);
    this.weaponMeshes.smg = makeGun(0.38, 0.068, false, false);
    this.weaponMeshes.rifle = makeGun(0.72, 0.07, true, false);
    this.weaponMeshes.shotgun = makeGun(0.76, 0.075, true, false);
    this.weaponMeshes.rpg = makeGun(0.95, 0.095, true, true);
  }

  public setWeapon(weapon: WeaponId): void {
    if (this.currentWeapon === weapon) return;
    this.currentWeapon = weapon;
    for (const [id, mesh] of Object.entries(this.weaponMeshes)) {
      if (mesh) mesh.visible = id === weapon;
    }
  }

  public triggerAttack(): void {
    if (this.currentWeapon === 'unarmed') {
      this.punchTimer = 0.26;
    } else {
      this.recoilTimer = 0.11;
    }
  }

  public getMuzzleWorldPos(out = new THREE.Vector3()): THREE.Vector3 {
    this.handSocket.getWorldPosition(out);
    out.y += 0.08;
    return out;
  }

  public updateAnimation(
    dt: number,
    moveSpeed: number,
    isSprinting: boolean,
    isGrounded: boolean,
    isAiming: boolean,
    aimPitch = 0,
    knockedDown = false,
    swimming = false,
    /** forward acceleration m/s² — spine leans into bursts & braking */
    accel = 0,
    /** yaw rate rad/s — spine bends into turns */
    turnRate = 0
  ): void {
    // Dynamic spine lean: acceleration pushes forward/back, yaw bends sideways
    const leanTarget = THREE.MathUtils.clamp(accel * 0.016, -0.16, 0.2);
    this.leanSmooth += (leanTarget - this.leanSmooth) * Math.min(1, dt * 6);
    const turnTarget = THREE.MathUtils.clamp(turnRate * 0.05, -0.22, 0.22);
    this.turnSmooth += (turnTarget - this.turnSmooth) * Math.min(1, dt * 7);

    if (knockedDown) {
      this.hips.position.y = 0.18;
      this.hips.rotation.x = -Math.PI * 0.48;
      this.hips.rotation.y = 0;
      this.leftArm.rotation.set(0, 0, 0.65);
      this.rightArm.rotation.set(0, 0, -0.65);
      this.leftLeg.rotation.set(0, 0, -0.2);
      this.rightLeg.rotation.set(0, 0, 0.25);
      this.leftElbow.rotation.x = 0.4;
      this.rightElbow.rotation.x = 0.4;
      this.leftKnee.rotation.x = 0.3;
      this.rightKnee.rotation.x = 0.3;
      return;
    }

    this.hips.rotation.x = 0;
    const speedRatio = Math.min(1.4, moveSpeed / 5.5);

    if (swimming) {
      // Front-crawl swim: body horizontal, arms paddling, legs flutter-kicking
      this.walkPhase += dt * (moveSpeed > 0.3 ? 7.5 : 3.0);
      const paddle = Math.sin(this.walkPhase);
      this.hips.position.y = 0.55;
      this.hips.rotation.x = 0.85;
      this.torso.rotation.x = 0.35;
      this.torso.rotation.y = 0;
      this.head.rotation.x = -0.55;
      this.leftArm.rotation.x = -1.9 + paddle * 0.7;
      this.rightArm.rotation.x = -1.9 - paddle * 0.7;
      this.leftElbow.rotation.x = -0.5 - Math.max(0, paddle) * 0.5;
      this.rightElbow.rotation.x = -0.5 - Math.max(0, -paddle) * 0.5;
      this.leftLeg.rotation.x = 0.25 + Math.sin(this.walkPhase * 2) * 0.3;
      this.rightLeg.rotation.x = 0.25 - Math.sin(this.walkPhase * 2) * 0.3;
      this.leftKnee.rotation.x = 0.35;
      this.rightKnee.rotation.x = 0.35;
      this.leftArm.rotation.z = 0.35;
      this.rightArm.rotation.z = -0.35;
      return;
    }

    if (moveSpeed > 0.25 && isGrounded) {
      // Stride-locked gait: step frequency tracks ground speed so feet PLANT
      // instead of skating (a ~1.5 m stride per full leg cycle).
      const strideFreq =
        THREE.MathUtils.clamp(moveSpeed * 4.3, 3.4, 14.5) * (this.isFemale ? 1.07 : 1);
      this.walkPhase += dt * strideFreq;
      const gaitAmp = isSprinting ? 0.82 : 0.5; // ~47° sprint / ~29° walk leg sweep
      const ampScale = Math.min(1, 0.42 + speedRatio * 0.85);
      const swing = Math.sin(this.walkPhase) * gaitAmp * ampScale;
      const swingVel = Math.cos(this.walkPhase) * gaitAmp * ampScale;
      const bob = Math.abs(Math.cos(this.walkPhase)) * (isSprinting ? 0.065 : 0.032);
      // Females carry a distinct hip-led walk; males a shoulder-led stride
      const hipSwayMul = this.isFemale ? 2.1 : 1;
      const hipSway = Math.sin(this.walkPhase) * (isSprinting ? 0.05 : 0.03) * hipSwayMul;

      this.hips.position.y = this.baseHipY + bob;
      // Pelvis yaw counter-rotates against the shoulders (real cross-body gait)
      this.hips.rotation.y = swing * 0.12;
      this.hips.rotation.z = hipSway;
      this.leftLeg.rotation.x = swing;
      this.rightLeg.rotation.x = -swing;
      // Knees bend hardest as each leg lifts & swings through, straighten at plant
      this.leftKnee.rotation.x = Math.max(0.06, -swingVel * 0.85 + 0.12) + (isSprinting ? 0.18 : 0);
      this.rightKnee.rotation.x = Math.max(0.06, swingVel * 0.85 + 0.12) + (isSprinting ? 0.18 : 0);
      // Arms counter-swing against legs with living elbow bend
      const armMul = isSprinting ? 1.05 : this.isFemale ? 0.74 : 0.9;
      this.leftArm.rotation.x = -swing * armMul;
      this.rightArm.rotation.x = swing * armMul;
      this.leftElbow.rotation.x = -0.3 - Math.max(0, swing) * 0.55;
      this.rightElbow.rotation.x = -0.3 - Math.max(0, -swing) * 0.55;
      // Spine leans into bursts/braking and bends into turns (actor weight shift)
      this.torso.rotation.x = (isSprinting ? 0.17 : 0.05) + this.leanSmooth;
      this.torso.rotation.y = -swing * 0.18;
      this.torso.rotation.z = this.turnSmooth;
      this.head.rotation.x = -this.torso.rotation.x * 0.6 + Math.sin(this.walkPhase * 2) * 0.02;
      this.head.rotation.y = swing * 0.06 - this.turnSmooth * 0.5;
      this.leftArm.rotation.z = 0.06;
      this.rightArm.rotation.z = -0.06;
      this.leftArm.rotation.y = 0;
      this.rightArm.rotation.y = 0;
    } else if (!isGrounded) {
      this.hips.position.y = this.baseHipY + 0.02;
      this.hips.rotation.z = 0;
      this.hips.rotation.y = 0;
      this.leftLeg.rotation.x = 0.35;
      this.rightLeg.rotation.x = -0.28;
      this.leftKnee.rotation.x = 0.55;
      this.rightKnee.rotation.x = 0.4;
      this.leftArm.rotation.x = -0.45;
      this.rightArm.rotation.x = -0.35;
      this.leftElbow.rotation.x = -0.4;
      this.rightElbow.rotation.x = -0.4;
      this.torso.rotation.x = 0.08;
      this.head.rotation.x = 0;
      this.head.rotation.y = 0;
      this.leftArm.rotation.z = 0.06;
      this.rightArm.rotation.z = -0.06;
      this.leftArm.rotation.y = 0;
      this.rightArm.rotation.y = 0;
    } else {
      // Idle: breathing, weight shift & subtle arm sway (nobody stands like a statue)
      this.walkPhase += dt * 2.0;
      const breath = Math.sin(this.walkPhase) * 0.012;
      const weightShift = Math.sin(this.walkPhase * 0.45) * 0.035;
      this.hips.position.y = this.baseHipY + breath;
      this.hips.rotation.z = weightShift * (this.isFemale ? 0.8 : 0.5);
      this.hips.rotation.y = 0;
      this.leftLeg.rotation.x = THREE.MathUtils.lerp(this.leftLeg.rotation.x, weightShift * 0.35, dt * 10);
      this.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rightLeg.rotation.x, -weightShift * 0.35, dt * 10);
      this.leftKnee.rotation.x = THREE.MathUtils.lerp(this.leftKnee.rotation.x, 0.05, dt * 10);
      this.rightKnee.rotation.x = THREE.MathUtils.lerp(this.rightKnee.rotation.x, 0.05, dt * 10);
      this.leftArm.rotation.x = THREE.MathUtils.lerp(this.leftArm.rotation.x, weightShift * 0.3, dt * 8);
      this.rightArm.rotation.x = THREE.MathUtils.lerp(this.rightArm.rotation.x, -weightShift * 0.3, dt * 8);
      this.leftArm.rotation.z = 0.06 + Math.sin(this.walkPhase * 0.7) * 0.02;
      this.rightArm.rotation.z = -0.06 - Math.sin(this.walkPhase * 0.7 + 1.1) * 0.02;
      this.leftElbow.rotation.x = THREE.MathUtils.lerp(this.leftElbow.rotation.x, -0.14, dt * 10);
      this.rightElbow.rotation.x = THREE.MathUtils.lerp(this.rightElbow.rotation.x, -0.14, dt * 10);
      this.torso.rotation.x = THREE.MathUtils.lerp(this.torso.rotation.x, this.leanSmooth * 0.5, dt * 8);
      this.torso.rotation.y = THREE.MathUtils.lerp(this.torso.rotation.y, Math.sin(this.walkPhase * 0.45) * 0.03, dt * 6);
      this.torso.rotation.z = this.turnSmooth * 0.5;
      this.head.rotation.x = THREE.MathUtils.lerp(this.head.rotation.x, Math.sin(this.walkPhase) * 0.02, dt * 6);
      this.head.rotation.y = THREE.MathUtils.lerp(this.head.rotation.y, Math.sin(this.walkPhase * 0.32) * 0.14, dt * 3.2);
    }

    // Melee punch animation
    if (this.punchTimer > 0) {
      this.punchTimer = Math.max(0, this.punchTimer - dt);
      const p = Math.sin((this.punchTimer / 0.26) * Math.PI);
      this.rightArm.rotation.x = -1.65 * p;
      this.rightElbow.rotation.x = -0.1 * p;
      this.torso.rotation.y = 0.38 * p;
    }

    // Firearm recoil & GTA V two-handed aiming stance
    if (this.recoilTimer > 0) {
      this.recoilTimer = Math.max(0, this.recoilTimer - dt);
    }
    const armed = this.currentWeapon !== 'unarmed';
    if (armed && (isAiming || this.recoilTimer > 0)) {
      const kick = (this.recoilTimer / 0.11) * 0.22;
      const pitchOffset = THREE.MathUtils.clamp(aimPitch, -0.6, 0.6);
      this.rightArm.rotation.x = -Math.PI * 0.5 + pitchOffset - kick;
      this.rightArm.rotation.y = -0.08;
      this.rightElbow.rotation.x = -0.08;
      const twoHand =
        this.currentWeapon === 'rifle' ||
        this.currentWeapon === 'shotgun' ||
        this.currentWeapon === 'rpg';
      if (twoHand) {
        this.leftArm.rotation.x = -Math.PI * 0.48 + pitchOffset - kick * 0.8;
        this.leftArm.rotation.y = 0.45;
        this.leftElbow.rotation.x = -0.55;
      }
      this.torso.rotation.y = 0;
    }
  }
}
