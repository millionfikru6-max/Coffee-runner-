/**
 * Dynamic sky dome, sun/moon, stars, clouds and the full lighting rig.
 *
 * The sky is a single inverted sphere with a custom gradient shader that takes
 * three colours from the existing world.ts palette, so day/night/weather all
 * keep working and now drive real scene lighting as well.
 */

import * as THREE from 'three';
import type { WorldState } from '../game/types';
import type { SkyPalette } from '../game/world';
import { G, type Quality, mulberry32, parseColor } from './core';

const SKY_VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vWorld = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAG = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uMid;
  uniform vec3 uLow;
  uniform float uHorizonBoost;
  varying vec3 vWorld;

  void main() {
    float h = normalize(vWorld).y;
    vec3 col;
    if (h > 0.06) {
      col = mix(uMid, uTop, smoothstep(0.06, 0.75, h));
    } else {
      col = mix(uLow, uMid, smoothstep(-0.35, 0.06, h));
    }
    // warm band right on the horizon for sunrise/sunset drama
    float band = exp(-abs(h) * 14.0) * uHorizonBoost;
    col += uLow * band * 0.6;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export interface LightingRig {
  sun: THREE.DirectionalLight;
  ambient: THREE.HemisphereLight;
  fill: THREE.DirectionalLight;
  rim: THREE.DirectionalLight;
  playerLight: THREE.PointLight;
}

export class Sky {
  readonly root = new THREE.Group();
  readonly lights: LightingRig;

  private dome: THREE.Mesh;
  private domeMat: THREE.ShaderMaterial;
  private sunDisc: THREE.Mesh;
  private sunGlow: THREE.Mesh;
  private moonDisc: THREE.Mesh;
  private stars: THREE.Points;
  private starMat: THREE.PointsMaterial;
  private clouds: THREE.Group;
  private cloudMats: THREE.MeshBasicMaterial[] = [];
  private quality: Quality;

  /** Current fog / atmosphere colour, shared with the environment. */
  readonly fogColor = new THREE.Color(0x9fbcd4);

  constructor(quality: Quality) {
    this.quality = quality;

    this.domeMat = new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: new THREE.Color(0x1a6ab0) },
        uMid: { value: new THREE.Color(0x5aafe0) },
        uLow: { value: new THREE.Color(0xc8e8ff) },
        uHorizonBoost: { value: 0.4 },
      },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 16), this.domeMat);
    this.dome.renderOrder = -100;
    this.root.add(this.dome);

    // ---- stars ----
    const starCount = quality === 'high' ? 900 : 380;
    const positions = new Float32Array(starCount * 3);
    const rand = mulberry32(20240727);
    for (let i = 0; i < starCount; i++) {
      // upper hemisphere only
      const u = rand();
      const v = rand() * 0.85 + 0.05;
      const theta = u * Math.PI * 2;
      const phi = Math.acos(1 - v);
      const r = 800;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi) * 0.9 + 40;
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.starMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 3.2,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    });
    this.stars = new THREE.Points(starGeo, this.starMat);
    this.stars.renderOrder = -99;
    this.root.add(this.stars);

    // ---- sun & moon ----
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xfff2a0, fog: false, transparent: true });
    this.sunDisc = new THREE.Mesh(G.circle('high'), sunMat);
    this.sunDisc.scale.setScalar(78);
    this.sunDisc.renderOrder = -98;
    this.root.add(this.sunDisc);

    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xffd070,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.sunGlow = new THREE.Mesh(G.circle('high'), glowMat);
    this.sunGlow.scale.setScalar(280);
    this.sunGlow.renderOrder = -99;
    this.root.add(this.sunGlow);

    const moonMat = new THREE.MeshBasicMaterial({ color: 0xe8eef8, fog: false, transparent: true });
    this.moonDisc = new THREE.Mesh(G.circle('high'), moonMat);
    this.moonDisc.scale.setScalar(56);
    this.moonDisc.renderOrder = -98;
    this.root.add(this.moonDisc);

    // ---- clouds ----
    this.clouds = new THREE.Group();
    const cloudCount = quality === 'high' ? 16 : 8;
    for (let i = 0; i < cloudCount; i++) {
      const m = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
        fog: false,
      });
      this.cloudMats.push(m);
      const puffCount = 3 + Math.floor(rand() * 3);
      const cloud = new THREE.Group();
      for (let p = 0; p < puffCount; p++) {
        const puff = new THREE.Mesh(G.lowSphere(), m);
        const s = 30 + rand() * 45;
        puff.scale.set(s * 1.9, s * 0.72, s);
        puff.position.set((p - puffCount / 2) * s * 1.3, rand() * s * 0.35, rand() * s * 0.4);
        cloud.add(puff);
      }
      const a = rand() * Math.PI * 2;
      const dist = 380 + rand() * 300;
      cloud.position.set(Math.cos(a) * dist, 130 + rand() * 190, -Math.abs(Math.sin(a)) * dist - 100);
      cloud.userData.drift = 0.6 + rand() * 1.4;
      this.clouds.add(cloud);
    }
    this.clouds.renderOrder = -97;
    this.root.add(this.clouds);

    // ---- lighting rig ----
    const sun = new THREE.DirectionalLight(0xfff0d0, 2.4);
    sun.position.set(24, 42, 18);
    sun.castShadow = true;
    const shadowSize = quality === 'high' ? 2048 : 1024;
    sun.shadow.mapSize.set(shadowSize, shadowSize);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 150;
    sun.shadow.camera.left = -26;
    sun.shadow.camera.right = 26;
    sun.shadow.camera.top = 34;
    sun.shadow.camera.bottom = -22;
    sun.shadow.bias = -0.0012;
    sun.shadow.normalBias = 0.028;
    sun.shadow.radius = 3;

    const ambient = new THREE.HemisphereLight(0xbfd8ff, 0x4a3a24, 1.05);
    // Bounce light from the ground, keeps shadowed faces readable on phones.
    const fill = new THREE.DirectionalLight(0x9ec4e8, 0.5);
    fill.position.set(-20, 14, -12);
    // Rim light separates the runner from the background.
    const rim = new THREE.DirectionalLight(0xffd9a0, 0.85);
    rim.position.set(-6, 10, -26);
    const playerLight = new THREE.PointLight(0xffc978, 0, 14, 2);
    playerLight.position.set(0, 2.4, 0);

    this.lights = { sun, ambient, fill, rim, playerLight };
    this.root.add(ambient, fill, rim, playerLight, sun, sun.target);
  }

  /** Keep the dome and lights centred on the camera rig. */
  follow(x: number, z: number) {
    this.dome.position.set(x, 0, z);
    this.stars.position.set(x, 0, z);
    this.clouds.position.x = x * 0.2;
    this.root.position.z = z;
    this.root.position.x = 0;
  }

  update(dt: number, world: WorldState, palette: SkyPalette, time: number) {
    const top = parseColor(palette.top);
    const mid = parseColor(palette.mid);
    const low = parseColor(palette.low);
    const u = this.domeMat.uniforms;
    (u.uTop.value as THREE.Color).lerp(top, Math.min(1, dt * 2.5));
    (u.uMid.value as THREE.Color).lerp(mid, Math.min(1, dt * 2.5));
    (u.uLow.value as THREE.Color).lerp(low, Math.min(1, dt * 2.5));
    u.uHorizonBoost.value =
      world.timeOfDay === 'sunset' || world.timeOfDay === 'dawn' ? 0.95 : 0.3;

    // Fog colour matches the low sky so the world dissolves into the horizon.
    this.fogColor.copy(u.uMid.value as THREE.Color).lerp(u.uLow.value as THREE.Color, 0.55);

    // ---- celestial arc ----
    // dayPhase 0..1; the sun sweeps a real arc so shadows rotate with the day.
    const p = world.dayPhase;
    const sunAngle = (p - 0.1) * Math.PI * 2; // sunrise at 0.1
    const elev = Math.sin(sunAngle);
    const azim = Math.cos(sunAngle);
    const sunDir = new THREE.Vector3(azim * 0.75, Math.max(-0.35, elev), -0.55).normalize();

    const skyRadius = 620;
    this.sunDisc.position.copy(sunDir).multiplyScalar(skyRadius);
    this.sunDisc.lookAt(0, this.sunDisc.position.y * 0.2, 0);
    this.sunGlow.position.copy(sunDir).multiplyScalar(skyRadius - 20);
    this.sunGlow.lookAt(0, this.sunGlow.position.y * 0.2, 0);
    this.moonDisc.position.copy(sunDir).multiplyScalar(-skyRadius);
    this.moonDisc.lookAt(0, this.moonDisc.position.y * 0.2, 0);

    this.sunDisc.visible = palette.showSun && elev > -0.15;
    this.sunGlow.visible = this.sunDisc.visible;
    this.moonDisc.visible = palette.showMoon;
    (this.sunDisc.material as THREE.MeshBasicMaterial).color.copy(parseColor(palette.sun));
    (this.sunGlow.material as THREE.MeshBasicMaterial).color.copy(parseColor(palette.sun));
    (this.sunGlow.material as THREE.MeshBasicMaterial).opacity =
      0.18 + (world.timeOfDay === 'sunset' || world.timeOfDay === 'dawn' ? 0.34 : 0.1);

    this.starMat.opacity += (palette.stars - this.starMat.opacity) * Math.min(1, dt * 1.5);
    this.stars.visible = this.starMat.opacity > 0.01;
    this.stars.rotation.y = time * 0.004;

    // clouds drift with wind and thicken with bad weather
    const cloudAlpha =
      world.weather === 'storm' ? 0.92 : world.weather === 'overcast' || world.weather === 'rain' ? 0.85 : 0.6;
    const cloudTint =
      world.weather === 'storm'
        ? 0x4c5361
        : world.weather === 'rain' || world.weather === 'overcast'
          ? 0x9aa4ad
          : world.timeOfDay === 'sunset'
            ? 0xffc9a0
            : world.timeOfDay === 'night'
              ? 0x4a5570
              : 0xffffff;
    for (const m of this.cloudMats) {
      m.opacity += (cloudAlpha - m.opacity) * Math.min(1, dt * 1.2);
      m.color.lerp(new THREE.Color(cloudTint), Math.min(1, dt * 1.5));
    }
    for (const c of this.clouds.children) {
      c.position.x += (c.userData.drift as number) * (0.4 + world.wind) * dt * 6;
      if (c.position.x > 700) c.position.x = -700;
    }

    // ---- lights react to the sky ----
    const light = world.light;
    const stormDim = world.weather === 'storm' ? 0.45 : world.weather === 'rain' ? 0.65 : world.weather === 'overcast' ? 0.78 : 1;
    const dayFactor = THREE.MathUtils.clamp(elev * 1.4 + 0.12, 0, 1);

    const { sun, ambient, fill, rim, playerLight } = this.lights;
    sun.position.copy(sunDir).multiplyScalar(60);
    sun.intensity = (0.22 + dayFactor * 2.5) * stormDim;
    sun.color.copy(parseColor(palette.sun)).lerp(new THREE.Color(0xffffff), 0.35);
    // Shadows are pointless (and expensive) once the sun is under the horizon.
    sun.castShadow = this.quality === 'high' ? dayFactor > 0.06 : dayFactor > 0.2;

    ambient.intensity = (0.35 + light * 0.9) * (world.weather === 'storm' ? 0.85 : 1);
    ambient.color.copy(this.fogColor).lerp(new THREE.Color(0xffffff), 0.25);
    ambient.groundColor.set(world.timeOfDay === 'night' ? 0x121a26 : 0x5a4526);

    fill.intensity = 0.24 + light * 0.42;
    fill.color.copy(this.fogColor);

    rim.intensity = 0.5 + dayFactor * 0.7;
    rim.color.copy(parseColor(palette.sun)).lerp(new THREE.Color(0xffd9a0), 0.5);

    // A warm personal light at night so the runner never disappears.
    const nightness = 1 - dayFactor;
    playerLight.intensity = nightness * nightness * 26;
    playerLight.color.set(world.biome === 'addis_ababa' ? 0xffd9a0 : 0xffc978);
  }

  /** Point the sun's shadow frustum at the runner. */
  aimShadow(targetZ: number) {
    const { sun } = this.lights;
    sun.target.position.set(0, 0, targetZ - 8);
    sun.target.updateMatrixWorld();
    const dir = sun.position.clone().normalize().multiplyScalar(60);
    sun.position.set(dir.x, Math.max(12, dir.y), targetZ - 8 + dir.z);
  }

  setQuality(q: Quality) {
    this.quality = q;
    const size = q === 'high' ? 2048 : 1024;
    this.lights.sun.shadow.mapSize.set(size, size);
    if (this.lights.sun.shadow.map) {
      this.lights.sun.shadow.map.dispose();
      this.lights.sun.shadow.map = null;
    }
  }

  dispose() {
    this.dome.geometry.dispose();
    this.domeMat.dispose();
    this.stars.geometry.dispose();
    this.starMat.dispose();
  }
}
