import { createCanvas } from 'yuzuha/canvas';

const sampleEntries = [
  { name: 'Lia', score: 96 }, { name: 'Domingos Ribeiro', score: 88 }, { name: 'Samira', score: 82 },
  { name: 'João Pedro', score: 77 }, { name: 'Mika Tanaka', score: 71 }, { name: 'Beatriz', score: 65 },
  { name: 'Nuno de Almeida', score: 59 }, { name: 'Ari', score: 52 }, { name: 'Camila Costa', score: 43 },
  { name: 'Ravi', score: 34 },
];

export function buildRanking(entries = sampleEntries) {
  if (entries.length !== 10) throw new RangeError('O exemplo de ranking recebe dez posições.');
  const canvas = createCanvas(1000, 700, { background: '#101722' })
    .rect({ x: 0, y: 0, width: 8, height: 700, fill: '#70d8bc' })
    .text('Community activity', { x: 42, y: 34, maxWidth: 600, fontSize: 34, weight: 700, color: '#f2f4f5' })
    .text('Ten sample positions · demonstration data', { x: 42, y: 78, maxWidth: 700, fontSize: 16, color: '#9ca9b5' })
    .line({ x1: 42, y1: 118, x2: 950, y2: 118, color: '#34414d' });
  entries.forEach((entry, index) => {
    const y = 140 + index * 52;
    canvas.text(String(index + 1).padStart(2, '0'), { x: 44, y, maxWidth: 50, fontSize: 16, weight: 700, color: index < 3 ? '#70d8bc' : '#84919d' })
      .text(entry.name, { x: 108, y, maxWidth: 370, fontSize: 18, minFontSize: 14, weight: index === 0 ? 700 : 400, color: '#ecf0f2' })
      .progress({ x: 520, y: y + 4, width: 330, height: 12, value: entry.score, max: 100, fill: index === 0 ? '#70d8bc' : '#6485a1', background: '#263342' })
      .text(`${entry.score}`, { x: 882, y, maxWidth: 60, fontSize: 15, weight: 700, align: 'right', color: '#c9d2d9' });
  });
  return canvas;
}
