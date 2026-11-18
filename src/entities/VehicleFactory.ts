import * as THREE from 'three';
import { VehicleKind, VEHICLE_SPECS } from '../types';
import { TextureFactory } from '../graphics/TextureFactory';

export interface BuiltVehicleRig {
  root: THREE.Group;
  bodyGroup: THREE.Group; // tilts for suspension roll & pitch!
  paintMat: THREE.MeshPhysicalMaterial;
  brakeMat: THREE.MeshBasicMaterial;
  headlightMat: THREE.MeshBasicMaterial;
  wheelMeshes: THREE.Object3D[];
  frontSteerPivots: THREE.Object3D[];
  sirenRedMat?: THREE.MeshBasicMaterial;
  sirenBlueMat?: THREE.MeshBasicMaterial;
  sirenLight?: THREE.PointLight;
  headlightBeam?: THREE.Mesh;
  mainRotor?: THREE.Object3D;
  tailRotor?: THREE.Object3D;
  neonMesh?: THREE.Mesh;
  neonMat?: THREE.MeshBasicMaterial;
}

export class VehicleFactory {
  private policeDoorTex: THREE.CanvasTexture;
  private plateTex: THREE.CanvasTexture;
  private taxiSignTex: THREE.CanvasTexture | null = null;

  private makeTaxiSignTex(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 112;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#f5b800';
    ctx.fillRect(0, 0, 256, 112);
    ctx.fillStyle = '#111111';
    ctx.font = '900 64px "Arial Black", Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TAXI', 128, 58);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  constructor(textures: TextureFactory) {
    this.policeDoorTex = textures.createPoliceDoorTexture();
    this.plateTex = textures.createSignTexture(
      '46EEK572',
      'SAN ANDREAS',
      '#f8fafc',
      '#1e3a8a',
      '#dc2626',
      256,
      96
    );
  }

