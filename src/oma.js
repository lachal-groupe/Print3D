// Lecture des fichiers OMA / VCA (Data Communication Standard).
// Gère TRCFMT=1 (ASCII), angles égaux (E) ou non (U), côtés R / L / B.
// Convention VCA : vue de face (côté convexe), 0° à 3 h, sens trigo.
// Pour l'œil droit, 0° est donc côté nasal.

export function parseOMA(text) {
  const lines = text.split(/\r?\n/);
  const header = {};
  const traces = {};
  let cur = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq);
    const val = line.slice(eq + 1);

    if (key === 'TRCFMT') {
      const [fmt, n, mode, side, type] = val.split(';');
      cur = { fmt: +fmt, n: +n, mode, side, type, R: [], A: [] };
      if (cur.fmt !== 1) throw new Error(`Format de tracé ${fmt} non géré (seul le format ASCII 1 est supporté).`);
      traces[side] = cur;
      continue;
    }
    if (cur && (key === 'R' || key === 'A')) {
      for (const v of val.split(';')) if (v.trim() !== '') cur[key].push(+v);
      continue;
    }
    // tout autre enregistrement termine le bloc de tracé courant
    if (key !== 'R' && key !== 'A') cur = null;
    if (!(key in header)) header[key] = val;
  }

  const sides = {};
  for (const [side, t] of Object.entries(traces)) {
    if (t.R.length === 0) continue;
    const n = t.R.length;
    const angles = t.mode === 'U' && t.A.length === n
      ? t.A.map(a => a / 100)
      : t.R.map((_, i) => (i * 360) / n);
    sides[side] = t.R.map((r, i) => {
      const a = (angles[i] * Math.PI) / 180;
      return [(r / 100) * Math.cos(a), (r / 100) * Math.sin(a)];
    });
  }

  // B = même forme pour les deux yeux : l'œil gauche est le miroir du droit
  if (!sides.R && sides.B) sides.R = sides.B;
  if (!sides.R && sides.L) sides.R = sides.L.map(([x, y]) => [-x, y]);
  if (!sides.L && sides.R) sides.L = sides.R.map(([x, y]) => [-x, y]);
  if (!sides.R) throw new Error('Aucun tracé trouvé dans le fichier.');

  const num = k => (header[k] ? parseFloat(header[k].split(';')[0]) : NaN);
  return {
    job: header.JOB || '',
    dbl: num('DBL'),
    hbox: num('HBOX'),
    vbox: num('VBOX'),
    traceType: traces.R?.type || traces.L?.type || '',
    device: [header.VEN, header.MNAME || header.MODEL].filter(Boolean).join(' '),
    right: centerBox(sides.R),
    left: centerBox(sides.L),
  };
}

// Recentre le contour sur le centre boxing.
function centerBox(pts) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x);
    y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return {
    pts: pts.map(([x, y]) => [x - cx, y - cy]),
    width: x1 - x0,
    height: y1 - y0,
  };
}
