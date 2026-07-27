/**
 * 3D models for every obstacle, collectible and wildlife type the engine
 * spawns. Each factory returns a group whose origin is on the ground at the
 * lane centre, so the scene layer can just position it and go.
 */

import * as THREE from 'three';
import type { CollectibleType, ObstacleType, PowerUpId, WildlifeType } from '../game/types';
import { G, type Quality, mat } from './core';

const M = {
  rock: () => mat('oRock', { color: 0x7a7168, roughness: 0.96, flat: true }),
  rockDark: () => mat('oRockD', { color: 0x554e46, roughness: 0.96, flat: true }),
  wood: () => mat('oWood', { color: 0x6b4a2c, roughness: 0.93 }),
  woodDark: () => mat('oWoodD', { color: 0x4a3120, roughness: 0.95 }),
  leaf: () => mat('oLeaf', { color: 0x2a6b28, roughness: 0.9, flat: true }),
  water: () =>
    mat('oWater', { color: 0x2f86ad, roughness: 0.1, metalness: 0.5, transparent: true, opacity: 0.85 }),
  foam: () => mat('oFoam', { color: 0xe8f6ff, roughness: 0.4 }),
  goatBody: () => mat('goatB', { color: 0xe6ded0, roughness: 0.88 }),
  goatDark: () => mat('goatD', { color: 0x6b5a48, roughness: 0.9 }),
  sheep: () => mat('sheepB', { color: 0xf5f1e8, roughness: 0.95, flat: true }),
  hyena: () => mat('hyenaB', { color: 0xa8906a, roughness: 0.9 }),
  hyenaSpot: () => mat('hyenaS', { color: 0x5c4a33, roughness: 0.9 }),
  metalBlue: () => mat('bajajB', { color: 0x1f6fb2, roughness: 0.45, metalness: 0.35 }),
  metalWhite: () => mat('bajajW', { color: 0xe8e8e4, roughness: 0.5, metalness: 0.2 }),
  tyre: () => mat('tyre', { color: 0x22242a, roughness: 0.95 }),
  cloth: () => mat('oCloth', { color: 0xd8442f, roughness: 0.85 }),
  clothY: () => mat('oClothY', { color: 0xe8b833, roughness: 0.85 }),
  dirt: () => mat('oDirt', { color: 0x3a2a1c, roughness: 1 }),
  gold: () => mat('gold', { color: 0xffd23f, roughness: 0.25, metalness: 0.75, emissive: 0x6a4a00, emissiveIntensity: 0.4 }),
  bean: () => mat('beanM', { color: 0x6f4e37, roughness: 0.55 }),
  beanSlit: () => mat('beanSlit', { color: 0x3a2515, roughness: 0.7 }),
  injera: () => mat('injeraM', { color: 0xe4d2a8, roughness: 0.92 }),
  jebena: () => mat('jebenaM', { color: 0x2f231a, roughness: 0.5 }),
  glass: () => mat('glassM', { color: 0x9fd8ff, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.55 }),
};

/* -------------------------------- obstacles ------------------------------- */

