import * as THREE from 'three';
import { createPulseRing, lineShape } from './primitives';
import type { SkiffRepair } from '../skiff-repairs';

export const SKIFF_REPAIR_COLORS = { shield: 0x70cfff, repair: 0xff80ee };
export function createSkiffRepairModel(kind: SkiffRepair): THREE.Group {
  const model = new THREE.Group(), color = SKIFF_REPAIR_COLORS[kind];
  if (kind === 'shield') {
    model.add(lineShape([[-4, 4, 0], [4, 4, 0], [3, -1, 0], [0, -5, 0], [-3, -1, 0]], [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0]], color));
    model.add(lineShape([[-1.5, 0, 0], [1.5, 0, 0], [0, -1.5, 0], [0, 1.5, 0]], [[0, 1], [2, 3]], color));
  } else {
    model.add(createPulseRing(color, 5, 0, 1, 8));
    model.add(lineShape([[-3, 0, 0], [3, 0, 0], [0, -3, 0], [0, 3, 0]], [[0, 1], [2, 3]], color));
    model.add(createPulseRing(color, 6.5, -2, 0.55, 8));
  }
  return model;
}
