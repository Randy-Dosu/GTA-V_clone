import * as THREE from 'three';
import { BuildingCollider, StuntRamp } from '../types';
import { TextureFactory } from '../graphics/TextureFactory';
import {
  ROAD_COORDS,
  ROAD_WIDTH,
  ROAD_HALF,
  SIDEWALK_Y,
  sampleBaseTerrainHeight,
} from './WorldData';

export interface MapFootprint {
  x: number;
  z: number;
  w: number;
  d: number;
  color: string;
}

export interface ExplodableProp {
  pos: THREE.Vector3;
  radius: number;
  exploded: boolean;
  mesh: THREE.Object3D;
}

export class CityBuilder {
  private scene: THREE.Scene;
  private textures: TextureFactory;

  public colliders: BuildingCollider[] = [];
  public footprints: MapFootprint[] = [];
  public explodables: ExplodableProp[] = [];

  private emissiveFacadeMats: THREE.MeshStandardMaterial[] = [];
  private nightLampMat!: THREE.MeshBasicMaterial;
  private ferrisWheelRotor: THREE.Group | null = null;
  private ferrisCabins: THREE.Object3D[] = [];
  private shopCoronas: THREE.Mesh[] = [];
  private beaconMat!: THREE.MeshBasicMaterial;
  private elapsed = 0;