export function buildObstacle(type: ObstacleType, q: Quality): THREE.Group {
  const g = new THREE.Group();
  switch (type) {
    case 'rock': {
      const r = new THREE.Mesh(G.rock(), M.rock());
      r.scale.set(1.5, 1.15, 1.4);
      r.position.y = 0.5;
      r.rotation.set(0.4, 0.8, 0.2);
      g.add(r);
      const r2 = new THREE.Mesh(G.rock2(), M.rockDark());
      r2.scale.set(0.8, 0.7, 0.8);
      r2.position.set(0.6, 0.3, 0.2);
      g.add(r2);
      break;
    }
    case 'boulder': {
      const r = new THREE.Mesh(G.rock(), M.rock());
      r.scale.set(2.4, 2.1, 2.2);
      r.position.y = 0.95;
      r.rotation.set(0.3, 1.1, 0.5);
      g.add(r);
      const moss = new THREE.Mesh(G.rock2(), M.leaf());
      moss.scale.set(1.3, 0.5, 1.2);
      moss.position.y = 1.85;
      g.add(moss);
      break;
    }
    case 'tree': {
      const trunk = new THREE.Mesh(G.cylUp(q), M.wood());
      trunk.scale.set(0.5, 2.4, 0.5);
      g.add(trunk);
      for (let i = 0; i < 3; i++) {
        const c = new THREE.Mesh(G.lowSphere(), i % 2 ? M.leaf() : mat('oLeaf2', { color: 0x1e5620, roughness: 0.9, flat: true }));
        const s = 2.6 - i * 0.55;
        c.scale.set(s, s * 0.72, s);
        c.position.y = 2.4 + i * 0.62;
        g.add(c);
      }
      // low branch the player must slide under
      const branch = new THREE.Mesh(G.box(), M.woodDark());
      branch.scale.set(4.2, 0.28, 0.28);
      branch.position.y = 2.05;
      g.add(branch);
      break;
    }
    case 'fallen_log': {
      const log = new THREE.Mesh(G.cyl(q), M.wood());
      log.scale.set(0.72, 6, 0.72);
      log.rotation.z = Math.PI / 2;
      log.position.y = 0.36;
      g.add(log);
      for (const sx of [-1, 1]) {
        const stub = new THREE.Mesh(G.cyl(q), M.woodDark());
        stub.scale.set(0.55, 0.9, 0.55);
        stub.rotation.z = Math.PI / 2;
        stub.position.set(sx * 2.6, 0.5, 0.3);
        g.add(stub);
      }
      break;
    }
    case 'river': {
      const w = new THREE.Mesh(G.plane(), M.water());
      w.rotation.x = -Math.PI / 2;
      w.scale.set(4.2, 3.4, 1);
      w.position.y = 0.04;
      g.add(w);
      for (let i = 0; i < 3; i++) {
        const f = new THREE.Mesh(G.plane(), M.foam());
        f.rotation.x = -Math.PI / 2;
        f.scale.set(4.2, 0.22, 1);
        f.position.set(0, 0.07, -1.2 + i * 1.2);
        g.add(f);
      }
      const bank = new THREE.Mesh(G.box(), M.dirt());
      bank.scale.set(4.4, 0.3, 0.4);
      bank.position.set(0, 0.1, 1.7);
      g.add(bank);
      break;
    }
    case 'pot_hole': {
      const hole = new THREE.Mesh(G.circle(q), mat('holeM', { color: 0x14100c, roughness: 1 }));
      hole.rotation.x = -Math.PI / 2;
      hole.scale.setScalar(2.4);
      hole.position.y = 0.03;
      g.add(hole);
      const water = new THREE.Mesh(G.circle(q), M.water());
      water.rotation.x = -Math.PI / 2;
      water.scale.setScalar(2.0);
      water.position.y = 0.05;
      g.add(water);
      const rim = new THREE.Mesh(G.torus(q), M.dirt());
      rim.rotation.x = -Math.PI / 2;
      rim.scale.setScalar(2.7);
      rim.position.y = 0.06;
      g.add(rim);
      break;
    }
    case 'barrel': {
      const b = new THREE.Mesh(G.cylUp(q), mat('barrelM', { color: 0xa8622c, roughness: 0.7, metalness: 0.15 }));
      b.scale.set(1.1, 1.5, 1.1);
      g.add(b);
      for (const y of [0.35, 1.15]) {
        const band = new THREE.Mesh(G.torus(q), mat('band', { color: 0x4a4a4a, roughness: 0.5, metalness: 0.6 }));
        band.rotation.x = Math.PI / 2;
        band.scale.set(1.3, 1.3, 1);
        band.position.y = y;
        g.add(band);
      }
      break;
    }
    case 'fence': {
      const rail = mat('railM', { color: 0x7a5638, roughness: 0.92 });
      for (let i = 0; i < 5; i++) {
        const post = new THREE.Mesh(G.cylUp(q), M.woodDark());
        post.scale.set(0.17, 1.3, 0.17);
        post.position.x = -3 + i * 1.5;
        g.add(post);
      }
      for (const y of [0.55, 1.05]) {
        const bar = new THREE.Mesh(G.box(), rail);
        bar.scale.set(7, 0.15, 0.15);
        bar.position.y = y;
        g.add(bar);
      }
      break;
    }
    case 'cart': {
      const bed = new THREE.Mesh(G.box(), M.wood());
      bed.scale.set(2.4, 0.25, 3.2);
      bed.position.y = 1.0;
      g.add(bed);
      for (const sx of [-1, 1]) {
        const side = new THREE.Mesh(G.box(), M.woodDark());
        side.scale.set(0.16, 0.8, 3.2);
        side.position.set(sx * 1.2, 1.4, 0);
        g.add(side);
      }
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const wheel = new THREE.Mesh(G.cyl(q), M.woodDark());
          wheel.scale.set(1.7, 0.22, 1.7);
          wheel.rotation.z = Math.PI / 2;
          wheel.position.set(sx * 1.25, 0.85, sz * 1.0);
          g.add(wheel);
        }
      }
      const sacks = new THREE.Mesh(G.lowSphere(), mat('sack', { color: 0xc9b78d, roughness: 0.95 }));
      sacks.scale.set(1.9, 0.9, 2.6);
      sacks.position.y = 1.55;
      g.add(sacks);
      break;
    }
    case 'market_stall': {
      for (const sx of [-1, 1]) {
        const post = new THREE.Mesh(G.cylUp(q), M.woodDark());
        post.scale.set(0.14, 2.5, 0.14);
        post.position.x = sx * 1.7;
        g.add(post);
      }
      const canopy = new THREE.Mesh(G.box(), M.cloth());
      canopy.scale.set(4.2, 0.18, 2.6);
      canopy.position.y = 2.5;
      canopy.rotation.x = 0.1;
      g.add(canopy);
      const stripe = new THREE.Mesh(G.box(), M.clothY());
      stripe.scale.set(4.24, 0.2, 0.7);
      stripe.position.set(0, 2.52, 0.6);
      stripe.rotation.x = 0.1;
      g.add(stripe);
      const table = new THREE.Mesh(G.box(), M.wood());
      table.scale.set(3.4, 0.16, 1.6);
      table.position.y = 1.0;
      g.add(table);
      for (let i = 0; i < 4; i++) {
        const fruit = new THREE.Mesh(G.lowSphere(), i % 2 ? M.cloth() : M.leaf());
        fruit.scale.setScalar(0.34);
        fruit.position.set(-1.2 + i * 0.8, 1.2, 0);
        g.add(fruit);
      }
      break;
    }
    case 'bajaj': {
      // Three-wheeled auto-rickshaw, the icon of Ethiopian streets.
      const body = new THREE.Mesh(G.boxUp(), M.metalBlue());
      body.scale.set(1.9, 1.5, 2.9);
      body.position.y = 0.5;
      g.add(body);
      const roof = new THREE.Mesh(G.boxUp(), M.metalWhite());
      roof.scale.set(1.95, 0.3, 2.6);
      roof.position.y = 2.0;
      g.add(roof);
      const wind = new THREE.Mesh(G.box(), M.glass());
      wind.scale.set(1.5, 0.9, 0.1);
      wind.position.set(0, 1.55, 1.45);
      g.add(wind);
      const front = new THREE.Mesh(G.cyl(q), M.tyre());
      front.scale.set(0.9, 0.28, 0.9);
      front.rotation.z = Math.PI / 2;
      front.position.set(0, 0.45, 1.5);
      g.add(front);
      for (const sx of [-1, 1]) {
        const w = new THREE.Mesh(G.cyl(q), M.tyre());
        w.scale.set(1.0, 0.3, 1.0);
        w.rotation.z = Math.PI / 2;
        w.position.set(sx * 1.0, 0.5, -1.0);
        g.add(w);
      }
      const lamp = new THREE.Mesh(G.sphere(q), mat('headlamp', { color: 0xfff2c0, emissive: 0xffd66a, emissiveIntensity: 1.6, roughness: 0.3 }));
      lamp.scale.setScalar(0.36);
      lamp.position.set(0, 1.05, 1.55);
      g.add(lamp);
      break;
    }
    case 'goat':
    case 'sheep':
    case 'hyena':
      return buildAnimal(type, q);
  }
  return g;
}