  private createWheel(radius: number, width: number): THREE.Group {
    const g = new THREE.Group();
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x17181b, roughness: 0.85, metalness: 0.08 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xdbe2ea, roughness: 0.22, metalness: 0.88 });
    const hubMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.4, metalness: 0.5 });
    const discMat = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.35, metalness: 0.85 });

    const tire = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, width, 24).rotateZ(Math.PI / 2),
      tireMat
    );
    tire.castShadow = true;

    // Tire tread blocks around the circumference
    const treadGeo = new THREE.BoxGeometry(width * 0.92, radius * 0.07, radius * 0.16);
    const treadCount = 22;
    const treadInst = new THREE.InstancedMesh(treadGeo, tireMat, treadCount);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < treadCount; i++) {
      const a = (i / treadCount) * Math.PI * 2;
      dummy.position.set(0, Math.cos(a) * radius * 0.99, Math.sin(a) * radius * 0.99);
      dummy.rotation.set(a, 0, 0);
      dummy.updateMatrix();
      treadInst.setMatrixAt(i, dummy.matrix);
    }
    treadInst.instanceMatrix.needsUpdate = true;

    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.62, radius * 0.62, width + 0.02, 16).rotateZ(Math.PI / 2),
      rimMat
    );

    // Brake disc behind the rim
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.45, radius * 0.45, width * 0.4, 16).rotateZ(Math.PI / 2),
      discMat
    );

    // 5-spoke alloy rim so wheel rotation is visibly crisp
    for (let i = 0; i < 5; i++) {
      const spoke = new THREE.Mesh(
        new THREE.BoxGeometry(width + 0.035, radius * 0.62, radius * 0.13),
        rimMat
      );
      spoke.rotation.x = (i / 5) * Math.PI * 2;
      g.add(spoke);
    }
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.14, radius * 0.14, width + 0.04, 10).rotateZ(Math.PI / 2),
      hubMat
    );
    const caliper = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.025, radius * 0.35, radius * 0.35),
      hubMat
    );

    g.add(tire, treadInst, rim, disc, hub, caliper);
    return g;
  }

  /** Shared realistic car detailing: bumpers, skirts, handles, LED strips, plates, exhausts. */
  private addCarDetails(
    bodyGroup: THREE.Group,
    W: number,
    L: number,
    headY: number,
    headlightMat: THREE.MeshBasicMaterial,
    brakeMat: THREE.MeshBasicMaterial,
    paintMat: THREE.MeshPhysicalMaterial,
    trimMat: THREE.MeshStandardMaterial,
    chromeMat: THREE.MeshStandardMaterial
  ): void {
    // Front & rear bumpers
    for (const s of [1, -1]) {
      const bumper = new THREE.Mesh(new THREE.BoxGeometry(W * 0.98, 0.18, 0.22), paintMat);
      bumper.position.set(0, 0.34, s * L * 0.5);
      bodyGroup.add(bumper);
    }
    // Side skirts
    for (const sx of [-W * 0.49, W * 0.49]) {
      const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, L * 0.7), trimMat);
      skirt.position.set(sx, 0.3, 0);
      bodyGroup.add(skirt);
    }
    // Door handles
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.4, metalness: 0.6 });
    for (const sx of [-W * 0.505, W * 0.505]) {
      for (const hz of [-0.55, 0.35]) {
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.035, 0.22), handleMat);
        handle.position.set(sx, 0.78, hz);
        bodyGroup.add(handle);
      }
    }
    // LED daytime-running-light strips + full-width taillight bar
    const drlMat = new THREE.MeshBasicMaterial({ color: 0xfff6d8 });
    for (const sx of [-W * 0.36, W * 0.36]) {
      const drl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.035, 0.03), drlMat);
      drl.position.set(sx, headY + 0.1, L * 0.495);
      bodyGroup.add(drl);
    }
    const tailBar = new THREE.Mesh(new THREE.BoxGeometry(W * 0.8, 0.05, 0.03), brakeMat);
    tailBar.position.set(0, headY + 0.1, -L * 0.495);
    bodyGroup.add(tailBar);
    // Front license plate
    const plateF = new THREE.Mesh(
      new THREE.PlaneGeometry(0.52, 0.2),
      new THREE.MeshBasicMaterial({ map: this.plateTex })
    );
    plateF.position.set(0, 0.44, L * 0.505);
    bodyGroup.add(plateF);
    // Dual chrome exhaust tips
    for (const sx of [-0.32, 0.32]) {
      const tip = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.055, 0.18, 10).rotateX(Math.PI / 2),
        chromeMat
      );
      tip.position.set(sx, 0.28, -L * 0.5);
      bodyGroup.add(tip);
    }
  }

  public build(kind: VehicleKind, colorHex: number): BuiltVehicleRig {
    const spec = VEHICLE_SPECS[kind];
    const root = new THREE.Group();
    const bodyGroup = new THREE.Group();
    root.add(bodyGroup);

    // Showroom-gloss GTA V clearcoat automotive paint!
    const paintMat = new THREE.MeshPhysicalMaterial({
      color: colorHex,
      metalness: kind === 'supercar' || kind === 'muscle' ? 0.55 : 0.42,
      roughness: 0.2,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
    });

    const trimMat = new THREE.MeshStandardMaterial({ color: 0x181a1f, roughness: 0.55, metalness: 0.35 });
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xe5ebf2, roughness: 0.15, metalness: 0.92 });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x111a26,
      metalness: 0.25,
      roughness: 0.08,
      clearcoat: 1.0,
      transparent: true,
      opacity: 0.86,
    });

    const headlightMat = new THREE.MeshBasicMaterial({ color: 0xfef9e7 });
    const brakeMat = new THREE.MeshBasicMaterial({ color: 0x8a0f14 });

    // Optional LS Customs neon underglow plane
    const neonMat = new THREE.MeshBasicMaterial({
      color: 0xa855f7,
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const neonMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(spec.halfWidth * 2.3, spec.halfLength * 2.1).rotateX(-Math.PI / 2),
      neonMat
    );
    neonMesh.position.y = 0.05;
    root.add(neonMesh);

    const wheelMeshes: THREE.Object3D[] = [];
    const frontSteerPivots: THREE.Object3D[] = [];
    let sirenRedMat: THREE.MeshBasicMaterial | undefined;
    let sirenBlueMat: THREE.MeshBasicMaterial | undefined;
    let sirenLight: THREE.PointLight | undefined;
    let mainRotor: THREE.Object3D | undefined;
    let tailRotor: THREE.Object3D | undefined;
    let headlightBeam: THREE.Mesh | undefined;

    // Convention: Vehicle forward is +Z!
    if (kind === 'helicopter') {
      // Buckingham Maverick Helicopter
      const whiteAccent = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.3, metalness: 0.3 });

      // Landing skids
      for (const sx of [-1.05, 1.05]) {
        const skid = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.4, 8).rotateX(Math.PI / 2), trimMat);
        skid.position.set(sx, 0.1, 0.2);
        const strutF = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.75, 6), trimMat);
        strutF.position.set(sx * 0.82, 0.45, 1.0);
        strutF.rotation.z = sx > 0 ? 0.35 : -0.35;
        const strutR = strutF.clone();
        strutR.position.z = -0.65;
        bodyGroup.add(skid, strutF, strutR);
      }

      // Sculpted fuselage & glass cockpit nose
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.75, 1.45, 3.1), paintMat);
      cabin.position.set(0, 1.45, 0.25);
      cabin.castShadow = true;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.24, 3.12), whiteAccent);
      stripe.position.set(0, 1.32, 0.25);

      const nose = new THREE.Mesh(new THREE.SphereGeometry(0.88, 14, 12), glassMat);
      nose.scale.set(0.96, 0.82, 1.45);
      nose.position.set(0, 1.4, 1.72);

      const noseChin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.52, 1.15), paintMat);
      noseChin.position.set(0, 1.0, 1.85);

      // Turbine cowling on roof
      const turbine = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.48, 1.85), paintMat);
      turbine.position.set(0, 2.38, -0.1);

      // Tapered tail boom & vertical fin
      const tailBoom = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.42, 4.4, 10).rotateX(Math.PI / 2),
        paintMat
      );
      tailBoom.position.set(0, 1.68, -3.25);
      tailBoom.castShadow = true;

      const vFin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.55, 0.72), paintMat);
      vFin.position.set(0, 2.15, -5.25);
      vFin.rotation.x = -0.25;
      const hStab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.4), whiteAccent);
      hStab.position.set(0, 1.68, -4.4);

      // Searchlight / nose LED + navigation lights
      const spot = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), headlightMat);
      spot.position.set(0, 0.85, 2.45);
      const navTail = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), brakeMat);
      navTail.position.set(0, 2.9, -5.4);

      // Cockpit window frames + wire-strike cutters + pitot tube
      for (const sx of [-0.82, 0.82]) {
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.1, 0.07), trimMat);
        pillar.position.set(sx, 1.6, 1.9);
        pillar.rotation.x = 0.25;
        bodyGroup.add(pillar);
      }
      const cutterTop = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.06), chromeMat);
      cutterTop.position.set(0, 2.75, 1.1);
      cutterTop.rotation.x = 0.5;
      const cutterBot = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.06), chromeMat);
      cutterBot.position.set(0, 0.75, 2.2);
      cutterBot.rotation.x = -0.4;
      const pitot = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6).rotateX(Math.PI / 2), chromeMat);
      pitot.position.set(0.5, 1.2, 2.3);
      bodyGroup.add(cutterTop, cutterBot, pitot);
      // Red/green nav lights on skids
      const navRed = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), brakeMat);
      navRed.position.set(-1.05, 0.35, 1.6);
      const navGreen = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), headlightMat);
      navGreen.position.set(1.05, 0.35, 1.6);
      bodyGroup.add(navRed, navGreen);

      // Main 4-blade rotor assembly
      const mr = new THREE.Group();
      mr.position.set(0, 2.82, 0.15);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.45, 8), chromeMat);
      mast.position.y = -0.18;
      const blade1 = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.04, 0.28), trimMat);
      const blade2 = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 9.4), trimMat);
      const rotorDisc = new THREE.Mesh(
        new THREE.CircleGeometry(4.7, 28).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({
          color: 0x1e293b,
          transparent: true,
          opacity: 0.16,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      mr.add(mast, blade1, blade2, rotorDisc);
      mainRotor = mr;

      // Tail rotor
      const tr = new THREE.Group();
      tr.position.set(0.18, 2.25, -5.25);
      tr.add(
        new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.45, 0.14), trimMat),
        new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 1.45), trimMat)
      );
      tailRotor = tr;

      bodyGroup.add(cabin, stripe, nose, noseChin, turbine, tailBoom, vFin, hStab, spot, navTail, mr, tr);

      return {
        root,
        bodyGroup,
        paintMat,
        brakeMat,
        headlightMat,
        wheelMeshes,
        frontSteerPivots,
        mainRotor,
        tailRotor,
        neonMesh,
        neonMat,
      };
    }

    if (kind === 'bike') {
      // Pegassi Bati 801 Sportbike
      const r = spec.wheelRadius;
      const rearW = this.createWheel(r, 0.22);
      rearW.position.set(0, r, -0.78);
      wheelMeshes.push(rearW);
      bodyGroup.add(rearW);

      const frontPivot = new THREE.Group();
      frontPivot.position.set(0, r, 0.8);
      const frontW = this.createWheel(r, 0.18);
      frontPivot.add(frontW);
      frontSteerPivots.push(frontPivot);
      wheelMeshes.push(frontW);
      bodyGroup.add(frontPivot);

      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.45, 1.15), trimMat);
      frame.position.set(0, 0.58, 0);
      const fairing = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.42, 0.95), paintMat);
      fairing.position.set(0, 0.82, 0.35);
      fairing.rotation.x = 0.22;
      fairing.castShadow = true;
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.68), paintMat);
      tail.position.set(0, 0.88, -0.58);
      tail.rotation.x = 0.22;
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.52), trimMat);
      seat.position.set(0, 0.82, -0.2);
      const screen = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.28, 0.35), glassMat);
      screen.position.set(0, 1.06, 0.62);
      screen.rotation.x = -0.55;
      const bars = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.72, 6).rotateZ(Math.PI / 2), chromeMat);
      bars.position.set(0, 0.98, 0.48);
      const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.65, 8).rotateX(Math.PI / 2), chromeMat);
      exhaust.position.set(0.24, 0.52, -0.58);
      exhaust.rotation.x = -0.3;

      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.08), headlightMat);
      hl.position.set(0, 0.82, 0.84);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.09, 0.06), brakeMat);
      tl.position.set(0, 0.94, -0.92);

      // Front forks, swingarm, chain, mirrors & turn signals
      for (const sx of [-0.09, 0.09]) {
        const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.75, 6), chromeMat);
        fork.position.set(sx, 0.55, 0.72);
        fork.rotation.x = 0.35;
        bodyGroup.add(fork);
      }
      const swingarm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.7), trimMat);
      swingarm.position.set(0, 0.38, -0.55);
      const chain = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.75), trimMat);
      chain.position.set(0.16, 0.36, -0.55);
      bodyGroup.add(swingarm, chain);
      for (const sx of [-0.3, 0.3]) {
        const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.07, 0.03), trimMat);
        mirror.position.set(sx, 1.08, 0.5);
        const signal = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.05), brakeMat);
        signal.position.set(sx * 0.8, 0.72, 0.6);
        bodyGroup.add(mirror, signal);
      }
      const plateB = new THREE.Mesh(
        new THREE.PlaneGeometry(0.3, 0.12),
        new THREE.MeshBasicMaterial({ map: this.plateTex })
      );
      plateB.position.set(0, 0.72, -0.93);
      plateB.rotation.y = Math.PI;
      bodyGroup.add(plateB);

      bodyGroup.add(frame, fairing, tail, seat, screen, bars, exhaust, hl, tl);

      return {
        root,
        bodyGroup,
        paintMat,
        brakeMat,
        headlightMat,
        wheelMeshes,
        frontSteerPivots,
        neonMesh,
        neonMat,
      };
    }

    // 4-Wheeled Cars (Supercar, Muscle, SUV, Sedan, LSPD Police Cruiser)
    const wr = spec.wheelRadius;
    const wheelW = kind === 'supercar' ? 0.31 : kind === 'suv' ? 0.3 : 0.26;
    const trackX = spec.halfWidth - 0.06;
    const axleZ = spec.halfLength * 0.64;

    // 4 Wheels (front pair inside steer pivots)
    for (const sx of [-trackX, trackX]) {
      const fp = new THREE.Group();
      fp.position.set(sx, wr, axleZ);
      const fw = this.createWheel(wr, wheelW);
      fp.add(fw);
      root.add(fp);
      frontSteerPivots.push(fp);
      wheelMeshes.push(fw);

      const rw = this.createWheel(wr, wheelW);
      rw.position.set(sx, wr, -axleZ);
      root.add(rw);
      wheelMeshes.push(rw);
    }

    const W = spec.halfWidth * 2;
    const L = spec.halfLength * 2;

    // Dark aerodynamic underbody splitter/diffuser
    const underbody = new THREE.Mesh(new THREE.BoxGeometry(W * 0.98, 0.16, L * 1.01), trimMat);
    underbody.position.set(0, wr * 0.72, 0);
    bodyGroup.add(underbody);

    if (kind === 'supercar') {
      // Pegassi Zentorno — low-slung Italian exotic wedge supercar!
      const chassis = new THREE.Mesh(new THREE.BoxGeometry(W, 0.44, L * 0.96), paintMat);
      chassis.position.set(0, 0.5, 0);
      chassis.castShadow = true;
      chassis.receiveShadow = true;

      // Sloped wedge nose hood
      const nose = new THREE.Mesh(new THREE.BoxGeometry(W * 0.94, 0.28, L * 0.34), paintMat);
      nose.position.set(0, 0.56, L * 0.31);
      nose.rotation.x = 0.16;

      // Sculpted greenhouse cockpit + carbon rear louvers
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(W * 0.78, 0.44, L * 0.44), glassMat);
      cabin.position.set(0, 0.88, -0.05);
      const roofCap = new THREE.Mesh(new THREE.BoxGeometry(W * 0.74, 0.07, L * 0.26), trimMat);
      roofCap.position.set(0, 1.11, -0.1);

      // Sloped windshield
      const wind = new THREE.Mesh(new THREE.BoxGeometry(W * 0.76, 0.06, 0.95), glassMat);
      wind.position.set(0, 0.88, 0.82);
      wind.rotation.x = 0.46;

      // Side carbon air intakes
      for (const sx of [-W * 0.49, W * 0.49]) {
        const vent = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.95), trimMat);
        vent.position.set(sx, 0.55, -0.45);
        bodyGroup.add(vent);
      }

      // Rear GT wing & quad exhausts
      const wing = new THREE.Mesh(new THREE.BoxGeometry(W * 0.96, 0.06, 0.34), trimMat);
      wing.position.set(0, 0.98, -L * 0.44);
      for (const sx of [-0.55, 0.55]) {
        const strut = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.28, 0.22), trimMat);
        strut.position.set(sx, 0.82, -L * 0.43);
        bodyGroup.add(strut);
      }
      const exhaust = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.09, 0.22, 10).rotateX(Math.PI / 2),
        chromeMat
      );
      exhaust.position.set(0, 0.36, -L * 0.49);

      bodyGroup.add(chassis, nose, cabin, roofCap, wind, wing, exhaust);
    } else if (kind === 'muscle') {
      // Bravado Gauntlet — aggressive widebody American muscle car with dual racing stripes!
      const chassis = new THREE.Mesh(new THREE.BoxGeometry(W, 0.54, L * 0.98), paintMat);
      chassis.position.set(0, 0.58, 0);
      chassis.castShadow = true;
      chassis.receiveShadow = true;

      // Racing stripes down hood & roof
      const stripeMat = new THREE.MeshStandardMaterial({ color: 0xf4f6f9, roughness: 0.25 });
      for (const sx of [-0.22, 0.22]) {
        const st = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, L * 0.96), stripeMat);
        st.position.set(sx, 0.86, 0);
        bodyGroup.add(st);
      }

      // Supercharger hood scoop
      const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.14, 0.85), trimMat);
      scoop.position.set(0, 0.9, 0.95);

      const cabin = new THREE.Mesh(new THREE.BoxGeometry(W * 0.82, 0.46, L * 0.44), glassMat);
      cabin.position.set(0, 1.04, -0.22);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(W * 0.8, 0.08, L * 0.34), paintMat);
      roof.position.set(0, 1.28, -0.24);
      roof.castShadow = true;

      // Aggressive recessed muscle front grille & rear ducktail spoiler
      const grille = new THREE.Mesh(new THREE.BoxGeometry(W * 0.88, 0.26, 0.1), trimMat);
      grille.position.set(0, 0.58, L * 0.49);
      const ducktail = new THREE.Mesh(new THREE.BoxGeometry(W * 0.94, 0.14, 0.16), trimMat);
      ducktail.position.set(0, 0.9, -L * 0.47);

      bodyGroup.add(chassis, scoop, cabin, roof, grille, ducktail);
    } else if (kind === 'suv') {
      // Benefactor Dubsta — luxury boxy G-Wagon style SUV!
      const chassis = new THREE.Mesh(new THREE.BoxGeometry(W, 0.68, L * 0.97), paintMat);
      chassis.position.set(0, 0.76, 0);
      chassis.castShadow = true;
      chassis.receiveShadow = true;

      const cabinGlass = new THREE.Mesh(new THREE.BoxGeometry(W * 0.9, 0.66, L * 0.62), glassMat);
      cabinGlass.position.set(0, 1.4, -0.35);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(W * 0.92, 0.12, L * 0.64), paintMat);
      roof.position.set(0, 1.76, -0.35);
      roof.castShadow = true;

      // Front chrome bullbar & rear-mounted spare wheel!
      const grille = new THREE.Mesh(new THREE.BoxGeometry(W * 0.72, 0.36, 0.1), chromeMat);
      grille.position.set(0, 0.84, L * 0.49);
      const spare = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.42, 0.24, 16).rotateX(Math.PI / 2),
        paintMat
      );
      spare.position.set(0.28, 1.08, -L * 0.5);

      bodyGroup.add(chassis, cabinGlass, roof, grille, spare);
    } else if (kind === 'luxury') {
      // Benefactor Schafter — elegant chrome-trimmed luxury sedan!
      const chassis = new THREE.Mesh(new THREE.BoxGeometry(W, 0.52, L * 0.98), paintMat);
      chassis.position.set(0, 0.56, 0);
      chassis.castShadow = true;
      chassis.receiveShadow = true;

      const cabin = new THREE.Mesh(new THREE.BoxGeometry(W * 0.84, 0.46, L * 0.5), glassMat);
      cabin.position.set(0, 1.04, -0.1);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(W * 0.82, 0.09, L * 0.4), paintMat);
      roof.position.set(0, 1.3, -0.12);
      roof.castShadow = true;

      // Chrome grille, window trim & hood ornament
      const grille = new THREE.Mesh(new THREE.BoxGeometry(W * 0.6, 0.24, 0.08), chromeMat);
      grille.position.set(0, 0.56, L * 0.49);
      for (const sx of [-W * 0.43, W * 0.43]) {
        const trim = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, L * 0.48), chromeMat);
        trim.position.set(sx, 1.06, -0.1);
        bodyGroup.add(trim);
      }
      const ornament = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 6), chromeMat);
      ornament.position.set(0, 0.82, L * 0.44);
      bodyGroup.add(chassis, cabin, roof, grille, ornament);
    } else if (kind === 'vintage') {
      // Declasse Tornado — rounded 1960s classic with chrome bumpers & tail fins!
      const chassis = new THREE.Mesh(new THREE.BoxGeometry(W, 0.56, L * 0.98), paintMat);
      chassis.position.set(0, 0.58, 0);
      chassis.castShadow = true;
      chassis.receiveShadow = true;

      // Rounded greenhouse (scaled sphere reads as a classic hardtop)
      const cabin = new THREE.Mesh(new THREE.SphereGeometry(0.72, 16, 12), glassMat);
      cabin.scale.set(1.28, 0.62, 1.85);
      cabin.position.set(0, 1.08, -0.15);
      const roof = new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 12), paintMat);
      roof.scale.set(1.26, 0.5, 1.8);
      roof.position.set(0, 1.2, -0.15);
      roof.castShadow = true;

      // Big chrome bumpers + tail fins
      for (const s of [1, -1]) {
        const bumper = new THREE.Mesh(new THREE.BoxGeometry(W * 1.02, 0.16, 0.14), chromeMat);
        bumper.position.set(0, 0.36, s * L * 0.5);
        bodyGroup.add(bumper);
      }
      for (const sx of [-W * 0.46, W * 0.46]) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.7), paintMat);
        fin.position.set(sx, 0.82, -L * 0.38);
        fin.rotation.x = 0.2;
        bodyGroup.add(fin);
      }
      // White-wall tire rings
      const wallMat = new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.7 });
      const trackX = spec.halfWidth - 0.06;
      const axleZ = spec.halfLength * 0.64;
      for (const sx of [-trackX, trackX]) {
        for (const sz of [-axleZ, axleZ]) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(spec.wheelRadius * 0.72, 0.035, 6, 20), wallMat);
          ring.position.set(sx + Math.sign(sx) * 0.14, spec.wheelRadius, sz);
          ring.rotation.y = Math.PI / 2;
          bodyGroup.add(ring);
        }
      }
      bodyGroup.add(chassis, cabin, roof);
    } else if (kind === 'cab') {
      // Vapid Taxi — yellow service sedan with roof sign & checker stripe!
      const chassis = new THREE.Mesh(new THREE.BoxGeometry(W, 0.54, L * 0.98), paintMat);
      chassis.position.set(0, 0.58, 0);
      chassis.castShadow = true;
      chassis.receiveShadow = true;

      const cabin = new THREE.Mesh(new THREE.BoxGeometry(W * 0.84, 0.48, L * 0.48), glassMat);
      cabin.position.set(0, 1.06, -0.12);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(W * 0.82, 0.09, L * 0.38), paintMat);
      roof.position.set(0, 1.32, -0.14);
      roof.castShadow = true;

      // Checker stripe along both flanks
      const darkMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.5 });
      for (const sx of [-W * 0.505, W * 0.505]) {
        for (let i = 0; i < 8; i++) {
          const sq = new THREE.Mesh(
            new THREE.BoxGeometry(0.02, 0.09, 0.28),
            i % 2 === 0 ? darkMat : new THREE.MeshStandardMaterial({ color: 0xf4f6f9, roughness: 0.5 })
          );
          sq.position.set(sx, 0.52, -L * 0.4 + i * 0.28);
          bodyGroup.add(sq);
        }
      }

      // Illuminated TAXI roof sign
      const signTex = this.taxiSignTex ?? (this.taxiSignTex = this.makeTaxiSignTex());
      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(0.62, 0.28, 0.3),
        new THREE.MeshStandardMaterial({ map: signTex, emissive: 0xfff2b0, emissiveMap: signTex, emissiveIntensity: 0.7 })
      );
      sign.position.set(0, 1.52, -0.14);
      const signBase = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.24), trimMat);
      signBase.position.set(0, 1.39, -0.14);
      bodyGroup.add(chassis, cabin, roof, sign, signBase);
    } else {
      // Obey Tailgater (Sedan) OR Vapid LSPD Police Cruiser!
      const isPolice = kind === 'police';
      const chassis = new THREE.Mesh(new THREE.BoxGeometry(W, 0.54, L * 0.98), paintMat);
      chassis.position.set(0, 0.58, 0);
      chassis.castShadow = true;
      chassis.receiveShadow = true;

      const whiteRoofMat = isPolice
        ? new THREE.MeshPhysicalMaterial({ color: 0xf4f6f9, roughness: 0.22, clearcoat: 0.9 })
        : paintMat;

      const cabin = new THREE.Mesh(new THREE.BoxGeometry(W * 0.84, 0.48, L * 0.48), glassMat);
      cabin.position.set(0, 1.06, -0.12);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(W * 0.82, 0.09, L * 0.38), whiteRoofMat);
      roof.position.set(0, 1.32, -0.14);
      roof.castShadow = true;

      const grille = new THREE.Mesh(new THREE.BoxGeometry(W * 0.58, 0.26, 0.08), chromeMat);
      grille.position.set(0, 0.58, L * 0.49);

      bodyGroup.add(chassis, cabin, roof, grille);

      if (isPolice) {
        // Authentic white doors with LSPD shield & "OBEY & SURVIVE"
        const doorMat = new THREE.MeshStandardMaterial({ map: this.policeDoorTex, roughness: 0.3 });
        for (const sx of [-W * 0.505, W * 0.505]) {
          const door = new THREE.Mesh(new THREE.PlaneGeometry(L * 0.46, 0.5), doorMat);
          door.position.set(sx, 0.58, -0.05);
          door.rotation.y = sx > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
          bodyGroup.add(door);
        }

        // Front steel PIT push-bar bumper
        const pushBar = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.52, 0.22), trimMat);
        pushBar.position.set(0, 0.56, L * 0.52);
        bodyGroup.add(pushBar);

        // Rooftop LSPD red/blue flashing lightbar!
        const barCenter = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.22), chromeMat);
        barCenter.position.set(0, 1.44, -0.05);
        sirenRedMat = new THREE.MeshBasicMaterial({ color: 0xff1e26 });
        sirenBlueMat = new THREE.MeshBasicMaterial({ color: 0x1d7bff });
        const redPod = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.14, 0.22), sirenRedMat);
        redPod.position.set(-0.4, 1.44, -0.05);
        const bluePod = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.14, 0.22), sirenBlueMat);
        bluePod.position.set(0.4, 1.44, -0.05);
        sirenLight = new THREE.PointLight(0xff1e2d, 0, 22);
        sirenLight.position.set(0, 1.9, 0);
        bodyGroup.add(barCenter, redPod, bluePod, sirenLight);
      }
    }

    // Projected sunset/night headlight beam pool on road asphalt!
    const beamCanvas = document.createElement('canvas');
    beamCanvas.width = 128;
    beamCanvas.height = 256;
    const bctx = beamCanvas.getContext('2d')!;
    const bg = bctx.createLinearGradient(0, 256, 0, 0);
    bg.addColorStop(0, 'rgba(255, 246, 214, 0.42)');
    bg.addColorStop(0.55, 'rgba(255, 242, 200, 0.14)');
    bg.addColorStop(1, 'rgba(255, 242, 200, 0)');
    bctx.fillStyle = bg;
    bctx.beginPath();
    bctx.moveTo(28, 256);
    bctx.lineTo(100, 256);
    bctx.lineTo(126, 0);
    bctx.lineTo(2, 0);
    bctx.closePath();
    bctx.fill();
    const beamTex = new THREE.CanvasTexture(beamCanvas);
    headlightBeam = new THREE.Mesh(
      new THREE.PlaneGeometry(W * 2.1, 13.5).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        map: beamTex,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    headlightBeam.position.set(0, 0.05, L * 0.5 + 6.6);
    root.add(headlightBeam);

    // Side mirrors, crisp LED headlights, dynamic brake taillights & San Andreas license plate!
    const headY = kind === 'supercar' ? 0.52 : kind === 'suv' ? 0.84 : 0.62;
    for (const sx of [-W * 0.36, W * 0.36]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.14, 0.08), headlightMat);
      hl.position.set(sx, headY, L * 0.49);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.15, 0.08), brakeMat);
      tl.position.set(sx, headY + 0.05, -L * 0.49);
      bodyGroup.add(hl, tl);
    }

    for (const sx of [-W * 0.48, W * 0.48]) {
      const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.14), paintMat);
      mirror.position.set(sx, headY + 0.32, 0.45);
      bodyGroup.add(mirror);
    }

    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.52, 0.2),
      new THREE.MeshBasicMaterial({ map: this.plateTex })
    );
    plate.position.set(0, 0.44, -L * 0.495);
    plate.rotation.y = Math.PI;
    bodyGroup.add(plate);

    this.addCarDetails(bodyGroup, W, L, headY, headlightMat, brakeMat, paintMat, trimMat, chromeMat);

    return {
      root,
      bodyGroup,
      paintMat,
      brakeMat,
      headlightMat,
      wheelMeshes,
      frontSteerPivots,
      sirenRedMat,
      sirenBlueMat,
      sirenLight,
      headlightBeam,
      neonMesh,
      neonMat,
    };
  }
}
