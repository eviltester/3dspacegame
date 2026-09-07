import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createArmadaRig, disposeObject } from '../models';
import { PlayerProtection, PROTECTION_COLOR, RESPAWN_PROTECTION_SECONDS } from './player-protection';

describe('respawn shield appearance and lifetime', () => {
  it('flashes the actual craft blue for three seconds, then restores every material', () => {
    const rig = createArmadaRig(), shield = new PlayerProtection();
    const materials: THREE.LineBasicMaterial[] = [];
    rig.craft.traverse(child => { if (child instanceof THREE.LineSegments && child.material instanceof THREE.LineBasicMaterial) materials.push(child.material); });
    expect(materials.length).toBeGreaterThan(0);
    const original = materials.map(m => ({ color: m.color.getHex(), opacity: m.opacity }));
    shield.start(rig.craft);
    expect(shield.remaining).toBe(RESPAWN_PROTECTION_SECONDS);
    expect(materials.every(m => m.color.getHex() === PROTECTION_COLOR)).toBe(true);
    const bright = materials[0].opacity; shield.update(1 / 6);
    expect(materials[0].opacity).toBeLessThan(bright);
    const paused = shield.remaining; shield.update(0); expect(shield.remaining).toBe(paused);
    for (let i = 0; i < 170; i++) shield.update(1 / 60);
    expect(shield.remaining).toBe(0);
    expect(materials.map(m => ({ color: m.color.getHex(), opacity: m.opacity }))).toEqual(original);
    shield.clear(); disposeObject(rig.root);
  });
  it('restores a craft before restarting protection and supports cockpit-only flight', () => {
    const shield = new PlayerProtection(), material = new THREE.LineBasicMaterial({ color: 0xffaa22, opacity: 0.8 });
    const craft = new THREE.LineSegments(new THREE.BufferGeometry(), material);
    shield.start(craft); shield.start(craft); shield.clear();
    expect(material.color.getHex()).toBe(0xffaa22); expect(material.opacity).toBe(0.8);
    shield.start(); shield.update(3.1); expect(shield.remaining).toBe(0);
    disposeObject(craft);
  });
  it('rebinds a replacement craft without extending the remaining protection', () => {
    const shield = new PlayerProtection(); shield.start(); shield.update(1);
    const remaining = shield.remaining;
    shield.start(undefined, remaining); shield.update(2);
    expect(shield.remaining).toBe(0);
  });
});
