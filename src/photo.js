// Contour complet de la face (nez, pont et tenons compris) dessiné sur une photo de face de la monture.
// 1. Calage : les contours OMA des deux verres sont superposés à la photo. Calage automatique sur les
//    ouvertures des verres, puis réglage manuel possible : déplacer, échelle (molette), rotation et
//    écart entre les verres (DBL). Le verre étant connu en mm, la photo se retrouve à l'échelle.
// 2. Contour : lasso polygonal libre. Une proposition automatique (silhouette de la monture sur le fond)
//    sert de départ ; on peut déplacer, ajouter ou supprimer des points, ou tout redessiner.
//    Option symétrie : on ne dessine que le côté gauche de l'image (verre droit), l'autre côté suit en miroir.
// Résultat : contour fermé en mm dans le repère de l'atelier (x = 0 au milieu du pont, y vers le haut).

import { maskContours } from './text.js';

const ICON_CAMERA = '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13.5" r="3.5"/></svg>';

// edit : état d'une session précédente (photo, calage, points de contrôle) pour reprendre le dessin.
export function openPhotoEditor({ oma, dbl, outline, edit, onApply, onClear }) {
  const root = document.createElement('div');
  root.className = 'photo-modal';
  root.innerHTML = `
    <div class="photo-card">
      <header>
        <div class="photo-title"><span class="icon-tile" style="--c:var(--lime)">${ICON_CAMERA}</span>
          <div><h2>Contour de face depuis une photo</h2><p>Photo de face, monture à plat sur un fond uni</p></div></div>
        <button class="ghost" data-act="close" aria-label="Fermer">✕</button>
      </header>
      <div class="photo-body">
        <div class="photo-stage"><canvas></canvas>
          <label class="photo-drop"><input type="file" accept="image/*" hidden>
            <strong>Choisir une photo</strong><span>ou la glisser ici</span></label>
        </div>
        <aside class="photo-side">
          <ol class="steps">
            <li data-step="1" class="on"><b>1</b> Caler les verres</li>
            <li data-step="2"><b>2</b> Dessiner le contour</li>
          </ol>
          <div class="step-pane" data-pane="1">
            <p class="hint">Les contours bleus des verres sont calés automatiquement. Vérifiez qu'ils coïncident
              avec les verres de la photo, sinon : <b>glisser</b> pour déplacer, <b>molette</b> pour l'échelle,
              et les curseurs ci-dessous.</p>
            <div class="field"><label>Écart entre les verres (DBL)</label>
              <div class="inputs"><input type="range" data-k="dbl" min="8" max="30" step="0.1"><output data-o="dbl"></output></div></div>
            <div class="field"><label>Rotation</label>
              <div class="inputs"><input type="range" data-k="rot" min="-15" max="15" step="0.1"><output data-o="rot"></output></div></div>
            <div class="field"><label>Échelle</label>
              <div class="inputs"><input type="range" data-k="scale" min="-1" max="1" step="0.002" value="0"><output data-o="scale"></output></div></div>
            <label class="check"><input type="checkbox" data-k="mirror"> Photo prise de dos (miroir)</label>
            <button class="wide" data-act="auto">Recaler automatiquement</button>
            <button class="primary wide" data-act="next">Dessiner le contour →</button>
          </div>
          <div class="step-pane" data-pane="2" hidden>
            <label class="check"><input type="checkbox" data-k="sym" checked> Un seul côté + symétrie</label>
            <div data-symopts>
              <div class="field"><label>Côté modèle</label>
                <div class="seg" style="--c:var(--lime)">
                  <button type="button" data-ref="left" class="on">Gauche de l’image</button>
                  <button type="button" data-ref="right">Droite de l’image</button>
                </div></div>
              <label class="check"><input type="checkbox" data-k="symphoto" checked> Photo symétrisée (le côté modèle en miroir)</label>
            </div>
            <div class="seg" style="--c:var(--lime)">
              <button type="button" data-mode="edit" class="on">Modifier</button>
              <button type="button" data-mode="draw">Dessiner</button>
            </div>
            <p class="hint" data-hint></p>
            <div class="row2"><button data-act="propose">Proposition auto</button><button data-act="clearpoly">Effacer</button></div>
            <div class="field"><label>Lissage des angles</label>
              <div class="inputs"><input type="range" data-k="smooth" min="0" max="6" step="0.1" value="2"><output data-o="smooth">2,0 mm</output></div>
              <p class="hint">Rayon d’arrondi. Les angles vifs (plus de 60°, ex. tenons) restent nets.</p></div>
            <div class="field"><label>Sensibilité de la proposition</label>
              <div class="inputs"><input type="range" data-k="thr" min="5" max="200" step="1" value="45"><output data-o="thr">auto</output></div>
              <p class="hint">Réglée automatiquement pour chaque photo. Plus bas = plus de monture, plus haut = moins d’ombres.</p></div>
            <div class="row2"><button data-act="back">← Calage</button><button class="primary" data-act="apply">Utiliser</button></div>
          </div>
          ${outline ? '<button class="danger wide" data-act="clear">Revenir au dessin de l’atelier</button>' : ''}
          <p class="mini">Conseil : photo bien de face, à 40 cm environ, sans flash, sur une feuille blanche
            (monture foncée) ou noire (monture claire).</p>
        </aside>
      </div>
    </div>`;
  document.body.appendChild(root);

  const $ = s => root.querySelector(s);
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d');
  const st = {
    img: null, pix: null, iw: 0, ih: 0, bg: [255, 255, 255], thr: 45,
    ox: 0, oy: 0, s: 1, s0: 1, rot: 0, mirror: false, dbl: dbl ?? oma.dbl ?? 18, // px image = O + s·R(rot)·(x, −y)
    step: 1, mode: 'edit', sym: true, smooth: 2, ref: 'left', symPhoto: true, // smooth : rayon de lissage (mm), 0 = aucun
    poly: [], // contour (mm) : demi-contour du côté gauche de l'image si symétrie, sinon contour complet
    drawing: false, drag: null, hover: null, view: { k: 1, x: 0, y: 0 },
  };
  // reprise d'un dessin : on retrouve les points de contrôle et la symétrie de la session précédente
  if (edit) {
    // ancienne case « Adoucir les angles » (vrai / faux) : vrai = 2 mm
    const smooth = typeof edit.smooth === 'number' ? edit.smooth : edit.smooth === false ? 0 : 2;
    Object.assign(st, { poly: edit.poly.map(q => [...q]), sym: edit.sym, ref: edit.ref, smooth, symPhoto: edit.symPhoto ?? true });
    $('[data-k="sym"]').checked = st.sym;
    $('[data-k="symphoto"]').checked = st.symPhoto;
    $('[data-symopts]').hidden = !st.sym;
    root.querySelectorAll('[data-ref]').forEach(b => b.classList.toggle('on', b.dataset.ref === st.ref));
  } else if (outline?.length) { st.sym = false; st.poly = outline.map(q => [...q]); $('[data-k="sym"]').checked = false; $('[data-symopts]').hidden = true; }

  // verres placés comme dans l'atelier, avec l'écart réglé au calage
  const lenses = [{ sg: -1, src: oma.right }, { sg: 1, src: oma.left }];
  const lensPts = l => l.src.pts.map(([x, y]) => [x + l.sg * (l.src.width / 2 + st.dbl / 2), y]);

  // ---------- coordonnées ----------
  const toImg = ([x, y]) => {
    const c = Math.cos(st.rot), s = Math.sin(st.rot);
    return [st.ox + st.s * (c * x + s * y), st.oy + st.s * (s * x - c * y)];
  };
  const imgToMm = (ix, iy) => {
    const dx = (ix - st.ox) / st.s, dy = (iy - st.oy) / st.s;
    const c = Math.cos(st.rot), s = Math.sin(st.rot);
    return [c * dx + s * dy, s * dx - c * dy];
  };
  const toScreen = ([ix, iy]) => [st.view.x + ix * st.view.k, st.view.y + iy * st.view.k];
  const fromScreen = (sx, sy) => [(sx - st.view.x) / st.view.k, (sy - st.view.y) / st.view.k];
  const mmToScreen = q => toScreen(toImg(q));
  const screenToMm = (sx, sy) => imgToMm(...fromScreen(sx, sy));
  // demi-contour : stocké côté x ≤ 0 ; affiché (et saisi) côté x ≥ 0 quand le modèle est à droite de l'image
  const flipRef = () => st.sym && st.ref === 'right';
  const D = q => (flipRef() ? [-q[0], q[1]] : q);
  const polyScreen = () => st.poly.map(q => mmToScreen(D(q)));
  const inputMm = (sx, sy) => D(screenToMm(sx, sy));

  function fit() {
    const r = canvas.parentElement.getBoundingClientRect();
    canvas.width = r.width * devicePixelRatio;
    canvas.height = r.height * devicePixelRatio;
    canvas.style.width = r.width + 'px';
    canvas.style.height = r.height + 'px';
    if (!st.img) return;
    const k = Math.min(r.width / st.iw, r.height / st.ih) * 0.96;
    st.view = { k, x: (r.width - st.iw * k) / 2, y: (r.height - st.ih * k) / 2 };
  }

  // ---------- image ----------
  function loadImage(file) {
    const img = new Image();
    img.onload = () => {
      st.img = img;
      st.iw = img.naturalWidth; st.ih = img.naturalHeight;
      buildPixels();
      st.s = st.s0 = st.iw / 160; st.ox = st.iw / 2; st.oy = st.ih / 2;
      if (edit?.calib && file === edit.file) {
        // même photo qu'à la session précédente : on garde son calage et on reprend au dessin
        Object.assign(st, edit.calib);
        st.s0 = st.s;
        $('[data-k="mirror"]').checked = st.mirror;
        if (st.mirror) buildPixels();
        setStep(2);
      } else autoCalibrate();
      $('.photo-drop').hidden = true;
      fit(); syncOutputs(); draw();
    };
    img.src = URL.createObjectURL(file);
    st.file = file;
  }
  function buildPixels() {
    const c = document.createElement('canvas');
    c.width = st.iw; c.height = st.ih;
    const x = c.getContext('2d', { willReadFrequently: true });
    if (st.mirror) { x.translate(st.iw, 0); x.scale(-1, 1); }
    x.drawImage(st.img, 0, 0);
    st.pix = x.getImageData(0, 0, st.iw, st.ih).data;
    st.shown = c;
    // couleur du fond : médiane des pixels du bord de l'image
    const samples = [];
    for (let i = 0; i < 400; i++) {
      const t = i / 400, side = i % 4;
      const px = side < 2 ? Math.floor(t * (st.iw - 1)) : side === 2 ? 2 : st.iw - 3;
      const py = side === 0 ? 2 : side === 1 ? st.ih - 3 : Math.floor(t * (st.ih - 1));
      const k = (py * st.iw + px) * 4;
      samples.push([st.pix[k], st.pix[k + 1], st.pix[k + 2]]);
    }
    st.bg = [0, 1, 2].map(ch => samples.map(s => s[ch]).sort((a, b) => a - b)[samples.length >> 1]);
    buildContrast();
  }

  // Carte de contraste pour la proposition de contour, moyennée sur des blocs de k×k pixels (le grain de
  // la photo disparaît) : écart au fond en luminosité et en teinte, la teinte comptant double pour qu'une
  // ombre grise sur la feuille pèse moins qu'une monture. Seuil choisi automatiquement (méthode d'Otsu).
  function buildContrast() {
    const k = Math.max(1, Math.round(st.iw / 900));
    const w = Math.floor(st.iw / k), h = Math.floor(st.ih / k);
    const map = new Float32Array(w * h);
    const lb = (st.bg[0] + st.bg[1] + st.bg[2]) / 3;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let r = 0, gr = 0, b = 0;
      for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) {
        const q = ((y * k + j) * st.iw + x * k + i) * 4;
        r += st.pix[q]; gr += st.pix[q + 1]; b += st.pix[q + 2];
      }
      r /= k * k; gr /= k * k; b /= k * k;
      const l = (r + gr + b) / 3;
      const dc = Math.hypot(r - l - (st.bg[0] - lb), gr - l - (st.bg[1] - lb), b - l - (st.bg[2] - lb));
      map[x + y * w] = Math.hypot(l - lb, 2 * dc);
    }
    const hist = new Float64Array(256);
    for (const v of map) hist[Math.min(255, v | 0)]++;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    let wB = 0, sB = 0, best = 0, thr = 45;
    for (let t = 0; t < 256; t++) {
      wB += hist[t];
      if (!wB) continue;
      const wF = map.length - wB;
      if (!wF) break;
      sB += t * hist[t];
      const between = wB * wF * (sB / wB - (sum - sB) / wF) ** 2;
      if (between > best) { best = between; thr = t; }
    }
    st.cmap = { k, w, h, map };
    st.thr = Math.max(12, Math.min(200, thr));
    st.thrAuto = true;
  }

  // Masque basse résolution : fond relié au bord de la photo (« extérieur », -2) et ouvertures (trous de fond).
  // Le calage garde son réglage éprouvé (écart de couleur < 45 sur l'image réduite) ; la proposition de
  // contour utilise la carte de contraste, plus fine, débarrassée de ses grains isolés.
  function analyse(forOutline = false) {
    let k, w, h, bgAt;
    if (forOutline) {
      ({ k, w, h } = st.cmap);
      const raw = new Uint8Array(w * h);
      for (let i = 0; i < raw.length; i++) raw[i] = st.cmap.map[i] < st.thr ? 1 : 0;
      // filtre majoritaire 3×3 : supprime les points isolés et adoucit le bord en escalier
      const clean = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let n = 0, t = 0;
        for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
          const xx = x + i, yy = y + j;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          n++; t += raw[xx + yy * w];
        }
        clean[x + y * w] = 2 * t > n ? 1 : 0;
      }
      bgAt = (x, y) => clean[x + y * w] === 1;
    } else {
      k = Math.max(1, Math.round(st.iw / 480));
      w = Math.floor(st.iw / k); h = Math.floor(st.ih / k);
      bgAt = (x, y) => {
        const i = ((y * k) * st.iw + x * k) * 4;
        return Math.hypot(st.pix[i] - st.bg[0], st.pix[i + 1] - st.bg[1], st.pix[i + 2] - st.bg[2]) < 45;
      };
    }
    const lab = new Int32Array(w * h).fill(-1);
    const flood = (sx, sy, id) => {
      const stack = [sx + sy * w], out = { n: 0, x0: w, x1: 0, y0: h, y1: 0, sx: 0 };
      lab[stack[0]] = id;
      while (stack.length) {
        const q = stack.pop(), x = q % w, y = (q / w) | 0;
        out.n++; out.sx += x;
        if (x < out.x0) out.x0 = x; if (x > out.x1) out.x1 = x; if (y < out.y0) out.y0 = y; if (y > out.y1) out.y1 = y;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const nq = nx + ny * w;
          if (lab[nq] !== -1 || !bgAt(nx, ny)) continue;
          lab[nq] = id; stack.push(nq);
        }
      }
      return out;
    };
    for (let x = 0; x < w; x++) for (const y of [0, h - 1]) if (lab[x + y * w] === -1 && bgAt(x, y)) flood(x, y, -2);
    for (let y = 0; y < h; y++) for (const x of [0, w - 1]) if (lab[x + y * w] === -1 && bgAt(x, y)) flood(x, y, -2);
    const holes = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
      if (lab[x + y * w] === -1 && bgAt(x, y)) { const c = flood(x, y, holes.length); if (c.n > w * h * 0.002) holes.push(c); }
    return { k, w, h, lab, holes };
  }

  // Calage automatique : les deux groupes d'ouvertures (gauche / droite de l'image) donnent
  // l'échelle (taille des verres), la rotation, la position et l'écart entre verres.
  function autoCalibrate() {
    const { k, holes } = analyse();
    if (holes.length < 2) return false;
    holes.sort((a, b) => a.sx / a.n - b.sx / b.n);
    let cut = 1, gapMax = -1;
    for (let i = 1; i < holes.length; i++) {
      const gap = holes[i].sx / holes[i].n - holes[i - 1].sx / holes[i - 1].n;
      if (gap > gapMax) { gapMax = gap; cut = i; }
    }
    const box = grp => grp.reduce((b, c) => ({ x0: Math.min(b.x0, c.x0), x1: Math.max(b.x1, c.x1), y0: Math.min(b.y0, c.y0), y1: Math.max(b.y1, c.y1) }),
      { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity });
    const [bR, bL] = [box(holes.slice(0, cut)), box(holes.slice(cut))].map(b => ({
      cx: ((b.x0 + b.x1) / 2) * k, cy: ((b.y0 + b.y1) / 2) * k, w: (b.x1 - b.x0) * k, h: (b.y1 - b.y0) * k }));
    // l'ouverture visible est le verre moins ~1,2 mm par côté (drageoir + tranche du verre)
    const sBox = [[bR, lenses[0]], [bL, lenses[1]]].flatMap(([b, l]) => [b.w / (l.src.width - 2.4), b.h / (l.src.height - 2.4)]);
    st.s = st.s0 = Math.min(...sBox); // estimation de départ, affinée ci-dessous
    st.rot = Math.atan2(bL.cy - bR.cy, bL.cx - bR.cx);
    st.ox = (bR.cx + bL.cx) / 2;
    st.oy = (bR.cy + bL.cy) / 2;
    // Affinage : les boîtes englobantes peuvent inclure du fond vu entre les branches pliées et la face.
    // On cherche l'échelle et le centre de chaque verre pour lesquels le contour OMA tombe sur le bord de
    // l'ouverture : du fond juste à l'intérieur, de la monture juste à l'extérieur.
    const isBg = (ix, iy) => {
      const x = Math.round(ix), y = Math.round(iy);
      if (x < 0 || y < 0 || x >= st.iw || y >= st.ih) return true;
      const i = (y * st.iw + x) * 4;
      return Math.hypot(st.pix[i] - st.bg[0], st.pix[i + 1] - st.bg[1], st.pix[i + 2] - st.bg[2]) < 45;
    };
    const probes = lenses.map(l => {
      const pts = l.src.pts.filter((_, i) => i % 6 === 0);
      return pts.map(([x, y]) => {
        const r = Math.hypot(x, y) || 1;
        // l'ouverture visible ≈ verre − 1,2 mm (drageoir + tranche du verre, qui paraît sombre)
        return { inn: [x * (1 - 2.2 / r), y * (1 - 2.2 / r)], out: [x * (1 - 0.2 / r), y * (1 - 0.2 / r)] };
      });
    });
    const c = Math.cos(st.rot), sn = Math.sin(st.rot);
    const score = (probe, s, cx, cy) => {
      let n = 0;
      for (const { inn, out } of probe) {
        if (isBg(cx + s * (c * inn[0] + sn * inn[1]), cy + s * (sn * inn[0] - c * inn[1]))) n++;
        if (!isBg(cx + s * (c * out[0] + sn * out[1]), cy + s * (sn * out[0] - c * out[1]))) n++;
      }
      return n;
    };
    let best = null;
    const s0 = st.s;
    for (let f = 0.8; f <= 1.12; f += 0.01) {
      const s = s0 * f;
      const fits = [bR, bL].map((b, li) => {
        let bb = { v: -1 };
        const span = 4 * s, step = 0.3 * s;
        for (let dx = -span; dx <= span; dx += step)
          for (let dy = -span; dy <= span; dy += step) {
            const v = score(probes[li], s, b.cx + dx, b.cy + dy);
            if (v > bb.v) bb = { v, cx: b.cx + dx, cy: b.cy + dy };
          }
        return bb;
      });
      const v = fits[0].v + fits[1].v;
      if (!best || v > best.v) best = { v, s, fits };
    }
    if (best) {
      const [fR, fL] = best.fits;
      st.s = st.s0 = best.s;
      st.rot = Math.atan2(fL.cy - fR.cy, fL.cx - fR.cx);
      st.ox = (fR.cx + fL.cx) / 2;
      st.oy = (fR.cy + fL.cy) / 2;
      const centers = Math.hypot(fL.cx - fR.cx, fL.cy - fR.cy) / st.s;
      st.dbl = Math.round((centers - (lenses[0].src.width + lenses[1].src.width) / 2) * 10) / 10;
    }
    return true;
  }

  // Proposition : silhouette de la monture (tout ce qui n'est pas le fond extérieur), simplifiée.
  function propose() {
    const { k, w, h, lab } = analyse(true);
    const loops = maskContours((x, y) => (lab[x + y * w] === -2 ? 0 : 1), w, h);
    if (!loops.length) return;
    const outer = loops.reduce((a, b) => (b.length > a.length ? b : a));
    let pts = simplify(outer.map(([x, y]) => imgToMm((x + 0.5) * k, (y + 0.5) * k)), 0.35);
    // pas de points serrés : plus facile à retoucher
    pts = pts.filter((q, i) => i === 0 || Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]) > 1);
    if (area(pts) < 0) pts.reverse();
    if (flipRef()) pts = pts.map(([x, y]) => [-x, y]).reverse(); // modèle à droite : ramené côté x ≤ 0
    st.poly = st.sym ? halfOf(pts) : pts;
    st.drawing = false;
  }

  // Demi-contour côté gauche de l'image (x ≤ 0) : du haut de l'axe, par la gauche, jusqu'au bas de l'axe.
  // Le contour reçu est en sens trigo : depuis le haut, il part bien vers la gauche.
  function halfOf(pts) {
    const n = pts.length, cuts = [];
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      if ((a[0] <= 0) !== (b[0] <= 0)) {
        const t = a[0] / (a[0] - b[0]);
        cuts.push({ i, y: a[1] + t * (b[1] - a[1]) });
      }
    }
    if (cuts.length < 2) return pts;
    const top = cuts.reduce((a, b) => (b.y > a.y ? b : a)), bot = cuts.reduce((a, b) => (b.y < a.y ? b : a));
    const out = [[0, top.y]];
    for (let j = (top.i + 1) % n; ; j = (j + 1) % n) {
      if (pts[j][0] <= 0) out.push(pts[j]);
      if (j === bot.i) break;
    }
    out.push([0, bot.y]);
    return out;
  }

  // contour complet (mm), avec symétrie et adoucissement éventuels
  function fullPolygon() {
    let pts = st.poly.map(q => [...q]);
    if (st.sym && pts.length >= 2) {
      pts[0][0] = 0; pts[pts.length - 1][0] = 0;
      pts = [...pts, ...pts.slice(1, -1).reverse().map(([x, y]) => [-x, y])];
    }
    if (pts.length < 3) return [];
    if (area(pts) < 0) pts.reverse();
    return st.smooth > 0 ? fillet(pts, st.smooth, 60) : pts;
  }

  // ---------- dessin ----------
  function draw() {
    const dpr = devicePixelRatio;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!st.img) return;
    // demi-plan (côté x ≤ 0 si sg < 0, x ≥ 0 sinon) en coordonnées écran, pour découper la photo
    const halfPlane = sg => {
      ctx.beginPath();
      [[0, 500], [sg * 900, 500], [sg * 900, -500], [0, -500]].forEach((q, i) => {
        const [sx, sy] = mmToScreen(q); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy);
      });
      ctx.closePath();
    };
    const photo = (mirrored = false) => {
      ctx.save();
      ctx.translate(st.view.x, st.view.y);
      ctx.scale(st.view.k, st.view.k);
      if (mirrored) {
        // réflexion par rapport à l'axe de symétrie (droite passant par O, dirigée selon +y du repère mm)
        const dx = Math.sin(st.rot), dy = -Math.cos(st.rot);
        const r00 = 2 * dx * dx - 1, r01 = 2 * dx * dy, r11 = 2 * dy * dy - 1;
        ctx.transform(r00, r01, r01, r11, st.ox - (r00 * st.ox + r01 * st.oy), st.oy - (r01 * st.ox + r11 * st.oy));
      }
      ctx.drawImage(st.shown, 0, 0);
      ctx.restore();
    };
    if (st.step === 2 && st.sym && st.symPhoto) {
      const ref = st.ref === 'right' ? 1 : -1;
      ctx.save(); halfPlane(ref); ctx.clip(); photo(false); ctx.restore();
      ctx.save(); halfPlane(-ref); ctx.clip(); photo(true); ctx.restore();
    } else photo(false);

    const line = (pts, color, width, closed = true, dash = []) => {
      if (pts.length < 2) return;
      ctx.beginPath();
      pts.forEach((q, i) => { const [sx, sy] = mmToScreen(q); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); });
      if (closed) ctx.closePath();
      ctx.setLineDash(dash);
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
      ctx.setLineDash([]);
    };
    for (const l of lenses) line(lensPts(l), '#60a5fa', 2);

    if (st.step === 2) {
      if (st.sym) line([[0, 40], [0, -40]], 'rgba(96,165,250,.7)', 1.2, false, [6, 6]); // axe de symétrie
      if (!st.drawing && st.poly.length >= 3) {
        const full = fullPolygon();
        ctx.beginPath();
        full.forEach((q, i) => { const [sx, sy] = mmToScreen(q); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); });
        ctx.closePath();
        ctx.fillStyle = 'rgba(163,230,53,.12)'; ctx.fill();
        ctx.strokeStyle = '#a3e635'; ctx.lineWidth = 2.5; ctx.stroke();
      }
      // polygone de contrôle (côté modifiable)
      line(st.poly.map(D), st.drawing ? '#fef08a' : 'rgba(163,230,53,.55)', 1.5, !st.sym && !st.drawing, [4, 4]);
      if (st.drawing && st.hover && st.poly.length) line([D(st.poly[st.poly.length - 1]), D(st.hover)], '#fef08a', 1.5, false, [4, 4]);
      st.poly.forEach((q, i) => {
        const [sx, sy] = mmToScreen(D(q));
        ctx.beginPath(); ctx.arc(sx, sy, i === 0 && st.drawing ? 7 : 5, 0, 2 * Math.PI);
        ctx.fillStyle = st.drag?.i === i ? '#fef08a' : '#a3e635'; ctx.fill();
        ctx.strokeStyle = '#0b0f17'; ctx.lineWidth = 1.5; ctx.stroke();
      });
    }
  }

  // ---------- interactions ----------
  const nearestVertex = (sx, sy, r = 10) => {
    let best = null, bd = r;
    polyScreen().forEach(([x, y], i) => { const d = Math.hypot(x - sx, y - sy); if (d < bd) { bd = d; best = i; } });
    return best;
  };
  const nearestEdge = (sx, sy, r = 8) => {
    const n = st.poly.length, ps = polyScreen();
    let best = null, bd = r;
    for (let i = 0; i < (st.sym ? n - 1 : n); i++) {
      const [ax, ay] = ps[i], [bx, by] = ps[(i + 1) % n];
      const t = Math.max(0, Math.min(1, ((sx - ax) * (bx - ax) + (sy - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2 || 1)));
      const d = Math.hypot(ax + t * (bx - ax) - sx, ay + t * (by - ay) - sy);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  };
  const finishDrawing = () => {
    st.drawing = false;
    if (st.sym && st.poly.length >= 2) { st.poly[0][0] = 0; st.poly[st.poly.length - 1][0] = 0; }
    setMode('edit');
  };

  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    if (!st.img) return;
    const { offsetX: sx, offsetY: sy } = e;
    if (st.step === 1) {
      canvas.setPointerCapture(e.pointerId);
      st.drag = { pan: true, start: fromScreen(sx, sy), ox: st.ox, oy: st.oy };
      return;
    }
    if (st.mode === 'draw') {
      if (e.button !== 0) return;
      const p = inputMm(sx, sy);
      if (!st.drawing) { if (st.sym) p[0] = 0; st.poly = [p]; st.drawing = true; } // le demi-contour part de l'axe
      else if (!st.sym && st.poly.length >= 3 && nearestVertex(sx, sy, 12) === 0) finishDrawing();
      else st.poly.push(p);
      draw();
      return;
    }
    const v = nearestVertex(sx, sy);
    if (e.button === 2) { // clic droit : supprimer un point
      if (v !== null && st.poly.length > 3) { st.poly.splice(v, 1); draw(); }
      return;
    }
    if (v !== null) { canvas.setPointerCapture(e.pointerId); st.drag = { i: v }; draw(); }
  });
  canvas.addEventListener('dblclick', e => {
    if (st.step !== 2) return;
    if (st.mode === 'draw' && st.drawing) {
      st.poly.pop(); // le second clic du double-clic a posé un point en trop
      if (st.sym) st.poly.push([0, inputMm(e.offsetX, e.offsetY)[1]]);
      finishDrawing(); draw();
      return;
    }
    if (st.mode === 'edit') { // double-clic sur un trait : ajouter un point
      const ei = nearestEdge(e.offsetX, e.offsetY);
      if (ei !== null) { st.poly.splice(ei + 1, 0, inputMm(e.offsetX, e.offsetY)); draw(); }
    }
  });
  canvas.addEventListener('pointermove', e => {
    if (st.step === 2 && st.mode === 'draw' && st.drawing) { st.hover = inputMm(e.offsetX, e.offsetY); draw(); return; }
    if (!st.drag) return;
    if (st.drag.pan) {
      const [ix, iy] = fromScreen(e.offsetX, e.offsetY);
      st.ox = st.drag.ox + (ix - st.drag.start[0]);
      st.oy = st.drag.oy + (iy - st.drag.start[1]);
    } else {
      const p = inputMm(e.offsetX, e.offsetY);
      if (st.sym && (st.drag.i === 0 || st.drag.i === st.poly.length - 1)) p[0] = 0; // extrémités sur l'axe
      st.poly[st.drag.i] = p;
    }
    draw();
  });
  canvas.addEventListener('pointerup', () => { st.drag = null; draw(); });
  canvas.addEventListener('wheel', e => {
    if (!st.img || st.step !== 1) return;
    e.preventDefault();
    st.s *= Math.exp(-e.deltaY * 0.0012);
    syncOutputs(); draw();
  }, { passive: false });

  // ---------- panneau ----------
  const HINTS = {
    edit: '<b>Glisser</b> un point pour le déplacer, <b>double-clic</b> sur un trait pour ajouter un point, <b>clic droit</b> sur un point pour le supprimer.',
    draw: 'Cliquez pour poser les points tout autour de la face (nez et tenons compris), puis <b>double-clic</b> ou clic sur le premier point pour fermer.',
    drawSym: 'Partez du <b>haut du pont, sur l’axe</b>, faites le tour du côté modèle, puis <b>double-cliquez</b> en bas : l’autre côté suit en miroir.',
  };
  function setMode(m) {
    st.mode = m;
    root.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
    $('[data-hint]').innerHTML = m === 'draw' ? (st.sym ? HINTS.drawSym : HINTS.draw) : HINTS.edit;
    if (st.step === 2) canvas.style.cursor = m === 'draw' ? 'crosshair' : 'default';
  }
  function syncOutputs() {
    $('[data-k="dbl"]').value = st.dbl;
    $('[data-o="dbl"]').textContent = `${st.dbl.toFixed(1)} mm`;
    $('[data-k="rot"]').value = (st.rot * 180) / Math.PI;
    $('[data-o="rot"]').textContent = `${((st.rot * 180) / Math.PI).toFixed(1)}°`;
    $('[data-k="scale"]').value = Math.log(st.s / st.s0);
    $('[data-o="scale"]').textContent = st.iw ? `${st.s.toFixed(2)} px/mm` : '—';
    $('[data-k="smooth"]').value = st.smooth;
    $('[data-o="smooth"]').textContent = st.smooth > 0 ? `${st.smooth.toFixed(1).replace('.', ',')} mm` : 'aucun';
    $('[data-k="thr"]').value = st.thr;
    $('[data-o="thr"]').textContent = st.thrAuto ? `auto (${Math.round(st.thr)})` : `${Math.round(st.thr)}`;
    root.querySelectorAll('input[type=range]').forEach(el => {
      el.style.setProperty('--p', `${((el.value - el.min) / (el.max - el.min)) * 100}%`);
    });
  }
  root.addEventListener('input', e => {
    const k = e.target.dataset.k;
    if (k === 'dbl') st.dbl = +e.target.value;
    if (k === 'rot') st.rot = (+e.target.value * Math.PI) / 180;
    if (k === 'scale' && st.iw) st.s = st.s0 * Math.exp(+e.target.value);
    if (k === 'mirror') { st.mirror = e.target.checked; buildPixels(); autoCalibrate(); }
    if (k === 'thr') { st.thr = +e.target.value; st.thrAuto = false; propose(); }
    if (k === 'smooth') st.smooth = +e.target.value;
    if (k === 'symphoto') st.symPhoto = e.target.checked;
    if (k === 'sym') {
      // passage symétrie ↔ libre : le contour en cours est converti
      const was = st.smooth; st.smooth = 0;
      const full = st.poly.length >= 3 ? fullPolygon() : [];
      st.smooth = was;
      st.sym = e.target.checked;
      st.poly = full.length ? (st.sym ? halfOf(flipRef() ? full.map(([x, y]) => [-x, y]).reverse() : full) : full) : [];
      $('[data-symopts]').hidden = !st.sym;
      setMode(st.mode);
    }
    syncOutputs(); draw();
  });
  const setStep = n => {
    st.step = n;
    root.querySelectorAll('.steps li').forEach(li => li.classList.toggle('on', +li.dataset.step === n));
    root.querySelectorAll('.step-pane').forEach(p => { p.hidden = +p.dataset.pane !== n; });
    canvas.style.cursor = n === 1 ? 'grab' : st.mode === 'draw' ? 'crosshair' : 'default';
    draw();
  };
  root.addEventListener('click', e => {
    const ref = e.target.closest('[data-ref]')?.dataset.ref;
    if (ref) {
      // changement de côté modèle : la proposition est refaite depuis l'autre côté de la photo
      st.ref = ref;
      root.querySelectorAll('[data-ref]').forEach(b => b.classList.toggle('on', b.dataset.ref === ref));
      if (st.img) propose();
      draw();
      return;
    }
    const mode = e.target.closest('[data-mode]')?.dataset.mode;
    if (mode) { setMode(mode); if (mode === 'draw') { st.poly = []; st.drawing = false; } draw(); return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'close') close();
    if (act === 'auto' && st.img) { autoCalibrate(); syncOutputs(); draw(); }
    if (act === 'next' && st.img) { if (st.poly.length < 3) propose(); setStep(2); }
    if (act === 'propose' && st.img) { propose(); setMode('edit'); draw(); }
    if (act === 'clearpoly') { st.poly = []; st.drawing = false; setMode('draw'); draw(); }
    if (act === 'back') setStep(1);
    if (act === 'apply') {
      const full = fullPolygon();
      if (full.length < 3) return;
      onApply({
        outline: full.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]),
        dbl: st.dbl,
        edit: {
          file: st.file, poly: st.poly.map(q => [...q]), sym: st.sym, ref: st.ref, smooth: st.smooth, symPhoto: st.symPhoto,
          calib: { ox: st.ox, oy: st.oy, s: st.s, rot: st.rot, mirror: st.mirror, dbl: st.dbl },
        },
      });
      close();
    }
    if (act === 'clear') { onClear(); close(); }
  });
  const fileInput = $('input[type=file]');
  fileInput.addEventListener('change', () => fileInput.files[0] && loadImage(fileInput.files[0]));
  const stage = $('.photo-stage');
  stage.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); });
  stage.addEventListener('drop', e => {
    e.preventDefault(); e.stopPropagation();
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith('image/')) loadImage(f);
  });
  const onKey = e => { if (e.key === 'Escape') { if (st.drawing) finishDrawing(); else close(); draw(); } };
  window.addEventListener('keydown', onKey);
  const onResize = () => { fit(); draw(); };
  window.addEventListener('resize', onResize);
  function close() { window.removeEventListener('resize', onResize); window.removeEventListener('keydown', onKey); root.remove(); }
  setMode('edit');
  syncOutputs();
  setTimeout(() => { fit(); draw(); if (edit?.file) loadImage(edit.file); }, 0);
  // accès pour les tests
  return { loadImage, state: st, draw, next: () => { if (st.poly.length < 3) propose(); setStep(2); }, full: fullPolygon };
}