/** Quadruped with animatable legs; leg groups are stashed in userData. */
export function buildAnimal(kind: 'goat' | 'sheep' | 'hyena', q: Quality): THREE.Group {
  const g = new THREE.Group();
  const bodyMat = kind === 'goat' ? M.goatBody() : kind === 'sheep' ? M.sheep() : M.hyena();
  const darkMat = kind === 'hyena' ? M.hyenaSpot() : M.goatDark();

  const bodyH = kind === 'hyena' ? 1.15 : 1.0;
  const body = new THREE.Mesh(kind === 'sheep' ? G.lowSphere() : G.capsule(q), bodyMat);
  if (kind === 'sheep') body.scale.set(1.7, 1.25, 2.1);
  else {
    body.scale.set(0.62, 0.85, 0.62);
    body.rotation.x = Math.PI / 2;
  }
  body.position.y = bodyH;
  body.castShadow = true;
  g.add(body);

  const neck = new THREE.Group();
  neck.position.set(0, bodyH + 0.15, 0.85);
  g.add(neck);
  const head = new THREE.Mesh(G.box(), bodyMat);
  head.scale.set(0.46, 0.44, 0.72);
  head.position.z = 0.3;
  neck.add(head);
  const snout = new THREE.Mesh(G.box(), darkMat);
  snout.scale.set(0.3, 0.26, 0.38);
  snout.position.set(0, -0.08, 0.72);
  neck.add(snout);

  if (kind === 'goat') {
    for (const sx of [-1, 1]) {
      const horn = new THREE.Mesh(G.coneUp(q), darkMat);
      horn.scale.set(0.14, 0.6, 0.14);
      horn.position.set(sx * 0.16, 0.2, 0.1);
      horn.rotation.x = -0.6;
      neck.add(horn);
    }
    const beard = new THREE.Mesh(G.box(), darkMat);
    beard.scale.set(0.12, 0.3, 0.12);
    beard.position.set(0, -0.28, 0.55);
    neck.add(beard);
  }
  if (kind === 'sheep') {
    const wool = new THREE.Mesh(G.lowSphere(), bodyMat);
    wool.scale.set(0.6, 0.6, 0.6);
    wool.position.set(0, 0.22, 0.15);
    neck.add(wool);
  }
  if (kind === 'hyena') {
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(G.coneUp(q), darkMat);
      ear.scale.set(0.24, 0.32, 0.12);
      ear.position.set(sx * 0.2, 0.28, 0.1);
      neck.add(ear);
    }
    const mane = new THREE.Mesh(G.box(), darkMat);
    mane.scale.set(0.2, 0.34, 1.4);
    mane.position.set(0, bodyH + 0.55, 0.1);
    g.add(mane);
    for (let i = 0; i < 4; i++) {
      const spot = new THREE.Mesh(G.lowSphere(), darkMat);
      spot.scale.setScalar(0.22);
      spot.position.set((i % 2 ? 1 : -1) * 0.4, bodyH + 0.25, -0.5 + i * 0.35);
      g.add(spot);
    }
  }

  const legs: THREE.Group[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(sx * 0.36, bodyH - 0.15, sz * 0.6);
      g.add(hip);
      const leg = new THREE.Mesh(G.boxUp(), darkMat);
      leg.scale.set(0.16, bodyH - 0.15, 0.16);
      leg.rotation.x = Math.PI;
      hip.add(leg);
      legs.push(hip);
    }
  }
  const tail = new THREE.Group();
  tail.position.set(0, bodyH + 0.25, -0.85);
  g.add(tail);
  const tailMesh = new THREE.Mesh(G.boxUp(), darkMat);
  tailMesh.scale.set(0.12, kind === 'hyena' ? 0.8 : 0.4, 0.12);
  tailMesh.rotation.x = kind === 'hyena' ? 2.4 : 2.9;
  tail.add(tailMesh);

  g.userData.legs = legs;
  g.userData.tail = tail;
  g.userData.neck = neck;
  return g;
}

