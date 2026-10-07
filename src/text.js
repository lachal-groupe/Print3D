// Contours d'images binaires (marching squares) et texte → contours vectoriels pour la gravure.

const SEGMENTS = {
  1: [['l', 'b']], 2: [['b', 'r']], 3: [['l', 'r']], 4: [['t', 'r']],
  5: [['l', 't'], ['b', 'r']], 6: [['t', 'b']], 7: [['l', 't']], 8: [['l', 't']],
  9: [['t', 'b']], 10: [['t', 'r'], ['l', 'b']], 11: [['t', 'r']], 12: [['l', 'r']],
  13: [['b', 'r']], 14: [['l', 'b']],
};

// Boucles fermées délimitant les pixels « pleins » d'un masque w × h (on(x, y) → 0 / 1).
// Coordonnées en pixels, sur les milieux d'arêtes des cellules.
export function maskContours(on, w, h) {
  const mid = (i, j, e) => (e === 't' ? [2 * i + 1, 2 * j] : e === 'r' ? [2 * i + 2, 2 * j + 1]
    : e === 'b' ? [2 * i + 1, 2 * j + 2] : [2 * i, 2 * j + 1]);
  const val = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : on(x, y));
  const adj = new Map();
  const link = (a, b) => {
    const ka = a.join(','), kb = b.join(',');
    if (!adj.has(ka)) adj.set(ka, []);
    if (!adj.has(kb)) adj.set(kb, []);
    adj.get(ka).push(kb);
    adj.get(kb).push(ka);
  };
  for (let j = -1; j < h; j++)
    for (let i = -1; i < w; i++) {
      const c = val(i, j) * 8 + val(i + 1, j) * 4 + val(i + 1, j + 1) * 2 + val(i, j + 1);
      for (const [e1, e2] of SEGMENTS[c] || []) link(mid(i, j, e1), mid(i, j, e2));
    }
  const loops = [];
  const seen = new Set();
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const loop = [];
    let prev = null, cur = start;
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      loop.push(cur.split(',').map(v => +v / 2));
      const next = adj.get(cur).find(k => k !== prev && !seen.has(k));
      prev = cur;
      cur = next;
    }
    if (loop.length >= 4) loops.push(loop);
  }
  return loops;
}

// Le texte est dessiné dans un canvas avec une police système, puis le contour des pixels pleins est suivi.
// Les contours (trous des lettres compris) se combinent en pair-impair.
export function textToPolys(text, font = '700 120px "Segoe UI", Arial, sans-serif') {
  text = (text || '').trim();
  if (!text) return [];
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.font = font;
  const pad = 8;
  const w = Math.ceil(ctx.measureText(text).width) + 2 * pad;
  const h = 170;
  canvas.width = w;
  canvas.height = h;
  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000';
  ctx.fillText(text, pad, h / 2);
  const data = ctx.getImageData(0, 0, w, h).data;
  return maskContours((x, y) => (data[(y * w + x) * 4 + 3] > 127 ? 1 : 0), w, h)
    .map(loop => loop.map(([x, y]) => [x, -y])); // y vers le haut
}
