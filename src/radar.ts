import * as THREE from 'three';

export const RADAR_RANGE = 650;
const CENTER = 90;
const WIDTH = 76;
const DEPTH = 32;
const HEIGHT = 58;
export interface RadarContact {
  position: THREE.Vector3;
  color: string;
  glyph: 'ship' | 'cargo' | 'gate' | 'mine';
}

export function projectRadarContact(position: THREE.Vector3, origin: THREE.Vector3, orientation: THREE.Quaternion) {
  const local = position.clone().sub(origin).applyQuaternion(orientation.clone().invert());
  const distance = local.length();
  const scale = Math.max(RADAR_RANGE, distance);
  const x = CENTER + local.x / scale * WIDTH;
  const planeY = CENTER + local.z / scale * DEPTH;
  const height = local.y / scale * HEIGHT;
  return { x, planeY, y: planeY - height, height, distance };
}

export function renderRadar(context: CanvasRenderingContext2D, contacts: RadarContact[], origin: THREE.Vector3, orientation: THREE.Quaternion): void {
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

  const projected = contacts.map(contact => ({ ...contact, ...projectRadarContact(contact.position, origin, orientation) }))
    .filter(contact => contact.distance <= RADAR_RANGE || contact.glyph === 'gate')
    .sort((a, b) => b.distance - a.distance);
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
    } else context.fillRect(x - 1.5, y - 1.5, 3, 3);
  }
  context.strokeStyle = '#fff';
  context.beginPath(); context.moveTo(CENTER - 3, CENTER + 2); context.lineTo(CENTER, CENTER - 3); context.lineTo(CENTER + 3, CENTER + 2); context.stroke();
  context.restore();
}
