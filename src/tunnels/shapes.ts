/** Authored cross-sections, sampled by distance so every lane has the same width. */
export type Point2 = readonly [number, number];
export interface TunnelShapeDefinition { name: string; closed: boolean; points: readonly Point2[] }
const arc = (count: number, start: number, end: number, rx: number, ry: number): Point2[] =>
  Array.from({ length: count }, (_, i) => { const a = start + (end - start) * i / (count - 1); return [Math.cos(a) * rx, Math.sin(a) * ry]; });
export const TUNNEL_SHAPES: readonly TunnelShapeDefinition[] = [
  { name: 'CLIPPED RECTANGLE', closed: true, points: [[-75,-60],[75,-60],[95,-40],[95,40],[75,60],[-75,60],[-95,40],[-95,-40]] },
  { name: 'UNEVEN HEXAGON', closed: true, points: [[-85,-45],[30,-65],[95,-20],[70,50],[-25,65],[-95,20]] },
  { name: 'FLATTENED OVAL', closed: true, points: arc(17, 0, Math.PI * 2, 100, 58).slice(0, -1) },
  { name: 'ASYMMETRIC OCTAGON', closed: true, points: [[-100,-20],[-65,-60],[30,-65],[95,-35],[88,20],[48,60],[-35,68],[-92,35]] },
  { name: 'ROUNDED TRAPEZOID', closed: true, points: [[-92,-48],[-76,-65],[76,-65],[92,-48],[58,50],[42,62],[-42,62],[-58,50]] },
  { name: 'CRESCENT', closed: false, points: arc(19, -Math.PI * 0.72, Math.PI * 0.72, 85, 68) },
  { name: 'STEPPED HORSESHOE', closed: false, points: [[-90,50],[-90,-15],[-60,-15],[-60,-60],[60,-60],[60,-15],[90,-15],[90,50]] },
  { name: 'SHALLOW ZIGZAG', closed: false, points: [[-100,15],[-60,-30],[-20,20],[20,-20],[60,30],[100,-15]] },
  { name: 'OFFSET BOWL', closed: false, points: [[-95,50],[-90,-10],[-50,-60],[20,-65],[85,-35],[100,35]] },
  { name: 'TWIN-BEND RIBBON', closed: false, points: [[-95,50],[-60,50],[-30,10],[0,-10],[30,10],[60,-45],[95,-45]] }
];
export const LANES = 12;
export const TUNNEL_DEPTH = 420;
export const LANE_SECONDS = 0.14;
export const WARNING_SECONDS = 0.9;
export const tunnelShape = (level: number): TunnelShapeDefinition => TUNNEL_SHAPES[(Math.max(1, Math.floor(level)) - 1) % TUNNEL_SHAPES.length];
export function trackPoint(shape: TunnelShapeDefinition, fraction: number): Point2 {
  const points = shape.closed ? [...shape.points, shape.points[0]] : shape.points;
  const lengths = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
  let distance = Math.max(0, Math.min(1, fraction)) * lengths.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lengths.length; i++) {
    if (distance <= lengths[i] || i === lengths.length - 1) {
      const t = distance / lengths[i]; return [points[i][0] + (points[i+1][0] - points[i][0]) * t, points[i][1] + (points[i+1][1] - points[i][1]) * t];
    }
    distance -= lengths[i];
  }
  return points[0];
}
export function wrapLane(lane: number, closed: boolean): number { return closed ? ((lane % LANES) + LANES) % LANES : Math.max(0, Math.min(LANES - 1, lane)); }
export function laneDelta(from: number, to: number, closed: boolean): number {
  const delta = to - from;
  return closed ? ((delta + LANES * 1.5) % LANES) - LANES / 2 : delta;
}
export function lanePoint(shape: TunnelShapeDefinition, lane: number, depth: number): [number, number, number] {
  const fraction = (wrapLane(lane, shape.closed) + 0.5) / LANES;
  const p = trackPoint(shape, shape.closed ? fraction % 1 : fraction);
  const scale = 1 - Math.max(0, depth) / TUNNEL_DEPTH * 0.5;
  return [p[0] * scale, p[1] * scale, -depth];
}
export const tunnelColor = (level: number): number => {
  const palette = [0x55dcca, 0xa8a0ff, 0xffb85a, 0x69c9ff, 0xef8bbc, 0xade471, 0xc4bbff];
  return palette[(level - 1 + Math.floor((level - 1) / 10) * 2) % palette.length];
};
