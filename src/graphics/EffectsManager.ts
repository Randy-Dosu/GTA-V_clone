import * as THREE from 'three';

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  startScale: number;
  endScale: number;
  gravity: number;
  mat: THREE.MeshBasicMaterial;
  startOpacity: number;
}

interface Tracer {
  line: THREE.Line;
  mat: THREE.LineBasicMaterial;
  life: number;
  maxLife: number;
}

interface SkidMark {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  age: number;
}

export interface CashPickup {
  mesh: THREE.Group;
  pos: THREE.Vector3;
  amount: number;
  age: number;
}

export interface RocketProjectile {
  mesh: THREE.Group;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  smokeTimer: number;
}

export class EffectsManager {
  private scene: THREE.Scene;
  private particles: Particle[] = [];
  private tracers: Tracer[] = [];
  private skids: SkidMark[] = [];
  private maxSkids = 160;
  public cashPickups: CashPickup[] = [];
  public rockets: RocketProjectile[] = [];

  private flashLight: THREE.PointLight;
  private flashTimer = 0;

  private sphereGeo: THREE.SphereGeometry;
  private boxGeo: THREE.BoxGeometry;
  private ringGeo: THREE.RingGeometry;
  private skidGeo: THREE.PlaneGeometry;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.sphereGeo = new THREE.SphereGeometry(0.35, 8, 6);
    this.boxGeo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
    this.ringGeo = new THREE.RingGeometry(0.5, 0.95, 24);
    this.ringGeo.rotateX(-Math.PI / 2);
    this.skidGeo = new THREE.PlaneGeometry(0.32, 0.95);
    this.skidGeo.rotateX(-Math.PI / 2);