/** Animate a quadruped built by buildAnimal. */
export function animateAnimal(g: THREE.Group, phase: number, amount = 1) {
  const legs = g.userData.legs as THREE.Group[] | undefined;
  if (!legs) return;
  for (let i = 0; i < legs.length; i++) {
    const off = i === 0 || i === 3 ? 0 : Math.PI;
    legs[i].rotation.x = Math.sin(phase * 2 + off) * 0.7 * amount;
  }
  const tail = g.userData.tail as THREE.Group | undefined;
  if (tail) tail.rotation.z = Math.sin(phase * 3) * 0.3;
  const neck = g.userData.neck as THREE.Group | undefined;
  if (neck) neck.rotation.x = Math.sin(phase * 2) * 0.08;
}

/* ------------------------------- collectibles ----------------------------- */

export function buildCollectible(type: CollectibleType, q: Quality, powerup?: PowerUpId): THREE.Group {
  const g = new THREE.Group();
  switch (type) {
    case 'bean':
    case 'golden_bean': {
      const golden = type === 'golden_bean';
      const bean = new THREE.Mesh(G.sphere(q), golden ? M.gold() : M.bean());
      bean.scale.set(0.46, 0.34, 0.58);
      g.add(bean);
      const slit = new THREE.Mesh(G.box(), golden ? mat('goldSlit', { color: 0xa87c12, roughness: 0.4, metalness: 0.6 }) : M.beanSlit());
      slit.scale.set(0.06, 0.1, 0.55);
      g.add(slit);
      if (golden) {
        const halo = new THREE.Mesh(G.circle(q), mat('goldHalo', { color: 0xffe27a, transparent: true, opacity: 0.35, emissive: 0xffc94a, emissiveIntensity: 1.2 }));
        halo.scale.setScalar(1.6);
        g.add(halo);
        g.userData.billboard = halo;
      }
      break;
    }
    case 'coin': {
      const c = new THREE.Mesh(G.cyl(q), M.gold());
      c.scale.set(0.8, 0.09, 0.8);
      c.rotation.x = Math.PI / 2;
      g.add(c);
      const inner = new THREE.Mesh(G.cyl(q), mat('coinInner', { color: 0xffeaa0, roughness: 0.3, metalness: 0.7 }));
      inner.scale.set(0.58, 0.11, 0.58);
      inner.rotation.x = Math.PI / 2;
      g.add(inner);
      break;
    }
    case 'injera': {
      const plate = new THREE.Mesh(G.cyl(q), M.injera());
      plate.scale.set(1.0, 0.12, 1.0);
      g.add(plate);
      for (let i = 0; i < 3; i++) {
        const w = new THREE.Mesh(G.lowSphere(), i === 0 ? mat('wotR', { color: 0xb8331f, roughness: 0.8 }) : i === 1 ? mat('wotY', { color: 0xd8a020, roughness: 0.8 }) : mat('wotG', { color: 0x4a7a2a, roughness: 0.8 }));
        const a = (i / 3) * Math.PI * 2;
        w.scale.setScalar(0.3);
        w.position.set(Math.cos(a) * 0.34, 0.1, Math.sin(a) * 0.34);
        g.add(w);
      }
      break;
    }
    case 'meskel_flower': {
      const centre = new THREE.Mesh(G.sphere(q), mat('mCentre', { color: 0xd88a1a, roughness: 0.7 }));
      centre.scale.setScalar(0.24);
      g.add(centre);
      const petalMat = mat('mPetal', { color: 0xffd23f, roughness: 0.55, emissive: 0x996600, emissiveIntensity: 0.3 });
      for (let i = 0; i < 8; i++) {
        const p = new THREE.Mesh(G.lowSphere(), petalMat);
        const a = (i / 8) * Math.PI * 2;
        p.scale.set(0.34, 0.08, 0.2);
        p.position.set(Math.cos(a) * 0.36, 0, Math.sin(a) * 0.36);
        p.rotation.y = -a;
        g.add(p);
      }
      break;
    }
    case 'coffee_pot': {
      const body = new THREE.Mesh(G.sphere(q), M.jebena());
      body.scale.set(0.62, 0.7, 0.62);
      g.add(body);
      const neck = new THREE.Mesh(G.cylUp(q), M.jebena());
      neck.scale.set(0.2, 0.55, 0.2);
      neck.position.y = 0.25;
      g.add(neck);
      const spout = new THREE.Mesh(G.cylUp(q), M.jebena());
      spout.scale.set(0.11, 0.6, 0.11);
      spout.position.set(0.3, 0.1, 0);
      spout.rotation.z = -0.9;
      g.add(spout);
      const lid = new THREE.Mesh(G.coneUp(q), mat('lidM', { color: 0xd8b25e, roughness: 0.6 }));
      lid.scale.set(0.28, 0.22, 0.28);
      lid.position.y = 0.78;
      g.add(lid);
      break;
    }
    case 'star': {
      const s = new THREE.Mesh(
        G.lowSphere(),
        mat('starM', { color: 0xfff6c0, roughness: 0.2, emissive: 0xffd54a, emissiveIntensity: 1.5 }),
      );
      s.scale.setScalar(0.62);
      g.add(s);
      for (let i = 0; i < 5; i++) {
        const spike = new THREE.Mesh(G.coneUp(q), mat('starM2', { color: 0xffe98a, roughness: 0.2, emissive: 0xffcf3a, emissiveIntensity: 1.2 }));
        const a = (i / 5) * Math.PI * 2;
        spike.scale.set(0.24, 0.6, 0.24);
        spike.position.set(Math.cos(a) * 0.28, 0, Math.sin(a) * 0.28);
        spike.rotation.z = -Math.cos(a) * 1.2;
        spike.rotation.x = Math.sin(a) * 1.2;
        g.add(spike);
      }
      break;
    }
    case 'powerup': {
      const colors: Record<PowerUpId, number> = {
        magnet: 0xff5a4a,
        shield: 0x5aa8ff,
        double: 0xffd700,
        superJump: 0x5ad46a,
        slow: 0xb07aff,
      };
      const col = colors[powerup ?? 'shield'];
      const orb = new THREE.Mesh(
        G.sphere(q),
        new THREE.MeshStandardMaterial({
          color: col,
          roughness: 0.18,
          metalness: 0.3,
          emissive: new THREE.Color(col),
          emissiveIntensity: 0.85,
          transparent: true,
          opacity: 0.92,
        }),
      );
      orb.scale.setScalar(1.05);
      g.add(orb);
      const ring = new THREE.Mesh(
        G.torus(q),
        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: new THREE.Color(col), emissiveIntensity: 1.4, roughness: 0.2 }),
      );
      ring.scale.setScalar(1.7);
      g.add(ring);
      g.userData.ring = ring;
      const ring2 = ring.clone();
      ring2.rotation.x = Math.PI / 2;
      g.add(ring2);
      g.userData.ring2 = ring2;
      break;
    }
  }
  return g;
}

