/** Ship-relative radar projection, kept independent of the main WebGL camera. */
import type * as THREE from 'three';

export const RADAR_RANGE = 650;
const CENTER = 90;
const WIDTH = 76;
const DEPTH = 32;
const HEIGHT = 58;
export interface RadarView { range: number; lateralRange: number; heightRange: number; rearRange: number }
export const SPACE_RADAR_VIEW: RadarView = { range: RADAR_RANGE, lateralRange: RADAR_RANGE, heightRange: RADAR_RANGE, rearRange: RADAR_RANGE };
// A canyon is tens of units wide, not hundreds. Magnify its lateral/vertical lanes
// while retaining enough forward range to see hazards before automatic flight reaches them.
export const COURSE_RADAR_VIEW: RadarView = { range: 500, lateralRange: 75, heightRange: 65, rearRange: 50 };
export interface RadarContact {
  position: THREE.Vector3;
  color: string;
  glyph: 'ship' | 'cargo' | 'gate' | 'mine' | 'rock' | 'obstacle' | 'shot';
}

export function projectRadarContact(position: THREE.Vector3, origin: THREE.Vector3, orientation: THREE.Quaternion, view = SPACE_RADAR_VIEW) {
  // Subtract our position, then undo our rotation. This turns world coordinates
  // into right/up/ahead relative to the cockpit even when flying upside down.
  const local = position.clone().sub(origin).applyQuaternion(orientation.clone().invert());
  const distance = local.length();
  // Ordinary contacts outside range are hidden below; gates remain pinned within
  // the radar, so the exit can still be found after travelling a long way away.
  const nx = local.x / view.lateralRange, ny = local.y / view.heightRange, nz = local.z / view.range;
  const scale = Math.max(1, Math.hypot(nx, ny, nz));
  const x = CENTER + nx / scale * WIDTH;
  // The ellipse is the ship's X/Z flight plane. Height lifts the symbol off its
  // plane point; the connecting stem shows above/below without losing range cues.
  const planeY = CENTER + nz / scale * DEPTH;
  const height = ny / scale * HEIGHT;
  return { x, planeY, y: planeY - height, height, distance, inRange: distance <= view.range && local.z <= view.rearRange };
}

export function renderRadar(context: CanvasRenderingContext2D, contacts: RadarContact[], origin: THREE.Vector3, orientation: THREE.Quaternion, view = SPACE_RADAR_VIEW): void {
  context.save();
  context.clearRect(0, 0, 180, 180);
  context.lineWidth = 1;
  context.strokeStyle = '#254f37';
  context.beginPath(); context.arc(CENTER, CENTER, 82, 0, Math.PI * 2); context.stroke();
  context.strokeStyle = '#397a53';
  context.beginPath(); context.ellipse(CENTER, CENTER, WIDTH, DEPTH, 0, 0, Math.PI * 2); context.stroke();
  context.strokeStyle = '#254f37';
  context.beginPath(); context.ellipse(CENTER, CENTER, WIDTH / 2, DEPTH / 2, 0, 0, Math.PI * 2);
  context.moveTo(CENTER - WIDTH, CENTER); context.lineTo(CENTER + WIDTH, CENTER);
  context.moveTo(CENTER, CENTER - DEPTH); context.lineTo(CENTER, CENTER + DEPTH); context.stroke();

  const projected = contacts.map(contact => ({ ...contact, ...projectRadarContact(contact.position, origin, orientation, view) }))
    .filter(contact => contact.inRange || contact.glyph === 'gate')
    .sort((a, b) => Number(a.glyph === 'gate') - Number(b.glyph === 'gate') || b.distance - a.distance);
  // Draw all height stems first, keeping the contact symbols distinct on top.
  for (const contact of projected) {
    if (Math.abs(contact.height) < 0.5) continue;
    context.strokeStyle = contact.color;
    context.globalAlpha = 0.65;
    context.setLineDash(contact.height < 0 ? [2, 2] : []);
    context.beginPath(); context.moveTo(contact.x, contact.planeY); context.lineTo(contact.x, contact.y); context.stroke();
    context.setLineDash([]);
    context.globalAlpha = 0.45;
    context.beginPath(); context.moveTo(contact.x - 2, contact.planeY); context.lineTo(contact.x + 2, contact.planeY); context.stroke();
  }
  context.globalAlpha = 1;
  for (const contact of projected) {
    const { x, y } = contact;
    context.strokeStyle = context.fillStyle = contact.color;
    if (contact.glyph === 'cargo') {
      context.beginPath(); context.moveTo(x, y - 4); context.lineTo(x - 3.5, y + 3); context.lineTo(x + 3.5, y + 3); context.closePath(); context.stroke();
    } else if (contact.glyph === 'gate') {
      context.beginPath(); context.moveTo(x - 4, y); context.lineTo(x + 4, y); context.moveTo(x, y - 4); context.lineTo(x, y + 4); context.stroke();
    } else if (contact.glyph === 'mine') {
      context.beginPath(); context.moveTo(x - 3, y - 3); context.lineTo(x + 3, y + 3); context.moveTo(x + 3, y - 3); context.lineTo(x - 3, y + 3); context.stroke();
    } else if (contact.glyph === 'rock') {
      context.beginPath(); context.arc(x, y, 2.5, 0, Math.PI * 2); context.stroke();
    } else if (contact.glyph === 'obstacle') {
      context.beginPath(); context.rect(x - 3, y - 3, 6, 6); context.stroke();
    } else if (contact.glyph === 'shot') {
      context.beginPath(); context.moveTo(x, y - 2); context.lineTo(x, y + 2); context.stroke();
    } else context.fillRect(x - 1.5, y - 1.5, 3, 3);
  }
  context.strokeStyle = '#fff';
  context.beginPath(); context.moveTo(CENTER - 3, CENTER + 2); context.lineTo(CENTER, CENTER - 3); context.lineTo(CENTER + 3, CENTER + 2); context.stroke();
  context.restore();
}
