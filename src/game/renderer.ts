import { VISIBLE_AHEAD_M, type GameEngine } from './engine';
import type {
  Collectible,
  Obstacle,
  ObstacleType,
  Particle,
  Player,
  Wildlife,
  WorldState,
} from './types';
import { skyPalette, terrainPalette } from './world';

const BASE = {
  coffee: '#6F4E37',
  bean: '#4a2c0a',
  gold: '#FFD700',
  playerSkin: '#8B5A2B',
  playerCloth: '#c41e3a',
  white: '#fff8f0',
};

export class Renderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  quality: 'high' | 'low' = 'high';
  private cloudSeed: number[] = [];
  private villageSeed: number[] = [];
  private treeSeed: { x: number; h: number; side: number; kind: number }[] = [];
  private starSeed: { x: number; y: number; s: number; tw: number }[] = [];
  private buildingSeed: { x: number; h: number; w: number; side: number; windows: number }[] = [];
  private mistPhase = 0;
  private camX = 0;
  private camY = 0;
  private camZoom = 1;

  setQuality(q: 'high' | 'low') {
    this.quality = q;
  }

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas unsupported');
    this.ctx = ctx;
    this.initDecor();
  }

  private initDecor() {
    this.cloudSeed = Array.from({ length: 10 }, (_, i) => i * 97.3 + 12);
    this.villageSeed = Array.from({ length: 8 }, (_, i) => i * 120 + 30);
    this.treeSeed = Array.from({ length: 16 }, (_, i) => ({
      x: (i * 73) % 200,
      h: 30 + (i % 5) * 8,
      side: i % 2 === 0 ? -1 : 1,
      kind: i % 3,
    }));
    this.starSeed = Array.from({ length: 60 }, () => ({
      x: Math.random(),
      y: Math.random() * 0.55,
      s: 0.6 + Math.random() * 1.6,
      tw: Math.random() * Math.PI * 2,
    }));
    this.buildingSeed = Array.from({ length: 12 }, (_, i) => ({
      x: (i * 67) % 180,
      h: 40 + (i % 5) * 18,
      w: 22 + (i % 3) * 10,
      side: i % 2 === 0 ? -1 : 1,
      windows: 2 + (i % 4),
    }));
  }

  resize(w: number, h: number, dpr: number) {
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  render(engine: GameEngine) {
    const { ctx } = this;
    const w = engine.width;
    const h = engine.height;
    const snap = engine.snapshot();
    const world = snap.world;
    this.mistPhase = snap.time;

    let shakeX = 0;
    let shakeY = 0;
    if (snap.shake > 0 && engine.settings.screenShake) {
      const m = snap.shake * 10;
      shakeX = (Math.random() - 0.5) * m;
      shakeY = (Math.random() - 0.5) * m;
    }

    // ---- cinematic camera: lane lean, run bob, event zoom ----
    const targetCamX = -(snap.player.x - w / 2) * 0.1;
    const bobbing = snap.alive && !snap.player.jumping && !snap.player.sliding;
    const targetCamY = bobbing ? Math.sin(snap.time * 13) * 1.6 : 0;
    const targetZoom = 1 + engine.cameraPulse * 0.022;
    this.camX += (targetCamX - this.camX) * 0.08;
    this.camY += (targetCamY - this.camY) * 0.12;
    this.camZoom += (targetZoom - this.camZoom) * 0.1;

    ctx.save();
    const zoomAnchorY = h * 0.72;
    ctx.translate(w / 2 + this.camX + shakeX, zoomAnchorY + this.camY + shakeY);
    ctx.scale(this.camZoom, this.camZoom);
    ctx.translate(-w / 2, -zoomAnchorY);

    const sky = skyPalette(world);
    const terrain = terrainPalette(world.biome, world.nextBiome, world.biomeBlend, world.light);

    this.drawSky(w, h, engine.horizonY, snap.time, world, sky);
    this.drawCelestials(w, engine.horizonY, snap.time, world, sky);
    this.drawMountains(w, engine.horizonY, snap.bgOffset, terrain, world);
    this.drawDistantWater(w, engine.horizonY, terrain, world, snap.time);
    this.drawFields(w, h, engine.horizonY, engine.ground, snap.bgOffset, terrain, world);
    this.drawRoad(engine, snap.bgOffset, terrain, world);
    this.drawSideDecor(engine, snap.bgOffset, terrain, world, snap.time);

    // wildlife behind player (far)
    const farLife = snap.wildlife.filter((wl) => wl.z > 0.15);
    const nearLife = snap.wildlife.filter((wl) => wl.z <= 0.15);
    for (const wl of farLife.sort((a, b) => b.z - a.z)) {
      this.drawWildlife(engine, wl, world);
    }

    const entities: { z: number; draw: () => void }[] = [];
    for (const o of snap.obstacles) {
      entities.push({ z: o.z, draw: () => this.drawObstacle(engine, o, world) });
    }
    for (const c of snap.collectibles) {
      entities.push({ z: c.z, draw: () => this.drawCollectible(engine, c, world) });
    }
    // personal-best pacer flag on the track
    const pbRemaining = snap.pbDistance - snap.stats.distance;
    if (snap.pbDistance > 40 && !snap.pbReached && pbRemaining > 0 && pbRemaining <= VISIBLE_AHEAD_M) {
      const pbZ = pbRemaining / VISIBLE_AHEAD_M;
      entities.push({ z: pbZ, draw: () => this.drawPbFlag(engine, pbZ, snap.time) });
    }
    entities.sort((a, b) => b.z - a.z);
    for (const e of entities) e.draw();

    this.drawPlayer(engine, snap.player, snap.time, world);
    this.drawPlayerAuras(engine, snap.time);

    for (const wl of nearLife) {
      this.drawWildlife(engine, wl, world);
    }

    this.drawParticles(snap.particles);
    this.drawFloatingTexts(engine);

    // lighting overlays
    this.drawLighting(engine, w, h, world);

    // slow-motion tint
    if (engine.effects.slow > 0) {
      const a = Math.min(0.16, engine.effects.slow * 0.08);
      ctx.fillStyle = `rgba(90, 80, 200, ${a})`;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = `rgba(176, 122, 255, ${Math.min(0.5, engine.effects.slow * 0.2)})`;
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, w - 6, h - 6);
    }

    if (snap.nearMissFlash > 0) {
      ctx.fillStyle = `rgba(255, 220, 100, ${snap.nearMissFlash * 0.15})`;
      ctx.fillRect(0, 0, w, h);
    }

    // speed streaks at high velocity
    if (this.quality === 'high' && snap.speed > 380 && snap.alive) {
      const a = Math.min(0.22, (snap.speed - 380) / 600);
      ctx.strokeStyle = `rgba(255, 250, 235, ${a})`;
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const sy = ((snap.time * 900 + i * 173) % (h + 80)) - 40;
        const sx = i % 2 === 0 ? w * 0.08 + (i % 3) * 14 : w * 0.92 - (i % 3) * 14;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx, sy + 46 + (snap.speed - 380) * 0.12);
        ctx.stroke();
      }
    }

    // biome label toast handled via floating text; subtle vignette
    this.drawVignette(w, h, world);

    ctx.restore();
  }

  private drawSky(
    w: number,
    h: number,
    horizon: number,
    time: number,
    world: WorldState,
    sky: ReturnType<typeof skyPalette>,
  ) {
    const { ctx } = this;
    const grad = ctx.createLinearGradient(0, 0, 0, horizon + 50);
    grad.addColorStop(0, sky.top);
    grad.addColorStop(0.5, sky.mid);
    grad.addColorStop(1, sky.low);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // stars
    if (sky.stars > 0) {
      for (const st of this.starSeed) {
        const tw = 0.5 + 0.5 * Math.sin(time * 2 + st.tw);
        ctx.globalAlpha = sky.stars * tw * 0.9;
        ctx.fillStyle = '#e8eef8';
        ctx.beginPath();
        ctx.arc(st.x * w, st.y * horizon, st.s, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // clouds
    const cloudAlpha =
      world.weather === 'storm'
        ? 0.55
        : world.weather === 'rain' || world.weather === 'overcast'
          ? 0.45
          : world.timeOfDay === 'night'
            ? 0.15
            : 0.32;
    ctx.fillStyle =
      world.weather === 'storm' || world.weather === 'overcast'
        ? `rgba(60,70,85,${cloudAlpha})`
        : `rgba(255, 240, 220,${cloudAlpha})`;
    for (let i = 0; i < this.cloudSeed.length; i++) {
      const base = this.cloudSeed[i];
      const speed = 8 + (i % 3) * 4 + world.wind * 20;
      const x = ((base * 30 + time * speed) % (w + 140)) - 70;
      const y = 18 + (i % 4) * 16 + Math.sin(time * 0.5 + i) * 4;
      const scale = world.weather === 'storm' ? 1.35 : 1;
      this.cloud(x, y, (28 + (i % 3) * 10) * scale);
    }
  }

  private cloud(x: number, y: number, s: number) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.ellipse(x, y, s, s * 0.45, 0, 0, Math.PI * 2);
    ctx.ellipse(x - s * 0.5, y + 4, s * 0.55, s * 0.35, 0, 0, Math.PI * 2);
    ctx.ellipse(x + s * 0.55, y + 3, s * 0.5, s * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawCelestials(
    w: number,
    horizon: number,
    time: number,
    world: WorldState,
    sky: ReturnType<typeof skyPalette>,
  ) {
    const { ctx } = this;
    // sun path arc
    if (sky.showSun) {
      let t = 0.5;
      if (world.timeOfDay === 'dawn') t = 0.15 + world.dayPhase * 0.5;
      else if (world.timeOfDay === 'day') t = 0.35 + (world.dayPhase - 0.2) * 0.8;
      else if (world.timeOfDay === 'sunset') t = 0.75 + (world.dayPhase - 0.5) * 0.8;
      const sunX = w * (0.15 + t * 0.7);
      const sunY = horizon * (0.85 - Math.sin(t * Math.PI) * 0.7);
      const sunR = Math.min(w, horizon * 3) * 0.07;

      const glow = ctx.createRadialGradient(sunX, sunY, sunR * 0.2, sunX, sunY, sunR * 2.5);
      glow.addColorStop(0, sky.sunGlow);
      glow.addColorStop(0.5, sky.sunGlow.replace(/[\d.]+\)$/, '0.15)'));
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(sunX, sunY, sunR * 2.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = sky.sun;
      ctx.beginPath();
      ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
      ctx.fill();
    }

    if (sky.showMoon) {
      const moonX = w * 0.72;
      const moonY = horizon * 0.35 + Math.sin(time * 0.2) * 4;
      const moonR = Math.min(w, horizon * 3) * 0.045;
      const glow = ctx.createRadialGradient(moonX, moonY, moonR * 0.2, moonX, moonY, moonR * 2);
      glow.addColorStop(0, 'rgba(200,220,255,0.35)');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(moonX, moonY, moonR * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e8eef8';
      ctx.beginPath();
      ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
      ctx.fill();
      // crescent shadow
      ctx.fillStyle = sky.top;
      ctx.beginPath();
      ctx.arc(moonX + moonR * 0.35, moonY - moonR * 0.1, moonR * 0.85, 0, Math.PI * 2);
      ctx.fill();
    }

    // lightning flash
    if (world.weather === 'storm' && Math.random() < 0.008) {
      ctx.fillStyle = 'rgba(220,230,255,0.35)';
      ctx.fillRect(0, 0, w, horizon + 40);
    }
  }

  private drawMountains(
    w: number,
    horizon: number,
    offset: number,
    terrain: ReturnType<typeof terrainPalette>,
    world: WorldState,
  ) {
    const { ctx } = this;
    const scroll = (offset * 0.15) % w;
    const jagged = world.biome === 'simien_mountains' || world.nextBiome === 'simien_mountains' ? 1.45 : 1;

    ctx.fillStyle = terrain.mountainFar;
    ctx.beginPath();
    ctx.moveTo(-20, horizon);
    for (let x = -20; x <= w + 20; x += 18) {
      const n =
        Math.sin((x + scroll * 0.5) * 0.01) * 40 * jagged +
        Math.sin((x + scroll) * 0.023) * 25 * jagged;
      ctx.lineTo(x, horizon - 70 - n);
    }
    ctx.lineTo(w + 20, horizon);
    ctx.closePath();
    ctx.fill();

    if (terrain.snow) {
      ctx.fillStyle = 'rgba(255, 250, 245, 0.55)';
      ctx.beginPath();
      ctx.moveTo(w * 0.18, horizon - 105);
      ctx.lineTo(w * 0.26, horizon - 145);
      ctx.lineTo(w * 0.34, horizon - 100);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(w * 0.55, horizon - 90);
      ctx.lineTo(w * 0.62, horizon - 130);
      ctx.lineTo(w * 0.7, horizon - 88);
      ctx.fill();
    }

    ctx.fillStyle = terrain.mountainMid;
    ctx.beginPath();
    ctx.moveTo(-30, horizon + 10);
    for (let x = -30; x <= w + 30; x += 14) {
      const n =
        Math.sin((x - scroll * 0.8) * 0.015) * 35 * jagged +
        Math.cos((x + scroll) * 0.03) * 18;
      ctx.lineTo(x, horizon - 35 - n);
    }
    ctx.lineTo(w + 30, horizon + 10);
    ctx.closePath();
    ctx.fill();

    // Simien escarpment cliffs
    if (world.biome === 'simien_mountains') {
      ctx.fillStyle = terrain.mountainNear;
      ctx.beginPath();
      ctx.moveTo(w * 0.55, horizon + 8);
      ctx.lineTo(w * 0.62, horizon - 55);
      ctx.lineTo(w * 0.7, horizon - 40);
      ctx.lineTo(w * 0.78, horizon - 70);
      ctx.lineTo(w * 0.9, horizon - 30);
      ctx.lineTo(w + 10, horizon + 8);
      ctx.closePath();
      ctx.fill();
    }
  }

  private drawDistantWater(
    w: number,
    horizon: number,
    terrain: ReturnType<typeof terrainPalette>,
    world: WorldState,
    time: number,
  ) {
    if (!terrain.riverside && world.biome !== 'blue_nile') return;
    const { ctx } = this;
    const y = horizon - 2;
    const grad = ctx.createLinearGradient(0, y, 0, y + 28);
    grad.addColorStop(0, terrain.water);
    grad.addColorStop(1, 'rgba(20,80,100,0.2)');
    ctx.fillStyle = grad;
    ctx.globalAlpha = 0.55 + Math.sin(time * 2) * 0.05;
    ctx.fillRect(0, y, w, 26);
    ctx.globalAlpha = 1;
    // shimmer
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const x = ((time * 30 + i * 80) % (w + 40)) - 20;
      ctx.beginPath();
      ctx.moveTo(x, y + 8 + i * 3);
      ctx.lineTo(x + 30, y + 8 + i * 3);
      ctx.stroke();
    }
  }

  private drawFields(
    w: number,
    h: number,
    horizon: number,
    ground: number,
    offset: number,
    terrain: ReturnType<typeof terrainPalette>,
    world: WorldState,
  ) {
    const { ctx } = this;
    const grad = ctx.createLinearGradient(0, horizon, 0, h);
    grad.addColorStop(0, terrain.fieldLight);
    grad.addColorStop(0.4, terrain.field);
    grad.addColorStop(1, terrain.fieldDark);
    ctx.fillStyle = grad;
    ctx.fillRect(0, horizon, w, h - horizon);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, horizon, w, h - horizon);
    ctx.clip();

    // terraces / fields
    for (let i = 0; i < 12; i++) {
      const y = horizon + 10 + i * ((ground - horizon) / 8);
      ctx.strokeStyle = `rgba(20, 40, 15, ${0.06 + (i % 2) * 0.04})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, y + Math.sin(offset * 0.1 + i) * 2);
      ctx.lineTo(w, y + Math.cos(offset * 0.08 + i) * 2);
      ctx.stroke();
    }

    // coffee bushes / crops
    const scroll = offset * 2;
    for (let i = 0; i < 34; i++) {
      const side = i % 2 === 0 ? 0.07 : 0.93;
      const px = w * side + Math.sin(i * 2.1) * w * 0.07;
      const depth = ((i * 47 + scroll) % 100) / 100;
      const py = horizon + depth * (h - horizon - 40);
      const sc = 0.3 + depth * 0.9;

      if (world.biome === 'blue_nile') {
        // reeds
        ctx.strokeStyle = '#2a5a30';
        ctx.lineWidth = 2 * sc;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.quadraticCurveTo(px + Math.sin(offset + i) * 6, py - 12 * sc, px + 2, py - 22 * sc);
        ctx.stroke();
      } else if (world.biome === 'addis_ababa') {
        // scrub / grass patches
        ctx.fillStyle = '#3a4a30';
        ctx.fillRect(px - 4 * sc, py, 8 * sc, 3 * sc);
      } else {
        ctx.fillStyle = i % 3 === 0 ? '#2a6b24' : '#245a20';
        ctx.beginPath();
        ctx.ellipse(px, py, 8 * sc, 5 * sc, 0, 0, Math.PI * 2);
        ctx.fill();
        if (i % 4 === 0) {
          ctx.fillStyle = '#8B2500';
          ctx.beginPath();
          ctx.arc(px - 2 * sc, py, 1.5 * sc, 0, Math.PI * 2);
          ctx.arc(px + 3 * sc, py - 1 * sc, 1.2 * sc, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  private drawRoad(
    engine: GameEngine,
    offset: number,
    terrain: ReturnType<typeof terrainPalette>,
    world: WorldState,
  ) {
    const { ctx } = this;
    const w = engine.width;
    const horizon = engine.horizonY;
    const ground = engine.ground;
    const lanes = engine.lanes;
    const farHalf = (lanes[2] - lanes[0]) * 0.2;
    const nearHalf = (lanes[2] - lanes[0]) * 0.72;
    const cx = w / 2;

    // urban asphalt vs dirt
    ctx.fillStyle = terrain.road;
    ctx.beginPath();
    ctx.moveTo(cx - farHalf, horizon + 4);
    ctx.lineTo(cx + farHalf, horizon + 4);
    ctx.lineTo(cx + nearHalf + 30, ground + 80);
    ctx.lineTo(cx - nearHalf - 30, ground + 80);
    ctx.closePath();
    ctx.fill();

    // Addis road markings / sidewalks
    if (terrain.urban) {
      ctx.fillStyle = 'rgba(90,90,90,0.5)';
      ctx.beginPath();
      ctx.moveTo(cx - farHalf - 6, horizon + 4);
      ctx.lineTo(cx - farHalf, horizon + 4);
      ctx.lineTo(cx - nearHalf - 30, ground + 80);
      ctx.lineTo(cx - nearHalf - 48, ground + 80);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + farHalf, horizon + 4);
      ctx.lineTo(cx + farHalf + 6, horizon + 4);
      ctx.lineTo(cx + nearHalf + 48, ground + 80);
      ctx.lineTo(cx + nearHalf + 30, ground + 80);
      ctx.closePath();
      ctx.fill();
    }

    ctx.strokeStyle = terrain.roadDark;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx - farHalf, horizon + 4);
    ctx.lineTo(cx - nearHalf - 30, ground + 80);
    ctx.moveTo(cx + farHalf, horizon + 4);
    ctx.lineTo(cx + nearHalf + 30, ground + 80);
    ctx.stroke();

    // lane lines
    ctx.strokeStyle = terrain.roadLine;
    ctx.lineCap = 'round';
    const segments = 14;
    for (let laneDiv = 0; laneDiv < 2; laneDiv++) {
      const tLane = laneDiv === 0 ? 0.33 : 0.66;
      for (let i = 0; i < segments; i++) {
        const z1 = (i / segments + (offset * 0.015) % (1 / segments)) % 1;
        const z2 = z1 + (terrain.urban ? 0.035 : 0.03);
        if (z2 > 1) continue;
        const y1 = horizon + (ground - horizon) * (1 - z1) ** 1.15;
        const y2 = horizon + (ground - horizon) * (1 - z2) ** 1.15;
        const s1 = 0.25 + (1 - z1) * 0.85;
        const halfNear = nearHalf + 30;
        const halfFar = farHalf;
        const hw1 = halfFar + (halfNear - halfFar) * ((y1 - horizon) / (ground + 80 - horizon));
        const hw2 = halfFar + (halfNear - halfFar) * ((y2 - horizon) / (ground + 80 - horizon));
        const x1 = cx - hw1 + tLane * hw1 * 2;
        const x2 = cx - hw2 + tLane * hw2 * 2;
        ctx.lineWidth = (terrain.urban ? 3 : 2) * s1;
        ctx.globalAlpha = 0.35 + (1 - z1) * 0.5;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    // Nile roadside wet sheen
    if (world.biome === 'blue_nile' || world.rainIntensity > 0.3) {
      ctx.fillStyle = `rgba(100,160,190,${0.06 + world.rainIntensity * 0.08})`;
      ctx.beginPath();
      ctx.moveTo(cx - farHalf, horizon + 4);
      ctx.lineTo(cx + farHalf, horizon + 4);
      ctx.lineTo(cx + nearHalf + 30, ground + 80);
      ctx.lineTo(cx - nearHalf - 30, ground + 80);
      ctx.closePath();
      ctx.fill();
    }
  }

  private drawSideDecor(
    engine: GameEngine,
    offset: number,
    terrain: ReturnType<typeof terrainPalette>,
    world: WorldState,
    time: number,
  ) {
    const w = engine.width;
    const horizon = engine.horizonY;
    const ground = engine.ground;

    if (terrain.urban || world.biome === 'addis_ababa') {
      for (const b of this.buildingSeed) {
        const z = ((b.x + offset * 0.5) % 100) / 100;
        const y = horizon + (ground - horizon) * (1 - z) ** 1.1;
        const scale = 0.2 + (1 - z) * 0.85;
        const x = w / 2 + b.side * (125 + (1 - z) * 95) * (w / 400);
        this.drawBuilding(x, y, scale, b, world);
      }
      // street lamps — glow at night
      const night = world.timeOfDay === 'night' || world.timeOfDay === 'sunset';
      for (let i = 0; i < 6; i++) {
        const z = ((i * 33 + offset * 0.5) % 95) / 95;
        const y = horizon + (ground - horizon) * (1 - z) ** 1.1;
        const scale = 0.25 + (1 - z) * 0.75;
        const side = i % 2 === 0 ? -1 : 1;
        const x = w / 2 + side * (105 + (1 - z) * 60) * (w / 400);
        this.drawStreetLamp(x, y, scale, night && this.quality === 'high');
      }
    } else {
      for (let i = 0; i < this.villageSeed.length; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const z = ((this.villageSeed[i] + offset * 0.4) % 120) / 120;
        const y = horizon + (ground - horizon) * (1 - z) ** 1.1;
        const scale = 0.2 + (1 - z) * 0.7;
        const x = w / 2 + side * (110 + (1 - z) * 90) * (w / 400);
        if (world.biome === 'traditional_village' || world.biome === 'coffee_highlands') {
          this.drawHut(x, y, scale, world, i);
        } else if (world.biome === 'blue_nile') {
          this.drawHut(x, y, scale * 0.85, world, i);
        } else {
          this.drawHut(x, y, scale * 0.7, world, i);
        }
      }
    }

    for (const t of this.treeSeed) {
      const z = ((t.x + offset * 0.55) % 100) / 100;
      const y = horizon + (ground - horizon) * (1 - z) ** 1.1;
      const scale = 0.2 + (1 - z) * 0.75;
      const x = w / 2 + t.side * (130 + (1 - z) * 100) * (w / 400);
      if (world.biome === 'simien_mountains') {
        this.drawGiantLobelia(x, y, scale * (t.h / 40));
      } else if (world.biome === 'blue_nile') {
        this.drawPalm(x, y, scale * (t.h / 40), time);
      } else {
        this.drawAcacia(x, y, scale * (t.h / 40));
      }
    }

    // market umbrellas in village / addis
    if (world.biome === 'traditional_village' || world.biome === 'addis_ababa') {
      for (let i = 0; i < 4; i++) {
        const z = ((i * 40 + offset * 0.45) % 90) / 90;
        const side = i % 2 === 0 ? -1 : 1;
        const y = horizon + (ground - horizon) * (1 - z) ** 1.1;
        const scale = 0.25 + (1 - z) * 0.7;
        const x = w / 2 + side * (100 + (1 - z) * 70) * (w / 400);
        this.drawMarketUmbrella(x, y, scale, i);
      }
    }
  }

  private drawBuilding(
    x: number,
    y: number,
    s: number,
    b: { h: number; w: number; windows: number },
    world: WorldState,
  ) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    const h = b.h;
    const w = b.w;
    ctx.fillStyle = '#5a5a68';
    ctx.fillRect(-w / 2, -h, w, h);
    ctx.fillStyle = '#3a3a48';
    ctx.fillRect(-w / 2, -h, w, 4);
    // windows — stable pattern, lit at night/sunset
    const lit = world.timeOfDay === 'night' || world.timeOfDay === 'sunset';
    for (let r = 0; r < b.windows; r++) {
      for (let c = 0; c < 2; c++) {
        const on = lit && (r + c + Math.floor(Math.abs(x))) % 3 !== 0;
        ctx.fillStyle = on ? '#f0d080' : '#1a1a28';
        ctx.fillRect(-w / 2 + 4 + c * (w / 2 - 2), -h + 8 + r * 10, 5, 6);
      }
    }
    ctx.restore();
  }

  private drawStreetLamp(x: number, y: number, s: number, night: boolean) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.strokeStyle = '#2a2a35';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -46);
    ctx.quadraticCurveTo(0, -54, 10, -54);
    ctx.stroke();
    ctx.fillStyle = night ? '#ffe9a8' : '#c0c0c8';
    ctx.beginPath();
    ctx.arc(12, -53, 4, 0, Math.PI * 2);
    ctx.fill();
    if (night) {
      const g = ctx.createRadialGradient(12, -53, 2, 12, -53, 40);
      g.addColorStop(0, 'rgba(255,220,130,0.35)');
      g.addColorStop(1, 'rgba(255,220,130,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(12, -53, 40, 0, Math.PI * 2);
      ctx.fill();
      // light cone on ground
      ctx.fillStyle = 'rgba(255,220,130,0.1)';
      ctx.beginPath();
      ctx.moveTo(6, -50);
      ctx.lineTo(-22, 0);
      ctx.lineTo(42, 0);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  private drawHut(x: number, y: number, s: number, world: WorldState, i: number) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = '#c4a574';
    ctx.beginPath();
    ctx.ellipse(0, -12, 18, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = i % 2 === 0 ? '#5c3317' : '#6a3a1a';
    ctx.beginPath();
    ctx.moveTo(0, -48);
    ctx.lineTo(24, -14);
    ctx.lineTo(-24, -14);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#3d2914';
    ctx.fillRect(-5, -18, 10, 16);
    // night glow
    if (world.timeOfDay === 'night') {
      ctx.fillStyle = 'rgba(255,180,60,0.35)';
      ctx.beginPath();
      ctx.arc(0, -14, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawAcacia(x: number, y: number, s: number) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.strokeStyle = '#3d2914';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -36);
    ctx.stroke();
    ctx.fillStyle = '#2d5a27';
    ctx.beginPath();
    ctx.ellipse(0, -42, 28, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3d7a35';
    ctx.beginPath();
    ctx.ellipse(-8, -46, 14, 7, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawGiantLobelia(x: number, y: number, s: number) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = '#4a5a38';
    ctx.fillRect(-3, -50, 6, 50);
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i % 2 ? '#3a6a40' : '#2a5a30';
      ctx.beginPath();
      ctx.ellipse(0, -12 - i * 7, 14 - i, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#d0e0d8';
    ctx.beginPath();
    ctx.arc(0, -54, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawPalm(x: number, y: number, s: number, time: number) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.strokeStyle = '#6a4a28';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(4, -20, 0, -44);
    ctx.stroke();
    ctx.strokeStyle = '#2d6b28';
    ctx.lineWidth = 3;
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * 0.45 + Math.sin(time + i) * 0.05;
      ctx.beginPath();
      ctx.moveTo(0, -44);
      ctx.quadraticCurveTo(
        Math.cos(a) * 10,
        -44 + Math.sin(a) * 10,
        Math.cos(a) * 28,
        -44 + Math.sin(a) * 22,
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawMarketUmbrella(x: number, y: number, s: number, i: number) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.strokeStyle = '#5a4030';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -28);
    ctx.stroke();
    const colors = ['#c41e3a', '#228B22', '#FFD700', '#1a5fb4'];
    ctx.fillStyle = colors[i % colors.length];
    ctx.beginPath();
    ctx.moveTo(0, -34);
    ctx.lineTo(18, -22);
    ctx.lineTo(-18, -22);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawPbFlag(engine: GameEngine, z: number, time: number) {
    const { ctx } = this;
    const p = engine.projectPublic(z, 1);
    const s = p.scale;
    const halfW = ((engine.lanes[2] - engine.lanes[0]) * 0.62 + 30) * s;
    const poleH = 78 * s;
    const wave = Math.sin(time * 5) * 3 * s;

    ctx.save();
    ctx.translate(p.x, p.y);

    // ground line
    ctx.strokeStyle = 'rgba(124,252,0,0.4)';
    ctx.lineWidth = 3 * s;
    ctx.setLineDash([8 * s, 6 * s]);
    ctx.beginPath();
    ctx.moveTo(-halfW, 0);
    ctx.lineTo(halfW, 0);
    ctx.stroke();
    ctx.setLineDash([]);

    // poles
    ctx.strokeStyle = '#e8e0d0';
    ctx.lineWidth = 4 * s;
    ctx.beginPath();
    ctx.moveTo(-halfW, 0);
    ctx.lineTo(-halfW, -poleH);
    ctx.moveTo(halfW, 0);
    ctx.lineTo(halfW, -poleH);
    ctx.stroke();

    // tricolor banner
    const bannerH = 22 * s;
    const colors = ['#078930', '#fcdd09', '#da121a'];
    colors.forEach((col, i) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      const y0 = -poleH + (i * bannerH) / 3;
      const y1 = -poleH + ((i + 1) * bannerH) / 3;
      ctx.moveTo(-halfW, y0 + (i === 0 ? 0 : wave * 0.4));
      ctx.quadraticCurveTo(0, y0 + wave, halfW, y0);
      ctx.lineTo(halfW, y1);
      ctx.quadraticCurveTo(0, y1 + wave, -halfW, y1 + (i === 2 ? 0 : wave * 0.4));
      ctx.closePath();
      ctx.fill();
    });

    // PB label
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${Math.max(9, 15 * s)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 3 * s;
    ctx.strokeText('YOUR BEST', 0, -poleH + bannerH / 2 + wave * 0.5);
    ctx.fillText('YOUR BEST', 0, -poleH + bannerH / 2 + wave * 0.5);

    // glow beacon
    ctx.fillStyle = 'rgba(124,252,0,0.35)';
    ctx.beginPath();
    ctx.arc(halfW, -poleH - 8 * s, (4 + Math.sin(time * 6) * 1.5) * s, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private drawObstacle(engine: GameEngine, o: Obstacle, world: WorldState) {
    const { ctx } = this;
    let laneOffset = 0;
    if (o.type === 'goat' || o.type === 'sheep' || o.type === 'hyena') {
      laneOffset = Math.sin(o.goatPhase ?? 0) * 28 * (o.goatDir ?? 1);
    }
    const p = engine.projectPublic(o.z, o.multiLane ? 1 : o.lane, laneOffset);
    const s = p.scale;

    ctx.save();
    ctx.translate(p.x, p.y);
    // night silhouette boost
    if (world.timeOfDay === 'night') {
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 8;
    }
    this.paintObstacle(o.type, s, o, world);
    ctx.restore();
  }

  private paintObstacle(type: ObstacleType, s: number, o: Obstacle, _world: WorldState) {
    switch (type) {
      case 'rock':
        this.rock(s);
        break;
      case 'boulder':
        this.boulder(s);
        break;
      case 'tree':
        this.obstacleTree(s);
        break;
      case 'river':
        this.river(s, o.multiLane ? 1.8 : 1, this.mistPhase);
        break;
      case 'goat':
        this.goat(s, o.goatPhase ?? 0, '#e8e0d5');
        break;
      case 'sheep':
        this.sheep(s, o.goatPhase ?? 0);
        break;
      case 'cart':
        this.cart(s);
        break;
      case 'barrel':
        this.barrel(s);
        break;
      case 'market_stall':
        this.marketStall(s);
        break;
      case 'bajaj':
        this.bajaj(s, o.anim ?? 0);
        break;
      case 'fence':
        this.fence(s, o.multiLane ? 1.6 : 1);
        break;
      case 'pot_hole':
        this.potHole(s);
        break;
      case 'fallen_log':
        this.fallenLog(s, o.multiLane ? 1.5 : 1);
        break;
      case 'hyena':
        this.hyena(s, o.goatPhase ?? 0);
        break;
      default:
        this.rock(s);
    }
  }

  private rock(s: number) {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(0, 2 * s, 22 * s, 5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6b6b6b';
    ctx.beginPath();
    ctx.moveTo(-22 * s, 0);
    ctx.lineTo(-18 * s, -22 * s);
    ctx.lineTo(-4 * s, -30 * s);
    ctx.lineTo(14 * s, -24 * s);
    ctx.lineTo(24 * s, -8 * s);
    ctx.lineTo(18 * s, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#8a8a8a';
    ctx.beginPath();
    ctx.moveTo(-10 * s, -8 * s);
    ctx.lineTo(-4 * s, -22 * s);
    ctx.lineTo(8 * s, -14 * s);
    ctx.closePath();
    ctx.fill();
  }

  private boulder(s: number) {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 2 * s, 30 * s, 6 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5a534c';
    ctx.beginPath();
    ctx.ellipse(0, -20 * s, 28 * s, 24 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7a736c';
    ctx.beginPath();
    ctx.ellipse(-6 * s, -28 * s, 10 * s, 8 * s, -0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  private obstacleTree(s: number) {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(0, 2 * s, 16 * s, 4 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5c3317';
    ctx.fillRect(-5 * s, -40 * s, 10 * s, 42 * s);
    ctx.fillStyle = '#1e4d1a';
    ctx.beginPath();
    ctx.arc(0, -55 * s, 22 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2d6b28';
    ctx.beginPath();
    ctx.arc(-10 * s, -50 * s, 14 * s, 0, Math.PI * 2);
    ctx.arc(12 * s, -52 * s, 13 * s, 0, Math.PI * 2);
    ctx.arc(0, -68 * s, 12 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b22222';
    ctx.beginPath();
    ctx.arc(-6 * s, -48 * s, 2.5 * s, 0, Math.PI * 2);
    ctx.arc(8 * s, -58 * s, 2.5 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  private river(s: number, wide: number, time: number) {
    const { ctx } = this;
    const rw = 40 * s * wide;
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.ellipse(0, 2 * s, rw, 8 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    const grad = ctx.createLinearGradient(-rw, 0, rw, 0);
    grad.addColorStop(0, '#1a6b8a');
    grad.addColorStop(0.5, '#3db5d4');
    grad.addColorStop(1, '#1a6b8a');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, -4 * s, rw, 10 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1.5 * s;
    ctx.beginPath();
    ctx.moveTo(-rw * 0.6, -4 * s + Math.sin(time * 6) * 2 * s);
    ctx.quadraticCurveTo(0, -10 * s, rw * 0.6, -2 * s + Math.cos(time * 5) * 2 * s);
    ctx.stroke();
  }

  private goat(s: number, phase: number, color: string) {
    const { ctx } = this;
    const leg = Math.sin(phase * 4) * 3 * s;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(0, 2 * s, 18 * s, 4 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, -16 * s, 18 * s, 12 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(16 * s, -26 * s, 8 * s, 7 * s, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5c4033';
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.moveTo(14 * s, -32 * s);
    ctx.quadraticCurveTo(12 * s, -42 * s, 8 * s, -40 * s);
    ctx.moveTo(18 * s, -32 * s);
    ctx.quadraticCurveTo(20 * s, -42 * s, 24 * s, -38 * s);
    ctx.stroke();
    ctx.strokeStyle = '#c4b8a8';
    ctx.lineWidth = 3 * s;
    ctx.beginPath();
    ctx.moveTo(-10 * s, -8 * s);
    ctx.lineTo(-10 * s, leg);
    ctx.moveTo(-2 * s, -8 * s);
    ctx.lineTo(-2 * s, -leg);
    ctx.moveTo(6 * s, -8 * s);
    ctx.lineTo(6 * s, leg);
    ctx.moveTo(12 * s, -8 * s);
    ctx.lineTo(12 * s, -leg);
    ctx.stroke();
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(18 * s, -27 * s, 1.5 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  private sheep(s: number, phase: number) {
    const { ctx } = this;
    const leg = Math.sin(phase * 4) * 2 * s;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(0, 2 * s, 18 * s, 4 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f2ebe0';
    ctx.beginPath();
    ctx.ellipse(0, -16 * s, 18 * s, 14 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    // fluffy bumps
    ctx.beginPath();
    ctx.arc(-10 * s, -22 * s, 8 * s, 0, Math.PI * 2);
    ctx.arc(0, -26 * s, 9 * s, 0, Math.PI * 2);
    ctx.arc(10 * s, -20 * s, 8 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8dcc8';
    ctx.beginPath();
    ctx.ellipse(16 * s, -18 * s, 7 * s, 6 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d0c4b0';
    ctx.lineWidth = 3 * s;
    ctx.beginPath();
    ctx.moveTo(-8 * s, -6 * s);
    ctx.lineTo(-8 * s, leg);
    ctx.moveTo(8 * s, -6 * s);
    ctx.lineTo(8 * s, -leg);
    ctx.stroke();
  }

  private hyena(s: number, phase: number) {
    const { ctx } = this;
    const leg = Math.sin(phase * 5) * 3 * s;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(0, 2 * s, 20 * s, 4 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b8a070';
    ctx.beginPath();
    ctx.ellipse(0, -14 * s, 20 * s, 10 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    // spots
    ctx.fillStyle = '#6a5030';
    ctx.beginPath();
    ctx.arc(-6 * s, -16 * s, 2 * s, 0, Math.PI * 2);
    ctx.arc(4 * s, -12 * s, 2.5 * s, 0, Math.PI * 2);
    ctx.arc(10 * s, -18 * s, 1.8 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b8a070';
    ctx.beginPath();
    ctx.ellipse(18 * s, -22 * s, 9 * s, 6 * s, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8a7050';
    ctx.lineWidth = 3 * s;
    ctx.beginPath();
    ctx.moveTo(-10 * s, -6 * s);
    ctx.lineTo(-10 * s, leg);
    ctx.moveTo(8 * s, -6 * s);
    ctx.lineTo(8 * s, -leg);
    ctx.stroke();
    // tail
    ctx.beginPath();
    ctx.moveTo(-18 * s, -14 * s);
    ctx.quadraticCurveTo(-28 * s, -24 * s, -24 * s, -8 * s);
    ctx.stroke();
  }

  private cart(s: number) {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(0, 2 * s, 26 * s, 5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(-22 * s, -28 * s, 44 * s, 20 * s);
    ctx.fillStyle = '#A0522D';
    ctx.fillRect(-20 * s, -36 * s, 40 * s, 10 * s);
    ctx.fillStyle = BASE.coffee;
    ctx.beginPath();
    ctx.ellipse(-8 * s, -40 * s, 10 * s, 8 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(8 * s, -42 * s, 11 * s, 9 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2a2a2a';
    ctx.beginPath();
    ctx.arc(-14 * s, -4 * s, 10 * s, 0, Math.PI * 2);
    ctx.arc(14 * s, -4 * s, 10 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c4a574';
    ctx.beginPath();
    ctx.arc(-14 * s, -4 * s, 4 * s, 0, Math.PI * 2);
    ctx.arc(14 * s, -4 * s, 4 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  private barrel(s: number) {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(0, 2 * s, 14 * s, 4 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6F4E37';
    ctx.beginPath();
    ctx.ellipse(0, -20 * s, 14 * s, 22 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#3d2914';
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.ellipse(0, -20 * s, 14 * s, 22 * s, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-14 * s, -20 * s);
    ctx.lineTo(14 * s, -20 * s);
    ctx.moveTo(-12 * s, -10 * s);
    ctx.lineTo(12 * s, -10 * s);
    ctx.stroke();
  }

  private marketStall(s: number) {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(0, 2 * s, 28 * s, 5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c4a574';
    ctx.fillRect(-24 * s, -30 * s, 48 * s, 28 * s);
    ctx.fillStyle = '#c41e3a';
    ctx.beginPath();
    ctx.moveTo(-28 * s, -30 * s);
    ctx.lineTo(0, -52 * s);
    ctx.lineTo(28 * s, -30 * s);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#228B22';
    ctx.fillRect(-20 * s, -26 * s, 12 * s, 8 * s);
    ctx.fillStyle = '#FFD700';
    ctx.fillRect(4 * s, -26 * s, 12 * s, 8 * s);
  }

  private bajaj(s: number, anim: number) {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(0, 2 * s, 26 * s, 5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    // body
    ctx.fillStyle = '#e8a020';
    ctx.beginPath();
    ctx.moveTo(-22 * s, -8 * s);
    ctx.lineTo(-18 * s, -36 * s);
    ctx.lineTo(12 * s, -40 * s);
    ctx.lineTo(24 * s, -18 * s);
    ctx.lineTo(20 * s, -8 * s);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#1a5fb4';
    ctx.fillRect(-14 * s, -32 * s, 18 * s, 12 * s);
    ctx.fillStyle = 'rgba(150,200,230,0.5)';
    ctx.fillRect(-12 * s, -30 * s, 14 * s, 8 * s);
    // wheels
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(-12 * s, -4 * s, 8 * s, 0, Math.PI * 2);
    ctx.arc(14 * s, -4 * s, 8 * s, 0, Math.PI * 2);
    ctx.arc(4 * s, -4 * s, 7 * s, 0, Math.PI * 2);
    ctx.fill();
    // blinker
    ctx.fillStyle = anim % 1 < 0.5 ? '#ff4040' : '#802020';
    ctx.beginPath();
    ctx.arc(22 * s, -20 * s, 2.5 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  private fence(s: number, wide: number) {
    const { ctx } = this;
    const w = 30 * s * wide;
    ctx.strokeStyle = '#6a4a28';
    ctx.lineWidth = 3 * s;
    ctx.beginPath();
    ctx.moveTo(-w, -8 * s);
    ctx.lineTo(w, -8 * s);
    ctx.moveTo(-w, -20 * s);
    ctx.lineTo(w, -20 * s);
    ctx.stroke();
    for (let i = -2; i <= 2; i++) {
      const x = (i / 2) * w;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, -28 * s);
      ctx.stroke();
    }
  }

  private potHole(s: number) {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(20,15,10,0.75)';
    ctx.beginPath();
    ctx.ellipse(0, -2 * s, 24 * s, 10 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(80,60,40,0.6)';
    ctx.lineWidth = 2 * s;
    ctx.stroke();
  }

  private fallenLog(s: number, wide: number) {
    const { ctx } = this;
    const w = 32 * s * wide;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(0, 2 * s, w, 5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5c3a1e';
    ctx.beginPath();
    ctx.ellipse(0, -8 * s, w, 10 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#3d2410';
    ctx.lineWidth = 1.5 * s;
    ctx.beginPath();
    ctx.moveTo(-w * 0.5, -8 * s);
    ctx.lineTo(w * 0.5, -8 * s);
    ctx.stroke();
  }

  private drawCollectible(engine: GameEngine, c: Collectible, world: WorldState) {
    if (c.collected) return;
    const { ctx } = this;
    const p = engine.projectPublic(c.z, c.lane);
    const bob = Math.sin(c.bobPhase) * 6 * p.scale;
    const s = p.scale;
    const spin = c.spin ?? 0;

    ctx.save();
    ctx.translate(p.x, p.y - 28 * s + bob);

    // light glow stronger at night
    const glowA = world.timeOfDay === 'night' ? 0.4 : 0.22;
    ctx.fillStyle =
      c.type === 'coin' || c.type === 'golden_bean' || c.type === 'star'
        ? `rgba(255,215,0,${glowA})`
        : c.type === 'meskel_flower'
          ? `rgba(255,160,40,${glowA})`
          : `rgba(139,90,43,${glowA})`;
    ctx.beginPath();
    ctx.arc(0, 0, 16 * s, 0, Math.PI * 2);
    ctx.fill();

    ctx.rotate(Math.sin(spin) * 0.2);

    switch (c.type) {
      case 'bean':
        this.drawBean(s, BASE.bean);
        break;
      case 'golden_bean':
        this.drawBean(s, '#D4AF37');
        ctx.strokeStyle = '#FFF8DC';
        ctx.lineWidth = 1 * s;
        ctx.stroke();
        break;
      case 'coin':
        ctx.fillStyle = BASE.gold;
        ctx.beginPath();
        ctx.arc(0, 0, 12 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#b8860b';
        ctx.lineWidth = 2 * s;
        ctx.stroke();
        ctx.fillStyle = '#b8860b';
        ctx.font = `bold ${12 * s}px Georgia, serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('ብ', 0, 1 * s);
        break;
      case 'injera':
        ctx.fillStyle = '#E8D5A3';
        ctx.beginPath();
        ctx.arc(0, 0, 13 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#d4c08a';
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * 5 * s, Math.sin(a) * 5 * s, 2 * s, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      case 'meskel_flower':
        ctx.fillStyle = '#FFD700';
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + spin;
          ctx.beginPath();
          ctx.ellipse(Math.cos(a) * 7 * s, Math.sin(a) * 7 * s, 5 * s, 2.5 * s, a, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#c45c26';
        ctx.beginPath();
        ctx.arc(0, 0, 3.5 * s, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'coffee_pot':
        // jebena silhouette
        ctx.fillStyle = '#5c3317';
        ctx.beginPath();
        ctx.ellipse(0, 2 * s, 9 * s, 11 * s, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(-3 * s, -14 * s, 6 * s, 8 * s);
        ctx.beginPath();
        ctx.moveTo(8 * s, -2 * s);
        ctx.quadraticCurveTo(16 * s, -6 * s, 14 * s, 4 * s);
        ctx.lineTo(8 * s, 4 * s);
        ctx.fill();
        ctx.strokeStyle = '#D4AF37';
        ctx.lineWidth = 1.5 * s;
        ctx.beginPath();
        ctx.arc(0, 2 * s, 9 * s, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'star':
        ctx.fillStyle = '#FFFACD';
        this.star(0, 0, 14 * s, 6 * s, 5);
        ctx.fillStyle = '#87CEEB';
        this.star(0, 0, 8 * s, 3 * s, 5);
        break;
      case 'powerup':
        this.drawPowerOrb(s, c.powerup ?? 'magnet', spin);
        break;
    }
    ctx.restore();
  }

  private drawPowerOrb(s: number, id: string, spin: number) {
    const { ctx } = this;
    const colors: Record<string, string> = {
      magnet: '#ff5a4a',
      shield: '#5aa8ff',
      double: '#ffd700',
      superJump: '#5ad46a',
      slow: '#b07aff',
    };
    const glyphs: Record<string, string> = {
      magnet: 'M',
      shield: 'S',
      double: '2×',
      superJump: '↑',
      slow: '◷',
    };
    const col = colors[id] ?? '#ffffff';
    const pulse = 1 + Math.sin(spin * 3) * 0.1;

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(0, 0, 14 * s * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 3 * s;
    ctx.stroke();
    ctx.fillStyle = col;
    ctx.font = `bold ${13 * s}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyphs[id] ?? '?', 0, 1 * s);
  }

  private drawBean(s: number, color: string) {
    const { ctx } = this;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, 0, 10 * s, 14 * s, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1.5 * s;
    ctx.beginPath();
    ctx.moveTo(0, -10 * s);
    ctx.quadraticCurveTo(4 * s, 0, 0, 10 * s);
    ctx.stroke();
  }

  private drawWildlife(engine: GameEngine, w: Wildlife, world: WorldState) {
    const { ctx } = this;
    let pos: { x: number; y: number; scale: number };

    if (w.type === 'bird' || w.type === 'butterfly') {
      const t = Math.max(0, Math.min(1, w.z));
      const yBase = engine.horizonY + (engine.ground - engine.horizonY) * (1 - t) ** 1.15;
      const scale = 0.25 + (1 - t) * 0.85;
      const x =
        engine.width / 2 +
        w.side * (90 + (1 - t) * 100) * (engine.width / 400) +
        Math.sin(w.phase) * 20;
      const y =
        yBase -
        (w.type === 'bird' ? 60 : 30) * scale -
        Math.abs(Math.sin(w.phase)) * (w.type === 'bird' ? 18 : 12);
      pos = { x, y, scale: scale * w.scale };
    } else if (w.type === 'fish') {
      if (world.biome !== 'blue_nile') return;
      const t = Math.max(0, Math.min(1, w.z));
      const y = engine.horizonY + 8 + Math.sin(w.phase) * 3;
      const x = engine.width * (0.2 + t * 0.6) + Math.sin(w.phase * 0.7) * 30;
      pos = { x, y, scale: (0.3 + (1 - t) * 0.5) * w.scale };
    } else {
      pos = engine.projectSide(w.z, w.side, 115);
      pos = { ...pos, scale: pos.scale * w.scale };
    }

    ctx.save();
    ctx.translate(pos.x, pos.y);
    const s = pos.scale;

    if (w.type === 'bird') {
      ctx.fillStyle = w.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, 8 * s, 3 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      // wings flap
      const flap = Math.sin(w.phase) * 0.8;
      ctx.beginPath();
      ctx.moveTo(-2 * s, 0);
      ctx.quadraticCurveTo(-6 * s, -12 * s * flap, -14 * s, -2 * s);
      ctx.moveTo(2 * s, 0);
      ctx.quadraticCurveTo(6 * s, -12 * s * flap, 14 * s, -2 * s);
      ctx.strokeStyle = w.color;
      ctx.lineWidth = 2 * s;
      ctx.stroke();
    } else if (w.type === 'butterfly') {
      const flap = 0.6 + Math.sin(w.phase) * 0.4;
      ctx.fillStyle = w.color;
      ctx.beginPath();
      ctx.ellipse(-5 * s * flap, 0, 6 * s, 4 * s, -0.5, 0, Math.PI * 2);
      ctx.ellipse(5 * s * flap, 0, 6 * s, 4 * s, 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#222';
      ctx.fillRect(-1 * s, -4 * s, 2 * s, 8 * s);
    } else if (w.type === 'goat_side') {
      this.goat(s * 0.7, w.phase, w.color);
    } else if (w.type === 'sheep_side') {
      this.sheep(s * 0.7, w.phase);
    } else if (w.type === 'ibex') {
      this.goat(s * 0.85, w.phase, w.color);
      // bigger horns
      ctx.strokeStyle = '#3d2914';
      ctx.lineWidth = 2.5 * s;
      ctx.beginPath();
      ctx.moveTo(8 * s, -28 * s);
      ctx.quadraticCurveTo(4 * s, -48 * s, -2 * s, -44 * s);
      ctx.moveTo(12 * s, -28 * s);
      ctx.quadraticCurveTo(16 * s, -50 * s, 20 * s, -42 * s);
      ctx.stroke();
    } else if (w.type === 'fish') {
      ctx.fillStyle = w.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, 8 * s, 4 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-8 * s, 0);
      ctx.lineTo(-14 * s, -4 * s);
      ctx.lineTo(-14 * s, 4 * s);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  private drawPlayer(engine: GameEngine, player: Player, time: number, world: WorldState) {
    const { ctx } = this;
    const x = player.x;
    const y = player.y;
    const sliding = player.sliding;
    const jumping = player.jumping;
    const frame = player.runFrame;
    const app = engine.appearance;

    ctx.save();
    ctx.translate(x, y);

    // shield bubble
    if (engine.effects.shield > 0) {
      const pulse = 1 + Math.sin(time * 6) * 0.06;
      const g = ctx.createRadialGradient(0, -30, 8, 0, -30, 42 * pulse);
      g.addColorStop(0, 'rgba(90,168,255,0.05)');
      g.addColorStop(0.8, 'rgba(90,168,255,0.18)');
      g.addColorStop(1, 'rgba(160,210,255,0.5)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, -30, 42 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(190,225,255,0.7)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // invincibility blink after shield break
    if (player.invincible > 0 && Math.floor(time * 12) % 2 === 0) {
      ctx.globalAlpha = 0.5;
    }

    // dynamic light rim
    if (world.timeOfDay === 'sunset' || world.timeOfDay === 'dawn') {
      ctx.shadowColor = 'rgba(255,140,60,0.45)';
      ctx.shadowBlur = 12;
    } else if (world.timeOfDay === 'night') {
      ctx.shadowColor = 'rgba(120,160,255,0.25)';
      ctx.shadowBlur = 10;
    }

    // soft shadow, offset by sun position
    const shadowScale = jumping ? 0.6 : sliding ? 1.2 : 1;
    const sunSide = world.timeOfDay === 'dawn' ? -6 : world.timeOfDay === 'sunset' ? 6 : 0;
    const shGrad = ctx.createRadialGradient(sunSide, 4, 2, sunSide, 4, 24 * shadowScale);
    shGrad.addColorStop(0, 'rgba(0,0,0,0.34)');
    shGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shGrad;
    ctx.beginPath();
    ctx.ellipse(sunSide, 4, 24 * shadowScale, 8 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();

    if (sliding) {
      ctx.translate(0, 10);
      ctx.scale(1.15, 0.65);
    }

    const bounce = jumping ? 0 : Math.sin(time * 12) * 2;
    ctx.translate(0, bounce);

    const legSwing = jumping ? 0.3 : sliding ? 0 : Math.sin(frame * 1.5) * 0.5;
    const armSwing = -legSwing;

    ctx.strokeStyle = '#2c1810';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-5, -18);
    ctx.lineTo(-5 - Math.sin(legSwing) * 12, -2 + Math.cos(legSwing) * 4);
    ctx.moveTo(5, -18);
    ctx.lineTo(5 + Math.sin(legSwing) * 12, -2 - Math.cos(legSwing) * 4);
    ctx.stroke();

    if (app.glow) {
      ctx.shadowColor = 'rgba(255,215,0,0.6)';
      ctx.shadowBlur = 14;
    }

    ctx.fillStyle = app.cloth;
    ctx.beginPath();
    ctx.roundRect(-12, -48, 24, 32, 6);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = app.sash;
    ctx.fillRect(-12, -30, 24, 6);
    ctx.fillStyle = app.trim1;
    ctx.fillRect(-12, -24, 24, 3);
    ctx.fillStyle = app.trim2;
    ctx.fillRect(-12, -21, 24, 2);

    ctx.strokeStyle = app.skin;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-12, -40);
    ctx.lineTo(-18 - Math.sin(armSwing) * 8, -28 + Math.cos(armSwing) * 6);
    ctx.moveTo(12, -40);
    ctx.lineTo(18 + Math.sin(armSwing) * 8, -28 - Math.cos(armSwing) * 6);
    ctx.stroke();

    ctx.fillStyle = app.skin;
    ctx.beginPath();
    ctx.arc(0, -58, 11, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = app.hair;
    ctx.beginPath();
    ctx.arc(0, -62, 10, Math.PI, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#1a0f0a';
    ctx.beginPath();
    ctx.arc(-3.5, -58, 1.5, 0, Math.PI * 2);
    ctx.arc(3.5, -58, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1a0f0a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, -55, 3, 0.1, Math.PI - 0.1);
    ctx.stroke();

    if (!sliding) {
      ctx.fillStyle = BASE.coffee;
      ctx.beginPath();
      ctx.ellipse(12, -38, 8, 10, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#3d2914';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    if (jumping) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(-8 - i * 6, 5 + i * 4, 3 - i * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  private drawPlayerAuras(engine: GameEngine, time: number) {
    const { ctx } = this;
    const p = engine.player;

    // magnet aura
    if (engine.effects.magnet > 0) {
      const r = 46 + Math.sin(time * 8) * 5;
      ctx.save();
      ctx.translate(p.x, p.y - 26);
      ctx.strokeStyle = 'rgba(255,90,74,0.55)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([8, 10]);
      ctx.lineDashOffset = -time * 60;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // double beans shimmer
    if (engine.effects.double > 0) {
      ctx.save();
      ctx.translate(p.x, p.y - 70);
      ctx.fillStyle = 'rgba(255,215,0,0.9)';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('×2', Math.sin(time * 5) * 3, -4 + Math.sin(time * 3) * 2);
      ctx.restore();
    }
  }

  private drawParticles(particles: Particle[]) {
    const { ctx } = this;
    for (const p of particles) {
      const a = Math.max(0, p.life / p.maxLife) * (p.alpha ?? 1);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;

      switch (p.type) {
        case 'star':
          this.star(0, 0, p.size, p.size * 0.5, 5);
          break;
        case 'leaf':
        case 'petal':
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size, p.size * 0.45, 0, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'spark':
          ctx.fillRect(-p.size * 0.2, -p.size, p.size * 0.4, p.size * 2);
          ctx.fillRect(-p.size, -p.size * 0.2, p.size * 2, p.size * 0.4);
          break;
        case 'rain':
          ctx.fillRect(-0.5, 0, 1.2, p.size * 3);
          break;
        case 'splash':
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size * 2, p.size * 0.6, 0, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'ember':
        case 'glow':
          if (this.quality === 'high') {
            ctx.shadowColor = p.color;
            ctx.shadowBlur = p.type === 'glow' ? 12 : 8;
          }
          ctx.beginPath();
          ctx.arc(0, 0, p.size, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'smoke':
        case 'dust':
          ctx.beginPath();
          ctx.arc(0, 0, p.size, 0, Math.PI * 2);
          ctx.fill();
          break;
        default:
          ctx.beginPath();
          ctx.arc(0, 0, p.size, 0, Math.PI * 2);
          ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  private star(x: number, y: number, r: number, ir: number, points: number) {
    const { ctx } = this;
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const radius = i % 2 === 0 ? r : ir;
      const angle = (i * Math.PI) / points - Math.PI / 2;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  private drawFloatingTexts(engine: GameEngine) {
    const { ctx } = this;
    for (const f of engine.floatingTexts) {
      const a = Math.max(0, f.life / f.maxLife);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = `bold ${16 + (1 - a) * 8}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = f.color;
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = 3;
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }
  }

  private drawLighting(engine: GameEngine, w: number, h: number, world: WorldState) {
    const { ctx } = this;
    const horizon = engine.horizonY;

    // ambient tint
    if (world.ambientTint && !world.ambientTint.endsWith(',0)')) {
      ctx.fillStyle = world.ambientTint;
      ctx.fillRect(0, 0, w, h);
    }

    // sun god rays at dawn/sunset
    if (this.quality === 'high' && (world.timeOfDay === 'dawn' || world.timeOfDay === 'sunset')) {
      const cx = w * (world.timeOfDay === 'dawn' ? 0.25 : 0.75);
      const cy = horizon * 0.5;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 7; i++) {
        const ang = -0.9 + i * 0.28 + Math.sin(this.mistPhase + i) * 0.02;
        ctx.fillStyle = `rgba(255,160,60,${0.03 + (i % 2) * 0.015})`;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, h * 0.9, ang, ang + 0.12);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    // night darkness with a warm pool of light around the runner
    if (world.timeOfDay === 'night' || world.light < 0.5) {
      const px = engine.player.x;
      const py = engine.player.y - 30;
      const dark = 0.42 * (1 - world.light);
      const g = ctx.createRadialGradient(px, py, 40, px, py, Math.max(w, h) * 0.75);
      g.addColorStop(0, 'rgba(0,5,20,0)');
      g.addColorStop(0.35, `rgba(0,5,20,${dark * 0.25})`);
      g.addColorStop(1, `rgba(0,5,20,${dark})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    // rain veil
    if (world.rainIntensity > 0.1) {
      ctx.fillStyle = `rgba(40,55,75,${world.rainIntensity * 0.12})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  private drawVignette(w: number, h: number, world: WorldState) {
    const { ctx } = this;
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.72);
    const a = world.timeOfDay === 'night' ? 0.45 : 0.28;
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(10,6,2,${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
}
