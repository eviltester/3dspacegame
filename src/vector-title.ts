// Single-stroke lettering, drawn with the same straight-line vocabulary as the ships.
// Each glyph is a list of pen strokes; a stroke stores x,y pairs on a 4-by-7 grid.
// Missing glyphs leave a blank advance. Add lettering here rather than a font asset.
const GLYPHS: Record<string, number[][]> = {
  A: [[0, 7, 0, 2, 2, 0, 4, 2, 4, 7], [0, 4, 4, 4]],
  B: [[0, 7, 0, 0, 3, 0, 4, 1, 4, 2.5, 3, 3.5, 0, 3.5], [3, 3.5, 4, 4.5, 4, 6, 3, 7, 0, 7]],
  C: [[4, 0, 1, 0, 0, 1, 0, 6, 1, 7, 4, 7]],
  D: [[0, 7, 0, 0, 2, 0, 4, 2, 4, 5, 2, 7, 0, 7]],
  E: [[4, 0, 0, 0, 0, 7, 4, 7], [0, 3.5, 3, 3.5]],
  F: [[4, 0, 0, 0, 0, 7], [0, 3.5, 3, 3.5]],
  G: [[4, 1, 3, 0, 1, 0, 0, 1, 0, 6, 1, 7, 4, 7, 4, 4, 2, 4]],
  H: [[0, 0, 0, 7], [4, 0, 4, 7], [0, 3.5, 4, 3.5]],
  I: [[0, 0, 4, 0], [2, 0, 2, 7], [0, 7, 4, 7]],
  J: [[4, 0, 4, 6, 3, 7, 1, 7, 0, 6]],
  K: [[0, 0, 0, 7], [4, 0, 0, 3.5, 4, 7]],
  L: [[0, 0, 0, 7, 4, 7]],
  M: [[0, 7, 0, 0, 2, 3, 4, 0, 4, 7]],
  N: [[0, 7, 0, 0, 4, 7, 4, 0]],
  O: [[1, 0, 3, 0, 4, 1, 4, 6, 3, 7, 1, 7, 0, 6, 0, 1, 1, 0]],
  P: [[0, 7, 0, 0, 3, 0, 4, 1, 4, 3, 3, 4, 0, 4]],
  Q: [[1, 0, 3, 0, 4, 1, 4, 5, 2, 7, 1, 7, 0, 6, 0, 1, 1, 0], [2, 5, 4, 7]],
  R: [[0, 7, 0, 0, 3, 0, 4, 1, 4, 3, 3, 4, 0, 4], [2, 4, 4, 7]],
  S: [[4, 0, 1, 0, 0, 1, 0, 3, 4, 4, 4, 6, 3, 7, 0, 7]],
  T: [[0, 0, 4, 0], [2, 0, 2, 7]],
  U: [[0, 0, 0, 6, 1, 7, 3, 7, 4, 6, 4, 0]],
  V: [[0, 0, 0, 3, 2, 7, 4, 3, 4, 0]],
  W: [[0, 0, 0, 7, 2, 4, 4, 7, 4, 0]],
  X: [[0, 0, 4, 7], [4, 0, 0, 7]],
  Y: [[0, 0, 2, 3.5, 4, 0], [2, 3.5, 2, 7]],
  Z: [[0, 0, 4, 0, 0, 7, 4, 7]],
  '-': [[0, 3.5, 4, 3.5]],
  '3': [[0, 0, 3, 0, 4, 1, 4, 2.5, 3, 3.5, 1, 3.5], [3, 3.5, 4, 4.5, 4, 6, 3, 7, 0, 7]],
  '&': [[4, 7, 0, 2, 0, 1, 1, 0, 2, 0, 3, 1, 3, 2, 0, 5, 0, 6, 1, 7, 2, 7, 4, 4]]
};

export function vectorTitleLines(text: string, width: number): string[] {
  // On compact panels, choose the word boundary with the shortest longest line.
  // Balancing two lines avoids one enormous word forcing the entire title tiny.
  const words = text.split(' ');
  if (width >= 500 || text.length <= 10 || words.length < 2) return [text];
  let lines = [text];
  let longest = text.length;
  for (let split = 1; split < words.length; split++) {
    const candidate = [words.slice(0, split).join(' '), words.slice(split).join(' ')];
    const length = Math.max(...candidate.map(line => line.length));
    if (length < longest) { lines = candidate; longest = length; }
  }
  return lines;
}

export function drawVectorTitle(canvas: HTMLCanvasElement, text: string, color: string): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  const width = canvas.clientWidth || 700;
  const height = canvas.clientHeight || 96;
  const pixelRatio = Math.min(window.devicePixelRatio, 2);
  // Backing pixels follow display density, while drawing coordinates stay in CSS
  // pixels. Cap density to avoid wasting work on a small decorative title canvas.
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  context.scale(pixelRatio, pixelRatio);
  const lines = vectorTitleLines(text, width);
  const lineHeight = height / lines.length;
  const longest = Math.max(4, ...lines.map(line => line.length * 6 - 2));
  const scale = Math.min((width - 16) / longest, (lineHeight - 14) / 7, 9);
  context.strokeStyle = color;
  context.lineWidth = 1.5;
  context.lineCap = 'square';
  context.lineJoin = 'bevel';
  lines.forEach((line, row) => {
    const units = Math.max(4, line.length * 6 - 2);
    const left = (width - units * scale) / 2;
    const top = row * lineHeight + (lineHeight - 7 * scale) / 2;
    [...line].forEach((character, index) => {
      for (const stroke of GLYPHS[character] ?? []) {
        context.beginPath();
        for (let point = 0; point < stroke.length; point += 2) {
          const x = left + (index * 6 + stroke[point]) * scale;
          const y = top + stroke[point + 1] * scale;
          if (point === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.stroke();
      }
    });
  });
}
