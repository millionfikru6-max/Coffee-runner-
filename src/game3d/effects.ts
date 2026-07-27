/**
 * GPU particle system, weather, player auras and 3D floating text.
 *
 * All particles live in one THREE.Points draw call with a shader that handles
 * fade and size falloff, so thousands of sparks cost almost nothing. Rain is a
 * separate instanced line field that scrolls with the camera.
 */

import * as THREE from 'three';
import type { Quality } from './core';
import { mulberry32 } from './core';

const MAX_PARTICLES_HIGH = 900;
const MAX_PARTICLES_LOW = 340;

const PART_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aLife;
  attribute vec3 aColor;
  varying float vLife;
  varying vec3 vColor;
  uniform float uScale;
  void main() {
    vLife = aLife;
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(1.0, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const PART_FRAG = /* glsl */ `
  varying float vLife;
  varying vec3 vColor;
  void main() {
    vec2 d = gl_PointCoord - vec2(0.5);
    float r = dot(d, d);
    if (r > 0.25) discard;
    // soft round sprite with a hot core
    float a = smoothstep(0.25, 0.02, r) * vLife;
    vec3 c = mix(vColor, vec3(1.0), smoothstep(0.12, 0.0, r) * 0.55);
    gl_FragColor = vec4(c, a);
  }
`;

interface P {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; maxLife: number;
  size: number; drag: number; gravity: number;
  r: number; g: number; b: number;
}

export class Particles3D {
  readonly points: THREE.Points;
  private geo: THREE.BufferGeometry;
  private matl: THREE.ShaderMaterial;
  private pool: P[] = [];
  private posArr: Float32Array;
  private sizeArr: Float32Array;
  private lifeArr: Float32Array;
  private colArr: Float32Array;
  private max: number;
  private head = 0;

  constructor(quality: Quality) {
    this.max = quality === 'high' ? MAX_PARTICLES_HIGH : MAX_PARTICLES_LOW;
    this.posArr = new Float32Array(this.max * 3);
    this.sizeArr = new Float32Array(this.max);
    this.lifeArr = new Float32Array(this.max);
    this.colArr = new Float32Array(this.max * 3);

    for (let i = 0; i < this.max; i++) {
      this.pool.push({
        x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0,
        life: 0, maxLife: 1, size: 1, drag: 1, gravity: 0, r: 1, g: 1, b: 1,
      });
    }

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.posArr, 3));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.sizeArr, 1));
    this.geo.setAttribute('aLife', new THREE.BufferAttribute(this.lifeArr, 1));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.colArr, 3));
    this.geo.setDrawRange(0, this.max);
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    this.matl = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 620 } },
      vertexShader: PART_VERT,
      fragmentShader: PART_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geo, this.matl);
    this.points.frustumCulled = false;
    this.points.renderOrder = 20;
  }

  setPixelScale(s: number) {
    this.matl.uniforms.uScale.value = 620 * s;
  }

  private tmpCol = new THREE.Color();

  emit(
    x: number,
    y: number,
    z: number,
    count: number,
    opts: {
      color: THREE.ColorRepresentation;
      speed?: number;
      spread?: number;
      size?: number;
      life?: number;
      gravity?: number;
      drag?: number;
      up?: number;
      forward?: number;
    },
  ) {
    const col = this.tmpCol.set(opts.color);
    const speed = opts.speed ?? 4;
    const spread = opts.spread ?? 1;
    const size = opts.size ?? 22;
    const life = opts.life ?? 0.7;
    for (let i = 0; i < count; i++) {
      const p = this.pool[this.head];
      this.head = (this.head + 1) % this.max;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      p.x = x + (Math.random() - 0.5) * 0.25;
      p.y = y + (Math.random() - 0.5) * 0.25;
      p.z = z + (Math.random() - 0.5) * 0.25;
      const sp = speed * (0.4 + Math.random() * 0.8);
      p.vx = Math.sin(phi) * Math.cos(theta) * sp * spread;
      p.vy = Math.abs(Math.cos(phi)) * sp * 0.7 + (opts.up ?? 1.2);
      p.vz = Math.sin(phi) * Math.sin(theta) * sp * spread + (opts.forward ?? 0);
      p.maxLife = life * (0.7 + Math.random() * 0.6);
      p.life = p.maxLife;
      p.size = size * (0.6 + Math.random() * 0.8);
      p.gravity = opts.gravity ?? -9;
      p.drag = opts.drag ?? 1.6;
      p.r = col.r; p.g = col.g; p.b = col.b;
    }
  }

  update(dt: number) {
    const pos = this.posArr;
    const sz = this.sizeArr;
    const lf = this.lifeArr;
    const cl = this.colArr;
    for (let i = 0; i < this.max; i++) {
      const p = this.pool[i];
      if (p.life <= 0) {
        lf[i] = 0;
        sz[i] = 0;
        continue;
      }
      p.life -= dt;
      const d = Math.max(0, 1 - p.drag * dt);
      p.vx *= d;
      p.vz *= d;
      p.vy = p.vy * d + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const t = Math.max(0, p.life / p.maxLife);
      pos[i * 3] = p.x;
      pos[i * 3 + 1] = p.y;
      pos[i * 3 + 2] = p.z;
      sz[i] = p.size * (0.35 + t * 0.65);
      lf[i] = t * t;
      cl[i * 3] = p.r;
      cl[i * 3 + 1] = p.g;
      cl[i * 3 + 2] = p.b;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aLife.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
  }

  clear() {
    for (const p of this.pool) p.life = 0;
  }

  dispose() {
    this.geo.dispose();
    this.matl.dispose();
  }
}

