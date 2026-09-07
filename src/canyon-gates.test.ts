import { expect, it } from 'vitest';
import { CanyonGateScore, canyonGatePoints } from './canyon-gates';

it.each([[false, 0, 50], [true, 0, 100], [false, 2, 100], [true, 2, 200]] as const)('small=%s motion=%s pays %s points', (small, motion, points) => {
  const score = new CanyonGateScore(), gate = { small, motion };
  expect(canyonGatePoints(gate)).toBe(points);
  expect(score.cross(true, gate)).toBe(points); expect(score.penalty).toBe(0);
});

it('increases each miss by 200 and reduces the active penalty one step per pass', () => {
  const score = new CanyonGateScore(), gate = { small: false, motion: 0 };
  for (const [pass, points, penalty] of [
    [false, -200, 200], [false, -400, 400], [false, -600, 600],
    [true, 50, 400], [false, -600, 600], [true, 50, 400],
    [true, 50, 200], [true, 50, 0], [true, 50, 0], [false, -200, 200]
  ] as const) {
    expect(score.cross(pass, gate)).toBe(points); expect(score.penalty).toBe(penalty);
  }
});
