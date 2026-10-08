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
              <div class="inputs"><input type="range" data-k="rot" min="-180" max="180" step="0.1"><output data-o="rot"></output></div></div>
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
          <p class="mini">Conseil : monture posée à plat (branches pliées, dans n'importe quel sens) sur une feuille
            blanche (monture foncée) ou noire (monture claire), téléphone bien à la verticale au-dessus, lumière
            douce venant d'en haut, sans flash.</p>
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
    flattenLight();
    buildContrast();
  }

  // Éclairage inégal (feuille plus claire au centre qu'aux bords) : on estime la couleur locale de la feuille
  // sur une image réduite (maximum glissant sur ±15 % de la largeur, plus large que la monture, pour un
  // fond clair ; minimum pour un fond sombre), lissée, puis chaque pixel est ramené au niveau du bord
  // (correction bornée à ±35 % : une grande zone sombre n'est jamais prise pour de la feuille).
  function flattenLight() {
    const ks = Math.max(1, Math.round(st.iw / 250));
    const w = Math.floor(st.iw / ks), h = Math.floor(st.ih / ks);
    const light = (st.bg[0] + st.bg[1] + st.bg[2]) / 3 >= 100;
    const R = Math.round(w * 0.15);
    const field = [0, 1, 2].map(ch => {
      let f = new Float32Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let v = 0;
        for (let j = 0; j < ks; j++) for (let i = 0; i < ks; i++) v += st.pix[((y * ks + j) * st.iw + x * ks + i) * 4 + ch];
        f[x + y * w] = v / (ks * ks);
      }
      f = slide(f, w, h, R, light ? Math.max : Math.min);
      return slide(f, w, h, R, null); // moyenne glissante : champ lisse
    });
    // niveau du champ sur le bord de la photo (là où st.bg a été mesuré) : la correction est relative à ce
    // niveau, ce qui annule le biais du maximum (un peu plus clair que la feuille moyenne)
    const edge = field.map(f => {
      const v = [];
      for (let x = 0; x < w; x++) v.push(f[x], f[x + (h - 1) * w]);
      for (let y = 0; y < h; y++) v.push(f[y * w], f[y * w + w - 1]);
      return v.sort((a, b) => a - b)[v.length >> 1];
    });
    const at = (f, fx, fy) => { // interpolation bilinéaire
      const x0 = Math.max(0, Math.min(w - 2, Math.floor(fx))), y0 = Math.max(0, Math.min(h - 2, Math.floor(fy)));
      const tx = Math.max(0, Math.min(1, fx - x0)), ty = Math.max(0, Math.min(1, fy - y0));
      const a = f[x0 + y0 * w], b = f[x0 + 1 + y0 * w], c = f[x0 + (y0 + 1) * w], d = f[x0 + 1 + (y0 + 1) * w];
      return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    };
    const pix = new Uint8ClampedArray(st.pix);
    for (let y = 0; y < st.ih; y++) {
      const fy = (y + 0.5) / ks - 0.5;
      for (let x = 0; x < st.iw; x++) {
        const fx = (x + 0.5) / ks - 0.5, q = (y * st.iw + x) * 4;
        for (let ch = 0; ch < 3; ch++) {
          const g = Math.min(1.35, Math.max(0.74, edge[ch] / Math.max(8, at(field[ch], fx, fy))));
          pix[q + ch] = st.pix[q + ch] * g;
        }
      }
    }
    st.pix = pix;
  }

  // Carte de contraste pour la proposition de contour, moyennée sur des blocs de k×k pixels (le grain de
  // la photo disparaît) : écart au fond en luminosité et en teinte (la teinte compte double), les ombres
  // portées étant atténuées. Seuil choisi automatiquement (méthode d'Otsu).
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
      // ombre portée : moyennement assombrie et presque sans couleur (gris, souvent bleuté) — la monture est
      // soit très sombre, soit nettement colorée ; l'ombre ne compte qu'à un quart
      const sat = (Math.max(r, gr, b) - Math.min(r, gr, b)) / Math.max(1, Math.max(r, gr, b));
      const shadow = l / lb > 0.45 && l / lb < 0.97 && sat < 0.2;
      map[x + y * w] = Math.hypot(l - lb, 2 * dc) * (shadow ? 0.25 : 1);
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

  // Masque basse résolution pour le calage : fond relié au bord de la photo (« extérieur », -2) et
  // ouvertures (trous de fond). Réglage éprouvé : écart de couleur < 45 sur l'image réduite.
  function analyse() {
    const k = Math.max(1, Math.round(st.iw / 480));
    const w = Math.floor(st.iw / k), h = Math.floor(st.ih / k);
    const bgAt = (x, y) => {
      const i = ((y * k) * st.iw + x * k) * 4;
      return Math.hypot(st.pix[i] - st.bg[0], st.pix[i + 1] - st.bg[1], st.pix[i + 2] - st.bg[2]) < 45;
    };
    const lab = new Int32Array(w * h).fill(-1);
    const flood = (sx, sy, id) => {
      const stack = [sx + sy * w], out = { n: 0, x0: w, x1: 0, y0: h, y1: 0, sx: 0, sy: 0 };
      lab[stack[0]] = id;
      while (stack.length) {
        const q = stack.pop(), x = q % w, y = (q / w) | 0;
        out.n++; out.sx += x; out.sy += y;
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

  // Les deux ouvertures des verres parmi les zones de fond enfermées (une feuille déchirée, une branche
  // ou un reflet peuvent en créer d'autres) : formes pleines aux proportions du verre OMA, de tailles
  // voisines, à bonne distance l'une de l'autre (photo dans n'importe quel sens). Les morceaux d'une
  // ouverture coupée par un trait (reflet, déchirure) y sont rattachés. Renvoie les deux groupes, ou null
  // (verres morcelés, par exemple par les branches repliées : voir twoClusters).
  function lensPair(holes) {
    const want = (lenses[0].src.width + lenses[1].src.width) / (lenses[0].src.height + lenses[1].src.height);
    const dims = c => ({ w: c.x1 - c.x0 + 1, h: c.y1 - c.y0 + 1, cx: c.sx / c.n, cy: c.sy / c.n });
    const big = Math.max(...holes.map(c => c.n));
    const ok = holes.filter(c => { // verre vu en entier : forme pleine, proportions du verre (ou tourné d'un quart de tour)
      const d = dims(c), a = d.w / d.h / want, a2 = d.h / d.w / want;
      return c.n > 0.35 * big && c.n / (d.w * d.h) > 0.5 && ((a > 0.65 && a < 1.5) || (a2 > 0.65 && a2 < 1.5));
    });
    let best = null;
    for (let i = 0; i < ok.length; i++) for (let j = i + 1; j < ok.length; j++) {
      const a = dims(ok[i]), b = dims(ok[j]);
      const size = Math.min(ok[i].n, ok[j].n) / Math.max(ok[i].n, ok[j].n);
      const dist = Math.hypot(a.cx - b.cx, a.cy - b.cy), dia = (Math.max(a.w, a.h) + Math.max(b.w, b.h)) / 2;
      if (size < 0.4 || dist < 0.8 * dia || dist > 2.5 * dia) continue;
      const score = size * Math.sqrt(ok[i].n + ok[j].n); // ressemblance × taille
      if (!best || score > best.score) best = { score, pair: [ok[i], ok[j]] };
    }
    if (!best) return null;
    return best.pair.map(main => {
      const m = dims(main), mx = 0.1 * m.w, my = 0.1 * m.h;
      return holes.filter(c => c === main || (!best.pair.includes(c)
        && c.sx / c.n > main.x0 - mx && c.sx / c.n < main.x1 + mx && c.sy / c.n > main.y0 - my && c.sy / c.n < main.y1 + my));
    });
  }

  // Repli quand aucune paire de verres entiers n'est visible : partage des ouvertures en deux groupes
  // (k-moyennes pondérées par la surface), en partant de la plus grande ouverture et de celle qui est à la
  // fois grande et loin d'elle.
  function twoClusters(holes) {
    const c = h => [h.sx / h.n, h.sy / h.n];
    const first = holes.reduce((a, b) => (b.n > a.n ? b : a));
    let A = c(first), B = A, far = -1;
    for (const h of holes) {
      const v = h.n * Math.hypot(c(h)[0] - A[0], c(h)[1] - A[1]);
      if (v > far) { far = v; B = c(h); }
    }
    let g = [[], []];
    for (let it = 0; it < 10; it++) {
      g = [[], []];
      for (const h of holes) { const p = c(h); g[Math.hypot(p[0] - A[0], p[1] - A[1]) <= Math.hypot(p[0] - B[0], p[1] - B[1]) ? 0 : 1].push(h); }
      const mean = grp => { const n = grp.reduce((t, h) => t + h.n, 0) || 1; return [grp.reduce((t, h) => t + h.sx, 0) / n, grp.reduce((t, h) => t + h.sy, 0) / n]; };
      if (!g[0].length || !g[1].length) break;
      A = mean(g[0]); B = mean(g[1]);
    }
    return g[0].length && g[1].length ? g : [holes.slice(0, 1), holes.slice(1)];
  }

  // Calage automatique : les deux groupes d'ouvertures (gauche / droite de l'image) donnent
  // l'échelle (taille des verres), la rotation, la position et l'écart entre verres.
  function autoCalibrate() {
    const { k, w, h, lab, holes } = analyse();
    if (holes.length < 2) return false;
    const box = grp => grp.reduce((b, c) => ({ x0: Math.min(b.x0, c.x0), x1: Math.max(b.x1, c.x1), y0: Math.min(b.y0, c.y0), y1: Math.max(b.y1, c.y1) }),
      { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity });
    const groups = lensPair(holes) || twoClusters(holes);
    let [bR, bL] = groups.map(box).map(b => ({
      cx: ((b.x0 + b.x1) / 2) * k, cy: ((b.y0 + b.y1) / 2) * k, w: (b.x1 - b.x0) * k, h: (b.y1 - b.y0) * k }));
    // Sens de la monture : le pont est au-dessus de l'axe des verres (le nez dégage le dessous). On compte
    // la matière de part et d'autre de l'axe, entre les verres ; « haut » = côté le plus plein.
    // Repère : x du porteur = de bR vers bL ; y (haut) = x tourné d'un quart de tour (y image vers le bas).
    {
      const L = Math.hypot(bL.cx - bR.cx, bL.cy - bR.cy) || 1;
      const ux = (bL.cx - bR.cx) / L, uy = (bL.cy - bR.cy) / L; // vers bL
      const upx = uy, upy = -ux; // haut supposé
      const mx = (bR.cx + bL.cx) / 2, my = (bR.cy + bL.cy) / 2;
      const reach = 0.35 * Math.max(bR.w, bR.h, bL.w, bL.h);
      let above = 0, below = 0;
      for (let t = 0.2; t <= 1; t += 0.1) for (let u = -0.12; u <= 0.12; u += 0.04) {
        const px = mx + ux * u * L, py = my + uy * u * L;
        const solid = (x, y) => {
          const X = Math.round(x), Y = Math.round(y);
          if (X < 0 || Y < 0 || X >= st.iw || Y >= st.ih) return 0;
          const i = (Y * st.iw + X) * 4;
          return Math.hypot(st.pix[i] - st.bg[0], st.pix[i + 1] - st.bg[1], st.pix[i + 2] - st.bg[2]) >= 45 ? 1 : 0;
        };
        above += solid(px + upx * t * reach, py + upy * t * reach);
        below += solid(px - upx * t * reach, py - upy * t * reach);
      }
      if (below > above) [bR, bL] = [bL, bR]; // monture tête en bas dans ce sens : on inverse droite / gauche
    }
    // l'ouverture visible est le verre moins ~1,2 mm par côté (drageoir + tranche du verre) ; photo tournée :
    // on compare la plus grande dimension de la boîte à celle du verre, et la plus petite à la plus petite
    const sBox = [[bR, lenses[0]], [bL, lenses[1]]].flatMap(([b, l]) => [
      Math.max(b.w, b.h) / (Math.max(l.src.width, l.src.height) - 2.4), Math.min(b.w, b.h) / (Math.min(l.src.width, l.src.height) - 2.4)]);
    st.s = st.s0 = Math.min(...sBox); // estimation de départ, affinée ci-dessous
    // Seconde estimation, utile quand les branches repliées cachent une partie des verres : la largeur de
    // la face le long de l'axe des verres ≈ deux verres + pont + ~6 mm de cercle et tenon de chaque côté.
    let sFace = st.s;
    {
      const L = Math.hypot(bL.cx - bR.cx, bL.cy - bR.cy) || 1;
      const ux = (bL.cx - bR.cx) / L, uy = (bL.cy - bR.cy) / L;
      const proj = [];
      for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) if (lab[x + y * w] !== -2) proj.push((x * ux + y * uy) * k);
      proj.sort((a, b) => a - b);
      const extent = proj[Math.floor(proj.length * 0.99)] - proj[Math.floor(proj.length * 0.01)];
      const mm = lenses[0].src.width + lenses[1].src.width + (oma.dbl || 18) + 12;
      if (proj.length) sFace = extent / mm;
    }
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
        if (isBg(cx + s * (c * inn[0] + sn * inn[1]), cy + s * (sn * inn[0] - c * inn[1]))) n += 0.5; // moitié : une branche repliée peut se voir derrière le verre
        if (!isBg(cx + s * (c * out[0] + sn * out[1]), cy + s * (sn * out[0] - c * out[1]))) n++;
      }
      return n;
    };
    const s0 = st.s;
    // recherche grossière (échelle entre les deux estimations, élargie ; centres à ±6 mm : les ouvertures
    // morcelées par les branches repliées donnent une boîte trop petite), puis fine autour du meilleur
    const search = (fs, centers, span, step) => {
      let top = null;
      for (const f of fs) {
        const s = s0 * f;
        const fits = centers.map((c, li) => {
          let bb = { v: -1 };
          for (let dx = -span; dx <= span + 1e-9; dx += step)
            for (let dy = -span; dy <= span + 1e-9; dy += step) {
              const v = score(probes[li], s, c.cx + dx * s, c.cy + dy * s);
              if (v > bb.v) bb = { v, cx: c.cx + dx * s, cy: c.cy + dy * s };
            }
          return bb;
        });
        const v = fits[0].v + fits[1].v;
        if (!top || v > top.v) top = { v, s, f, fits };
      }
      return top;
    };
    const range = (a, b, d) => Array.from({ length: Math.round((b - a) / d) + 1 }, (_, i) => a + i * d);
    const fLo = 0.8 * Math.min(1, sFace / s0), fHi = 1.25 * Math.max(1.12, sFace / s0);
    const df = 0.03 * Math.max(1, (fHi - fLo) / 0.6);
    const coarse = search(range(fLo, fHi, df), [bR, bL], 6, 0.6);
    const best = search(range(coarse.f - df, coarse.f + df, 0.005), coarse.fits, 0.6, 0.15);
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

  // Silhouette de la monture sur la carte de contraste : tout ce qui n'est pas le fond relié au bord de la
  // photo. Les traits collés à la monture (bord de feuille déchirée, ligne de table…) sont coupés : on garde
  // le « cœur » qui résiste à une ouverture de 1,2 mm, puis seulement les pixels d'origine proches de ce
  // cœur (les angles des tenons reviennent, les traits ne gardent qu'un moignon, retiré par une petite
  // ouverture). Une fermeture comble enfin les encoches du bord.
  function silhouette() {
    const { k, w, h, map } = st.cmap;
    const px = mm => Math.max(1, Math.round((mm * st.s) / k)); // mm → pixels de la carte
    let m = new Uint8Array(w * h);
    for (let i = 0; i < m.length; i++) m[i] = map[i] >= st.thr ? 1 : 0;
    m = fillOutside(m, w, h);
    const R = px(1.2);
    const near = morph(morph(morph(m, w, h, R, false), w, h, R, true), w, h, R + 1, true);
    for (let i = 0; i < m.length; i++) m[i] &= near[i];
    // zone possible de la face (voir faceZone) : les bouts de branches repliées et les ombres qui dépassent
    // ailleurs sont retirés
    // Sous l'axe des verres, le cercle a une épaisseur à peu près régulière : on la mesure pour chaque verre
    // (épaisseur maximale par secteur de 10°, on retient le 30e centile : les défauts ne font qu'ajouter) et
    // on retire ce qui dépasse de plus de 2,5 mm (bouts de branches repliées, ombres).
    const zone = faceZone();
    const mmOf = new Float32Array(2 * w * h);
    const sectors = new Float32Array(2 * 36);
    const cx = [-(lenses[0].src.width + st.dbl) / 2, (lenses[1].src.width + st.dbl) / 2];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = x + y * w;
      if (!m[i]) continue;
      const [qx, qy] = imgToMm((x + 0.5) * k, (y + 0.5) * k);
      mmOf[2 * i] = qx; mmOf[2 * i + 1] = qy;
      if (!zone.lower(qx, qy)) continue;
      const dv = zone.dist(qx, qy);
      if (dv > 20) continue;
      const li = qx < 0 ? 0 : 1, sec = Math.floor(((Math.atan2(qy, qx - cx[li]) + 2 * Math.PI) % (2 * Math.PI)) / (Math.PI / 18));
      sectors[li * 36 + sec] = Math.max(sectors[li * 36 + sec], dv);
    }
    const limit = [0, 1].map(li => {
      const prof = [...sectors.slice(li * 36, li * 36 + 36)].filter(v => v > 0).sort((a, b) => a - b);
      return prof.length >= 4 ? prof[Math.floor(prof.length * 0.3)] + 2.5 : 14;
    });
    for (let i = 0; i < m.length; i++) if (m[i] && !zone.test(mmOf[2 * i], mmOf[2 * i + 1], limit)) m[i] = 0;
    const r = px(0.5);
    m = morph(morph(m, w, h, r, false), w, h, r, true); // ouverture : moignons
    m = morph(morph(m, w, h, r, true), w, h, r, false); // fermeture : encoches
    return { k, w, h, m: fillOutside(m, w, h) };
  }

  // Zone où peut se trouver la face, en mm (repère des verres calés) : jusqu'à 14 mm autour de chaque verre
  // (le calage peut décaler le verre d'un ou deux mm), sans limite au pont (moitié haute) ni aux tenons
  // (côté extérieur, moitié haute). Le bas des cercles reçoit une limite plus serrée (voir silhouette).
  function faceZone() {
    const step = 0.5, reach = 14;
    const half = st.dbl / 2 + Math.max(lenses[0].src.width, lenses[1].src.width);
    const H = Math.max(lenses[0].src.height, lenses[1].src.height);
    const x0 = -half - 25, y0 = -H / 2 - 15;
    const gw = Math.ceil((2 * half + 50) / step), gh = Math.ceil((H + 30) / step);
    // distance au verre le plus proche (chanfrein 3-4 sur une grille de 0,5 mm), 0 à l'intérieur des verres
    const d = new Float32Array(gw * gh).fill(1e9);
    const polys = lenses.map(lensPts);
    const inside = (P, x, y) => {
      let c = false;
      for (let i = 0, j = P.length - 1; i < P.length; j = i++)
        if ((P[i][1] > y) !== (P[j][1] > y) && x < ((P[j][0] - P[i][0]) * (y - P[i][1])) / (P[j][1] - P[i][1]) + P[i][0]) c = !c;
      return c;
    };
    for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
      const x = x0 + gx * step, y = y0 + gy * step;
      if (polys.some(P => inside(P, x, y))) d[gx + gy * gw] = 0;
    }
    const a = step, b = step * Math.SQRT2;
    for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
      const i = gx + gy * gw;
      if (gx > 0) d[i] = Math.min(d[i], d[i - 1] + a);
      if (gy > 0) {
        d[i] = Math.min(d[i], d[i - gw] + a);
        if (gx > 0) d[i] = Math.min(d[i], d[i - gw - 1] + b);
        if (gx < gw - 1) d[i] = Math.min(d[i], d[i - gw + 1] + b);
      }
    }
    for (let gy = gh - 1; gy >= 0; gy--) for (let gx = gw - 1; gx >= 0; gx--) {
      const i = gx + gy * gw;
      if (gx < gw - 1) d[i] = Math.min(d[i], d[i + 1] + a);
      if (gy < gh - 1) {
        d[i] = Math.min(d[i], d[i + gw] + a);
        if (gx < gw - 1) d[i] = Math.min(d[i], d[i + gw + 1] + b);
        if (gx > 0) d[i] = Math.min(d[i], d[i + gw - 1] + b);
      }
    }
    const dist = (x, y) => {
      const gx = Math.round((x - x0) / step), gy = Math.round((y - y0) / step);
      return gx < 0 || gy < 0 || gx >= gw || gy >= gh ? 1e9 : d[gx + gy * gw];
    };
    const free = (x, y) => { // pont (moitié haute) et tenons (côté extérieur, moitié haute) : pas de limite
      const ax = Math.abs(x);
      if (ax <= st.dbl / 2 + 4 && y >= -0.1 * H && y <= H / 2 + 10) return true;
      return ax >= half - 0.3 * (half - st.dbl / 2) && ax <= half + 22 && y >= -0.15 * H && y <= H / 2 + 12;
    };
    const lower = (x, y) => y < -0.1 * H && !free(x, y); // bas des cercles : épaisseur régulière attendue
    const test = (x, y, limit = [reach, reach]) => free(x, y) || dist(x, y) <= (lower(x, y) ? limit[x < 0 ? 0 : 1] : reach);
    return { test, dist, lower, half };
  }

  // Proposition : contour de la silhouette, adouci (σ ≈ 0,3 mm, enlève l'escalier des pixels) et simplifié.
  function propose() {
    const { k, w, h, m } = silhouette();
    const loops = maskContours((x, y) => m[x + y * w], w, h);
    if (!loops.length) return;
    const outer = loops.reduce((a, b) => (b.length > a.length ? b : a));
    let pts = outer.map(([x, y]) => imgToMm((x + 0.5) * k, (y + 0.5) * k));
    pts = smoothOutline(resample(pts, 0.2), 0.3, 75);
    pts = simplify(pts, 0.25);
    // pas de points serrés : plus facile à retoucher
    pts = pts.filter((q, i) => i === 0 || Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]) > 1.5);
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
    return st.smooth > 0 ? simplify(smoothOutline(resample(pts, Math.max(0.2, st.smooth / 12)), st.smooth / 2, 60), 0.01) : pts;
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
      if (st.drawing && st.hover && st.poly.length) {
        const end = closingPoint(st.hover);
        line([D(st.poly[st.poly.length - 1]), D(end || st.hover)], end ? '#a3e635' : '#fef08a', end ? 2.5 : 1.5, false, end ? [] : [4, 4]);
        if (end) {
          const [sx, sy] = mmToScreen(D(end));
          ctx.beginPath(); ctx.arc(sx, sy, 9, 0, 2 * Math.PI);
          ctx.strokeStyle = '#a3e635'; ctx.lineWidth = 2.5; ctx.stroke();
        }
      }
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
    st.hover = null;
    if (st.sym && st.poly.length >= 2) { st.poly[0][0] = 0; st.poly[st.poly.length - 1][0] = 0; }
    setMode('edit');
    $('[data-hint]').innerHTML = HINTS.done;
  };
  // Point qui fermerait la forme si l'on cliquait en q (mm), sinon null : en symétrie, retour sur l'axe
  // (deuxième passage sur la ligne médiane) ; sans symétrie, retour sur le premier point.
  const SNAP = 14; // px
  const closingPoint = q => {
    if (!st.drawing) return null;
    const [sx, sy] = mmToScreen(D(q));
    if (st.sym) {
      if (st.poly.length < 2) return null;
      const a = mmToScreen([0, q[1]]);
      return Math.hypot(a[0] - sx, a[1] - sy) < SNAP ? [0, q[1]] : null;
    }
    if (st.poly.length < 3) return null;
    const f = mmToScreen(D(st.poly[0]));
    return Math.hypot(f[0] - sx, f[1] - sy) < SNAP ? st.poly[0] : null;
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
      else {
        const end = closingPoint(p);
        if (end && st.sym) { st.poly.push(end); finishDrawing(); } // retour sur l'axe : demi-forme fermée
        else if (end) finishDrawing(); // retour sur le premier point
        else st.poly.push(p);
      }
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
    draw: 'Cliquez pour poser les points tout autour de la face (nez et tenons compris). <b>Revenez sur le premier point</b> pour fermer : le trait passe au <b style="color:#a3e635">vert</b>.',
    drawSym: 'Partez du <b>haut du pont, sur l’axe</b>, faites le tour du côté modèle et <b>revenez sur l’axe</b> en bas : le trait passe au <b style="color:#a3e635">vert</b> et la forme se ferme, l’autre côté suit en miroir.',
    done: '<b style="color:#a3e635">✓ Forme fermée.</b> Vous pouvez encore <b>glisser</b> les points, <b>double-cliquer</b> sur un trait pour en ajouter, <b>clic droit</b> pour en supprimer.',
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
// Contour fermé rééchantillonné tous les `step` mm.
export function resample(pts, step) {
  const out = [];
  const n = pts.length;
  let carry = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let t = carry;
    while (t < L) { out.push([a[0] + ((b[0] - a[0]) * t) / L, a[1] + ((b[1] - a[1]) * t) / L]); t += step; }
    carry = t - L;
  }
  return out;
}

