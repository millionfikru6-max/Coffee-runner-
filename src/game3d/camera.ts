/**
 * Cinematic chase camera.
 *
 * Critically damped springs on every axis, a look-ahead target that leads the
 * runner into turns, speed-driven FOV, landing dip, impact shake and dedicated
 * menu / game-over framing. All motion is frame-rate independent.
 */

import * as THREE from 'three';

export type CamMode = 'menu' | 'play' | 'gameover' | 'revive';

const BASE = {
  height: 4.05,
  back: 8.1,
  lookHeight: 1.55,
  lookAhead: 9.0,
  fov: 62,
};

export class ChaseCamera {
  readonly camera: THREE.PerspectiveCamera;

  private pos = new THREE.Vector3(0, BASE.height, BASE.back);
  private look = new THREE.Vector3(0, BASE.lookHeight, -BASE.lookAhead);
  private shake = 0;
  private shakeSeed = Math.random() * 100;
  private dip = 0;
  private roll = 0;
  private fov = BASE.fov;
  private mode: CamMode = 'menu';
  private orbit = 0;
  private introT = 0;
  private tmp = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(BASE.fov, aspect, 0.35, 1000);
    this.camera.position.copy(this.pos);
  }

  setMode(m: CamMode) {
    if (m === this.mode) return;
    this.mode = m;
    if (m === 'play') this.introT = 1;
  }

  resize(aspect: number) {
    this.camera.aspect = aspect;
    // On tall phone screens a wider vertical FOV keeps the road readable.
    this.camera.updateProjectionMatrix();
  }

  /** Punch the camera — magnitude 0..1. */
  impact(amount: number) {
    this.shake = Math.min(1.4, this.shake + amount);
  }

  /** Quick downward dip, used on landings. */
  land(amount = 1) {
    this.dip = Math.min(1, this.dip + amount);
  }

  update(
    dt: number,
    target: {
      x: number;
      y: number;
      z: number;
      laneVel: number;
      speed01: number;
      jumping: boolean;
      sliding: boolean;
      alive: boolean;
      pulse: number;
      shakeEngine: number;
      allowShake: boolean;
      portrait: boolean;
    },
  ) {
    this.shake = Math.max(0, this.shake - dt * 2.6);
    this.dip = Math.max(0, this.dip - dt * 5);
    this.introT = Math.max(0, this.introT - dt * 0.85);

    const portraitPush = target.portrait ? 1.18 : 1;

    let desiredX: number;
    let desiredY: number;
    let desiredZ: number;
    let lookX: number;
    let lookY: number;
    let lookZ: number;
    let desiredFov: number;
    let lambda = 6.5;

    if (this.mode === 'menu') {
      // Slow orbit around the runner for the main menu — showcases the model.
      this.orbit += dt * 0.16;
      const r = 7.4;
      desiredX = Math.sin(this.orbit) * r;
      desiredZ = target.z + Math.cos(this.orbit) * r;
      desiredY = 3.1 + Math.sin(this.orbit * 0.7) * 0.5;
      lookX = 0;
      lookY = 1.45;
      lookZ = target.z - 1.2;
      desiredFov = 52;
      lambda = 2.6;
    } else if (this.mode === 'gameover') {
      // Drop low and swing round the fallen runner.
      this.orbit += dt * 0.42;
      const r = 5.4;
      desiredX = target.x + Math.sin(this.orbit) * r;
      desiredZ = target.z + Math.cos(this.orbit) * r;
      desiredY = 2.0;
      lookX = target.x;
      lookY = 0.75;
      lookZ = target.z;
      desiredFov = 46;
      lambda = 3.2;
    } else {
      this.orbit = 0;
      const speed = target.speed01;
      // Camera pulls back and rises as you go faster — classic runner feel.
      const back = (BASE.back + speed * 1.5 + this.introT * 5.5) * portraitPush;
      const height = BASE.height + speed * 0.55 + this.introT * 1.6;

      // Trail the lane rather than snapping to it: a little lag reads as weight.
      desiredX = target.x * 0.72;
      desiredY = height + target.y * 0.36 - this.dip * 0.55;
      desiredZ = target.z + back;

      // Look-ahead leads into the lane the player is heading for.
      lookX = target.x * 1.05 + target.laneVel * 0.22;
      lookY = BASE.lookHeight + target.y * 0.5 + (target.sliding ? -0.35 : 0);
      lookZ = target.z - (BASE.lookAhead + speed * 4.5);

      desiredFov = (BASE.fov + speed * 9 + target.pulse * 4) * (target.portrait ? 1.06 : 1);
      lambda = 7.5;
    }

    this.pos.x = THREE.MathUtils.damp(this.pos.x, desiredX, lambda, dt);
    this.pos.y = THREE.MathUtils.damp(this.pos.y, desiredY, lambda * 1.15, dt);
    this.pos.z = THREE.MathUtils.damp(this.pos.z, desiredZ, lambda * 1.3, dt);

    this.look.x = THREE.MathUtils.damp(this.look.x, lookX, lambda * 0.85, dt);
    this.look.y = THREE.MathUtils.damp(this.look.y, lookY, lambda * 0.85, dt);
    this.look.z = THREE.MathUtils.damp(this.look.z, lookZ, lambda * 1.4, dt);

    this.fov = THREE.MathUtils.damp(this.fov, desiredFov, 4.5, dt);

    // Bank into lane changes.
    const targetRoll = this.mode === 'play' ? THREE.MathUtils.clamp(-target.laneVel * 0.013, -0.075, 0.075) : 0;
    this.roll = THREE.MathUtils.damp(this.roll, targetRoll, 6, dt);

    // Combine engine shake with our own impacts.
    const shakeAmt = target.allowShake ? Math.max(this.shake, target.shakeEngine * 0.9) : 0;
    let sx = 0;
    let sy = 0;
    let sr = 0;
    if (shakeAmt > 0.001) {
      const t = performance.now() * 0.001 + this.shakeSeed;
      const decay = shakeAmt * shakeAmt;
      sx = (Math.sin(t * 47) + Math.sin(t * 23.3)) * 0.13 * decay;
      sy = (Math.cos(t * 39.7) + Math.sin(t * 31.1)) * 0.11 * decay;
      sr = Math.sin(t * 53) * 0.026 * decay;
    }

    this.camera.position.set(this.pos.x + sx, this.pos.y + sy, this.pos.z);
    this.tmp.set(this.look.x + sx * 0.4, this.look.y + sy * 0.4, this.look.z);
    this.camera.lookAt(this.tmp);
    this.camera.rotateZ(this.roll + sr);

    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Snap instantly — used when starting a run so there is no swoop-in lag. */
  snapTo(x: number, y: number, z: number) {
    this.pos.set(x * 0.72, BASE.height + y * 0.36, z + BASE.back);
    this.look.set(x, BASE.lookHeight, z - BASE.lookAhead);
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
  }

  get z() {
    return this.pos.z;
  }
  get x() {
    return this.pos.x;
  }
}
