// Plateau d'impression : placement des pièces vu de dessus (glisser, tourner, ranger), contrôle des
// chevauchements et des débords, puis pièces placées pour le .3mf. Repère du plateau : x vers la droite,
// y vers l'arrière, origine au coin avant gauche (comme la machine).

const SPRITE = 4; // px par mm des vignettes
const GAP = 2;    // écart minimal entre pièces (mm)

// Empreinte d'une pièce vue de dessus : vignette (triangles projetés) + cases occupées de 1 mm.
function footprint(arr, color) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, z0 = Infinity;
  for (let i = 0; i < arr.pos.length; i += 3) {
    const x = arr.pos[i], y = arr.pos[i + 1];
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    if (arr.pos[i + 2] < z0) z0 = arr.pos[i + 2];
  }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, w = x1 - x0, h = y1 - y0;
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(w * SPRITE) + 2; cv.height = Math.ceil(h * SPRITE) + 2;
  const g = cv.getContext('2d');
  g.fillStyle = color;
  g.beginPath();
  const P = i => [(arr.pos[3 * i] - x0) * SPRITE + 1, (y1 - arr.pos[3 * i + 1]) * SPRITE + 1];
  for (let t = 0; t < arr.idx.length; t += 3) {
    const a = P(arr.idx[t]);
    let b = P(arr.idx[t + 1]), c = P(arr.idx[t + 2]);
    // tous les triangles dans le même sens : sinon dessus et dessous s'annulent au remplissage
    if ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) < 0) [b, c] = [c, b];
    g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.closePath();
  }
  g.fill();
  const px = g.getImageData(0, 0, cv.width, cv.height).data;
  const cells = []; // centres des cases pleines, en mm, relatifs au centre de la pièce
  for (let my = 0.5; my < h; my += 1) for (let mx = 0.5; mx < w; mx += 1) {
    const sx = Math.round(mx * SPRITE + 1), sy = Math.round((h - my) * SPRITE + 1);
    if (px[(sy * cv.width + sx) * 4 + 3] > 0) cells.push([x0 + mx - cx, y0 + my - cy]);
  }
  return { cv, cx, cy, z0, w, h, cells };
}

// Rangement par défaut : pièces empilées d'avant en arrière, centrées en x.
export function defaultLayout(parts, bed) {
  const layout = {};
  let y = 8;
  for (const [name, arr] of parts) {
    let y0 = Infinity, y1 = -Infinity;
    for (let i = 1; i < arr.pos.length; i += 3) { if (arr.pos[i] < y0) y0 = arr.pos[i]; if (arr.pos[i] > y1) y1 = arr.pos[i]; }
    layout[name] = { x: bed[0] / 2, y: y + (y1 - y0) / 2, a: 0 };
    y += y1 - y0 + 6;
  }
  return layout;
}

// Pièces placées (rotation autour de z puis translation, posées à z = 0) pour l'export.
export function placeParts(parts, layout, bed) {
  const lay = { ...defaultLayout(parts, bed), ...layout };
  return parts.map(([name, arr]) => {
    const { x, y, a } = lay[name];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, z0 = Infinity;
    for (let i = 0; i < arr.pos.length; i += 3) {
      x0 = Math.min(x0, arr.pos[i]); x1 = Math.max(x1, arr.pos[i]);
      y0 = Math.min(y0, arr.pos[i + 1]); y1 = Math.max(y1, arr.pos[i + 1]); z0 = Math.min(z0, arr.pos[i + 2]);
    }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, c = Math.cos((a * Math.PI) / 180), s = Math.sin((a * Math.PI) / 180);
    const pos = new Float32Array(arr.pos.length);
    for (let i = 0; i < pos.length; i += 3) {
      const dx = arr.pos[i] - cx, dy = arr.pos[i + 1] - cy;
      pos[i] = x + c * dx - s * dy; pos[i + 1] = y + s * dx + c * dy; pos[i + 2] = arr.pos[i + 2] - z0;
    }
    return { name, pos, idx: arr.idx };
  });
}

