/** Original X/Z flight paths. A shared clock keeps squadron leaders and followers together. */
import * as THREE from 'three';

export const INVADER_SLOTS = 18;
export const INVADER_PATTERNS = ['MARCH', 'ORBIT', 'SWARM', 'FIGURE EIGHT', 'PINCER', 'COIL', 'SWOOP', 'CONVOY', 'WEAVE'] as const;
export function invaderPattern(wave: number): typeof INVADER_PATTERNS[number] {
  return INVADER_PATTERNS[(Math.max(1, Math.floor(wave)) - 1) % INVADER_PATTERNS.length];
}

export function invaderHome(slot: number): THREE.Vector3 {
  return new THREE.Vector3((slot % 6 - 2.5) * 26, 0, -160 - Math.floor(slot / 6) * 78);
}

// Arc-length sampling keeps followers evenly paced through the tighter bends.
const convoy = new THREE.CatmullRomCurve3([
  [-60, -325], [-62, -175], [-28, -85], [20, -75], [64, -175], [44, -310], [0, -350]
].map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');

export function invaderPosition(slot: number, elapsed: number, wave: number, speed: number): THREE.Vector3 {
  const clock = elapsed * speed, group = Math.floor(slot / 3), follower = slot % 3;
  const home = invaderHome(slot), angle = clock * 0.58 - slot * Math.PI * 2 / INVADER_SLOTS;
  switch (invaderPattern(wave)) {
    case 'MARCH':
      return home.add(new THREE.Vector3(Math.sin(clock * 0.7) * 6, 0, Math.sin(clock * 0.35) * 20));
    case 'ORBIT':
      return new THREE.Vector3(Math.cos(angle) * 66, 0, -218 + Math.sin(angle) * 118);
    case 'SWARM': {
      // Six three-ship wedges circle and surge together, rather than eighteen solo dives.
      const phase = clock * 0.5 - group * Math.PI / 3;
      const wing = [-12, 12, 0][follower], trail = follower === 2 ? -35 : 0;
      return new THREE.Vector3(Math.sin(phase) * 48 + wing, 0, -210 + Math.cos(phase) * 108 + trail);
    }
    case 'FIGURE EIGHT':
      return new THREE.Vector3(Math.sin(angle) * 66, 0, -218 + Math.sin(angle * 2) * 112);
    case 'PINCER': {
      const phase = clock * 0.6 - Math.floor(group / 2) * 2.1 - follower * 0.24;
      return new THREE.Vector3((group % 2 ? 1 : -1) * (42 + Math.cos(phase) * 24), 0, -212 + Math.sin(phase) * 116);
    }
    case 'COIL': {
      const radius = 60 + Math.sin(clock * 0.28) * 6;
      return new THREE.Vector3(Math.cos(angle) * radius, 0, -222 + Math.sin(angle) * (radius * 1.8) + Math.sin(clock * 0.28) * 18);
    }
    case 'SWOOP': {
      const phase = clock * 0.62 - group * 1.05 - follower * 0.18;
      const dive = Math.max(0, Math.sin(phase)) ** 2;
      return new THREE.Vector3(home.x * (1 - dive * 0.35) + Math.sin(phase * 2) * dive * 16,
        0, home.z + (-home.z - 65) * dive);
    }
    case 'CONVOY': {
      // A pause between each trio makes the leader/follower rhythm visible.
      const progress = clock * 0.055 - group / 6 - follower * 0.036;
      return convoy.getPointAt((progress % 1 + 1) % 1);
    }
    case 'WEAVE':
      return home.add(new THREE.Vector3(Math.sin(clock * 0.9 + Math.floor(slot / 6) * 1.7) * 6, 0,
        Math.sin(clock * 0.5 + Math.floor(slot / 6)) * 20));
  }
}
