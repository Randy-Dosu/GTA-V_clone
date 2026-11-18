import * as THREE from 'three';
import { WeaponId } from '../types';

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

  private skinMat: THREE.MeshStandardMaterial;
  private hairMat: THREE.MeshStandardMaterial;
  private topMat: THREE.MeshStandardMaterial;
  private subTopMat: THREE.MeshStandardMaterial;
  private pantsMat: THREE.MeshStandardMaterial;
  private shoeMat: THREE.MeshStandardMaterial;

  private weaponMeshes: Partial<Record<WeaponId, THREE.Object3D>> = {};
  private currentWeapon: WeaponId = 'unarmed';
  private walkPhase = Math.random() * Math.PI * 2;
  private punchTimer = 0;
  private recoilTimer = 0;

  constructor(colors: CharacterColors, withWeapons = false) {
    this.skinMat = new THREE.MeshStandardMaterial({ color: colors.skin, roughness: 0.65 });
    this.hairMat = new THREE.MeshStandardMaterial({ color: colors.hair, roughness: 0.8 });
    this.topMat = new THREE.MeshStandardMaterial({ color: colors.top, roughness: 0.72 });
    this.subTopMat = new THREE.MeshStandardMaterial({
      color: colors.secondaryTop ?? colors.top,
      roughness: 0.68,
    });
    this.pantsMat = new THREE.MeshStandardMaterial({ color: colors.pants, roughness: 0.82 });
    this.shoeMat = new THREE.MeshStandardMaterial({ color: colors.shoes, roughness: 0.6 });

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

    // Hips at 0.90m height (total standing character height ~1.82m)
    this.hips.position.y = 0.9;
    this.root.add(this.hips);

    // Pelvis belt block
    const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.24), this.pantsMat);
    this.hips.add(pelvis);

    // Torso (jacket/shirt + inner shirt front detail + collar)
    this.torso.position.y = 0.08;
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.54, 0.26), this.topMat);
    chest.position.y = 0.27;
    chest.castShadow = true;
    const innerShirt = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.46, 0.275), this.subTopMat);
    innerShirt.position.y = 0.28;
    this.torso.add(chest, innerShirt);

    if (colors.isPolice) {
      // Gold LSPD chest badge & utility belt
      const badge = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.08, 0.02),
        new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.8, roughness: 0.2 })
      );
      badge.position.set(-0.13, 0.4, 0.14);
      const belt = new THREE.Mesh(
        new THREE.BoxGeometry(0.45, 0.07, 0.265),
        new THREE.MeshStandardMaterial({ color: 0x111317, roughness: 0.4 })
      );
      belt.position.y = 0.02;
      this.torso.add(badge, belt);
    }

    this.hips.add(this.torso);

    // Head, neck, hair, aviators
    this.head.position.y = 0.56;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.12, 8), this.skinMat);
    neck.position.y = 0.04;
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.28, 0.26), this.skinMat);
    skull.position.y = 0.2;
    skull.castShadow = true;

    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.268, 0.11, 0.275), this.hairMat);
    hair.position.set(0, 0.31, -0.01);
    const hairBack = new THREE.Mesh(new THREE.BoxGeometry(0.265, 0.18, 0.08), this.hairMat);
    hairBack.position.set(0, 0.22, -0.11);
    this.head.add(neck, skull, hair, hairBack);

    if (colors.isPolice) {
      // LSPD peaked patrol cap
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.15, 0.09, 12), this.topMat);
      cap.position.y = 0.36;
      const visor = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.025, 0.14),
        new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2 })
      );
      visor.position.set(0, 0.32, 0.13);
      this.head.add(cap, visor);
    } else if (colors.hasSunglasses) {
      const shades = new THREE.Mesh(
        new THREE.BoxGeometry(0.23, 0.06, 0.04),
        new THREE.MeshStandardMaterial({ color: 0x111318, metalness: 0.8, roughness: 0.15 })
      );
      shades.position.set(0, 0.22, 0.13);
      this.head.add(shades);
    }

    this.torso.add(this.head);

    // Articulated Left & Right Arms (shoulder pivot)
    const buildArm = (side: -1 | 1): THREE.Group => {
      const arm = new THREE.Group();
      arm.position.set(side * 0.3, 0.49, 0);
      const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.28, 0.15), this.topMat);
      sleeve.position.y = -0.12;
      sleeve.castShadow = true;
      const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.28, 0.12), this.skinMat);
      forearm.position.y = -0.38;
      arm.add(sleeve, forearm);
      return arm;
    };

    // Local +Z is forward, +Y is up => character's left is +X, right is -X
    this.leftArm = buildArm(1);
    this.rightArm = buildArm(-1);
    this.handSocket.position.set(0, -0.5, 0.08);
    this.rightArm.add(this.handSocket);
    this.torso.add(this.leftArm, this.rightArm);

    // Articulated Left & Right Legs (hip pivot)
    const buildLeg = (side: -1 | 1): THREE.Group => {
      const leg = new THREE.Group();
      leg.position.set(side * 0.12, -0.04, 0);
      const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.74, 0.18), this.pantsMat);
      thigh.position.y = -0.38;
      thigh.castShadow = true;
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.175, 0.12, 0.27), this.shoeMat);
      shoe.position.set(0, -0.8, 0.045);
      leg.add(thigh, shoe);
      return leg;
    };

    this.leftLeg = buildLeg(1);
    this.rightLeg = buildLeg(-1);
    this.hips.add(this.leftLeg, this.rightLeg);

    if (withWeapons) {
      this.buildWeaponModels();
    }
  }

  public applyPalette(colors: CharacterColors): void {
    this.skinMat.color.setHex(colors.skin);
    this.hairMat.color.setHex(colors.hair);
    this.topMat.color.setHex(colors.top);
    this.subTopMat.color.setHex(colors.secondaryTop ?? colors.top);
    this.pantsMat.color.setHex(colors.pants);
    this.shoeMat.color.setHex(colors.shoes);
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
    knockedDown = false
  ): void {
    if (knockedDown) {
      this.hips.position.y = 0.18;
      this.hips.rotation.x = -Math.PI * 0.48;
      this.leftArm.rotation.set(0, 0, 0.65);
      this.rightArm.rotation.set(0, 0, -0.65);
      this.leftLeg.rotation.set(0, 0, -0.2);
      this.rightLeg.rotation.set(0, 0, 0.25);
      return;
    }

    this.hips.rotation.x = 0;
    const speedRatio = Math.min(1.4, moveSpeed / 5.5);

    if (moveSpeed > 0.25 && isGrounded) {
      const freq = isSprinting ? 12.5 : 8.5;
      this.walkPhase += dt * freq * Math.max(0.55, speedRatio);
      const swing = Math.sin(this.walkPhase) * (isSprinting ? 0.72 : 0.48) * Math.min(1, speedRatio);
      const bob = Math.abs(Math.cos(this.walkPhase)) * (isSprinting ? 0.055 : 0.03);

      this.hips.position.y = 0.9 + bob;
      this.leftLeg.rotation.x = swing;
      this.rightLeg.rotation.x = -swing;
      this.leftArm.rotation.x = -swing * 0.85;
      this.rightArm.rotation.x = swing * 0.85;
      this.torso.rotation.x = isSprinting ? 0.14 : 0.04;
      this.torso.rotation.y = -swing * 0.1;
    } else if (!isGrounded) {
      this.hips.position.y = 0.92;
      this.leftLeg.rotation.x = 0.35;
      this.rightLeg.rotation.x = -0.28;
      this.leftArm.rotation.x = -0.45;
      this.rightArm.rotation.x = -0.35;
      this.torso.rotation.x = 0.08;
    } else {
      // Subtle idle breathing
      this.walkPhase += dt * 2.0;
      const breath = Math.sin(this.walkPhase) * 0.012;
      this.hips.position.y = 0.9 + breath;
      this.leftLeg.rotation.x = THREE.MathUtils.lerp(this.leftLeg.rotation.x, 0, dt * 10);
      this.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rightLeg.rotation.x, 0, dt * 10);
      this.leftArm.rotation.x = THREE.MathUtils.lerp(this.leftArm.rotation.x, 0, dt * 10);
      this.rightArm.rotation.x = THREE.MathUtils.lerp(this.rightArm.rotation.x, 0, dt * 10);
      this.torso.rotation.x = THREE.MathUtils.lerp(this.torso.rotation.x, 0, dt * 8);
      this.torso.rotation.y = THREE.MathUtils.lerp(this.torso.rotation.y, 0, dt * 8);
    }

    this.leftArm.rotation.z = 0.06;
    this.rightArm.rotation.z = -0.06;
    this.leftArm.rotation.y = 0;
    this.rightArm.rotation.y = 0;

    // Melee punch animation
    if (this.punchTimer > 0) {
      this.punchTimer = Math.max(0, this.punchTimer - dt);
      const p = Math.sin((this.punchTimer / 0.26) * Math.PI);
      this.rightArm.rotation.x = -1.65 * p;
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
      const twoHand =
        this.currentWeapon === 'rifle' ||
        this.currentWeapon === 'shotgun' ||
        this.currentWeapon === 'rpg';
      if (twoHand) {
        this.leftArm.rotation.x = -Math.PI * 0.48 + pitchOffset - kick * 0.8;
        this.leftArm.rotation.y = 0.45;
      }
      this.torso.rotation.y = 0;
    }
  }
}
