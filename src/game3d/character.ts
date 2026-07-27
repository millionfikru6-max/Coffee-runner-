/**
 * Fully rigged low-poly Ethiopian runner.
 *
 * The character is built from a joint hierarchy (hips → spine → chest → head,
 * plus two arms and two legs with knee/elbow joints), then driven by a
 * procedural animation system with proper run, jump, slide, stumble and idle
 * states. No external model files, so it loads instantly and stays tiny.
 *
 * Outfit colours come from the existing Appearance type so the shop keeps
 * working exactly as before.
 */

import * as THREE from 'three';
import type { Appearance } from '../game/types';
import { G, type Quality, mat, setShadows } from './core';

export type CharPose = 'run' | 'jump' | 'fall' | 'slide' | 'idle' | 'dead';

interface Joint {
  group: THREE.Group;
  rest: THREE.Euler;
}

function joint(parent: THREE.Object3D, x: number, y: number, z: number): Joint {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return { group: g, rest: new THREE.Euler(0, 0, 0) };
}

function limb(
  parent: THREE.Object3D,
  material: THREE.Material,
  w: number,
  h: number,
  d: number,
  yOffset: number,
): THREE.Mesh {
  const m = new THREE.Mesh(G.boxUp(), material);
  m.scale.set(w, h, d);
  m.position.y = yOffset;
  parent.add(m);
  return m;
}

export class Character {
  readonly root = new THREE.Group();

  private hips!: Joint;
  private spine!: Joint;
  private chest!: Joint;
  private neck!: Joint;
  private head!: THREE.Group;
  private armL!: Joint;
  private armR!: Joint;
  private foreL!: Joint;
  private foreR!: Joint;
  private legL!: Joint;
  private legR!: Joint;
  private shinL!: Joint;
  private shinR!: Joint;
  private footL!: Joint;
  private footR!: Joint;
  private scarf!: THREE.Group;
  private scarfSegs: THREE.Mesh[] = [];

  private skinMat!: THREE.MeshStandardMaterial;
  private hairMat!: THREE.MeshStandardMaterial;
  private clothMat!: THREE.MeshStandardMaterial;
  private sashMat!: THREE.MeshStandardMaterial;
  private trim1Mat!: THREE.MeshStandardMaterial;
  private trim2Mat!: THREE.MeshStandardMaterial;

  private phase = 0;
  private pose: CharPose = 'run';
  private poseBlend = { jump: 0, slide: 0, dead: 0, idle: 0 };
  private lean = 0;
  private turn = 0;
  private stumble = 0;
  private quality: Quality;

  /** Vertical offset of the hips in the current pose, for FX anchoring. */
  hipHeight = 0.92;

  constructor(appearance: Appearance, quality: Quality) {
    this.quality = quality;
    this.buildMaterials(appearance);
    this.build();
    setShadows(this.root, true, false);
  }

  private buildMaterials(a: Appearance) {
    // Per-character instances (not cached) so outfits can change at runtime.
    this.skinMat = new THREE.MeshStandardMaterial({ color: a.skin, roughness: 0.72, metalness: 0.02 });
    this.hairMat = new THREE.MeshStandardMaterial({ color: a.hair, roughness: 0.92 });
    this.clothMat = new THREE.MeshStandardMaterial({ color: a.cloth, roughness: 0.82 });
    this.sashMat = new THREE.MeshStandardMaterial({ color: a.sash, roughness: 0.7 });
    this.trim1Mat = new THREE.MeshStandardMaterial({ color: a.trim1, roughness: 0.7 });
    this.trim2Mat = new THREE.MeshStandardMaterial({
      color: a.trim2,
      roughness: 0.35,
      metalness: 0.45,
      emissive: a.glow ? new THREE.Color(a.trim2) : new THREE.Color(0x000000),
      emissiveIntensity: a.glow ? 0.5 : 0,
    });
  }

  setAppearance(a: Appearance) {
    this.skinMat.color.set(a.skin);
    this.hairMat.color.set(a.hair);
    this.clothMat.color.set(a.cloth);
    this.sashMat.color.set(a.sash);
    this.trim1Mat.color.set(a.trim1);
    this.trim2Mat.color.set(a.trim2);
    this.trim2Mat.emissive.set(a.glow ? a.trim2 : 0x000000);
    this.trim2Mat.emissiveIntensity = a.glow ? 0.5 : 0;
  }

