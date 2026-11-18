import * as THREE from 'three';
import { TimePreset, WeatherKind } from '../types';

export class SkyAndOcean {
  public timeOfDay = 16.65; // 4:39 PM Los Santos Golden Afternoon
  public weather: WeatherKind = 'clear';
  public nightFactor = 0;

  public sunLight: THREE.DirectionalLight;
  public hemiLight: THREE.HemisphereLight;
  public fillLight: THREE.DirectionalLight;
  public fog: THREE.FogExp2;

  private scene: THREE.Scene;
  private skyMesh: THREE.Mesh;
  private skyMat: THREE.ShaderMaterial;
  private oceanMesh: THREE.Mesh;
  private oceanMat: THREE.ShaderMaterial;

  public sunDirection = new THREE.Vector3(-0.72, 0.42, 0.25).normalize();
  private elapsed = 0;

  // Reusable colors
  private cZenith = new THREE.Color();
  private cHorizon = new THREE.Color();
  private cSun = new THREE.Color();
  private cGround = new THREE.Color();

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer, highQuality = true) {
    this.scene = scene;

    // Generate Los Santos California PMREM reflection environment for glossy car clearcoats & glass towers!
    this.buildCaliforniaEnvironment(renderer);

    // Atmospheric fog tuned to match horizon
    this.fog = new THREE.FogExp2(0xdfd0be, 0.00125);
    scene.fog = this.fog;

    // Hemisphere bounce (California sky + warm sandstone bounce)
    this.hemiLight = new THREE.HemisphereLight(0x88c2ff, 0x9c8669, 0.85);
    scene.add(this.hemiLight);

    // Subtle cool sky fill opposite sun so shadow sides keep crisp detail
    this.fillLight = new THREE.DirectionalLight(0x9dc4f0, 0.42);
    this.fillLight.position.set(120, 90, -100);
    scene.add(this.fillLight);

    // Primary Sun directional light with player-tracking shadow frustum
    this.sunLight = new THREE.DirectionalLight(0xffe2b5, 2.35);
    this.sunLight.castShadow = true;
    const mapSize = highQuality ? 2048 : 1024;
    this.sunLight.shadow.mapSize.set(mapSize, mapSize);
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 360;
    const d = 105;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.00045;
    this.sunLight.shadow.normalBias = 0.035;
    scene.add(this.sunLight);
    scene.add(this.sunLight.target);

    // Custom GLSL California Sky Dome
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTopColor: { value: new THREE.Color(0x1f66b8) },
        uHorizonColor: { value: new THREE.Color(0xf2cfa8) },
        uSunColor: { value: new THREE.Color(0xfff0cc) },
        uSunDir: { value: this.sunDirection.clone() },
        uTime: { value: 0 },
        uNight: { value: 0 },
        uCloudiness: { value: 0.34 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorldDir;
        void main() {
          vWorldDir = position;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uTopColor;
        uniform vec3 uHorizonColor;
        uniform vec3 uSunColor;
        uniform vec3 uSunDir;
        uniform float uTime;
        uniform float uNight;
        uniform float uCloudiness;
        varying vec3 vWorldDir;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
            mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }

        float fbm(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          for (int i = 0; i < 4; i++) {
            v += a * noise(p);
            p = p * 2.04 + vec2(13.1, 7.7);
            a *= 0.5;
          }
          return v;
        }

        void main() {
          vec3 dir = normalize(vWorldDir);
          float h = clamp(dir.y, 0.0, 1.0);

          // Rayleigh gradient with warm coastal horizon band
          vec3 sky = mix(uHorizonColor, uTopColor, pow(h, 0.48));
          float horizonBand = exp(-abs(dir.y) * 9.5);
          sky = mix(sky, uHorizonColor * 1.08, horizonBand * 0.55);

          // Mie scattering halo & crisp solar disc
          float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
          float mie = pow(sunDot, 7.0) * 0.34 + pow(sunDot, 48.0) * 0.45;
          float disc = smoothstep(0.9982, 0.9994, sunDot) * 2.2;
          float dayVis = clamp(1.0 - uNight * 1.15, 0.0, 1.0);
          sky += uSunColor * (mie + disc) * dayVis;

          // High wispy California cirrus clouds
          if (dir.y > 0.03) {
            vec2 cloudUV = dir.xz / (dir.y + 0.16) * 1.35 + vec2(uTime * 0.005, -uTime * 0.002);
            float c = fbm(cloudUV);
            float cloudMask = smoothstep(0.58 - uCloudiness * 0.25, 0.86, c) * smoothstep(0.03, 0.22, dir.y);
            vec3 cloudCol = mix(vec3(0.97, 0.96, 0.95), uSunColor * 1.05, pow(sunDot, 2.0) * 0.65 + (1.0 - h) * 0.35);
            cloudCol = mix(cloudCol, vec3(0.11, 0.14, 0.22), uNight * 0.88);
            sky = mix(sky, cloudCol, cloudMask * 0.52);
          }

          // Subtle stars at night
          if (uNight > 0.15 && dir.y > 0.08) {
            vec2 starCell = floor(dir.xz / (dir.y + 0.25) * 210.0);
            float s = hash(starCell);
            if (s > 0.9965) {
              float twinkle = 0.65 + 0.35 * sin(uTime * 2.5 + s * 900.0);
              sky += vec3(0.85, 0.91, 1.0) * twinkle * uNight * smoothstep(0.08, 0.35, dir.y);
            }
          }

          gl_FragColor = vec4(sky, 1.0);
        }
      `,
    });

    const skyGeo = new THREE.SphereGeometry(1450, 32, 20);
    this.skyMesh = new THREE.Mesh(skyGeo, this.skyMat);
    scene.add(this.skyMesh);

    // Animated Vespucci / Pacific Ocean with sunlit specular shimmer & shoreline foam
    this.oceanMat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        uSunDir: { value: this.sunDirection.clone() },
        uSunColor: { value: new THREE.Color(0xffe7bd) },
        uSkyHorizon: { value: new THREE.Color(0xf0cda4) },
        uNight: { value: 0 },
        uShoreX: { value: -308.0 },
      },
      vertexShader: /* glsl */ `
        uniform float uTime;
        varying vec3 vWorldPos;
        varying float vWave;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          float w1 = sin(wp.x * 0.11 + uTime * 1.45) * 0.22;
          float w2 = cos(wp.z * 0.08 - uTime * 1.1 + wp.x * 0.05) * 0.16;
          wp.y += w1 + w2;
          vWave = w1 + w2;
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform vec3 uSkyHorizon;
        uniform float uNight;
        uniform float uShoreX;
        varying vec3 vWorldPos;
        varying float vWave;

        void main() {
          // Animated multi-wave surface normal
          float nx = cos(vWorldPos.x * 0.24 + uTime * 1.8) * 0.11
                   + sin(vWorldPos.x * 0.62 + vWorldPos.z * 0.35 - uTime * 2.4) * 0.06;
          float nz = sin(vWorldPos.z * 0.21 - uTime * 1.5) * 0.09
                   + cos(vWorldPos.z * 0.55 - vWorldPos.x * 0.28 + uTime * 2.1) * 0.06;
          vec3 N = normalize(vec3(-nx, 1.0, -nz));
          vec3 V = normalize(cameraPosition - vWorldPos);
          vec3 L = normalize(uSunDir);

          // Depth color: turquoise California surf near Vespucci Beach -> rich Pacific sapphire offshore
          float shoreDist = max(0.0, uShoreX - vWorldPos.x);
          float shallow = exp(-shoreDist * 0.032);
          vec3 deepCol = mix(vec3(0.03, 0.21, 0.38), vec3(0.01, 0.04, 0.10), uNight);
          vec3 shallowCol = mix(vec3(0.08, 0.49, 0.56), vec3(0.02, 0.11, 0.18), uNight);
          vec3 water = mix(deepCol, shallowCol, shallow);

          // Fresnel sky reflection
          float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.6);
          water = mix(water, uSkyHorizon * 0.85, fresnel * 0.62);

          // Golden Pacific sun path sparkle
          vec3 H = normalize(L + V);
          float spec = pow(max(dot(N, H), 0.0), 140.0) * 1.9 + pow(max(dot(N, H), 0.0), 24.0) * 0.28;
          water += uSunColor * spec * (1.0 - uNight * 0.82);

          // Breaking white shoreline foam along Vespucci Beach
          float surfWave = sin(vWorldPos.z * 0.07 + uTime * 1.2) * 3.2 + sin(uTime * 1.9 + vWorldPos.x * 0.35) * 2.0;
          float foamBand = smoothstep(14.0, 1.5, shoreDist + surfWave);
          float foamLine = smoothstep(0.62, 0.92, sin(shoreDist * 0.65 - uTime * 2.6 + sin(vWorldPos.z * 0.12) * 2.0)) * exp(-shoreDist * 0.065);
          float foam = clamp(foamBand * 0.78 + foamLine * 0.55, 0.0, 1.0);
          vec3 foamCol = mix(vec3(0.95, 0.96, 0.97), vec3(0.28, 0.34, 0.44), uNight);
          water = mix(water, foamCol, foam);

          // Atmospheric distance fade into horizon
          float camDist = length(cameraPosition - vWorldPos);
          float fogFactor = 1.0 - exp(-pow(camDist * 0.00125, 2.0));
          water = mix(water, uSkyHorizon, clamp(fogFactor, 0.0, 1.0));

          gl_FragColor = vec4(water, 0.96);
        }
      `,
    });

    const oceanGeo = new THREE.PlaneGeometry(1150, 2200, 96, 96);
    oceanGeo.rotateX(-Math.PI / 2);
    this.oceanMesh = new THREE.Mesh(oceanGeo, this.oceanMat);
    this.oceanMesh.position.set(-875, -0.35, 0);
    scene.add(this.oceanMesh);

    // Also south harbor water bay (La Puerta / Pacific south)
    const southBayGeo = new THREE.PlaneGeometry(1800, 900, 48, 48);
    southBayGeo.rotateX(-Math.PI / 2);
    const southBay = new THREE.Mesh(southBayGeo, this.oceanMat);
    southBay.position.set(220, -0.38, 740);
    scene.add(southBay);

    this.applyLighting(new THREE.Vector3(0, 0, 0));
  }

  private buildCaliforniaEnvironment(renderer: THREE.WebGLRenderer): void {
    try {
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envScene = new THREE.Scene();

      // Equirectangular California sky + Pacific horizon + asphalt ground gradient dome
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 256;
      const ctx = c.getContext('2d')!;
      const grad = ctx.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0.0, '#1c63c4');
      grad.addColorStop(0.34, '#6eb0f2');
      grad.addColorStop(0.47, '#f7cfa2');
      grad.addColorStop(0.51, '#ffe4bd');
      grad.addColorStop(0.55, '#5b5652');
      grad.addColorStop(1.0, '#252830');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 512, 256);

      // Warm golden California solar specular highlight for car hood clearcoat gleam!
      const sunGrad = ctx.createRadialGradient(130, 106, 4, 130, 106, 68);
      sunGrad.addColorStop(0, '#ffffff');
      sunGrad.addColorStop(0.25, 'rgba(255, 236, 190, 0.92)');
      sunGrad.addColorStop(1, 'rgba(255, 200, 140, 0)');
      ctx.fillStyle = sunGrad;
      ctx.fillRect(40, 30, 190, 160);

      const envTex = new THREE.CanvasTexture(c);
      envTex.colorSpace = THREE.SRGBColorSpace;
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(40, 24, 16),
        new THREE.MeshBasicMaterial({ map: envTex, side: THREE.BackSide })
      );
      envScene.add(dome);

      const rt = pmrem.fromScene(envScene, 0.035);
      this.scene.environment = rt.texture;
      this.scene.environmentIntensity = 0.88;
      pmrem.dispose();
      envTex.dispose();
      dome.geometry.dispose();
    } catch {
      // Safe fallback if PMREM unavailable
    }
  }

  public setTimePreset(preset: TimePreset): void {
    switch (preset) {
      case 'noon':
        this.timeOfDay = 12.6;
        break;
      case 'golden':
        this.timeOfDay = 16.65;
        break;
      case 'sunset':
        this.timeOfDay = 18.45;
        break;
      case 'night':
        this.timeOfDay = 22.5;
        break;
    }
  }

  public setQuality(high: boolean): void {
    const size = high ? 2048 : 1024;
    if (this.sunLight.shadow.mapSize.x !== size) {
      this.sunLight.shadow.mapSize.set(size, size);
      this.sunLight.shadow.map?.dispose();
      this.sunLight.shadow.map = null;
    }
  }

  public update(dt: number, focusPos: THREE.Vector3, autoCycle: boolean): void {
    this.elapsed += dt;
    if (autoCycle) {
      // Gentle real-time cycle: ~14 minutes per full Los Santos day
      this.timeOfDay = (this.timeOfDay + dt * 0.028) % 24;
    }
    this.skyMat.uniforms.uTime.value = this.elapsed;
    this.oceanMat.uniforms.uTime.value = this.elapsed;
    this.skyMesh.position.copy(focusPos);
    this.applyLighting(focusPos);
  }

  private applyLighting(focusPos: THREE.Vector3): void {
    // Solar arc: rises East (+X) at 6:00, high South-Zenith at 12:30, sets over Pacific Ocean (-X) at 19:00!
    const angle = ((this.timeOfDay - 6.0) / 13.0) * Math.PI;
    const sunElev = Math.sin(angle); // >0 daytime, <0 nighttime
    const sunX = Math.cos(angle);
    const sunZ = 0.28;

    this.sunDirection.set(sunX, Math.max(-0.35, sunElev * 0.88), sunZ).normalize();

    const night = THREE.MathUtils.clamp(1 - THREE.MathUtils.smoothstep(sunElev, -0.14, 0.22), 0, 1);
    const golden = THREE.MathUtils.clamp(
      1 - Math.abs(sunElev - 0.24) / 0.34,
      0,
      1
    ) * (1 - night * 0.7);
    this.nightFactor = night;

    // Palette blend: Noon California Blue <-> Golden Hour / Sunset <-> Los Santos Neon Night
    this.cZenith.setHex(0x1f6fd1);
    this.cHorizon.setHex(0xcbe2f6);
    this.cSun.setHex(0xfff6e3);
    this.cGround.setHex(0x9a8a73);

    if (golden > 0) {
      this.cZenith.lerp(new THREE.Color(0x28569e), golden * 0.65);
      this.cHorizon.lerp(new THREE.Color(0xf4b67c), golden * 0.88);
      this.cSun.lerp(new THREE.Color(0xffca7a), golden * 0.85);
      this.cGround.lerp(new THREE.Color(0xa67e58), golden * 0.6);
    }

    if (night > 0) {
      this.cZenith.lerp(new THREE.Color(0x060b18), night);
      this.cHorizon.lerp(new THREE.Color(0x162138), night);
      this.cSun.lerp(new THREE.Color(0x7fa2d6), night);
      this.cGround.lerp(new THREE.Color(0x1b2030), night);
    }

    // Weather adjustments
    let fogDensity = 0.00115;
    let cloudiness = 0.32;
    if (this.weather === 'haze') {
      this.cHorizon.lerp(new THREE.Color(night > 0.5 ? 0x222c44 : 0xf2d9b8), 0.45);
      fogDensity = 0.0021;
      cloudiness = 0.5;
    } else if (this.weather === 'overcast') {
      this.cZenith.lerp(new THREE.Color(night > 0.5 ? 0x101521 : 0x6f7f91), 0.7);
      this.cHorizon.lerp(new THREE.Color(night > 0.5 ? 0x1a2030 : 0xb8c1ca), 0.7);
      fogDensity = 0.0019;
      cloudiness = 0.88;
    }

    this.skyMat.uniforms.uTopColor.value.copy(this.cZenith);
    this.skyMat.uniforms.uHorizonColor.value.copy(this.cHorizon);
    this.skyMat.uniforms.uSunColor.value.copy(this.cSun);
    this.skyMat.uniforms.uSunDir.value.copy(this.sunDirection);
    this.skyMat.uniforms.uNight.value = night;
    this.skyMat.uniforms.uCloudiness.value = cloudiness;

    this.oceanMat.uniforms.uSunDir.value.copy(this.sunDirection);
    this.oceanMat.uniforms.uSunColor.value.copy(this.cSun);
    this.oceanMat.uniforms.uSkyHorizon.value.copy(this.cHorizon);
    this.oceanMat.uniforms.uNight.value = night;

    this.fog.color.copy(this.cHorizon);
    this.fog.density = fogDensity;

    // Update scene lights
    const weatherDim = this.weather === 'overcast' ? 0.65 : 1.0;
    this.sunLight.color.copy(this.cSun);
    this.sunLight.intensity = THREE.MathUtils.lerp(2.45, 0.48, night) * weatherDim;

    // Keep shadow direction slightly elevated at night (moonlight)
    const lightDirX = night > 0.7 ? -0.45 : this.sunDirection.x;
    const lightDirY = Math.max(0.28, this.sunDirection.y);
    const lightDirZ = night > 0.7 ? -0.35 : this.sunDirection.z;

    // Snap shadow target slightly to reduce shadow swimming
    const tx = Math.round(focusPos.x * 0.5) * 2;
    const tz = Math.round(focusPos.z * 0.5) * 2;
    this.sunLight.target.position.set(tx, focusPos.y, tz);
    this.sunLight.position.set(
      tx + lightDirX * 155,
      focusPos.y + lightDirY * 155,
      tz + lightDirZ * 155
    );

    this.hemiLight.color.copy(this.cZenith).lerp(new THREE.Color(0xffffff), 0.35);
    this.hemiLight.groundColor.copy(this.cGround);
    this.hemiLight.intensity = THREE.MathUtils.lerp(0.92, 0.46, night);

    this.fillLight.intensity = THREE.MathUtils.lerp(0.42, 0.25, night);
    this.scene.environmentIntensity = THREE.MathUtils.lerp(0.9, 0.34, night);
  }
}