// ---------- outils ----------
function area(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length]; a += x0 * y1 - x1 * y0; }
  return a / 2;
}
// Douglas-Peucker sur un contour fermé : la boucle est coupée en deux au point le plus éloigné du premier.
function simplify(pts, tol) {
  if (pts.length < 8) return pts;
  let far = 0, fd = 0;
  pts.forEach((q, i) => { const d = Math.hypot(q[0] - pts[0][0], q[1] - pts[0][1]); if (d > fd) { fd = d; far = i; } });
  const loop = [...pts, pts[0]];
  return [...rdp(loop, 0, far, tol).slice(0, -1), ...rdp(loop, far, pts.length, tol).slice(0, -1)];
}
function rdp(pts, a, b, tol) {
  let imax = -1, dmax = 0;
  const [ax, ay] = pts[a], [bx, by] = pts[b];
  const L = Math.hypot(bx - ax, by - ay) || 1;
  for (let i = a + 1; i < b; i++) {
    const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / L;
    if (d > dmax) { dmax = d; imax = i; }
  }
  return dmax > tol ? [...rdp(pts, a, imax, tol).slice(0, -1), ...rdp(pts, imax, b, tol)] : [pts[a], pts[b]];
}
// Arrondi des angles (contour fermé) : chaque coin devient un arc de rayon r, sauf les angles vifs où la
// direction tourne de plus de maxTurn degrés (tenons, pointes), gardés nets. L'arc est limité à 45 % des
// segments voisins pour ne jamais empiéter sur le coin suivant.
export function fillet(pts, r, maxTurn = 60) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const a = pts[(i + n - 1) % n], p = pts[i], b = pts[(i + 1) % n];
    const la = Math.hypot(p[0] - a[0], p[1] - a[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
    if (la < 1e-6 || lb < 1e-6) continue;
    const u = [(p[0] - a[0]) / la, (p[1] - a[1]) / la], v = [(b[0] - p[0]) / lb, (b[1] - p[1]) / lb];
    const turn = Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1])));
    if (turn < 0.02 || turn > (maxTurn * Math.PI) / 180) { out.push(p); continue; }
    const t = Math.min(r * Math.tan(turn / 2), 0.45 * la, 0.45 * lb);
    const p1 = [p[0] - u[0] * t, p[1] - u[1] * t], p2 = [p[0] + v[0] * t, p[1] + v[1] * t];
    // arc approché par une Bézier quadratique p1 → p → p2, tangente aux deux segments
    const m = Math.max(2, Math.ceil(turn / 0.12));
    for (let j = 0; j <= m; j++) {
      const s = j / m, c0 = (1 - s) ** 2, c1 = 2 * s * (1 - s), c2 = s * s;
      out.push([c0 * p1[0] + c1 * p[0] + c2 * p2[0], c0 * p1[1] + c1 * p[1] + c2 * p2[1]]);
    }
  }
  return out;
}