  private build() {
    const q = this.quality;

    // ---- hips / torso ----
    this.hips = joint(this.root, 0, 0.92, 0);

    const pelvis = new THREE.Mesh(G.box(), this.clothMat);
    pelvis.scale.set(0.44, 0.26, 0.29);
    this.hips.group.add(pelvis);

    this.spine = joint(this.hips.group, 0, 0.1, 0);
    this.chest = joint(this.spine.group, 0, 0.2, 0);

    const torso = new THREE.Mesh(G.box(), this.clothMat);
    torso.scale.set(0.5, 0.46, 0.3);
    torso.position.y = 0.2;
    this.chest.group.add(torso);

    // netela / shamma sash across the chest — the signature Ethiopian drape
    const sash = new THREE.Mesh(G.box(), this.sashMat);
    sash.scale.set(0.53, 0.11, 0.33);
    sash.position.set(0, 0.24, 0);
    sash.rotation.z = 0.34;
    this.chest.group.add(sash);

    const tibeb = new THREE.Mesh(G.box(), this.trim2Mat); // woven gold hem
    tibeb.scale.set(0.54, 0.035, 0.335);
    tibeb.position.set(0, 0.08, 0);
    tibeb.rotation.z = 0.34;
    this.chest.group.add(tibeb);

    const hem = new THREE.Mesh(G.box(), this.trim1Mat);
    hem.scale.set(0.46, 0.05, 0.31);
    hem.position.y = -0.02;
    this.chest.group.add(hem);

    // ---- head ----
    this.neck = joint(this.chest.group, 0, 0.44, 0);
    const neckMesh = new THREE.Mesh(G.cylUp(q), this.skinMat);
    neckMesh.scale.set(0.14, 0.08, 0.14);
    this.neck.group.add(neckMesh);

    this.head = new THREE.Group();
    this.head.position.y = 0.08;
    this.neck.group.add(this.head);

    const skull = new THREE.Mesh(G.sphere(q), this.skinMat);
    skull.scale.set(0.34, 0.4, 0.34);
    skull.position.y = 0.19;
    this.head.add(skull);

    const jaw = new THREE.Mesh(G.box(), this.skinMat);
    jaw.scale.set(0.24, 0.12, 0.26);
    jaw.position.set(0, 0.08, 0.02);
    this.head.add(jaw);

    // short natural hair
    const hair = new THREE.Mesh(G.sphere(q), this.hairMat);
    hair.scale.set(0.37, 0.34, 0.37);
    hair.position.y = 0.25;
    this.head.add(hair);

    const eyeGeo = G.sphere(q);
    const eyeMat = mat('eye-white', { color: 0xf8f4ee, roughness: 0.35 });
    const pupilMat = mat('eye-pupil', { color: 0x140c06, roughness: 0.3 });
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.scale.set(0.085, 0.1, 0.06);
      eye.position.set(sx * 0.098, 0.2, 0.155);
      this.head.add(eye);
      const pupil = new THREE.Mesh(eyeGeo, pupilMat);
      pupil.scale.set(0.05, 0.06, 0.04);
      pupil.position.set(sx * 0.1, 0.198, 0.178);
      this.head.add(pupil);
    }

    // ---- arms ----
    const buildArm = (side: number): [Joint, Joint] => {
      const shoulder = joint(this.chest.group, side * 0.3, 0.35, 0);
      limb(shoulder.group, this.skinMat, 0.15, 0.3, 0.15, -0.3);
      const upper = shoulder.group.children[0] as THREE.Mesh;
      upper.position.y = 0;
      upper.scale.set(0.15, 0.3, 0.15);
      upper.rotation.x = Math.PI; // point down
      const elbow = joint(shoulder.group, 0, -0.3, 0);
      const fore = limb(elbow.group, this.skinMat, 0.13, 0.28, 0.13, 0);
      fore.rotation.x = Math.PI;
      const hand = new THREE.Mesh(G.sphere(q), this.skinMat);
      hand.scale.set(0.14, 0.14, 0.12);
      hand.position.y = -0.31;
      elbow.group.add(hand);
      return [shoulder, elbow];
    };
    [this.armL, this.foreL] = buildArm(-1);
    [this.armR, this.foreR] = buildArm(1);