// Lissage d'un contour fermé régulièrement échantillonné, d'écart-type ≈ sigma mm. Les angles vifs, où la direction tourne de plus de maxTurn degrés sur ±0,6 mm,
// sont repérés d'abord et restent fixes : tenons et pointes gardent leur arête.
export function smoothOutline(pts, sigma, maxTurn = 60) {
  const n = pts.length;
  if (n < 8 || sigma <= 0) return pts;
  const h = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]) || 0.2;
  const wdw = Math.max(1, Math.round(0.6 / h));
  const turn = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = pts[(i - wdw + n) % n], p = pts[i], b = pts[(i + wdw) % n];
    const u = Math.atan2(p[1] - a[1], p[0] - a[0]), v = Math.atan2(b[1] - p[1], b[0] - p[0]);
    let d = Math.abs(v - u);
    if (d > Math.PI) d = 2 * Math.PI - d;
    turn[i] = d;
  }
  const lim = (maxTurn * Math.PI) / 180;
  const fixed = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (turn[i] <= lim) continue;
    let peak = true; // un seul point fixe par angle : le sommet du virage
    for (let j = 1; j <= wdw && peak; j++) if (turn[(i + j) % n] > turn[i] || turn[(i - j + n) % n] > turn[i]) peak = false;
    if (peak) fixed[i] = 1;
  }
  // lissage gaussien (passes [¼ ½ ¼] : chacune ajoute 0,5·h² de variance), appliqué deux fois :
  // 2·G(p) − G(G(p)) garde la taille des courbes (un simple G rétrécirait les arrondis serrés)
  const passes = Math.min(3000, Math.ceil((sigma * sigma) / (0.5 * h * h)));
  const gauss = (x0, y0) => {
    let x = Float64Array.from(x0), y = Float64Array.from(y0);
    let x2 = new Float64Array(n), y2 = new Float64Array(n);
    for (let k = 0; k < passes; k++) {
      for (let i = 0; i < n; i++) {
        const a = i ? i - 1 : n - 1, b = i < n - 1 ? i + 1 : 0;
        x2[i] = fixed[i] ? x[i] : (x[a] + 2 * x[i] + x[b]) / 4;
        y2[i] = fixed[i] ? y[i] : (y[a] + 2 * y[i] + y[b]) / 4;
      }
      [x, x2] = [x2, x]; [y, y2] = [y2, y];
    }
    return [x, y];
  };
  const [x1, y1] = gauss(Float64Array.from(pts, q => q[0]), Float64Array.from(pts, q => q[1]));
  const [xx, yy] = gauss(x1, y1);
  const x = x1.map((v, i) => 2 * v - xx[i]), y = y1.map((v, i) => 2 * v - yy[i]);
  return Array.from(x, (v, i) => [v, y[i]]);
}

