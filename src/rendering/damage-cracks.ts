/** Cosmetic randomness is separate from encounter and loot seeds. */
import { Random } from '../encounters';
type Point = [number, number];
const cosmetic = new Random(0x7c4a51);
export function damageCracks(seed: number): Point[][] {
  const random = new Random(seed), paths: Point[][] = [];
  for (let i = 0; i < 8; i++) {
    const start: Point = i === 0 ? [random.range(25, 75), 0] : [i % 2 ? 0 : 100, random.range(8, 88)];
    const end: Point = i === 0 ? [random.range(38, 62), 96] : [random.range(30, 70), random.range(30, 95)];
    const path: Point[] = [start];
    for (let step = 1; step <= 7; step++) {
      const t = step / 7;
      path.push([Math.max(0, Math.min(100, start[0] + (end[0] - start[0]) * t + random.range(-4, 4))),
        Math.max(0, Math.min(100, start[1] + (end[1] - start[1]) * t + random.range(-3, 3)))]);
    }
    paths.push(path);
    for (const branch of [2, 4, 6]) {
      const point = path[branch], side = random.next() < 0.5 ? -1 : 1;
      paths.push([point, [Math.max(0, Math.min(100, point[0] + side * 4)), Math.max(0, Math.min(100, point[1] + 5))],
        [Math.max(0, Math.min(100, point[0] + side * random.range(7, 12))), Math.max(0, Math.min(100, point[1] + random.range(8, 16)))]]);
    }
  }
  return paths;
}
export function flashDamage(layer: HTMLElement | null): void {
  if (!layer) return;
  const paths = damageCracks(Math.floor(cosmetic.next() * 0x100000000));
  layer.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${paths.map(points =>
    `<polyline points="${points.map(point => point.map(value => value.toFixed(2)).join(',')).join(' ')}"/>`).join('')}</svg>`;
  layer.classList.remove('active'); void layer.offsetWidth; layer.classList.add('active');
}