/* ---------------------------------- rain ---------------------------------- */

/** Scrolling rain volume that follows the camera; also handles snow-ish mist. */
export class Rain {
  readonly mesh: THREE.LineSegments;
  private geo: THREE.BufferGeometry;
  private matl: THREE.LineBasicMaterial;
  private count: number;
  private positions: Float32Array;
  private speeds: Float32Array;
  private area = { x: 26, y: 22, z: 46 };

  constructor(quality: Quality) {
    this.count = quality === 'high' ? 700 : 260;
    this.positions = new Float32Array(this.count * 6);
    this.speeds = new Float32Array(this.count);
    const rand = mulberry32(77);
    for (let i = 0; i < this.count; i++) {
      const x = (rand() - 0.5) * this.area.x * 2;
      const y = rand() * this.area.y;
      const z = (rand() - 0.5) * this.area.z;
      const len = 0.5 + rand() * 0.9;
      this.positions[i * 6] = x;
      this.positions[i * 6 + 1] = y;
      this.positions[i * 6 + 2] = z;
      this.positions[i * 6 + 3] = x;
      this.positions[i * 6 + 4] = y + len;
      this.positions[i * 6 + 5] = z;
      this.speeds[i] = 26 + rand() * 22;
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.matl = new THREE.LineBasicMaterial({
      color: 0xcfe3ff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.mesh = new THREE.LineSegments(this.geo, this.matl);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 18;
  }

  update(dt: number, intensity: number, wind: number, camX: number, camZ: number, night: boolean) {
    const target = Math.min(0.85, intensity * 0.9);
    this.matl.opacity += (target - this.matl.opacity) * Math.min(1, dt * 3);
    this.mesh.visible = this.matl.opacity > 0.02;
    this.matl.color.set(night ? 0x9db4dc : 0xdcecff);
    if (!this.mesh.visible) return;

    this.mesh.position.set(camX, 0, camZ);
    const p = this.positions;
    const drift = -wind * 9 * dt;
    for (let i = 0; i < this.count; i++) {
      const fall = this.speeds[i] * dt * (0.6 + intensity * 0.8);
      p[i * 6 + 1] -= fall;
      p[i * 6 + 4] -= fall;
      p[i * 6] += drift;
      p[i * 6 + 3] += drift;
      if (p[i * 6 + 1] < -1) {
        const x = (Math.random() - 0.5) * this.area.x * 2;
        const z = (Math.random() - 0.5) * this.area.z;
        const len = 0.5 + Math.random() * 0.9;
        p[i * 6] = x;
        p[i * 6 + 1] = this.area.y;
        p[i * 6 + 2] = z;
        p[i * 6 + 3] = x;
        p[i * 6 + 4] = this.area.y + len;
        p[i * 6 + 5] = z;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
  }

  dispose() {
    this.geo.dispose();
    this.matl.dispose();
  }
}

/* ---------------------------- speed lines / auras -------------------------- */

/** Radial speed streaks that kick in at high velocity. */
export class SpeedLines {
  readonly mesh: THREE.LineSegments;
  private geo: THREE.BufferGeometry;
  private matl: THREE.LineBasicMaterial;
  private count: number;
  private positions: Float32Array;
  private base: Float32Array;

  constructor(quality: Quality) {
    this.count = quality === 'high' ? 90 : 44;
    this.positions = new Float32Array(this.count * 6);
    this.base = new Float32Array(this.count * 3);
    const rand = mulberry32(4242);
    for (let i = 0; i < this.count; i++) {
      const a = rand() * Math.PI * 2;
      const r = 3.5 + rand() * 9;
      this.base[i * 3] = Math.cos(a) * r;
      this.base[i * 3 + 1] = 1 + Math.sin(a) * r * 0.55;
      this.base[i * 3 + 2] = -rand() * 40;
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.matl = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.LineSegments(this.geo, this.matl);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 21;
  }

  update(dt: number, intensity: number, camZ: number) {
    const target = THREE.MathUtils.clamp(intensity, 0, 1) * 0.5;
    this.matl.opacity += (target - this.matl.opacity) * Math.min(1, dt * 5);
    this.mesh.visible = this.matl.opacity > 0.015;
    if (!this.mesh.visible) return;
    this.mesh.position.z = camZ;
    const p = this.positions;
    const len = 2.5 + intensity * 7;
    for (let i = 0; i < this.count; i++) {
      let z = this.base[i * 3 + 2] + ((performance.now() * 0.06 * (0.5 + intensity)) % 44);
      if (z > 4) z -= 44;
      p[i * 6] = this.base[i * 3];
      p[i * 6 + 1] = this.base[i * 3 + 1];
      p[i * 6 + 2] = z;
      p[i * 6 + 3] = this.base[i * 3];
      p[i * 6 + 4] = this.base[i * 3 + 1];
      p[i * 6 + 5] = z - len;
    }
    this.geo.attributes.position.needsUpdate = true;
    void dt;
  }

  dispose() {
    this.geo.dispose();
    this.matl.dispose();
  }
}

/* --------------------------------- auras ---------------------------------- */

/** Visual shells around the player for shield / magnet / double / slow. */
export class Auras {
  readonly root = new THREE.Group();
  private shield: THREE.Mesh;
  private magnet: THREE.Mesh;
  private trail: THREE.Mesh;
  private ring: THREE.Mesh;

  constructor() {
    const shieldMat = new THREE.MeshStandardMaterial({
      color: 0x6ec2ff,
      transparent: true,
      opacity: 0,
      emissive: 0x2a7fd4,
      emissiveIntensity: 1.1,
      roughness: 0.1,
      metalness: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.shield = new THREE.Mesh(new THREE.IcosahedronGeometry(1.35, 2), shieldMat);
    this.shield.position.y = 1.05;
    this.shield.visible = false;
    this.root.add(this.shield);

    const magMat = new THREE.MeshBasicMaterial({
      color: 0xff7a5a,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.magnet = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.06, 6, 40), magMat);
    this.magnet.rotation.x = -Math.PI / 2;
    this.magnet.position.y = 0.15;
    this.magnet.visible = false;
    this.root.add(this.magnet);

    const trailMat = new THREE.MeshBasicMaterial({
      color: 0xffd24a,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.trail = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 5), trailMat);
    this.trail.rotation.x = -Math.PI / 2;
    this.trail.position.set(0, 0.06, -2.6);
    this.trail.visible = false;
    this.root.add(this.trail);

    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xb07aff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(1.8, 2.3, 32), ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.1;
    this.ring.visible = false;
    this.root.add(this.ring);
  }

  update(
    dt: number,
    time: number,
    e: { shield: number; magnet: number; double: number; slow: number; superJump: number },
  ) {
    const set = (m: THREE.Mesh, on: boolean, target: number) => {
      const mm = m.material as THREE.Material & { opacity: number };
      mm.opacity += ((on ? target : 0) - mm.opacity) * Math.min(1, dt * 6);
      m.visible = mm.opacity > 0.01;
    };

    set(this.shield, e.shield > 0, 0.3);
    this.shield.rotation.y = time * 0.9;
    this.shield.rotation.x = Math.sin(time * 1.4) * 0.16;
    this.shield.scale.setScalar(1 + Math.sin(time * 4) * 0.035);

    set(this.magnet, e.magnet > 0, 0.75);
    this.magnet.rotation.z = time * 2.4;
    this.magnet.scale.setScalar(1 + Math.sin(time * 5) * 0.06);

    set(this.trail, e.double > 0, 0.34);
    (this.trail.material as THREE.MeshBasicMaterial).color.set(e.superJump > 0 ? 0x5ad46a : 0xffd24a);

    set(this.ring, e.slow > 0, 0.5);
    this.ring.scale.setScalar(1 + Math.sin(time * 3) * 0.1);
  }

  dispose() {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    });
  }
}

/* ------------------------------ floating text ----------------------------- */

/** Pooled camera-facing score popups drawn on canvas textures. */
export class FloatingText3D {
  readonly root = new THREE.Group();
  private sprites: { sprite: THREE.Sprite; mat: THREE.SpriteMaterial; tex: THREE.CanvasTexture; canvas: HTMLCanvasElement; life: number; maxLife: number; vy: number }[] = [];
  private cursor = 0;

  constructor(count = 14) {
    for (let i = 0; i < count; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = 384;
      canvas.height = 96;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(3.2, 0.8, 1);
      sprite.visible = false;
      sprite.renderOrder = 30;
      this.root.add(sprite);
      this.sprites.push({ sprite, mat, tex, canvas, life: 0, maxLife: 1, vy: 0 });
    }
  }

  spawn(x: number, y: number, z: number, text: string, color: string, scale = 1) {
    const s = this.sprites[this.cursor];
    this.cursor = (this.cursor + 1) % this.sprites.length;
    const ctx = s.canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, s.canvas.width, s.canvas.height);
    ctx.font = 'bold 62px "Baloo 2", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 12;
    ctx.strokeStyle = 'rgba(20,12,4,0.85)';
    ctx.strokeText(text, 192, 50);
    const grad = ctx.createLinearGradient(0, 12, 0, 84);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.45, color);
    grad.addColorStop(1, color);
    ctx.fillStyle = grad;
    ctx.fillText(text, 192, 50);
    s.tex.needsUpdate = true;
    s.sprite.position.set(x, y, z);
    s.sprite.scale.set(3.2 * scale, 0.8 * scale, 1);
    s.sprite.visible = true;
    s.life = 1.1;
    s.maxLife = 1.1;
    s.vy = 2.6;
    s.mat.opacity = 1;
  }

  update(dt: number) {
    for (const s of this.sprites) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.sprite.position.y += s.vy * dt;
      s.vy *= Math.max(0, 1 - dt * 1.6);
      const t = Math.max(0, s.life / s.maxLife);
      s.mat.opacity = t < 0.35 ? t / 0.35 : 1;
      const pop = 1 + (1 - t) * 0.25;
      s.sprite.scale.y = 0.8 * pop;
      if (s.life <= 0) s.sprite.visible = false;
    }
  }

  clear() {
    for (const s of this.sprites) {
      s.life = 0;
      s.sprite.visible = false;
    }
  }

  dispose() {
    for (const s of this.sprites) {
      s.tex.dispose();
      s.mat.dispose();
    }
  }
}