    this.flashLight = new THREE.PointLight(0xffa43b, 0, 28);
    scene.add(this.flashLight);
  }

  public spawnMuzzleFlash(pos: THREE.Vector3): void {
    this.flashLight.position.copy(pos);
    this.flashLight.color.setHex(0xffc266);
    this.flashLight.intensity = 5.5;
    this.flashLight.distance = 16;
    this.flashTimer = 0.055;

    this.spawnParticle(
      pos,
      new THREE.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5),
      0xffe08a,
      0.06,
      0.45,
      0.85,
      0,
      0.95,
      true
    );
  }

  public spawnTracer(start: THREE.Vector3, end: THREE.Vector3, color = 0xffe49c): void {
    const geom = new THREE.BufferGeometry().setFromPoints([start, end]);
    const mat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.72,
    });
    const line = new THREE.Line(geom, mat);
    this.scene.add(line);
    this.tracers.push({ line, mat, life: 0.065, maxLife: 0.065 });
  }

  public spawnImpact(pos: THREE.Vector3, isFlesh = false): void {
    const count = isFlesh ? 5 : 7;
    for (let i = 0; i < count; i++) {
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 7,
        1.2 + Math.random() * 4.5,
        (Math.random() - 0.5) * 7
      );
      const col = isFlesh ? 0xb52424 : i % 2 === 0 ? 0xffc65c : 0xc8c4bc;
      this.spawnParticle(pos, vel, col, 0.25 + Math.random() * 0.2, 0.28, 0.05, 12, 0.9, !isFlesh, true);
    }
  }

  public spawnTireSmoke(pos: THREE.Vector3): void {
    if (this.particles.length > 180) return;
    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * 1.4,
      0.55 + Math.random() * 0.85,
      (Math.random() - 0.5) * 1.4
    );
    this.spawnParticle(pos, vel, 0xe4e6ea, 0.55 + Math.random() * 0.3, 0.45, 1.9, -0.4, 0.34, false);
  }

  public spawnDamageSmoke(pos: THREE.Vector3, burning = false): void {
    if (this.particles.length > 200) return;
    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * 1.2,
      1.6 + Math.random() * 1.6,
      (Math.random() - 0.5) * 1.2
    );
    const col = burning && Math.random() < 0.45 ? 0xff7722 : 0x33363d;
    this.spawnParticle(pos, vel, col, 0.75, 0.55, 2.2, -0.5, burning ? 0.65 : 0.42, burning);
  }

  public spawnNitroFlame(pos: THREE.Vector3, backDir: THREE.Vector3): void {
    const vel = backDir.clone().multiplyScalar(6).add(new THREE.Vector3(0, 0.2, 0));
    this.spawnParticle(pos, vel, 0x45b6ff, 0.1, 0.48, 0.12, 0, 0.9, true);
  }

  public spawnSkidMark(pos: THREE.Vector3, heading: number): void {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x111214,
      transparent: true,
      opacity: 0.46,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.skidGeo, mat);
    mesh.position.set(pos.x, pos.y + 0.025, pos.z);
    mesh.rotation.y = heading;
    this.scene.add(mesh);
    this.skids.push({ mesh, mat, age: 0 });

    if (this.skids.length > this.maxSkids) {
      const oldest = this.skids.shift()!;
      this.scene.remove(oldest.mesh);
      oldest.mat.dispose();
    }
  }

  public spawnExplosion(pos: THREE.Vector3): void {
    this.flashLight.position.set(pos.x, pos.y + 2, pos.z);
    this.flashLight.color.setHex(0xff8424);
    this.flashLight.intensity = 18;
    this.flashLight.distance = 48;
    this.flashTimer = 0.38;

    // Shockwave ring
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffb347,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(this.ringGeo, ringMat);
    ring.position.set(pos.x, pos.y + 0.35, pos.z);
    this.scene.add(ring);
    this.particles.push({
      mesh: ring,
      vel: new THREE.Vector3(0, 0.2, 0),
      life: 0.45,
      maxLife: 0.45,
      startScale: 1,
      endScale: 13,
      gravity: 0,
      mat: ringMat,
      startOpacity: 0.85,
    });

    // Core fireballs
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 2 + Math.random() * 9;
      const vel = new THREE.Vector3(Math.cos(a) * spd, 2.5 + Math.random() * 8, Math.sin(a) * spd);
      const col = i % 3 === 0 ? 0xfff099 : i % 3 === 1 ? 0xff7b1c : 0xd93814;
      this.spawnParticle(
        pos.clone().add(new THREE.Vector3(0, 0.8, 0)),
        vel,
        col,
        0.55 + Math.random() * 0.45,
        1.4,
        4.6,
        1.5,
        0.92,
        true
      );
    }

    // Rising dark smoke plume
    for (let i = 0; i < 14; i++) {
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 6,
        4 + Math.random() * 7,
        (Math.random() - 0.5) * 6
      );
      this.spawnParticle(
        pos.clone().add(new THREE.Vector3(0, 1.2, 0)),
        vel,
        0x26282e,
        1.3 + Math.random() * 0.9,
        1.5,
        5.8,
        -0.8,
        0.58,
        false
      );
    }

    // Flying sparks/debris
    for (let i = 0; i < 14; i++) {
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 20,
        6 + Math.random() * 14,
        (Math.random() - 0.5) * 20
      );
      this.spawnParticle(pos, vel, 0xffaa33, 0.8 + Math.random() * 0.5, 1.2, 0.2, 18, 1.0, true, true);
    }
  }

  public spawnRocket(start: THREE.Vector3, dir: THREE.Vector3): void {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.55, 8).rotateX(Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x3b4632, roughness: 0.5 })
    );
    const flame = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffae33 })
    );
    flame.position.z = -0.32;
    group.add(body, flame);
    group.position.copy(start);
    group.lookAt(start.clone().add(dir));
    this.scene.add(group);

    this.rockets.push({
      mesh: group,
      pos: start.clone(),
      vel: dir.clone().normalize().multiplyScalar(54),
      life: 3.4,
      smokeTimer: 0,
    });
  }

  public spawnCash(pos: THREE.Vector3, amount: number): void {
    const group = new THREE.Group();
    const stack = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.14, 0.24),
      new THREE.MeshStandardMaterial({
        color: 0x38b555,
        emissive: 0x1c7a32,
        emissiveIntensity: 0.55,
        roughness: 0.4,
      })
    );
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.15, 0.25),
      new THREE.MeshBasicMaterial({ color: 0xf2e4a2 })
    );
    const glow = new THREE.Mesh(
      new THREE.RingGeometry(0.32, 0.46, 16).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: 0x5ec96f,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
      })
    );
    glow.position.y = -0.25;
    group.add(stack, band, glow);
    group.position.set(pos.x, pos.y + 0.45, pos.z);
    this.scene.add(group);
    this.cashPickups.push({ mesh: group, pos: group.position.clone(), amount, age: 0 });
  }

  private spawnParticle(
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    color: number,
    maxLife: number,
    startScale: number,
    endScale: number,
    gravity: number,
    opacity: number,
    additive = false,
    useBox = false
  ): void {
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(useBox ? this.boxGeo : this.sphereGeo, mat);
    mesh.position.copy(pos);
    mesh.scale.setScalar(startScale);
    this.scene.add(mesh);
    this.particles.push({
      mesh,
      vel,
      life: maxLife,
      maxLife,
      startScale,
      endScale,
      gravity,
      mat,
      startOpacity: opacity,
    });
  }

  public update(
    dt: number,
    onRocketStep?: (prev: THREE.Vector3, next: THREE.Vector3) => boolean
  ): void {
    // Muzzle / explosion flash decay
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) {
        this.flashLight.intensity = 0;
      } else {
        this.flashLight.intensity *= Math.pow(0.04, dt);
      }
    }

    // Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mat.dispose();
        this.particles.splice(i, 1);
        continue;
      }
      const prog = 1 - p.life / p.maxLife;
      p.vel.y -= p.gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      const s = THREE.MathUtils.lerp(p.startScale, p.endScale, prog);
      p.mesh.scale.setScalar(s);
      p.mat.opacity = p.startOpacity * (1 - prog * prog);
    }

    // Tracers
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        t.mat.dispose();
        this.tracers.splice(i, 1);
      } else {
        t.mat.opacity = 0.72 * (t.life / t.maxLife);
      }
    }

    // Skid marks fade out gently after 18s
    for (let i = this.skids.length - 1; i >= 0; i--) {
      const sk = this.skids[i];
      sk.age += dt;
      if (sk.age > 22) {
        this.scene.remove(sk.mesh);
        sk.mat.dispose();
        this.skids.splice(i, 1);
      } else if (sk.age > 16) {
        sk.mat.opacity = 0.46 * (1 - (sk.age - 16) / 6);
      }
    }

    // Rockets
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.life -= dt;
      const prev = r.pos.clone();
      r.vel.y -= 1.8 * dt;
      r.pos.addScaledVector(r.vel, dt);
      r.mesh.position.copy(r.pos);

      r.smokeTimer += dt;
      if (r.smokeTimer > 0.022) {
        r.smokeTimer = 0;
        this.spawnParticle(
          prev,
          new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.3, (Math.random() - 0.5) * 0.8),
          0xdcdedf,
          0.48,
          0.38,
          1.45,
          -0.2,
          0.45,
          false
        );
      }

      const hit = onRocketStep ? onRocketStep(prev, r.pos) : r.pos.y <= 0.1;
      if (hit || r.life <= 0) {
        this.scene.remove(r.mesh);
        this.rockets.splice(i, 1);
      }
    }

    // Cash pickups bob & spin
    for (let i = this.cashPickups.length - 1; i >= 0; i--) {
      const c = this.cashPickups[i];
      c.age += dt;
      if (c.age > 35) {
        this.scene.remove(c.mesh);
        this.cashPickups.splice(i, 1);
        continue;
      }
      c.mesh.rotation.y += dt * 2.4;
      c.mesh.position.y = c.pos.y + Math.sin(c.age * 3.5) * 0.09;
    }
  }
}