// Filtre glissant séparable sur une fenêtre de ±r : maximum, minimum, ou moyenne (op = null).
function slide(f, w, h, r, op) {
  const pass = (src, horiz) => {
    const out = new Float32Array(w * h);
    const len = horiz ? w : h, lines = horiz ? h : w;
    for (let l = 0; l < lines; l++) {
      const at = i => src[horiz ? l * w + i : i * w + l];
      for (let i = 0; i < len; i++) {
        const a = Math.max(0, i - r), b = Math.min(len - 1, i + r);
        let v = op ? at(a) : 0;
        for (let j = a; j <= b; j++) v = op ? op(v, at(j)) : v + at(j);
        out[horiz ? l * w + i : i * w + l] = op ? v : v / (b - a + 1);
      }
    }
    return out;
  };
  return pass(pass(f, true), false);
}

// Masque plein (1) : on remplit tout ce qui n'est pas relié au bord de l'image (trous de la silhouette).
function fillOutside(m, w, h) {
  const out = new Uint8Array(w * h).fill(1);
  const stack = [];
  const seed = q => { if (!m[q] && out[q]) { out[q] = 0; stack.push(q); } };
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
  while (stack.length) {
    const q = stack.pop(), x = q % w;
    if (x > 0) seed(q - 1);
    if (x < w - 1) seed(q + 1);
    if (q >= w) seed(q - w);
    if (q < w * h - w) seed(q + w);
  }
  return out;
}

// Dilatation (dil) ou érosion d'un masque par un carré de demi-côté r (deux passes séparables).
function morph(m, w, h, r, dil) {
  const pass = (src, horiz) => {
    const out = new Uint8Array(w * h);
    const len = horiz ? w : h, lines = horiz ? h : w;
    for (let l = 0; l < lines; l++) {
      const at = i => (horiz ? l * w + i : i * w + l);
      // compte glissant des pixels pleins dans la fenêtre [i − r, i + r] (hors image = vide pour dilater, plein pour éroder)
      let cnt = 0;
      const val = i => (i < 0 || i >= len ? (dil ? 0 : 1) : src[at(i)]);
      for (let i = -r; i <= r; i++) cnt += val(i);
      for (let i = 0; i < len; i++) {
        out[at(i)] = dil ? (cnt > 0 ? 1 : 0) : (cnt === 2 * r + 1 ? 1 : 0);
        cnt += val(i + r + 1) - val(i - r);
      }
    }
    return out;
  };
  return pass(pass(m, true), false);
}