// Chevauchements et débords : renvoie l'ensemble des pièces en défaut.
function problems(fps, lay, bed) {
  const bad = new Set();
  const owner = new Map();
  for (const [name, fp] of fps) {
    const { x, y, a } = lay[name];
    const c = Math.cos((a * Math.PI) / 180), s = Math.sin((a * Math.PI) / 180);
    const mine = new Set();
    for (const [dx, dy] of fp.cells) {
      const X = x + c * dx - s * dy, Y = y + s * dx + c * dy;
      if (X < 1 || Y < 1 || X > bed[0] - 1 || Y > bed[1] - 1) bad.add(name);
      // la case et ses voisines (écart minimal entre pièces)
      for (let i = -GAP / 2; i <= GAP / 2; i++) for (let j = -GAP / 2; j <= GAP / 2; j++) mine.add(`${Math.floor(X) + i},${Math.floor(Y) + j}`);
    }
    for (const k of mine) {
      const o = owner.get(k);
      if (o && o !== name) { bad.add(name); bad.add(o); } else owner.set(k, name);
    }
  }
  return bad;
}

const COLORS = ['#5eead4', '#a78bfa', '#fbbf24', '#f472b6'];

// Éditeur de plateau dans une boîte de dialogue. onDone(layout) à la validation.
export function openPlate({ parts, bed, layout, onDone, title = 'Plateau' }) {
  const dlg = document.createElement('dialog');
  dlg.className = 'plate-dialog';
  dlg.innerHTML = `
    <h2>${title} <span class="mini">${bed[0]} × ${bed[1]} mm</span></h2>
    <p class="mini"><b>Glisser</b> une pièce pour la déplacer · <b>molette</b> ou boutons pour la tourner ·
      <b>flèches</b> du clavier : 1 mm (Maj : 10 mm) sur la pièce choisie.</p>
    <div class="plate-wrap"><canvas></canvas></div>
    <p class="plate-msg" data-msg></p>
    <div class="plate-bar">
      <button type="button" data-a="-90">↺ 90°</button><button type="button" data-a="-15">↺ 15°</button>
      <button type="button" data-a="15">↻ 15°</button><button type="button" data-a="90">↻ 90°</button>
      <button type="button" data-act="auto" class="ghost">Ranger automatiquement</button>
      <span class="sp"></span>
      <button type="button" data-act="cancel" class="ghost">Annuler</button>
      <button type="button" data-act="ok" class="primary">Valider</button>
    </div>`;
  document.body.appendChild(dlg);
  const canvas = dlg.querySelector('canvas'), ctx = canvas.getContext('2d');
  const fps = new Map(parts.map(([name, arr], i) => [name, footprint(arr, COLORS[i % COLORS.length])]));
  const lay = JSON.parse(JSON.stringify({ ...defaultLayout(parts, bed), ...layout }));
  for (const k of Object.keys(lay)) if (!fps.has(k)) delete lay[k];
  let sel = parts[0]?.[0] ?? null, drag = null, bad = new Set();
  const size = Math.min(560, window.innerWidth - 80);
  const k = size / Math.max(bed[0], bed[1]);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = bed[0] * k * dpr; canvas.height = bed[1] * k * dpr;
  canvas.style.width = `${bed[0] * k}px`; canvas.style.height = `${bed[1] * k}px`;
  const toScreen = (x, y) => [x * k, (bed[1] - y) * k];
  const toBed = (sx, sy) => [sx / k, bed[1] - sy / k];

  function draw() {
    bad = problems(fps, lay, bed);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#1b2333'; ctx.fillRect(0, 0, bed[0] * k, bed[1] * k);
    ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = 1;
    for (let v = 10; v < Math.max(bed[0], bed[1]); v += 10) {
      ctx.beginPath(); ctx.moveTo(v * k, 0); ctx.lineTo(v * k, bed[1] * k); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, v * k); ctx.lineTo(bed[0] * k, v * k); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.font = '11px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('avant de la machine', bed[0] * k / 2, bed[1] * k - 6);
    for (const [name, fp] of fps) {
      const { x, y, a } = lay[name];
      const [sx, sy] = toScreen(x, y);
      ctx.save();
      ctx.translate(sx, sy); ctx.rotate((-a * Math.PI) / 180); ctx.scale(k / SPRITE, k / SPRITE);
      ctx.globalAlpha = name === sel ? 1 : 0.85;
      if (bad.has(name)) { ctx.filter = 'drop-shadow(0 0 4px #f87171) drop-shadow(0 0 2px #f87171)'; }
      else if (name === sel) { ctx.filter = 'drop-shadow(0 0 3px #fff)'; }
      ctx.drawImage(fp.cv, -fp.cv.width / 2, -fp.cv.height / 2);
      ctx.restore();
    }
    const msg = dlg.querySelector('[data-msg]');
    msg.textContent = bad.size ? `⚠ ${[...bad].join(', ')} : chevauchement ou débord du plateau.` : '✓ Toutes les pièces tiennent sur le plateau.';
    msg.classList.toggle('bad', !!bad.size);
  }
  // pièce sous le pointeur : test sur la vignette (transparence)
  function hit(bx, by) {
    for (const [name, fp] of [...fps].reverse()) {
      const { x, y, a } = lay[name];
      const c = Math.cos((-a * Math.PI) / 180), s = Math.sin((-a * Math.PI) / 180);
      const dx = bx - x, dy = by - y, lx = c * dx - s * dy, ly = s * dx + c * dy;
      const px = Math.round(lx * SPRITE + fp.cv.width / 2), py = Math.round(-ly * SPRITE + fp.cv.height / 2);
      if (px < 0 || py < 0 || px >= fp.cv.width || py >= fp.cv.height) continue;
      if (fp.cv.getContext('2d').getImageData(px, py, 1, 1).data[3] > 0) return name;
    }
    return null;
  }
  canvas.addEventListener('pointerdown', e => {
    const [bx, by] = toBed(e.offsetX, e.offsetY);
    const n = hit(bx, by);
    if (!n) return;
    sel = n;
    drag = { n, dx: lay[n].x - bx, dy: lay[n].y - by };
    canvas.setPointerCapture(e.pointerId);
    draw();
  });
  canvas.addEventListener('pointermove', e => {
    if (!drag) { canvas.style.cursor = hit(...toBed(e.offsetX, e.offsetY)) ? 'grab' : 'default'; return; }
    const [bx, by] = toBed(e.offsetX, e.offsetY);
    lay[drag.n].x = Math.round((bx + drag.dx) * 2) / 2;
    lay[drag.n].y = Math.round((by + drag.dy) * 2) / 2;
    draw();
  });
  canvas.addEventListener('pointerup', () => { drag = null; });
  canvas.addEventListener('wheel', e => {
    const n = hit(...toBed(e.offsetX, e.offsetY)) || sel;
    if (!n) return;
    e.preventDefault();
    sel = n;
    lay[n].a = (lay[n].a + (e.deltaY > 0 ? 5 : -5) + 360) % 360;
    draw();
  }, { passive: false });
  dlg.addEventListener('keydown', e => {
    if (!sel || !e.key.startsWith('Arrow')) return;
    e.preventDefault();
    const st = e.shiftKey ? 10 : 1;
    if (e.key === 'ArrowLeft') lay[sel].x -= st;
    if (e.key === 'ArrowRight') lay[sel].x += st;
    if (e.key === 'ArrowUp') lay[sel].y += st;
    if (e.key === 'ArrowDown') lay[sel].y -= st;
    draw();
  });
  dlg.addEventListener('click', e => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a && sel) { lay[sel].a = (lay[sel].a + +a + 360) % 360; draw(); return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'auto') { Object.assign(lay, defaultLayout(parts, bed)); draw(); }
    if (act === 'cancel') dlg.close();
    if (act === 'ok') { onDone(JSON.parse(JSON.stringify(lay)), bad.size === 0); dlg.close(); }
  });
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();
  draw();
  // accès pour les essais
  return { dlg, layout: lay, problems: () => [...problems(fps, lay, bed)] };
}

// Contrôle sans affichage (avant impression) : liste des pièces en défaut pour un placement donné.
export function layoutProblems(parts, layout, bed) {
  const fps = new Map(parts.map(([name, arr]) => [name, footprint(arr, '#000')]));
  const lay = { ...defaultLayout(parts, bed), ...layout };
  return [...problems(fps, lay, bed)];
}