/* -------------------------------- wildlife -------------------------------- */

export function buildWildlife(type: WildlifeType, q: Quality, color: string): THREE.Group {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });

  switch (type) {
    case 'bird': {
      const body = new THREE.Mesh(G.lowSphere(), bodyMat);
      body.scale.set(0.36, 0.28, 0.6);
      g.add(body);
      const head = new THREE.Mesh(G.lowSphere(), bodyMat);
      head.scale.setScalar(0.26);
      head.position.set(0, 0.1, 0.4);
      g.add(head);
      const wings: THREE.Mesh[] = [];
      for (const sx of [-1, 1]) {
        const pivot = new THREE.Group();
        pivot.position.set(sx * 0.14, 0.06, 0);
        g.add(pivot);
        const wing = new THREE.Mesh(G.plane(), bodyMat);
        (wing.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
        wing.scale.set(1.1, 0.5, 1);
        wing.position.set(sx * 0.55, 0, 0);
        wing.rotation.x = -Math.PI / 2;
        pivot.add(wing);
        wings.push(wing);
        (g.userData[sx < 0 ? 'wingL' : 'wingR'] as unknown) = pivot;
      }
      break;
    }
    case 'butterfly': {
      const body = new THREE.Mesh(G.box(), bodyMat);
      body.scale.set(0.05, 0.05, 0.22);
      g.add(body);
      for (const sx of [-1, 1]) {
        const pivot = new THREE.Group();
        g.add(pivot);
        const wing = new THREE.Mesh(G.plane(), bodyMat);
        (wing.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
        wing.scale.set(0.3, 0.24, 1);
        wing.position.x = sx * 0.15;
        pivot.add(wing);
        (g.userData[sx < 0 ? 'wingL' : 'wingR'] as unknown) = pivot;
      }
      break;
    }
    case 'fish': {
      const body = new THREE.Mesh(G.lowSphere(), bodyMat);
      body.scale.set(0.2, 0.28, 0.55);
      g.add(body);
      const tail = new THREE.Mesh(G.plane(), bodyMat);
      (tail.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      tail.scale.set(0.35, 0.35, 1);
      tail.position.z = -0.42;
      g.add(tail);
      g.userData.tailMesh = tail;
      break;
    }
    case 'goat_side':
      return buildAnimal('goat', q);
    case 'sheep_side':
      return buildAnimal('sheep', q);
    case 'ibex': {
      const ibex = buildAnimal('goat', q);
      // Walia ibex: the great curved horns of the Simiens.
      const neck = ibex.userData.neck as THREE.Group;
      for (const sx of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          const seg = new THREE.Mesh(G.cylUp(q), mat('ibexHorn', { color: 0x4a3a28, roughness: 0.8 }));
          seg.scale.set(0.13 - i * 0.015, 0.34, 0.13 - i * 0.015);
          seg.position.set(sx * 0.18, 0.2 + i * 0.28, 0.05 - i * 0.12);
          seg.rotation.x = 0.35 + i * 0.35;
          neck.add(seg);
        }
      }
      ibex.scale.setScalar(1.25);
      return ibex;
    }
  }
  return g;
}

export function animateWildlife(g: THREE.Group, type: WildlifeType, phase: number) {
  if (type === 'bird' || type === 'butterfly') {
    const amp = type === 'bird' ? 0.8 : 1.25;
    const speed = type === 'bird' ? 1 : 2.2;
    const wl = g.userData.wingL as THREE.Group | undefined;
    const wr = g.userData.wingR as THREE.Group | undefined;
    if (wl) wl.rotation.z = Math.sin(phase * speed) * amp;
    if (wr) wr.rotation.z = -Math.sin(phase * speed) * amp;
  } else if (type === 'fish') {
    const t = g.userData.tailMesh as THREE.Mesh | undefined;
    if (t) t.rotation.y = Math.sin(phase * 3) * 0.6;
  } else {
    animateAnimal(g, phase, 0.6);
  }
}