    // ---- legs ----
    const buildLeg = (side: number): [Joint, Joint, Joint] => {
      const hip = joint(this.hips.group, side * 0.14, -0.1, 0);
      const thigh = new THREE.Mesh(G.boxUp(), this.skinMat);
      thigh.scale.set(0.18, 0.36, 0.18);
      thigh.rotation.x = Math.PI;
      hip.group.add(thigh);

      const knee = joint(hip.group, 0, -0.36, 0);
      const shin = new THREE.Mesh(G.boxUp(), this.skinMat);
      shin.scale.set(0.15, 0.36, 0.15);
      shin.rotation.x = Math.PI;
      knee.group.add(shin);

      const ankle = joint(knee.group, 0, -0.36, 0);
      const foot = new THREE.Mesh(G.box(), this.skinMat);
      foot.scale.set(0.16, 0.08, 0.28);
      foot.position.set(0, -0.03, 0.06);
      ankle.group.add(foot);
      return [hip, knee, ankle];
    };
    [this.legL, this.shinL, this.footL] = buildLeg(-1);
    [this.legR, this.shinR, this.footR] = buildLeg(1);

    // ---- trailing netela scarf: secondary motion sells the speed ----
    this.scarf = new THREE.Group();
    this.scarf.position.set(0, 0.3, -0.14);
    this.chest.group.add(this.scarf);
    let prev: THREE.Object3D = this.scarf;
    for (let i = 0; i < 4; i++) {
      const segGroup = new THREE.Group();
      segGroup.position.z = i === 0 ? 0 : -0.16;
      prev.add(segGroup);
      const seg = new THREE.Mesh(G.box(), i % 2 === 0 ? this.clothMat : this.sashMat);
      seg.scale.set(0.34 - i * 0.045, 0.035, 0.17);
      seg.position.z = -0.08;
      segGroup.add(seg);
      this.scarfSegs.push(seg);
      // store the pivot group for animation
      (seg.userData as { pivot: THREE.Object3D }).pivot = segGroup;
      prev = segGroup;
    }
  }

  /* ------------------------------ animation ------------------------------ */

  setPose(pose: CharPose) {
    this.pose = pose;
  }

  /** Trigger a short stagger — used on shielded hits and revives. */
  hitReaction() {
    this.stumble = 1;
  }

  /**
   * @param dt      delta seconds
   * @param speed01 0..1 normalised running speed (drives cadence + lean)
   * @param laneVel horizontal velocity, for banking into turns
   */
  update(dt: number, speed01: number, laneVel: number) {
    const cadence = 7.4 + speed01 * 5.6;
    const p = this.pose;

    if (p === 'run') this.phase += dt * cadence;
    else if (p === 'idle') this.phase += dt * 1.6;

    this.stumble = Math.max(0, this.stumble - dt * 2.4);

    // blend weights
    const k = Math.min(1, dt * 12);
    this.poseBlend.jump += ((p === 'jump' || p === 'fall' ? 1 : 0) - this.poseBlend.jump) * k;
    this.poseBlend.slide += ((p === 'slide' ? 1 : 0) - this.poseBlend.slide) * k;
    this.poseBlend.dead += ((p === 'dead' ? 1 : 0) - this.poseBlend.dead) * k;
    this.poseBlend.idle += ((p === 'idle' ? 1 : 0) - this.poseBlend.idle) * k;

    this.turn += (THREE.MathUtils.clamp(-laneVel * 0.16, -0.5, 0.5) - this.turn) * Math.min(1, dt * 9);
    this.lean += ((0.1 + speed01 * 0.16) - this.lean) * Math.min(1, dt * 5);

    const t = this.phase;
    const s = Math.sin(t);
    const c = Math.cos(t);

    const jb = this.poseBlend.jump;
    const sb = this.poseBlend.slide;
    const db = this.poseBlend.dead;
    const ib = this.poseBlend.idle;
    const rb = Math.max(0, 1 - jb - sb - db - ib);

    /* ---- run cycle ---- */
    // Legs swing in counter-phase; knees flex hardest on the recovery half.
    const legSwing = 0.95;
    const runLegL = s * legSwing;
    const runLegR = -s * legSwing;
    const runKneeL = Math.max(0, -Math.sin(t + 0.6)) * 1.65;
    const runKneeR = Math.max(0, -Math.sin(t + Math.PI + 0.6)) * 1.65;
    const runArmL = -s * 0.85;
    const runArmR = s * 0.85;
    const bob = Math.abs(c) * 0.075;

    /* ---- jump / fall pose ---- */
    const falling = this.pose === 'fall';
    const jLegF = falling ? 0.35 : -0.85;
    const jLegB = falling ? -0.5 : 0.55;
    const jKnee = falling ? 0.5 : 1.5;
    const jArm = falling ? -2.1 : -1.5;

    /* ---- slide pose ---- */
    const slLeg = -1.15;
    const slKnee = 0.65;
    const slArm = -2.4;

    const mix5 = (run: number, jump: number, slide: number, dead: number, idle: number) =>
      run * rb + jump * jb + slide * sb + dead * db + idle * ib;

    // idle: gentle breathing, arms relaxed
    const idleArm = 0.12 + Math.sin(t) * 0.06;

    const stum = this.stumble * Math.sin(this.stumble * 26) * 0.35;

    this.legL.group.rotation.x = mix5(runLegL, jLegF, slLeg, 0.9, 0.03) + stum * 0.4;
    this.legR.group.rotation.x = mix5(runLegR, jLegB, slLeg + 0.25, 0.3, -0.03) - stum * 0.4;
    this.shinL.group.rotation.x = mix5(runKneeL, jKnee, slKnee, 0.6, 0.05);
    this.shinR.group.rotation.x = mix5(runKneeR, jKnee * 0.6, slKnee + 0.3, 1.1, 0.05);
    this.footL.group.rotation.x = mix5(-runLegL * 0.35 + 0.1, 0.4, 0.5, 0.2, 0);
    this.footR.group.rotation.x = mix5(-runLegR * 0.35 + 0.1, 0.2, 0.5, 0.2, 0);

    this.armL.group.rotation.x = mix5(runArmL, jArm, slArm, -0.4, idleArm) + stum;
    this.armR.group.rotation.x = mix5(runArmR, jArm - 0.3, slArm, -1.2, idleArm) - stum;
    this.armL.group.rotation.z = mix5(0.16, 0.3, 0.5, 0.9, 0.14) + this.turn * 0.3;
    this.armR.group.rotation.z = mix5(-0.16, -0.3, -0.5, -0.9, -0.14) + this.turn * 0.3;
    this.foreL.group.rotation.x = mix5(-1.05 - runArmL * 0.45, -0.6, -0.35, -0.3, -0.25);
    this.foreR.group.rotation.x = mix5(-1.05 - runArmR * 0.45, -0.6, -0.35, -0.5, -0.25);

    // torso: lean forward with speed, counter-rotate against the arm swing
    const torsoLean = mix5(this.lean, 0.05, 1.15, 1.35, 0.02);
    this.hips.group.rotation.x = torsoLean * 0.45;
    this.spine.group.rotation.x = torsoLean * 0.35;
    this.chest.group.rotation.x = torsoLean * 0.2 + Math.sin(t * 2) * 0.02 * rb + ib * Math.sin(t) * 0.04;
    this.chest.group.rotation.y = mix5(-s * 0.16, 0, 0, 0, 0) + this.turn * 0.4;
    this.hips.group.rotation.y = mix5(s * 0.13, 0, 0, 0, 0);
    this.hips.group.rotation.z = this.turn * 0.22;

    // head stays level and looks ahead — a big readability win
    this.neck.group.rotation.x = -torsoLean * 0.75 + mix5(0, -0.15, 0.35, 0.2, 0);
    this.neck.group.rotation.y = this.turn * -0.5;
    this.neck.group.rotation.z = -this.turn * 0.15;

    // hip height per pose
    const hipY = mix5(0.92 + bob, 0.95, 0.42, 0.3, 0.9);
    this.hips.group.position.y = hipY;
    this.hipHeight = hipY;

    this.root.rotation.z = -this.turn * 0.16;
    this.root.rotation.y = this.turn * 0.55;

    // scarf trails behind, driven by speed and lane movement
    for (let i = 0; i < this.scarfSegs.length; i++) {
      const pivot = (this.scarfSegs[i].userData as { pivot: THREE.Object3D }).pivot;
      const lag = i * 0.55;
      pivot.rotation.x = 0.25 + Math.sin(t * 1.5 - lag) * 0.16 + speed01 * 0.35;
      pivot.rotation.y = Math.sin(t * 1.1 - lag) * 0.2 - this.turn * (0.4 + i * 0.15);
    }
  }

  dispose() {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.geometry && !(m.geometry as THREE.BufferGeometry).userData.shared) {
        // geometries are shared from the cache; only per-character materials die here
      }
    });
    for (const m of [
      this.skinMat,
      this.hairMat,
      this.clothMat,
      this.sashMat,
      this.trim1Mat,
      this.trim2Mat,
    ]) {
      m.dispose();
    }
  }
}
