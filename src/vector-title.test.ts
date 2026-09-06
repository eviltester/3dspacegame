import { afterEach, describe, expect, it, vi } from 'vitest';
import { drawVectorTitle, vectorTitleLines } from './vector-title';

afterEach(() => { vi.unstubAllGlobals(); });

describe('vector title lettering', () => {
  it('balances long mobile titles into two lines without losing any words', () => {
    expect(vectorTitleLines('3D VECTOR SPACE SHOOTER', 280)).toEqual(['3D VECTOR', 'SPACE SHOOTER']);
    expect(vectorTitleLines('SHIPS & OBJECTS', 350)).toEqual(['SHIPS &', 'OBJECTS']);
    expect(vectorTitleLines('3D VECTOR SPACE SHOOTER', 720)).toEqual(['3D VECTOR SPACE SHOOTER']);
    expect(vectorTitleLines('GAME OVER', 280)).toEqual(['GAME OVER']);
  });

  it.each(['3', '&', '3D VECTOR SPACE SHOOTER', 'SHIPS & OBJECTS'])('draws %s with visible strokes inside its canvas at desktop and mobile sizes', text => {
    vi.stubGlobal('window', { devicePixelRatio: 2 });
    for (const [width, height] of [[720, 96], [350, 110], [280, 110]]) {
      const points: Array<[number, number]> = [];
      const point = (x: number, y: number) => { points.push([x, y]); };
      const context = { scale: vi.fn(), beginPath: vi.fn(), stroke: vi.fn(), moveTo: point, lineTo: point };
      const canvas = { clientWidth: width, clientHeight: height, width: 0, height: 0, getContext: () => context } as unknown as HTMLCanvasElement;
      drawVectorTitle(canvas, text, '#ffff70');
      expect(context.stroke).toHaveBeenCalled();
      expect(points.length).toBeGreaterThan(3);
      for (const [x, y] of points) {
        expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(width);
        expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(height);
      }
      expect(canvas.width).toBe(width * 2); expect(canvas.height).toBe(height * 2);
    }
  });
});