  constructor(scene: THREE.Scene, textures: TextureFactory, ramps: StuntRamp[]) {
    this.scene = scene;
    this.textures = textures;

    this.nightLampMat = new THREE.MeshBasicMaterial({ color: 0xffe4b0 });
    this.beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2b2b });

    this.buildBaseGroundAndRoads();
    this.buildVinewoodHillsAndSign();
    this.buildVespucciBeachAndPier();
    this.buildDowntownAndDistricts();
    this.buildNYCInfill();
    this.buildInteractiveShops();
    this.buildStreetFurnitureAndPalms();
    this.buildNYCStreetLife();
    this.buildRooftopAndAlleyDetails();
    this.buildStuntRamps(ramps);
    this.buildDistantMountains();
  }

  private addBuildingBox(
    x: number,
    z: number,
    w: number,
    d: number,
    h: number,
    mat: THREE.Material,
    roofColor = 0x454952,
    baseY = SIDEWALK_Y,
    mapColor = '#4c535e',
    addCollider = true
  ): THREE.Mesh {
    const geo = new THREE.BoxGeometry(w, h, d);
    const roofMat = new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.88 });
    const mats = [mat, mat, roofMat, roofMat, mat, mat];
    const mesh = new THREE.Mesh(geo, mats);
    mesh.position.set(x, baseY + h * 0.5, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    if (addCollider) {
      this.colliders.push({
        minX: x - w * 0.5,
        maxX: x + w * 0.5,
        minZ: z - d * 0.5,
        maxZ: z + d * 0.5,
        minY: baseY,
        maxY: baseY + h,
      });
    }
    this.footprints.push({ x, z, w, d, color: mapColor });
    return mesh;
  }

  private makeSkyscraperMat(
    key: string,
    frame: string,
    top: string,
    bottom: string,
    cols = 8,
    rows = 16,
    metalness = 0.55,
    roughness = 0.24
  ): THREE.MeshStandardMaterial {
    const set = this.textures.getSkyscraperFacade(key, frame, top, bottom, cols, rows);
    const mat = new THREE.MeshStandardMaterial({
      map: set.map,
      emissive: new THREE.Color(0xffd9a0),
      emissiveMap: set.emissiveMap,
      emissiveIntensity: 0.12,
      bumpMap: set.bumpMap,
      bumpScale: 0.15,
      metalness,
      roughness,
    });
    this.emissiveFacadeMats.push(mat);
    return mat;
  }

  private makeBrownstoneMat(key: string, brick: string, trim: string, cols = 5, rows = 5): THREE.MeshStandardMaterial {
    const set = this.textures.getBrownstoneFacade(key, brick, trim, cols, rows);
    const mat = new THREE.MeshStandardMaterial({
      map: set.map,
      emissive: new THREE.Color(0xffd699),
      emissiveMap: set.emissiveMap,
      emissiveIntensity: 0.1,
      bumpMap: set.bumpMap,
      bumpScale: 0.12,
      roughness: 0.8,
      metalness: 0.05,
    });
    this.emissiveFacadeMats.push(mat);
    return mat;
  }

  private makeBodegaMat(key: string, wall: string, awning: string, sign: string): THREE.MeshStandardMaterial {
    const set = this.textures.getBodegaFacade(key, wall, awning, sign, 4, 3);
    const mat = new THREE.MeshStandardMaterial({
      map: set.map,
      emissive: new THREE.Color(0xffe9b8),
      emissiveMap: set.emissiveMap,
      emissiveIntensity: 0.35,
      bumpMap: set.bumpMap,
      bumpScale: 0.1,
      roughness: 0.75,
      metalness: 0.05,
    });
    this.emissiveFacadeMats.push(mat);
    return mat;
  }

  private makeMidriseMat(
    key: string,
    wall: string,
    trim: string,
    awning: string,
    cols = 6,
    rows = 5
  ): THREE.MeshStandardMaterial {
    const set = this.textures.getMidriseFacade(key, wall, trim, awning, cols, rows);
    const mat = new THREE.MeshStandardMaterial({
      map: set.map,
      emissive: new THREE.Color(0xffd699),
      emissiveMap: set.emissiveMap,
      emissiveIntensity: 0.1,
      bumpMap: set.bumpMap,
      bumpScale: 0.12,
      roughness: 0.72,
      metalness: 0.08,
    });
    this.emissiveFacadeMats.push(mat);
    return mat;
  }

  private buildBaseGroundAndRoads(): void {
    // Sub-city urban ground slab
    const cityUnder = new THREE.Mesh(
      new THREE.PlaneGeometry(540, 540).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({
        map: this.textures.sidewalk,
        roughness: 0.88,
        metalness: 0.02,
      })
    );
    cityUnder.position.set(12, -0.02, 12);
    cityUnder.receiveShadow = true;
    this.scene.add(cityUnder);

    // Raised concrete sidewalk blocks between all 5x5 streets + perimeter blocks
    const sidewalkMat = new THREE.MeshStandardMaterial({
      map: this.textures.sidewalk,
      roughness: 0.86,
      metalness: 0.03,
    });
    const blockCenters = [-165, -55, 55, 165];
    const blockSize = 110 - ROAD_WIDTH; // 88m

    for (const bx of blockCenters) {
      for (const bz of blockCenters) {
        const block = new THREE.Mesh(
          new THREE.BoxGeometry(blockSize, SIDEWALK_Y, blockSize),
          sidewalkMat
        );
        block.position.set(bx, SIDEWALK_Y * 0.5, bz);
        block.receiveShadow = true;
        this.scene.add(block);
      }
    }

    // Perimeter sidewalks (west beach strip, south port strip, east industrial strip)
    const westProm = new THREE.Mesh(new THREE.BoxGeometry(13, SIDEWALK_Y, 520), sidewalkMat);
    westProm.position.set(-237.5, SIDEWALK_Y * 0.5, 10);
    westProm.receiveShadow = true;
    this.scene.add(westProm);

    const southProm = new THREE.Mesh(new THREE.BoxGeometry(520, SIDEWALK_Y, 44), sidewalkMat);
    southProm.position.set(10, SIDEWALK_Y * 0.5, 253);
    southProm.receiveShadow = true;
    this.scene.add(southProm);

    const eastProm = new THREE.Mesh(new THREE.BoxGeometry(44, SIDEWALK_Y, 520), sidewalkMat);
    eastProm.position.set(253, SIDEWALK_Y * 0.5, 10);
    eastProm.receiveShadow = true;
    this.scene.add(eastProm);

    // Vinewood Blvd iconic Walk of Fame star strips (cleanly per block so intersections stay crisp)
    const walkTex = this.textures.vinewoodWalk;
    walkTex.repeat.set(12, 1);
    const walkMat = new THREE.MeshStandardMaterial({
      map: walkTex,
      roughness: 0.5,
      metalness: 0.15,
    });
    for (const bx of blockCenters) {
      const walkStrip = new THREE.Mesh(
        new THREE.PlaneGeometry(blockSize - 2, 4.2).rotateX(-Math.PI / 2),
        walkMat
      );
      walkStrip.position.set(bx, SIDEWALK_Y + 0.015, -206.8);
      walkStrip.receiveShadow = true;
      this.scene.add(walkStrip);
    }

    // North Vinewood Blvd curb sidewalks flanking Baytree Canyon Rd entrance
    for (const [nx, nw] of [
      [-128, 232],
      [142, 264],
    ]) {
      const nSide = new THREE.Mesh(new THREE.BoxGeometry(nw, SIDEWALK_Y, 12), sidewalkMat);
      nSide.position.set(nx, SIDEWALK_Y * 0.5, -237);
      nSide.receiveShadow = true;
      this.scene.add(nSide);
    }

    // Road asphalt materials
    const interMat = new THREE.MeshStandardMaterial({
      map: this.textures.roadIntersection,
      bumpMap: this.textures.roadBump,
      bumpScale: 0.04,
      roughness: 0.76,
      metalness: 0.06,
    });

    const nsTex = this.textures.roadNS;
    nsTex.repeat.set(1, 3);
    const nsMat = new THREE.MeshStandardMaterial({
      map: nsTex,
      bumpMap: this.textures.roadBump,
      bumpScale: 0.04,
      roughness: 0.76,
      metalness: 0.06,
    });

    const ewTex = this.textures.roadEW;
    ewTex.repeat.set(3, 1);
    const ewMat = new THREE.MeshStandardMaterial({
      map: ewTex,
      bumpMap: this.textures.roadBump,
      bumpScale: 0.04,
      roughness: 0.76,
      metalness: 0.06,
    });

    const interGeo = new THREE.PlaneGeometry(ROAD_WIDTH, ROAD_WIDTH).rotateX(-Math.PI / 2);
    const nsGeo = new THREE.PlaneGeometry(ROAD_WIDTH, blockSize).rotateX(-Math.PI / 2);
    const ewGeo = new THREE.PlaneGeometry(blockSize, ROAD_WIDTH).rotateX(-Math.PI / 2);

    // 25 Intersections
    for (const rx of ROAD_COORDS) {
      for (const rz of ROAD_COORDS) {
        const m = new THREE.Mesh(interGeo, interMat);
        m.position.set(rx, 0.01, rz);
        m.receiveShadow = true;
        this.scene.add(m);
      }
    }

    // North-South & East-West road segments
    for (const rx of ROAD_COORDS) {
      for (const bz of blockCenters) {
        const m = new THREE.Mesh(nsGeo, nsMat);
        m.position.set(rx, 0.01, bz);
        m.receiveShadow = true;
        this.scene.add(m);
      }
    }
    for (const rz of ROAD_COORDS) {
      for (const bx of blockCenters) {
        const m = new THREE.Mesh(ewGeo, ewMat);
        m.position.set(bx, 0.01, rz);
        m.receiveShadow = true;
        this.scene.add(m);
      }
    }
  }

  private buildVinewoodHillsAndSign(): void {
    // Sculpted Vinewood Hills terrain matching sampleBaseTerrainHeight exactly!
    const width = 680;
    const depth = 260;
    const segX = 96;
    const segZ = 56;
    const geo = new THREE.PlaneGeometry(width, depth, segX, segZ);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i);
      const lz = pos.getZ(i);
      const wx = lx - 20;
      const wz = lz - 362;
      const wy = sampleBaseTerrainHeight(wx, wz);
      pos.setY(i, wy - 0.04);
    }
    geo.computeVertexNormals();

    const hillMat = new THREE.MeshStandardMaterial({
      map: this.textures.hillGrass,
      roughness: 0.94,
      metalness: 0.0,
    });
    const hillMesh = new THREE.Mesh(geo, hillMat);
    hillMesh.position.set(-20, 0, -362);
    hillMesh.receiveShadow = true;
    this.scene.add(hillMesh);

    // Scenic Baytree Canyon Road ribbon climbing from (0, -231) to Observatory (0, -346)
    const roadSegs = 28;
    const roadGeo = new THREE.PlaneGeometry(18, 118, 2, roadSegs);
    roadGeo.rotateX(-Math.PI / 2);
    const rpos = roadGeo.attributes.position;
    for (let i = 0; i < rpos.count; i++) {
      const wx = rpos.getX(i);
      const wz = rpos.getZ(i) - 290;
      rpos.setY(i, sampleBaseTerrainHeight(wx, wz) + 0.06);
    }
    roadGeo.computeVertexNormals();
    const hillRoad = new THREE.Mesh(
      roadGeo,
      new THREE.MeshStandardMaterial({
        map: this.textures.roadNS,
        roughness: 0.78,
      })
    );
    hillRoad.position.set(0, 0, -290);
    hillRoad.receiveShadow = true;
    this.scene.add(hillRoad);

    // Galileo Observatory Plaza & iconic White Art-Deco Triple-Domed Observatory
    const plazaY = 28.0;
    const obsPlaza = new THREE.Mesh(
      new THREE.BoxGeometry(68, 0.5, 32),
      new THREE.MeshStandardMaterial({ map: this.textures.plazaTile, roughness: 0.8 })
    );
    obsPlaza.position.set(0, plazaY - 0.2, -356);
    obsPlaza.receiveShadow = true;
    this.scene.add(obsPlaza);

    // Low scenic stone balustrade along south edge of overlook (leaves opening for road & stunt jump)
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0xebe5d8, roughness: 0.72 });
    const copperDomeMat = new THREE.MeshStandardMaterial({
      color: 0x456e65,
      roughness: 0.42,
      metalness: 0.48,
    });

    // Observatory main white facade
    const obsMain = new THREE.Mesh(new THREE.BoxGeometry(34, 8.5, 11), stoneMat);
    obsMain.position.set(0, plazaY + 4.25, -366);
    obsMain.castShadow = true;
    obsMain.receiveShadow = true;
    this.scene.add(obsMain);
    this.colliders.push({
      minX: -17,
      maxX: 17,
      minZ: -371.5,
      maxZ: -360.5,
      minY: plazaY,
      maxY: plazaY + 14,
    });
    this.footprints.push({ x: 0, z: -366, w: 34, d: 11, color: '#cbd5e1' });

    // Central + twin flanking telescope domes
    const centerRotunda = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 6.5, 5, 20), stoneMat);
    centerRotunda.position.set(0, plazaY + 10.5, -366);
    const centerDome = new THREE.Mesh(
      new THREE.SphereGeometry(6.1, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
      copperDomeMat
    );
    centerDome.position.set(0, plazaY + 13, -366);
    this.scene.add(centerRotunda, centerDome);

    for (const sx of [-13.5, 13.5]) {
      const sideDrum = new THREE.Mesh(new THREE.CylinderGeometry(3.8, 4.0, 3.5, 16), stoneMat);
      sideDrum.position.set(sx, plazaY + 9.5, -365.5);
      const sideDome = new THREE.Mesh(
        new THREE.SphereGeometry(3.75, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
        copperDomeMat
      );
      sideDome.position.set(sx, plazaY + 11.2, -365.5);
      this.scene.add(sideDrum, sideDome);
    }

    // Obelisk monument on Observatory lawn (just like GTA V!)
    const obelisk = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 1.15, 11, 4), stoneMat);
    obelisk.position.set(-14, plazaY + 5.5, -350);
    obelisk.castShadow = true;
    this.scene.add(obelisk);

    // ICONIC 3D "VINEWOOD" SIGN perched proudly across Mount Lee / Vinewood Ridge!
    this.buildVinewoodSign();

    // Modern Vinewood Hills cantilevered stilt mansions with glowing turquoise infinity pools!
    const mansionSpots = [
      { x: -115, z: -305 },
      { x: -62, z: -292 },
      { x: 68, z: -298 },
      { x: 132, z: -312 },
      { x: -175, z: -288 },
    ];
    const whiteStucco = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.65 });
    const darkSteel = new THREE.MeshStandardMaterial({ color: 0x262b33, metalness: 0.6, roughness: 0.35 });
    const poolWater = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
    const warmWindow = new THREE.MeshStandardMaterial({
      color: 0x5c7a99,
      emissive: 0xffd28a,
      emissiveIntensity: 0.35,
      roughness: 0.15,
      metalness: 0.7,
    });
    this.emissiveFacadeMats.push(warmWindow);

    for (const ms of mansionSpots) {
      const gy = sampleBaseTerrainHeight(ms.x, ms.z);
      const g = new THREE.Group();
      g.position.set(ms.x, gy, ms.z);

      // Deck slab & support stilts on downslope
      const deck = new THREE.Mesh(new THREE.BoxGeometry(22, 0.8, 14), whiteStucco);
      deck.position.y = 4.5;
      g.add(deck);

      for (const px of [-9, 0, 9]) {
        const stilt = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 9, 8), darkSteel);
        stilt.position.set(px, 0, 5.5);
        g.add(stilt);
      }

      // Cantilevered modern glass & stucco upper wings
      const body = new THREE.Mesh(new THREE.BoxGeometry(18, 4.5, 8), whiteStucco);
      body.position.set(0, 7.1, -2);
      body.castShadow = true;
      const glassWall = new THREE.Mesh(new THREE.BoxGeometry(16, 3.4, 0.4), warmWindow);
      glassWall.position.set(0, 7.0, 2.05);
      const upper = new THREE.Mesh(new THREE.BoxGeometry(11, 3.8, 7.5), whiteStucco);
      upper.position.set(-3, 11.1, -2);
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(12, 3.6).rotateX(-Math.PI / 2), poolWater);
      pool.position.set(1, 4.95, 4.4);
      g.add(body, glassWall, upper, pool);
      this.scene.add(g);
      this.footprints.push({ x: ms.x, z: ms.z, w: 20, d: 12, color: '#6b7280' });
    }
  }

  private buildVinewoodSign(): void {
    // Crisp high-visibility 3D vector block letters "V I N E W O O D"
    const letters = ['V', 'I', 'N', 'E', 'W', 'O', 'O', 'D'];
    const letterMat = new THREE.MeshStandardMaterial({
      color: 0xfbfcfb,
      emissive: 0xfff3d6,
      emissiveIntensity: 0.28,
      roughness: 0.45,
    });
    this.emissiveFacadeMats.push(letterMat);

    const trussMat = new THREE.MeshStandardMaterial({ color: 0x454a52, metalness: 0.6, roughness: 0.5 });
    const spacing = 18.5;
    const startX = -((letters.length - 1) * spacing) * 0.5;
    const signZ = -402;

    const addBar = (
      parent: THREE.Group,
      x: number,
      y: number,
      w: number,
      h: number,
      rotZ = 0
    ) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 1.5), letterMat);
      m.position.set(x, y, 0);
      m.rotation.z = rotZ;
      parent.add(m);
    };

    letters.forEach((ch, idx) => {
      const wx = startX + idx * spacing;
      const gy = sampleBaseTerrainHeight(wx, signZ) + 3.5;
      const g = new THREE.Group();
      g.position.set(wx, gy, signZ);

      const H = 21;
      const T = 2.8;

      // Support steel struts behind each letter
      for (const sx of [-3.2, 3.2]) {
        const pole = new THREE.Mesh(new THREE.BoxGeometry(0.45, H + 5, 0.45), trussMat);
        pole.position.set(sx, H * 0.42, -1.0);
        g.add(pole);
      }

      switch (ch) {
        case 'V':
          addBar(g, -2.7, H * 0.5, T, H * 1.04, 0.26);
          addBar(g, 2.7, H * 0.5, T, H * 1.04, -0.26);
          break;
        case 'I':
          addBar(g, 0, H * 0.5, T * 1.15, H);
          break;
        case 'N':
          addBar(g, -4.6, H * 0.5, T, H);
          addBar(g, 4.6, H * 0.5, T, H);
          addBar(g, 0, H * 0.5, T * 0.92, H * 1.12, 0.46);
          break;
        case 'E':
          addBar(g, -4.2, H * 0.5, T, H);
          addBar(g, 0.4, H - T * 0.5, 10.5, T);
          addBar(g, -0.2, H * 0.5, 9.0, T * 0.92);
          addBar(g, 0.4, T * 0.5, 10.5, T);
          break;
        case 'W':
          addBar(g, -5.6, H * 0.5, T * 0.9, H, 0.14);
          addBar(g, -1.9, H * 0.36, T * 0.85, H * 0.72, -0.2);
          addBar(g, 1.9, H * 0.36, T * 0.85, H * 0.72, 0.2);
          addBar(g, 5.6, H * 0.5, T * 0.9, H, -0.14);
          break;
        case 'O':
          addBar(g, -4.5, H * 0.5, T, H);
          addBar(g, 4.5, H * 0.5, T, H);
          addBar(g, 0, H - T * 0.5, 11.2, T);
          addBar(g, 0, T * 0.5, 11.2, T);
          break;
        case 'D':
          addBar(g, -4.5, H * 0.5, T, H);
          addBar(g, 4.3, H * 0.5, T, H * 0.78);
          addBar(g, -0.4, H - T * 0.5, 9.6, T);
          addBar(g, -0.4, T * 0.5, 9.6, T);
          break;
      }

      this.scene.add(g);
    });
  }

  private buildVespucciBeachAndPier(): void {
    // Beachfront boardwalk along x = -249
    const walk = new THREE.Mesh(
      new THREE.BoxGeometry(10.5, SIDEWALK_Y, 540),
      new THREE.MeshStandardMaterial({ map: this.textures.sidewalk, roughness: 0.82 })
    );
    walk.position.set(-249, SIDEWALK_Y * 0.5, 10);
    walk.receiveShadow = true;
    this.scene.add(walk);

    // Golden Vespucci Beach sloping sand strip
    const sandGeo = new THREE.PlaneGeometry(76, 560, 14, 32);
    sandGeo.rotateX(-Math.PI / 2);
    const sp = sandGeo.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      const wx = sp.getX(i) - 291;
      const t = THREE.MathUtils.clamp((-253 - wx) / 59, 0, 1.35);
      sp.setY(i, THREE.MathUtils.lerp(SIDEWALK_Y, -0.32, Math.min(1, t)) - Math.max(0, t - 1) * 1.4);
    }
    sandGeo.computeVertexNormals();
    const sandMesh = new THREE.Mesh(
      sandGeo,
      new THREE.MeshStandardMaterial({ map: this.textures.sand, roughness: 0.92 })
    );
    sandMesh.position.set(-291, 0, 10);
    sandMesh.receiveShadow = true;
    this.scene.add(sandMesh);

    // Classic California Baby-Blue Lifeguard Towers + Colorful Beach Umbrellas
    const lgMat = new THREE.MeshStandardMaterial({ color: 0x7fc4dc, roughness: 0.65 });
    const lgRoofMat = new THREE.MeshStandardMaterial({ color: 0xf4f6f8, roughness: 0.6 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x735238, roughness: 0.85 });

    for (const lz of [-155, -55, 115, 225]) {
      const gx = -284;
      const gy = sampleBaseTerrainHeight(gx, lz);
      const lg = new THREE.Group();
      lg.position.set(gx, gy, lz);

      const base = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.6, 3.6), woodMat);
      base.position.y = 0.8;
      const hut = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.5, 3.0), lgMat);
      hut.position.y = 2.85;
      hut.castShadow = true;
      const roof = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.28, 3.8), lgRoofMat);
      roof.position.y = 4.2;
      roof.rotation.z = 0.12;
      const buoy = new THREE.Mesh(
        new THREE.BoxGeometry(0.25, 0.95, 0.35),
        new THREE.MeshStandardMaterial({ color: 0xe6392e })
      );
      buoy.position.set(1.8, 2.6, 0.8);
      lg.add(base, hut, roof, buoy);
      this.scene.add(lg);
    }

    // Beach umbrellas & sun loungers
    const umbrellaColors = [0xe63946, 0xf4a261, 0x2a9d8f, 0x3a86ff, 0xffbe0b];
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.5 });
    for (let i = 0; i < 22; i++) {
      const uz = -190 + i * 19;
      if (uz > 18 && uz < 64) continue; // skip pier
      if (uz > 164 && uz < 206) continue; // skip helipad
      const ux = -270 - (i % 3) * 8;
      const uy = sampleBaseTerrainHeight(ux, uz);
      const g = new THREE.Group();
      g.position.set(ux, uy, uz);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.5, 6), poleMat);
      pole.position.y = 1.25;
      const canopy = new THREE.Mesh(
        new THREE.ConeGeometry(1.75, 0.65, 8),
        new THREE.MeshStandardMaterial({
          color: umbrellaColors[i % umbrellaColors.length],
          roughness: 0.6,
        })
      );
      canopy.position.y = 2.5;
      canopy.castShadow = true;
      g.add(pole, canopy);
      this.scene.add(g);
    }

    // VESPUCCI HELIPAD at (-272, 185)
    const heliSlab = new THREE.Mesh(
      new THREE.BoxGeometry(28, 0.6, 28),
      new THREE.MeshStandardMaterial({ map: this.textures.helipad, roughness: 0.72 })
    );
    heliSlab.position.set(-272, -0.14, 185);
    heliSlab.receiveShadow = true;
    this.scene.add(heliSlab);
    // Corner yellow-green perimeter lights on helipad
    const heliLampMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    for (const cx of [-13, 13]) {
      for (const cz of [-13, 13]) {
        const l = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), heliLampMat);
        l.position.set(-272 + cx, 0.28, 185 + cz);
        this.scene.add(l);
      }
    }

    // DEL PERRO PIER (z = 40, x from -234 out to -396, deck height 3.2m)
    const plankMat = new THREE.MeshStandardMaterial({
      map: this.textures.boardwalk,
      roughness: 0.82,
    });

    // Seamless drivable entrance ramp (-234 to -266)
    const rampLen = Math.hypot(32, 3.2 - SIDEWALK_Y);
    const rampAngle = Math.atan2(3.2 - SIDEWALK_Y, 32);
    const pierRamp = new THREE.Mesh(new THREE.BoxGeometry(rampLen, 0.45, 24), plankMat);
    pierRamp.position.set(-250, (SIDEWALK_Y + 3.2) * 0.5 - 0.2, 40);
    pierRamp.rotation.z = -rampAngle;
    pierRamp.receiveShadow = true;
    this.scene.add(pierRamp);

    // Main Pier Deck (-266 to -396)
    const pierDeck = new THREE.Mesh(new THREE.BoxGeometry(130, 0.6, 24), plankMat);
    pierDeck.position.set(-331, 3.2 - 0.3, 40);
    pierDeck.castShadow = true;
    pierDeck.receiveShadow = true;
    this.scene.add(pierDeck);
    this.footprints.push({ x: -320, z: 40, w: 152, d: 24, color: '#7c6551' });

    // Wooden ocean pilings & side railings
    const pilingGeo = new THREE.CylinderGeometry(0.42, 0.46, 6.5, 8);
    for (let px = -268; px >= -392; px -= 12) {
      for (const pz of [29.5, 40, 50.5]) {
        const piling = new THREE.Mesh(pilingGeo, woodMat);
        piling.position.set(px, 0.0, pz);
        this.scene.add(piling);
      }
    }

    const railMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.55 });
    for (const rz of [28.3, 51.7]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(128, 0.9, 0.3), railMat);
      rail.position.set(-330, 3.65, rz);
      this.scene.add(rail);
    }

    // Iconic Del Perro Pier Entrance Arch Sign!
    const archSignTex = this.textures.createSignTexture(
      'DEL PERRO PIER',
      'PLEASURE PIER  •  EST. 1920',
      '#132847',
      '#fff4d2',
      '#f59e0b'
    );
    const archMat = new THREE.MeshStandardMaterial({
      map: archSignTex,
      emissive: 0xffd280,
      emissiveMap: archSignTex,
      emissiveIntensity: 0.45,
    });
    this.emissiveFacadeMats.push(archMat);
    for (const pz of [29, 51]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 9.5, 10), railMat);
      post.position.set(-266, 7.8, pz);
      this.scene.add(post);
    }
    const archBoard = new THREE.Mesh(new THREE.BoxGeometry(1.1, 3.8, 22.5), archMat);
    archBoard.position.set(-266, 11.4, 40);
    this.scene.add(archBoard);

    // ICONIC LEVIATHAN FERRIS WHEEL on Del Perro Pier (offset north of driving lane at z = 24.5)
    this.buildFerrisWheel(-338, 3.2, 24.5);
  }

  private buildFerrisWheel(x: number, y: number, z: number): void {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    const frameMat = new THREE.MeshStandardMaterial({ color: 0xf4f6f9, metalness: 0.5, roughness: 0.35 });
    const neonMat = new THREE.MeshBasicMaterial({ color: 0xf472b6 });
    const neonCyanMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });

    // A-frame support legs + ocean deck platform
    const platform = new THREE.Mesh(
      new THREE.BoxGeometry(36, 0.6, 10),
      new THREE.MeshStandardMaterial({ map: this.textures.boardwalk, roughness: 0.82 })
    );
    platform.position.set(0, -0.3, 0);
    group.add(platform);

    const centerH = 21;
    for (const sz of [-2.4, 2.4]) {
      const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.55, 24, 8), frameMat);
      legL.position.set(-6.5, centerH * 0.5, sz);
      legL.rotation.z = -0.28;
      const legR = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.55, 24, 8), frameMat);
      legR.position.set(6.5, centerH * 0.5, sz);
      legR.rotation.z = 0.28;
      group.add(legL, legR);
    }

    // Rotating wheel rotor
    const rotor = new THREE.Group();
    rotor.position.set(0, centerH, 0);
    const R = 17.5;

    for (const sz of [-1.6, 1.6]) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.32, 8, 36), frameMat);
      rim.position.z = sz;
      rotor.add(rim);

      const innerNeon = new THREE.Mesh(new THREE.TorusGeometry(R * 0.68, 0.16, 6, 28), neonCyanMat);
      innerNeon.position.z = sz;
      rotor.add(innerNeon);
    }

    const outerGlow = new THREE.Mesh(new THREE.TorusGeometry(R, 0.18, 6, 36), neonMat);
    rotor.add(outerGlow);

    const spokeCount = 12;
    const cabinColors = [0xef4444, 0xf59e0b, 0x10b981, 0x3b82f6, 0xec4899, 0xa855f7];
    for (let i = 0; i < spokeCount; i++) {
      const ang = (i / spokeCount) * Math.PI * 2;
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, R * 2, 6), neonMat);
      spoke.rotation.z = ang;
      if (i < spokeCount / 2) rotor.add(spoke);

      // Hanging gondola pivot (counter-rotates in update() so gondolas always stay upright!)
      const pivot = new THREE.Group();
      pivot.position.set(Math.cos(ang) * R, Math.sin(ang) * R, 0);
      const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(2.1, 2.2, 2.4),
        new THREE.MeshStandardMaterial({
          color: cabinColors[i % cabinColors.length],
          emissive: cabinColors[i % cabinColors.length],
          emissiveIntensity: 0.35,
          roughness: 0.4,
        })
      );
      cabin.position.y = -1.2;
      pivot.add(cabin);
      rotor.add(pivot);
      this.ferrisCabins.push(pivot);
    }

    group.add(rotor);
    this.ferrisWheelRotor = rotor;
    this.scene.add(group);
  }

  private buildDowntownAndDistricts(): void {
    // =========================================================================
    // 1. MAZE BANK TOWER — Block (-55, -55), Los Santos' Crown Jewel (146m tall!)
    // =========================================================================
    const mazeMat = this.makeSkyscraperMat(
      'maze_bank',
      '#d9d1c2',
      '#587085',
      '#2c3a47',
      10,
      24,
      0.42,
      0.32
    );

    // Landscaped podium plaza
    const podium = new THREE.Mesh(
      new THREE.BoxGeometry(62, 1.2, 62),
      new THREE.MeshStandardMaterial({ map: this.textures.plazaTile, roughness: 0.72 })
    );
    podium.position.set(-55, 0.6, -55);
    podium.receiveShadow = true;
    this.scene.add(podium);

    // Stepped octagonal/cylindrical tower silhouette (authentic US Bank / Maze Bank Tower!)
    const mazeLower = new THREE.Mesh(new THREE.CylinderGeometry(18, 20.5, 92, 12), mazeMat);
    mazeLower.position.set(-55, 46, -55);
    mazeLower.castShadow = true;
    mazeLower.receiveShadow = true;

    const mazeMid = new THREE.Mesh(new THREE.CylinderGeometry(14.8, 16.5, 34, 12), mazeMat);
    mazeMid.position.set(-55, 108, -55);
    mazeMid.castShadow = true;

    const mazeCrown = new THREE.Mesh(new THREE.CylinderGeometry(12.2, 13.5, 18, 16), mazeMat);
    mazeCrown.position.set(-55, 133, -55);
    mazeCrown.castShadow = true;

    // Illuminated glass crown ring + rooftop helipad!
    const crownGlow = new THREE.Mesh(
      new THREE.CylinderGeometry(12.4, 12.4, 3.2, 24),
      new THREE.MeshBasicMaterial({ color: 0xfff1cc })
    );
    crownGlow.position.set(-55, 141.5, -55);

    const roofPad = new THREE.Mesh(
      new THREE.CylinderGeometry(11.5, 11.5, 0.5, 24),
      new THREE.MeshStandardMaterial({ map: this.textures.helipad, roughness: 0.7 })
    );
    roofPad.position.set(-55, 143.2, -55);

    // Red aviation warning beacon
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.85, 8, 8), this.beaconMat);
    beacon.position.set(-55, 145.2, -44);

    // MAZE BANK sign bands on North & South faces
    const mazeSignTex = this.textures.createSignTexture(
      'MAZE BANK',
      '',
      '#ebe5d8',
      '#c81e2b',
      '#c81e2b',
      512,
      110
    );
    const mazeSignMat = new THREE.MeshStandardMaterial({
      map: mazeSignTex,
      emissive: 0xffcccc,
      emissiveMap: mazeSignTex,
      emissiveIntensity: 0.35,
    });
    for (const sz of [-13.6, 13.6]) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(14, 3.2, 0.5), mazeSignMat);
      s.position.set(-55, 124, -55 + sz);
      this.scene.add(s);
    }

    this.scene.add(mazeLower, mazeMid, mazeCrown, crownGlow, roofPad, beacon);
    this.colliders.push({
      minX: -72,
      maxX: -38,
      minZ: -72,
      maxZ: -38,
      minY: 0,
      maxY: 143.4,
      label: 'Maze Bank Tower',
    });
    this.footprints.push({ x: -55, z: -55, w: 36, d: 36, color: '#64748b' });

    // =========================================================================
    // 2. FIB & IAA TWIN TOWERS + PILLBOX HILL MEDICAL — Block (+55, -55)
    // =========================================================================
    const fibMat = this.makeSkyscraperMat('fib', '#1c2836', '#2a5785', '#12263d', 8, 22, 0.72, 0.16);
    const iaaMat = this.makeSkyscraperMat('iaa', '#2b3945', '#4b82a6', '#1f3e57', 8, 22, 0.68, 0.18);

    this.addBuildingBox(72, -72, 26, 26, 118, fibMat, 0x1e2630, SIDEWALK_Y, '#526071');
    this.addBuildingBox(36, -74, 24, 24, 108, iaaMat, 0x26323d, SIDEWALK_Y, '#526071');

    // FIB & IAA rooftop signs + spires
    const fibSign = this.textures.createSignTexture('FIB', '', '#121c29', '#dbeafe', '#3b82f6', 256, 96);
    const fibBoard = new THREE.Mesh(
      new THREE.BoxGeometry(12, 4, 0.5),
      new THREE.MeshBasicMaterial({ map: fibSign })
    );
    fibBoard.position.set(72, 114, -58.7);
    const spire = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.5, 22, 8),
      new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.8 })
    );
    spire.position.set(72, 129, -72);
    const spireBeacon = new THREE.Mesh(new THREE.SphereGeometry(0.65, 8, 8), this.beaconMat);
    spireBeacon.position.set(72, 140.2, -72);
    this.scene.add(fibBoard, spire, spireBeacon);

    // Pillbox Hill Medical Center (South half of block +55, -55)
    const hospMat = this.makeMidriseMat('hospital', '#e8e6e1', '#94a3b8', '#16a34a', 8, 6);
    this.addBuildingBox(52, -32, 44, 22, 34, hospMat, 0x64748b, SIDEWALK_Y, '#5b6b63');
    const hospSignTex = this.textures.createSignTexture(
      'PILLBOX HILL MEDICAL',
      '24H EMERGENCY TRAUMA CENTER',
      '#f8fafc',
      '#dc2626',
      '#16a34a'
    );
    const hospSign = new THREE.Mesh(
      new THREE.BoxGeometry(24, 4.2, 0.6),
      new THREE.MeshBasicMaterial({ map: hospSignTex })
    );
    hospSign.position.set(52, 31, -20.6);
    this.scene.add(hospSign);

    // =========================================================================
    // 3. NORTH FINANCIAL CORE — Blocks (-55, -165) & (+55, -165)
    // =========================================================================
    const bronzeGlass = this.makeSkyscraperMat('bronze', '#3b332b', '#877258', '#3d3126', 8, 18, 0.6, 0.22);
    const silverGlass = this.makeSkyscraperMat('silver', '#94a3b8', '#6893b8', '#334e68', 10, 20, 0.65, 0.2);
    const emeraldGlass = this.makeSkyscraperMat('emerald', '#243b38', '#3a7d73', '#193b36', 8, 16, 0.62, 0.2);

    // Union Depository & Arcadius Business Center
    this.addBuildingBox(-68, -152, 28, 28, 94, bronzeGlass, 0x3b3530, SIDEWALK_Y, '#58606d');
    this.addBuildingBox(-34, -172, 26, 26, 78, silverGlass, 0x475569, SIDEWALK_Y, '#58606d');
    this.addBuildingBox(-64, -184, 30, 18, 42, emeraldGlass, 0x334155, SIDEWALK_Y, '#4f5966');

    // Vinewood Oriental Theater & Downtown Vinewood Towers (+55, -165)
    const decoGold = this.makeMidriseMat('deco_gold', '#e8d7b7', '#b8860b', '#991b1b', 7, 5);
    this.addBuildingBox(38, -182, 34, 24, 28, decoGold, 0x785a32, SIDEWALK_Y, '#5c554c');
    this.addBuildingBox(74, -176, 26, 28, 66, emeraldGlass, 0x293b38, SIDEWALK_Y, '#525d69');
    this.addBuildingBox(54, -140, 52, 24, 54, silverGlass, 0x3f4d5e, SIDEWALK_Y, '#525d69');

    // =========================================================================
    // 4. LEGION SQUARE PARK — Block (-55, +55) — Lush GTA V Downtown Park!
    // =========================================================================
    const parkGrass = new THREE.Mesh(
      new THREE.BoxGeometry(72, 0.16, 72),
      new THREE.MeshStandardMaterial({ color: 0x4d8b46, roughness: 0.9 })
    );
    parkGrass.position.set(-55, SIDEWALK_Y + 0.08, 55);
    parkGrass.receiveShadow = true;
    this.scene.add(parkGrass);
    this.footprints.push({ x: -55, z: 55, w: 72, d: 72, color: '#2f5934' });

    // Cross stone walkways + central pool + iconic GTA V red modern art torus-knot sculpture!
    const pathMat = new THREE.MeshStandardMaterial({ map: this.textures.plazaTile, roughness: 0.78 });
    const path1 = new THREE.Mesh(new THREE.BoxGeometry(72, 0.2, 8), pathMat);
    path1.position.set(-55, SIDEWALK_Y + 0.1, 55);
    const path2 = new THREE.Mesh(new THREE.BoxGeometry(8, 0.2, 72), pathMat);
    path2.position.set(-55, SIDEWALK_Y + 0.1, 55);
    const fountain = new THREE.Mesh(
      new THREE.CylinderGeometry(8.5, 9, 0.7, 24),
      new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.15, metalness: 0.3 })
    );
    fountain.position.set(-55, SIDEWALK_Y + 0.35, 55);
    const redSculpture = new THREE.Mesh(
      new THREE.TorusKnotGeometry(3.2, 0.58, 64, 12),
      new THREE.MeshPhysicalMaterial({ color: 0xdc2626, roughness: 0.2, clearcoat: 0.9 })
    );
    redSculpture.position.set(-55, SIDEWALK_Y + 5.2, 55);
    redSculpture.castShadow = true;
    this.scene.add(path1, path2, fountain, redSculpture);

    // =========================================================================
    // 5. ROCKFORD HILLS & ECLIPSE TOWERS — Blocks (-165, -165) & (-165, -55)
    // =========================================================================
    const eclipseMat = this.makeSkyscraperMat('eclipse', '#e2e8f0', '#38bdf8', '#1d4ed8', 10, 20, 0.55, 0.18);
    this.addBuildingBox(-176, -172, 28, 22, 92, eclipseMat, 0xcbd5e1, SIDEWALK_Y, '#596575');
    this.addBuildingBox(-142, -158, 28, 22, 84, eclipseMat, 0xcbd5e1, SIDEWALK_Y, '#596575');
    const eclipseSign = this.textures.createSignTexture(
      'ECLIPSE TOWERS',
      'WEST VINEWOOD LUXURY RESIDENCES',
      '#0f172a',
      '#f8fafc',
      '#38bdf8'
    );
    const ecBoard = new THREE.Mesh(
      new THREE.BoxGeometry(22, 3.8, 0.5),
      new THREE.MeshBasicMaterial({ map: eclipseSign })
    );
    ecBoard.position.set(-142, 80, -146.6);
    this.scene.add(ecBoard);

    // Rockford Hills luxury shopping (Ponsonbys, Lifeinvader, Lombank West)
    const creamBoutique = this.makeMidriseMat('rockford1', '#f2eadc', '#c8b89d', '#1e293b', 6, 4);
    const terracottaMat = this.makeMidriseMat('rockford2', '#deb897', '#f5ebe0', '#9f1239', 6, 5);
    this.addBuildingBox(-142, -74, 32, 24, 22, creamBoutique, 0x8a7e6e, SIDEWALK_Y, '#585652');
    this.addBuildingBox(-184, -68, 24, 34, 72, silverGlass, 0x475569, SIDEWALK_Y, '#556170');
    this.addBuildingBox(-154, -34, 44, 22, 26, terracottaMat, 0x8c5a44, SIDEWALK_Y, '#59534e');

    const lifeSign = this.textures.createSignTexture(
      'LIFEINVADER',
      "IT'S NOT TECHNOLOGY, IT'S YOUR LIFE",
      '#dc2626',
      '#ffffff',
      '#fecaca'
    );
    const liBoard = new THREE.Mesh(
      new THREE.BoxGeometry(22, 4.5, 0.5),
      new THREE.MeshBasicMaterial({ map: lifeSign })
    );
    liBoard.position.set(-154, 28.5, -22.8);
    this.scene.add(liBoard);

    // =========================================================================
    // 6. VESPUCCI BEACHFRONT HOTELS & CONDOS — Blocks (-165, +55) & (-165, +165)
    // =========================================================================
    const pastelCoral = this.makeMidriseMat('vesp_coral', '#f2c6b6', '#ffffff', '#0284c7', 6, 5);
    const pastelMint = this.makeMidriseMat('vesp_mint', '#c8e6dc', '#ffffff', '#f97316', 6, 5);
    const pastelSand = this.makeMidriseMat('vesp_sand', '#f5e6c8', '#e2c792', '#0d9488', 7, 4);

    this.addBuildingBox(-184, 38, 22, 32, 26, pastelCoral, 0x94a3b8, SIDEWALK_Y, '#59575c');
    this.addBuildingBox(-184, 76, 22, 28, 22, pastelMint, 0x94a3b8, SIDEWALK_Y, '#59575c');
    this.addBuildingBox(-142, 56, 30, 56, 38, pastelSand, 0x78716c, SIDEWALK_Y, '#59575c');

    // Burger Shot on Vespucci South
    this.addBuildingBox(-182, 145, 24, 28, 16, pastelSand, 0x64748b, SIDEWALK_Y, '#555861');
    const burgerSign = this.textures.createSignTexture(
      'BURGER SHOT',
      'BLEEDER BURGER  •  DRIVE-THRU',
      '#1d4ed8',
      '#fde047',
      '#ef4444'
    );
    const bsBoard = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 4.2, 18),
      new THREE.MeshBasicMaterial({ map: burgerSign })
    );
    bsBoard.position.set(-194.3, 18.2, 145);
    this.scene.add(bsBoard);

    this.addBuildingBox(-144, 168, 34, 48, 34, pastelCoral, 0x64748b, SIDEWALK_Y, '#555861');
    this.addBuildingBox(-182, 185, 24, 24, 24, pastelMint, 0x64748b, SIDEWALK_Y, '#555861');

    // =========================================================================
    // 7. SOUTH LOS SANTOS, STRAWBERRY & EAST LS — Remaining City Blocks
    // =========================================================================
    const brickUrban = this.makeMidriseMat('brick', '#9c5644', '#d6ccc2', '#15803d', 6, 4);
    const modGrey = this.makeMidriseMat('modgrey', '#cbd5e1', '#475569', '#2563eb', 7, 5);
    const industrialMat = this.makeMidriseMat('indus', '#8d969f', '#374151', '#d97706', 5, 3);

    // Block (-55, +165) — South Pillbox / La Puerta Lofts
    this.addBuildingBox(-72, 152, 28, 42, 44, modGrey, 0x475569, SIDEWALK_Y, '#525864');
    this.addBuildingBox(-35, 174, 30, 34, 30, brickUrban, 0x57534e, SIDEWALK_Y, '#525864');

    // Block (+55, +165) — Strawberry Avenue (Franklin's neighborhood + 24/7 Supermarket)
    this.addBuildingBox(38, 144, 30, 22, 14, creamBoutique, 0x64748b, SIDEWALK_Y, '#525864');
    const s247 = this.textures.createSignTexture(
      '24/7 SUPERMARKET',
      'OPEN ALL DAY  •  STRAWBERRY',
      '#15803d',
      '#ffffff',
      '#f97316'
    );
    const s247Board = new THREE.Mesh(
      new THREE.BoxGeometry(22, 3.6, 0.5),
      new THREE.MeshBasicMaterial({ map: s247 })
    );
    s247Board.position.set(38, 15.8, 132.7);
    this.scene.add(s247Board);

    this.addBuildingBox(74, 165, 28, 52, 22, brickUrban, 0x57534e, SIDEWALK_Y, '#525864');
    this.addBuildingBox(36, 184, 28, 24, 18, pastelSand, 0x64748b, SIDEWALK_Y, '#525864');

    // East LS Blocks (+165, -165), (+165, -55), (+165, +55), (+165, +165)
    // Mirror Park & Vinewood East (+165, -165)
    this.addBuildingBox(152, -172, 36, 30, 36, modGrey, 0x475569, SIDEWALK_Y, '#525864');
    this.addBuildingBox(186, -148, 24, 42, 28, terracottaMat, 0x6b5344, SIDEWALK_Y, '#525864');

    // Downtown East Towers (+165, -55) + Giant SPRUNK Billboard!
    this.addBuildingBox(148, -62, 34, 48, 58, bronzeGlass, 0x3b3530, SIDEWALK_Y, '#545d6a');
    this.addBuildingBox(186, -48, 22, 46, 34, brickUrban, 0x4b4642, SIDEWALK_Y, '#545d6a');
    const sprunkSign = this.textures.createSignTexture(
      'SPRUNK',
      'THE ESSENCE OF LIFE',
      '#16a34a',
      '#faff00',
      '#ffffff'
    );
    const sprunkBoard = new THREE.Mesh(
      new THREE.BoxGeometry(24, 6, 0.6),
      new THREE.MeshBasicMaterial({ map: sprunkSign })
    );
    sprunkBoard.position.set(148, 61.5, -37.8);
    this.scene.add(sprunkBoard);

    // Block (+165, +55) — Simeon's Premium Deluxe Motorsport + East Commercial
    this.addBuildingBox(178, 44, 30, 38, 24, modGrey, 0x475569, SIDEWALK_Y, '#525864');

    // Block (+165, +165) — La Mesa Industrial Warehouses (Trevor's turf)
    this.addBuildingBox(175, 152, 44, 28, 15, industrialMat, 0x4b5563, SIDEWALK_Y, '#4d535c');
    this.addBuildingBox(172, 186, 48, 22, 18, brickUrban, 0x4b5563, SIDEWALK_Y, '#4d535c');
  }

  /**
   * NYC-style infill: brownstone row houses, bodega storefronts, rooftop water
   * towers and fire escapes that fill the gaps between the landmark blocks so
   * the city reads as a dense, lived-in community. All placements avoid the
   * protagonist spawns and shop doorways.
   */
  private buildNYCInfill(): void {
    const brown1 = this.makeBrownstoneMat('nyc_brown_red', '#8a4a3a', '#d8cfc0', 5, 5);
    const brown2 = this.makeBrownstoneMat('nyc_brown_dark', '#6e3f33', '#c9bda8', 5, 4);
    const brown3 = this.makeBrownstoneMat('nyc_brown_tan', '#9c6b4f', '#e2d8c8', 4, 5);
    const bodega1 = this.makeBodegaMat('nyc_bodega_green', '#7a6a55', '#15803d', '#14532d');
    const bodega2 = this.makeBodegaMat('nyc_bodega_red', '#8d7b68', '#b91c1c', '#7f1d1d');

    // [x, z, w, d, h, material, roofColor, mapColor]
    const infill: Array<[number, number, number, number, number, THREE.Material, number, string]> = [
      [20, -50, 18, 24, 22, brown1, 0x4a3a30, '#5c4a42'],      // Pillbox west strip
      [-30, -135, 24, 20, 14, bodega1, 0x4b5563, '#4f5a52'],   // Financial SE bodega
      [19, -135, 14, 26, 24, brown2, 0x3f3630, '#554e48'],     // Vinewood west brownstone
      [-200, -140, 16, 30, 22, brown3, 0x5a4a3a, '#5c554c'],   // Eclipse SW brownstone
      [-165, -92, 30, 12, 12, bodega2, 0x4b5563, '#585652'],    // Rockford north bodega
      [-165, 16, 24, 10, 18, brown1, 0x4a3a30, '#59575c'],     // Vespucci north brownstone
      [-165, 126, 30, 10, 18, brown2, 0x3f3630, '#555861'],    // Vespucci south brownstone
      [-93, 160, 12, 36, 22, brown3, 0x5a4a3a, '#525864'],     // South Pillbox west brownstone
      [16, 165, 10, 40, 20, brown1, 0x4a3a30, '#525864'],      // Strawberry west brownstone
      [127, -165, 12, 36, 22, brown2, 0x3f3630, '#525864'],    // Mirror Park west brownstone
      [170, -92, 30, 12, 13, bodega1, 0x4b5563, '#545d6a'],    // Downtown East bodega
      [135, 55, 24, 40, 24, brown3, 0x5a4a3a, '#525864'],      // East Commercial brownstone
      [140, 128, 20, 14, 18, brown1, 0x4a3a30, '#4d535c'],     // La Mesa north brownstone
    ];

    for (const [x, z, w, d, h, mat, roof, mapColor] of infill) {
      this.addBuildingBox(x, z, w, d, h, mat, roof, SIDEWALK_Y, mapColor);
    }

    // Iconic NYC rooftop water towers on select mid-rise roofs
    const tankMat = new THREE.MeshStandardMaterial({ color: 0x8a6b4a, roughness: 0.85 });
    const coneMat = new THREE.MeshStandardMaterial({ color: 0x5c4a34, roughness: 0.8 });
    const legMat = new THREE.MeshStandardMaterial({ color: 0x3a3f45, metalness: 0.6, roughness: 0.5 });
    const towerSpots: Array<[number, number, number]> = [
      [-142, -74, 22],   // Rockford boutique roof
      [-154, -34, 26],   // Terracotta roof
      [-184, 38, 26],    // Vespucci coral roof
      [74, 165, 22],     // Strawberry brick roof
      [148, -62, 58],    // Downtown East bronze roof
      [52, -32, 34],     // Hospital roof
      [38, -182, 28],    // Deco theater roof
      [-35, 174, 30],    // South Pillbox brick roof
    ];
    for (const [x, z, roofY] of towerSpots) {
      const g = new THREE.Group();
      g.position.set(x, SIDEWALK_Y + roofY, z);
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.4, 4.2, 12), tankMat);
      tank.position.y = 4.6;
      tank.castShadow = true;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.8, 12), coneMat);
      cone.position.y = 7.6;
      g.add(tank, cone);
      for (const [lx, lz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]] as const) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.8, 6), legMat);
        leg.position.set(lx, 1.4, lz);
        g.add(leg);
      }
      this.scene.add(g);
    }

    // Fire escapes on the brownstone fronts (platforms + railings + stairs)
    const fireMat = new THREE.MeshStandardMaterial({ color: 0x2f3338, metalness: 0.7, roughness: 0.45 });
    const fireSpots: Array<{ x: number; z: number; w: number; h: number; rotY: number }> = [
      { x: 20, z: -37.8, w: 18, h: 22, rotY: 0 },       // faces +Z (south)
      { x: -200, z: -124.8, w: 16, h: 22, rotY: Math.PI }, // faces -Z (north)
      { x: -93, z: 142.2, w: 12, h: 22, rotY: Math.PI },   // faces -Z
      { x: 16, z: 185.2, w: 10, h: 20, rotY: 0 },          // faces +Z
      { x: 127, z: -183.2, w: 12, h: 22, rotY: 0 },        // faces +Z
      { x: 135, z: 75.2, w: 24, h: 24, rotY: 0 },          // faces +Z
    ];
    for (const fs of fireSpots) {
      const g = new THREE.Group();
      g.position.set(fs.x, SIDEWALK_Y, fs.z);
      g.rotation.y = fs.rotY;
      const floors = Math.floor(fs.h / 5.5);
      for (let f = 1; f <= floors; f++) {
        const y = f * 5.2;
        const platform = new THREE.Mesh(new THREE.BoxGeometry(fs.w * 0.8, 0.18, 1.4), fireMat);
        platform.position.set(0, y, 0.7);
        g.add(platform);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(fs.w * 0.8, 0.7, 0.06), fireMat);
        rail.position.set(0, y + 0.5, 1.35);
        g.add(rail);
        for (const sx of [-fs.w * 0.4, fs.w * 0.4]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 0.08), fireMat);
          post.position.set(sx, y + 0.5, 1.35);
          g.add(post);
        }
        // Diagonal stair to next platform
        if (f < floors) {
          const stair = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 5.4), fireMat);
          stair.position.set(f % 2 === 0 ? -fs.w * 0.2 : fs.w * 0.2, y + 2.6, 0.7);
          stair.rotation.x = 0.85;
          g.add(stair);
        }
      }
      this.scene.add(g);
    }
  }

  /**
   * Lived-in NYC street life: deciduous street trees, benches, trash cans,
   * planters, bike racks, newspaper boxes, subway entrances, traffic cones
   * and construction barriers along the sidewalks.
   */
  private buildNYCStreetLife(): void {
    const dummy = new THREE.Object3D();

    // ── Deciduous street trees (instanced trunk + canopy) ──────────────────
    const treeSpots: Array<{ x: number; z: number; s: number }> = [];
    for (const r of ROAD_COORDS) {
      for (const mid of [-165, -55, 55, 165]) {
        if (Math.random() < 0.75) treeSpots.push({ x: r + 13.4, z: mid + 18, s: 0.9 + Math.random() * 0.35 });
        if (Math.random() < 0.75) treeSpots.push({ x: mid - 18, z: r - 13.4, s: 0.9 + Math.random() * 0.35 });
      }
    }
    // Legion Square park trees
    for (const [px, pz] of [[-80, 30], [-30, 30], [-80, 80], [-30, 80], [-55, 22], [-55, 88]] as const) {
      treeSpots.push({ x: px, z: pz, s: 1.1 });
    }

    const trunkGeo = new THREE.CylinderGeometry(0.14, 0.22, 3.2, 7);
    trunkGeo.translate(0, 1.6, 0);
    const canopyGeo = new THREE.SphereGeometry(1.9, 10, 8);
    canopyGeo.translate(0, 4.4, 0);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.9 });
    const canopyMat = new THREE.MeshStandardMaterial({ color: 0x4a7c3a, roughness: 0.85 });
    const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, treeSpots.length);
    const canopyInst = new THREE.InstancedMesh(canopyGeo, canopyMat, treeSpots.length);
    trunkInst.castShadow = true;
    canopyInst.castShadow = true;
    treeSpots.forEach((t, i) => {
      const gy = sampleBaseTerrainHeight(t.x, t.z);
      dummy.position.set(t.x, gy, t.z);
      dummy.rotation.set(0, i * 1.7, 0);
      dummy.scale.setScalar(t.s);
      dummy.updateMatrix();
      trunkInst.setMatrixAt(i, dummy.matrix);
      // Second offset canopy blob for fuller crown
      dummy.position.y = gy + 0.9 * t.s;
      dummy.updateMatrix();
      canopyInst.setMatrixAt(i, dummy.matrix);
    });
    this.scene.add(trunkInst, canopyInst);

    // ── Benches, trash cans, planters, newspaper boxes (instanced) ─────────
    const benchMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.8 });
    const benchGeo = new THREE.BoxGeometry(1.9, 0.12, 0.55);
    benchGeo.translate(0, 0.45, 0);
    const benchSpots: Array<[number, number, number]> = [];
    for (const r of ROAD_COORDS) {
      for (const mid of [-165, -55, 55, 165]) {
        benchSpots.push([r + 13.2, mid - 8, Math.PI / 2]);
        benchSpots.push([mid + 8, r + 13.2, 0]);
      }
    }
    const benchInst = new THREE.InstancedMesh(benchGeo, benchMat, benchSpots.length);
    benchInst.castShadow = true;
    benchSpots.forEach(([x, z, rotY], i) => {
      dummy.position.set(x, SIDEWALK_Y, z);
      dummy.rotation.set(0, rotY, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      benchInst.setMatrixAt(i, dummy.matrix);
    });
    this.scene.add(benchInst);

    const canMat = new THREE.MeshStandardMaterial({ color: 0x2f5d3a, roughness: 0.6, metalness: 0.4 });
    const canGeo = new THREE.CylinderGeometry(0.34, 0.3, 0.95, 10);
    canGeo.translate(0, 0.48, 0);
    const canSpots: Array<[number, number]> = [];
    for (const r of ROAD_COORDS) {
      for (const mid of [-165, -55, 55, 165]) {
        canSpots.push([r + 12.6, mid + 6]);
        canSpots.push([mid - 6, r + 12.6]);
      }
    }
    const canInst = new THREE.InstancedMesh(canGeo, canMat, canSpots.length);
    canInst.castShadow = true;
    canSpots.forEach(([x, z], i) => {
      dummy.position.set(x, SIDEWALK_Y, z);
      dummy.rotation.set(0, i, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      canInst.setMatrixAt(i, dummy.matrix);
    });
    this.scene.add(canInst);

    const planterMat = new THREE.MeshStandardMaterial({ color: 0x8a8578, roughness: 0.85 });
    const planterGeo = new THREE.BoxGeometry(1.6, 0.55, 0.7);
    planterGeo.translate(0, 0.28, 0);
    const planterTopGeo = new THREE.BoxGeometry(1.5, 0.22, 0.6);
    planterTopGeo.translate(0, 0.66, 0);
    const planterTopMat = new THREE.MeshStandardMaterial({ color: 0x3f7a38, roughness: 0.9 });
    const planterSpots: Array<[number, number, number]> = [];
    for (const r of ROAD_COORDS) {
      for (const mid of [-165, -55, 55, 165]) {
        planterSpots.push([r + 13.6, mid + 26, Math.PI / 2]);
        planterSpots.push([mid - 26, r + 13.6, 0]);
      }
    }
    const planterInst = new THREE.InstancedMesh(planterGeo, planterMat, planterSpots.length);
    const planterTopInst = new THREE.InstancedMesh(planterTopGeo, planterTopMat, planterSpots.length);
    planterSpots.forEach(([x, z, rotY], i) => {
      dummy.position.set(x, SIDEWALK_Y, z);
      dummy.rotation.set(0, rotY, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      planterInst.setMatrixAt(i, dummy.matrix);
      planterTopInst.setMatrixAt(i, dummy.matrix);
    });
    this.scene.add(planterInst, planterTopInst);

    // Newspaper vending boxes (colorful, NYC sidewalk staple)
    const newsColors = [0xdc2626, 0x2563eb, 0xf59e0b, 0x16a34a, 0x7c3aed];
    const newsGeo = new THREE.BoxGeometry(0.55, 0.95, 0.5);
    newsGeo.translate(0, 0.48, 0);
    const newsSpots: Array<[number, number]> = [];
    for (const r of ROAD_COORDS) {
      for (const mid of [-55, 55, 165]) {
        newsSpots.push([r + 12.4, mid - 14]);
      }
    }
    newsSpots.forEach(([x, z], i) => {
      const box = new THREE.Mesh(
        newsGeo,
        new THREE.MeshStandardMaterial({ color: newsColors[i % newsColors.length], roughness: 0.55 })
      );
      box.position.set(x, SIDEWALK_Y, z);
      box.rotation.y = i * 0.7;
      box.castShadow = true;
      this.scene.add(box);
    });

    // ── Subway entrances (stairs + railing + sign) ─────────────────────────
    const subwaySpots: Array<[number, number, number]> = [
      [-110, -13.5, 0], [0, 13.5, Math.PI], [110, -13.5, 0], [-55, 13.5, Math.PI], [55, -13.5, 0],
    ];
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x3b4048, metalness: 0.7, roughness: 0.4 });
    const subwaySignTex = this.textures.createSignTexture('SUBWAY', 'LOS SANTOS TRANSIT AUTHORITY', '#0f172a', '#ffffff', '#f59e0b', 512, 128);
    for (const [sx, sz, rotY] of subwaySpots) {
      const g = new THREE.Group();
      g.position.set(sx, SIDEWALK_Y, sz);
      g.rotation.y = rotY;
      // Descending stairwell
      for (let s = 0; s < 5; s++) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.22, 0.55), steelMat);
        step.position.set(0, -s * 0.22, s * 0.55);
        g.add(step);
      }
      // Railings
      for (const rx of [-1.7, 1.7]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.0, 3.2), steelMat);
        rail.position.set(rx, 0.5, 1.2);
        g.add(rail);
      }
      // Sign board
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(3.4, 1.0, 0.15),
        new THREE.MeshStandardMaterial({ map: subwaySignTex, roughness: 0.5 })
      );
      board.position.set(0, 1.6, -0.4);
      g.add(board);
      for (const px of [-1.5, 1.5]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6), steelMat);
        post.position.set(px, 0.8, -0.4);
        g.add(post);
      }
      this.scene.add(g);
    }

    // ── Traffic cones + construction barriers ──────────────────────────────
    const coneMat = new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.6 });
    const coneBandMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.5 });
    const coneSpots: Array<[number, number]> = [
      [-8, 8], [8, -8], [102, 8], [-102, -8], [8, 102], [-8, -102],
      [102, 102], [-102, -102], [118, 8], [-118, -8], [8, 118], [-8, -118],
    ];
    for (const [cx, cz] of coneSpots) {
      const g = new THREE.Group();
      g.position.set(cx, 0, cz);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 10), coneMat);
      cone.position.y = 0.3;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.14, 10), coneBandMat);
      band.position.y = 0.32;
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.42), coneMat);
      base.position.y = 0.03;
      g.add(cone, band, base);
      this.scene.add(g);
    }

    const barrierSpots: Array<[number, number, number]> = [
      [30, 30, 0.3], [-40, 60, -0.2], [70, -30, 0.5], [-70, -40, 0.1], [40, 130, -0.4], [-30, -130, 0.2],
    ];
    for (const [bx, bz, rotY] of barrierSpots) {
      const g = new THREE.Group();
      g.position.set(bx, SIDEWALK_Y, bz);
      g.rotation.y = rotY;
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 0.7, 0.12),
        new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.6 })
      );
      board.position.y = 0.75;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.22, 0.18, 0.13), coneBandMat);
      stripe.position.y = 0.75;
      g.add(board, stripe);
      for (const lx of [-0.9, 0.9]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.8, 0.5), steelMat);
        leg.position.set(lx, 0.4, 0);
        g.add(leg);
      }
      this.scene.add(g);
    }

    // ── Bike racks (U-shaped tubes) ────────────────────────────────────────
    const rackMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8, roughness: 0.3 });
    const rackGeo = new THREE.TorusGeometry(0.35, 0.035, 6, 12, Math.PI);
    for (const [rx, rz] of [[-13.2, -30], [13.2, 40], [-30, 13.2], [40, -13.2], [-13.2, 130], [130, 13.2]] as const) {
      for (let k = 0; k < 3; k++) {
        const rack = new THREE.Mesh(rackGeo, rackMat);
        rack.position.set(rx + k * 0.6, SIDEWALK_Y + 0.02, rz);
        rack.rotation.y = Math.PI / 2;
        this.scene.add(rack);
      }
    }
  }

  /** Dumpsters in alleys, rooftop AC units and TV antennas for lived-in realism. */
  private buildRooftopAndAlleyDetails(): void {
    const dumpMat = new THREE.MeshStandardMaterial({ color: 0x2f5d3a, roughness: 0.7, metalness: 0.3 });
    const dumpLidMat = new THREE.MeshStandardMaterial({ color: 0x264a2e, roughness: 0.65, metalness: 0.3 });
    const dumpSpots: Array<[number, number, number]> = [
      [-20, -70, 0.2], [60, -50, -0.15], [-60, -140, 0.1], [80, -150, 0.25],
      [-150, -50, -0.2], [-170, 60, 0.15], [-40, 160, 0.1], [50, 150, -0.1],
      [160, -150, 0.2], [180, -40, -0.15], [160, 60, 0.1], [150, 170, -0.2],
    ];
    for (const [dx, dz, rotY] of dumpSpots) {
      const g = new THREE.Group();
      g.position.set(dx, SIDEWALK_Y, dz);
      g.rotation.y = rotY;
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.25, 1.15), dumpMat);
      body.position.y = 0.63;
      body.castShadow = true;
      const lid = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.1, 1.2), dumpLidMat);
      lid.position.y = 1.3;
      g.add(body, lid);
      this.scene.add(g);
    }

    // Rooftop AC units + antennas on mid-rise roofs
    const acMat = new THREE.MeshStandardMaterial({ color: 0xb8bec6, roughness: 0.5, metalness: 0.6 });
    const antMat = new THREE.MeshStandardMaterial({ color: 0x3a3f45, metalness: 0.7, roughness: 0.4 });
    const roofSpots: Array<[number, number, number]> = [
      [-142, -74, 22], [-154, -34, 26], [-184, 38, 26], [74, 165, 22],
      [-35, 174, 30], [38, 144, 14], [52, -32, 34], [-72, 152, 44],
      [152, -172, 36], [178, 44, 24], [-144, 168, 34], [36, 184, 18],
    ];
    for (const [rx, rz, roofY] of roofSpots) {
      const baseY = SIDEWALK_Y + roofY;
      const ac = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.9, 1.4), acMat);
      ac.position.set(rx + 4, baseY + 0.45, rz + 3);
      ac.castShadow = true;
      const ac2 = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 1.1), acMat);
      ac2.position.set(rx - 5, baseY + 0.4, rz - 4);
      ac2.castShadow = true;
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 5.5, 6), antMat);
      ant.position.set(rx, baseY + 2.75, rz);
      const cross = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 0.05), antMat);
      cross.position.set(rx, baseY + 4.6, rz);
      const cross2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 1.1), antMat);
      cross2.position.set(rx, baseY + 4.2, rz);
      this.scene.add(ac, ac2, ant, cross, cross2);
    }
  }

  private buildInteractiveShops(): void {
    // =========================================================================
    // 1. LOS SANTOS CUSTOMS — Block (+55, +55) Southeast corner at (82, 84)
    // =========================================================================
    const lscBrick = new THREE.MeshStandardMaterial({ color: 0x3f434c, roughness: 0.78 });
    const lscTrim = new THREE.MeshStandardMaterial({ color: 0xa855f7, emissive: 0x7e22ce, emissiveIntensity: 0.5 });

    // Open-bay drive-in garage structure (Left wall, Right wall, Roof — open front so player drives right up!)
    this.addBuildingBox(72, 74, 3.5, 22, 10, lscBrick, 0x2d3138, SIDEWALK_Y, '#584b69');
    this.addBuildingBox(92, 74, 3.5, 22, 10, lscBrick, 0x2d3138, SIDEWALK_Y, '#584b69');
    this.addBuildingBox(82, 63, 23.5, 3, 10, lscBrick, 0x2d3138, SIDEWALK_Y, '#584b69');
    const lscRoof = new THREE.Mesh(new THREE.BoxGeometry(24.5, 1.4, 23), lscBrick);
    lscRoof.position.set(82, SIDEWALK_Y + 10.5, 74);
    lscRoof.castShadow = true;
    const lscStripe = new THREE.Mesh(new THREE.BoxGeometry(24.8, 0.5, 23.2), lscTrim);
    lscStripe.position.set(82, SIDEWALK_Y + 9.6, 74);
    const lscSignTex = this.textures.createSignTexture(
      'LOS SANTOS CUSTOMS',
      'CUSTOM PERFORMANCE  •  RESPRAY  •  REPAIR',
      '#18181b',
      '#f8fafc',
      '#c084fc'
    );
    const lscSign = new THREE.Mesh(
      new THREE.BoxGeometry(22, 4.4, 0.6),
      new THREE.MeshBasicMaterial({ map: lscSignTex })
    );
    lscSign.position.set(82, SIDEWALK_Y + 13.4, 85.2);
    this.scene.add(lscRoof, lscStripe, lscSign);
    this.addShopCorona(82, SIDEWALK_Y + 0.08, 88, 0xc084fc, 3.6);

    // =========================================================================
    // 2. AMMU-NATION — Block (+55, +55) Southwest corner at (28, 92)
    // =========================================================================
    const ammuWall = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.72 });
    this.addBuildingBox(34, 78, 24, 18, 9.5, ammuWall, 0x475569, SIDEWALK_Y, '#664a4a');
    const redBand = new THREE.Mesh(
      new THREE.BoxGeometry(24.3, 1.4, 18.3),
      new THREE.MeshStandardMaterial({ color: 0xdc2626 })
    );
    redBand.position.set(34, SIDEWALK_Y + 8.2, 78);
    const blueBand = new THREE.Mesh(
      new THREE.BoxGeometry(24.3, 1.1, 18.3),
      new THREE.MeshStandardMaterial({ color: 0x1d4ed8 })
    );
    blueBand.position.set(34, SIDEWALK_Y + 6.9, 78);
    const ammuSignTex = this.textures.createSignTexture(
      'AMMU-NATION',
      'PROTECTING YOUR RIGHTS  •  WEAPONS & ARMOR',
      '#991b1b',
      '#ffffff',
      '#fde047'
    );
    const ammuSign = new THREE.Mesh(
      new THREE.BoxGeometry(20, 4.0, 0.5),
      new THREE.MeshBasicMaterial({ map: ammuSignTex })
    );
    ammuSign.position.set(34, SIDEWALK_Y + 11.6, 87.1);
    this.scene.add(redBand, blueBand, ammuSign);
    this.addShopCorona(28, SIDEWALK_Y + 0.08, 92, 0xf87171, 2.2);

    // =========================================================================
    // 3. LTD GASOLINE STATION — Block (+55, +55) North side at (56, 32)
    // =========================================================================
    const ltdCanopy = new THREE.Mesh(
      new THREE.BoxGeometry(28, 1.4, 14),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.5 })
    );
    ltdCanopy.position.set(56, SIDEWALK_Y + 6.8, 30);
    ltdCanopy.castShadow = true;
    const ltdSignTex = this.textures.createSignTexture(
      'LTD GASOLINE',
      '24 HOUR FUEL & MART',
      '#1e3a8a',
      '#ffffff',
      '#ef4444'
    );
    const ltdFascia = new THREE.Mesh(
      new THREE.BoxGeometry(28.2, 1.8, 0.4),
      new THREE.MeshBasicMaterial({ map: ltdSignTex })
    );
    ltdFascia.position.set(56, SIDEWALK_Y + 7.0, 23);
    this.scene.add(ltdCanopy, ltdFascia);

    const pillarMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.4 });
    const pumpMat = new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      emissive: 0x7f1d1d,
      emissiveIntensity: 0.25,
    });
    for (const px of [46, 56, 66]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.65, 6.8, 0.65), pillarMat);
      col.position.set(px, SIDEWALK_Y + 3.4, 30);
      this.scene.add(col);

      // Explodable fuel pump!
      const pump = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.1, 0.7), pumpMat);
      pump.position.set(px + 2.2, SIDEWALK_Y + 1.05, 30);
      pump.castShadow = true;
      this.scene.add(pump);
      this.explodables.push({
        pos: pump.position.clone(),
        radius: 1.5,
        exploded: false,
        mesh: pump,
      });
    }

    // =========================================================================
    // 4. PREMIUM DELUXE MOTORSPORT (Simeon's Dealership) at (142, 82)
    // =========================================================================
    const pdmGlass = this.makeSkyscraperMat('pdm', '#e2e8f0', '#38bdf8', '#0f172a', 6, 3, 0.7, 0.14);
    this.addBuildingBox(144, 76, 30, 22, 12, pdmGlass, 0x334155, SIDEWALK_Y, '#4c5b70');
    const pdmSignTex = this.textures.createSignTexture(
      'PREMIUM DELUXE',
      'MOTORSPORT  •  SIMEON YETARIAN',
      '#0f172a',
      '#f8fafc',
      '#eab308'
    );
    const pdmSign = new THREE.Mesh(
      new THREE.BoxGeometry(24, 4.2, 0.5),
      new THREE.MeshBasicMaterial({ map: pdmSignTex })
    );
    pdmSign.position.set(144, SIDEWALK_Y + 14.0, 87.2);
    this.scene.add(pdmSign);
  }

  private addShopCorona(x: number, y: number, z: number, color: number, radius: number): void {
    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, 1.3, 28, 1, true),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.42,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    ring.position.set(x, y + 0.65, z);
    this.scene.add(ring);
    this.shopCoronas.push(ring);
  }

  private buildStreetFurnitureAndPalms(): void {
    // Authentic California Washingtonia Fan Palms along Vespucci Beach, Vespucci Blvd, Vinewood Blvd, Legion Square & Rockford Hills!
    const palmPositions: Array<{ x: number; z: number; scale: number; lean: number }> = [];

    // Beachfront palm colonnade (iconic GTA V vista!)
    for (let z = -215; z <= 235; z += 18) {
      if (z > 22 && z < 58) continue;
      palmPositions.push({ x: -244.5, z, scale: 1.05 + ((Math.abs(z) % 5) * 0.08), lean: -0.08 });
      palmPositions.push({ x: -206.5, z: z + 7, scale: 0.95 + ((Math.abs(z) % 4) * 0.07), lean: 0.06 });
    }

    // Vespucci Blvd & Vinewood Blvd grand palm rows
    for (let x = -198; x <= 198; x += 24) {
      if (ROAD_COORDS.some((r) => Math.abs(x - r) < 16)) continue;
      palmPositions.push({ x, z: -13.2, scale: 1.0, lean: 0.05 });
      palmPositions.push({ x, z: 13.2, scale: 1.08, lean: -0.05 });
      palmPositions.push({ x, z: -206.5, scale: 1.12, lean: 0.04 });
      palmPositions.push({ x, z: -233.5, scale: 1.05, lean: -0.06 });
    }

    // Rockford Dr & Power St downtown palms
    for (let z = -195; z <= 195; z += 30) {
      if (ROAD_COORDS.some((r) => Math.abs(z - r) < 16)) continue;
      palmPositions.push({ x: -96.5, z, scale: 0.96, lean: 0.05 });
      palmPositions.push({ x: -13.2, z, scale: 1.0, lean: -0.04 });
    }

    // Legion Square & Maze Bank Plaza palms
    for (const [px, pz] of [
      [-78, 32], [-32, 32], [-78, 78], [-32, 78], [-68, 50], [-42, 62],
      [-80, -30], [-30, -30], [-80, -80], [-30, -80],
    ]) {
      palmPositions.push({ x: px, z: pz, scale: 1.1, lean: 0.07 });
    }

    // Vinewood Hills scenic palms
    for (let z = -255; z >= -340; z -= 22) {
      palmPositions.push({ x: -12.5, z, scale: 0.95, lean: -0.06 });
      palmPositions.push({ x: 12.5, z, scale: 0.95, lean: 0.06 });
    }

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7c6249, roughness: 0.92 });
    const frondMat = new THREE.MeshStandardMaterial({
      color: 0x3f7a38,
      roughness: 0.72,
      side: THREE.DoubleSide,
    });
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.36, 11.5, 7);
    trunkGeo.translate(0, 5.75, 0);

    // Drooping arched palm frond geometry
    const frondGeo = new THREE.PlaneGeometry(0.95, 4.2, 1, 4);
    frondGeo.rotateX(-Math.PI / 2);
    frondGeo.translate(0, 0, 2.1);
    const fp = frondGeo.attributes.position;
    for (let i = 0; i < fp.count; i++) {
      const fz = fp.getZ(i);
      const t = fz / 4.2;
      fp.setY(i, Math.sin(t * Math.PI) * 0.65 - t * t * 1.15);
      // Taper tip
      fp.setX(i, fp.getX(i) * (1 - t * 0.72));
    }
    frondGeo.computeVertexNormals();

    // Use InstancedMesh for ultra-smooth 60fps rendering of 180+ detailed palm trees!
    const count = palmPositions.length;
    const frondsPerTree = 9;
    const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
    trunkInst.castShadow = true;
    trunkInst.receiveShadow = true;
    const frondInst = new THREE.InstancedMesh(frondGeo, frondMat, count * frondsPerTree);
    frondInst.castShadow = true;

    const dummy = new THREE.Object3D();
    let fIdx = 0;
    palmPositions.forEach((p, idx) => {
      const gy = sampleBaseTerrainHeight(p.x, p.z);
      dummy.position.set(p.x, gy, p.z);
      dummy.rotation.set(0, idx * 1.3, p.lean);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      trunkInst.setMatrixAt(idx, dummy.matrix);

      const topX = p.x - Math.sin(p.lean) * 11.3 * p.scale;
      const topY = gy + Math.cos(p.lean) * 11.3 * p.scale;
      for (let f = 0; f < frondsPerTree; f++) {
        const yaw = (f / frondsPerTree) * Math.PI * 2 + idx * 0.4;
        const pitch = f % 2 === 0 ? -0.18 : 0.14;
        dummy.position.set(topX, topY, p.z);
        dummy.rotation.set(pitch, yaw, 0, 'YXZ');
        dummy.scale.setScalar(p.scale * (f % 2 === 0 ? 1.05 : 0.88));
        dummy.updateMatrix();
        frondInst.setMatrixAt(fIdx++, dummy.matrix);
      }
    });
    trunkInst.instanceMatrix.needsUpdate = true;
    frondInst.instanceMatrix.needsUpdate = true;
    this.scene.add(trunkInst, frondInst);

    // Streetlights & Traffic Lights at intersections (Instanced poles + glowing lamps!)
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x3b4048, metalness: 0.7, roughness: 0.4 });
    const lampPositions: Array<{ x: number; z: number; rotY: number }> = [];

    for (const rx of ROAD_COORDS) {
      for (const rz of ROAD_COORDS) {
        lampPositions.push({ x: rx + 12.2, z: rz + 12.2, rotY: Math.PI * 1.25 });
        lampPositions.push({ x: rx - 12.2, z: rz - 12.2, rotY: Math.PI * 0.25 });
      }
    }
    // Mid-block streetlights
    for (const mid of [-165, -55, 55, 165]) {
      for (const r of ROAD_COORDS) {
        lampPositions.push({ x: r + 12.2, z: mid, rotY: Math.PI });
        lampPositions.push({ x: mid, z: r - 12.2, rotY: Math.PI * 0.5 });
      }
    }

    const poleGeo = new THREE.CylinderGeometry(0.11, 0.16, 7.6, 6);
    poleGeo.translate(0, 3.8, 0);
    const armGeo = new THREE.BoxGeometry(2.4, 0.12, 0.12);
    armGeo.translate(1.1, 7.55, 0);
    const bulbGeo = new THREE.BoxGeometry(0.65, 0.16, 0.32);
    bulbGeo.translate(2.1, 7.45, 0);

    const poleInst = new THREE.InstancedMesh(poleGeo, poleMat, lampPositions.length);
    const armInst = new THREE.InstancedMesh(armGeo, poleMat, lampPositions.length);
    const bulbInst = new THREE.InstancedMesh(bulbGeo, this.nightLampMat, lampPositions.length);

    lampPositions.forEach((lp, i) => {
      dummy.position.set(lp.x, SIDEWALK_Y, lp.z);
      dummy.rotation.set(0, lp.rotY, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      poleInst.setMatrixAt(i, dummy.matrix);
      armInst.setMatrixAt(i, dummy.matrix);
      bulbInst.setMatrixAt(i, dummy.matrix);
    });
    this.scene.add(poleInst, armInst, bulbInst);

    // Traffic Signal boxes on intersection corners
    const sigGreen = new THREE.MeshBasicMaterial({ color: 0x22c55e });
    const sigRed = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    for (const rx of [-110, 0, 110]) {
      for (const rz of [-110, 0, 110]) {
        const box = new THREE.Mesh(
          new THREE.BoxGeometry(0.38, 1.1, 0.38),
          new THREE.MeshStandardMaterial({ color: 0x1e2024 })
        );
        box.position.set(rx + 12.2, 5.8, rz + 10.2);
        const light = new THREE.Mesh(
          new THREE.SphereGeometry(0.14, 6, 6),
          (rx + rz) % 220 === 0 ? sigGreen : sigRed
        );
        light.position.set(rx + 12.2, 5.55, rz + 9.98);
        this.scene.add(box, light);
      }
    }

    // Authentic California Caltrans Emerald-Green Overhead Highway Gantry Signs!
    const buildGantry = (x: number, z: number, rotY: number, title: string, sub: string) => {
      const g = new THREE.Group();
      g.position.set(x, SIDEWALK_Y, z);
      g.rotation.y = rotY;

      for (const sx of [-12.6, 12.6]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 8.6, 8), poleMat);
        post.position.set(sx, 4.3, 0);
        g.add(post);
      }
      const truss = new THREE.Mesh(new THREE.BoxGeometry(25.8, 0.36, 0.36), poleMat);
      truss.position.set(0, 8.2, 0);
      g.add(truss);

      const signTex = this.textures.createSignTexture(
        title,
        sub,
        '#065f46',
        '#ffffff',
        '#f8fafc',
        512,
        140
      );
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(15.5, 3.1, 0.25),
        new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.45 })
      );
      board.position.set(0, 8.2, 0.22);
      g.add(board);
      this.scene.add(g);
    };

    buildGantry(0, -16, 0, 'VINEWOOD HILLS', 'MAZE BANK  •  GALILEO OBSERVATORY');
    buildGantry(-82, 0, Math.PI * 0.5, 'VESPUCCI BEACH', 'DEL PERRO PIER  •  PACIFIC COAST HWY');
    buildGantry(82, 0, -Math.PI * 0.5, 'STRAWBERRY AVE', 'LS CUSTOMS  •  AMMU-NATION  •  PDM');

    // Red California Fire Hydrants on street corners (instanced for zero cost!)
    const hydrantMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.4, metalness: 0.3 });
    const hydrantGeo = new THREE.CylinderGeometry(0.16, 0.2, 0.78, 8);
    hydrantGeo.translate(0, 0.39, 0);
    const hydInst = new THREE.InstancedMesh(hydrantGeo, hydrantMat, ROAD_COORDS.length * ROAD_COORDS.length);
    let hIdx = 0;
    for (const rx of ROAD_COORDS) {
      for (const rz of ROAD_COORDS) {
        dummy.position.set(rx - 12.6, SIDEWALK_Y, rz + 13.8);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        hydInst.setMatrixAt(hIdx++, dummy.matrix);
      }
    }
    this.scene.add(hydInst);
  }

  private buildStuntRamps(ramps: StuntRamp[]): void {
    // High-visibility hazard-striped wedge stunt ramps
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#475569';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(0, 0, 22, 256);
    ctx.fillRect(234, 0, 22, 256);
    // Launch chevron arrows
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.85)';
    ctx.lineWidth = 10;
    for (let y = 55; y < 230; y += 65) {
      ctx.beginPath();
      ctx.moveTo(68, y + 28);
      ctx.lineTo(128, y);
      ctx.lineTo(188, y + 28);
      ctx.stroke();
    }
    const rampTex = new THREE.CanvasTexture(c);
    rampTex.colorSpace = THREE.SRGBColorSpace;
    const rampMat = new THREE.MeshStandardMaterial({ map: rampTex, roughness: 0.65 });

    for (const r of ramps) {
      // Custom wedge geometry aligned with +Z = forward (up the ramp)
      const hw = r.width * 0.5;
      const hl = r.length * 0.5;
      const h = r.height;

      const geo = new THREE.BufferGeometry();
      const verts = new Float32Array([
        // Sloped top surface (2 triangles)
        -hw, 0, -hl, hw, 0, -hl, hw, h, hl,
        -hw, 0, -hl, hw, h, hl, -hw, h, hl,
        // Front vertical drop face
        -hw, 0, hl, hw, 0, hl, hw, h, hl,
        -hw, 0, hl, hw, h, hl, -hw, h, hl,
        // Left side triangle
        -hw, 0, -hl, -hw, h, hl, -hw, 0, hl,
        // Right side triangle
        hw, 0, -hl, hw, 0, hl, hw, h, hl,
      ]);
      const uvs = new Float32Array([
        0, 0, 1, 0, 1, 1,
        0, 0, 1, 1, 0, 1,
        0, 0, 1, 0, 1, 1,
        0, 0, 1, 1, 0, 1,
        0, 0, 1, 1, 1, 0,
        0, 0, 1, 0, 1, 1,
      ]);
      geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      geo.computeVertexNormals();

      const mesh = new THREE.Mesh(geo, rampMat);
      mesh.position.set(r.x, r.y, r.z);
      mesh.rotation.y = Math.atan2(r.dirX, r.dirZ);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }
  }

  private buildDistantMountains(): void {
    // San Andreas / Mount Chiliad & Tataviam Mountains framing the East and Far North horizon
    const mtnMat = new THREE.MeshStandardMaterial({
      color: 0x6c7a62,
      roughness: 0.96,
      metalness: 0,
    });
    const peaks = [
      { x: 460, z: -260, r: 210, h: 145 },
      { x: 520, z: -40, r: 195, h: 118 },
      { x: 480, z: 180, r: 185, h: 96 },
      { x: 260, z: -560, r: 240, h: 168 },
      { x: -120, z: -610, r: 250, h: 155 },
    ];
    for (const pk of peaks) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(pk.r, pk.h, 9), mtnMat);
      cone.position.set(pk.x, pk.h * 0.45, pk.z);
      cone.rotation.y = pk.x * 0.01;
      this.scene.add(cone);
    }
  }

  public update(dt: number, nightFactor: number): void {
    this.elapsed += dt;

    // Smoothly turn up Los Santos skyscraper & storefront window lights at sunset & night
    const targetEmissive = THREE.MathUtils.lerp(0.1, 1.15, nightFactor);
    for (const m of this.emissiveFacadeMats) {
      m.emissiveIntensity = targetEmissive;
    }

    // Streetlight bulbs glow brightly at dusk/night, stay warm neutral by day
    this.nightLampMat.color.setHex(nightFactor > 0.25 ? 0xffdf99 : 0xd1d5db);

    // Blink skyscraper aviation beacon
    const blink = Math.sin(this.elapsed * 4.5) > 0;
    this.beaconMat.color.setHex(blink ? 0xff2424 : 0x550808);

    // Rotate Del Perro Pier Ferris Wheel smoothly & keep gondolas upright!
    if (this.ferrisWheelRotor) {
      this.ferrisWheelRotor.rotation.z += dt * 0.22;
      const counter = -this.ferrisWheelRotor.rotation.z;
      for (const cabin of this.ferrisCabins) {
        cabin.rotation.z = counter;
      }
    }

    // Gentle pulse on interactive shop coronas
    const pulse = 0.34 + Math.sin(this.elapsed * 3.2) * 0.1;
    for (const c of this.shopCoronas) {
      (c.material as THREE.MeshBasicMaterial).opacity = pulse;
    }
  }
}
