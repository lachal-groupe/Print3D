// Générateur de monture : face (cercles + drageoir en V + pont + tenons) et branches.
// Repère : x vers la droite (vu de face), y vers le haut, z vers l'avant. Unités : mm.
// L'œil droit du porteur est à gauche (x < 0).

import { ShapeUtils, Vector2 } from 'three';

export const DEFAULTS = {
  // Verre / drageoir
  clearance: 0.05,     // jeu radial au fond du drageoir (+ = plus lâche)
  grooveDepth: 0.9,    // profondeur du drageoir (hauteur du biseau)
  bevelAngle: 110,     // angle d'ouverture du V
  bevelPos: 0.4,       // position du sommet du biseau, en fraction de l'épaisseur depuis l'avant
  baseCurve: 0,        // base de cerclage (dioptries), 0 = face plate (impression à plat)
  // Face
  dbl: null,           // pont (null = valeur du fichier)
  thickness: 4.5,      // épaisseur de la face
  rimWidth: 3.0,       // largeur du cercle autour du verre
  rimTop: 1.0,         // surépaisseur en haut du cercle
  faceOutline: null,   // contour complet de la face (mm), dessiné sur une photo ; null = dessin de l'atelier
  rimMin: 1.8,         // matière minimale autour du drageoir quand le contour est dessiné
  fillet: 2.0,         // arrondi des raccords (vu de face)
  faceRound: 0.8,      // arrondi des arêtes avant / arrière de la face
  wrap: 0,             // galbe de face (degrés par côté), 0 = face plate
  // Pont (hauteurs en mm au-dessus de la ligne des centres des verres)
  bridgePos: 9,        // hauteur du pont
  bridgeHeight: 4.5,   // épaisseur du pont, au milieu
  bridgeTopCurve: 1.5, // courbe supérieure : les extrémités remontent de cette valeur
  bridgeBotCurve: 2.5, // courbe inférieure : les extrémités descendent de cette valeur (arche)
  doubleBridge: 'non', // double pont (barre haute)
  bridge2Pos: 30,      //   hauteur de la barre haute ; plafonnée : son bord haut reste tangent au haut des cercles
  bridge2Height: 2.2,  //   épaisseur de la barre haute
  bridge2TopCurve: 0,  //   courbe supérieure de la barre haute
  bridge2BotCurve: 0,  //   courbe inférieure de la barre haute
  // Plaquettes repose-nez intégrées
  pads: 'integrees',   // 'aucune' | 'integrees'
  // La plaquette est le cercle lui-même, pincé vers l'arrière côté nez : invisible de face.
  padFaceAngle: 20,     //   angle de face : inclinaison de la goutte, vue de dos (haut vers le nez)
  padSplay: 20,        //   angle de chasse : le sommet se décale vers le verre, le flanc de contact s'ouvre vers le nez
  padDepth: 4,       //   profondeur : saillie maximale derrière le cercle
  padHeight: 22,       //   longueur, le long du cercle
  padWidth: 0,       //   élargissement local du cercle côté nez, pour donner de l'assise à la plaquette
  padOffsetY: 0,       //   décalage vertical (mm) par rapport à la position par défaut
  // Tenons et charnières
  hingeMode: 'tenon',  // 'tenon' : bloc à l'arrière, vis par-dessous ; 'face' : charnière dans la face, vis par-dessus
  seatDepth: 1.0,      // mode 'face' : talon d'appui de la collerette (compense l'inclinaison)
  tenonY: 0.55,        // hauteur des tenons, fraction de la demi-hauteur du verre
  tenonWidth: 8,     // largeur du tenon : du bord du verre au bord extérieur, où s'alignent branche et charnière
  tenonHeight: 7.5,    // épaisseur du tenon (y) : loge la vis longue
  tenonDepth: 6.0,     // profondeur du tenon vers l'arrière
  // Charnière flex à goupilles : patte courte dans le tenon, tige longue dans la branche.
  // Collerettes 6 × 4,5 mm en appui sur le tenon et sur la branche.
  // Lettres = cotes de la fiche cotes-charniere.html (relevées sur la charnière du kit).
  tabLen: 4.0,         // A  patte côté face : longueur sous la collerette
  tabW: 2.5,           // B  largeur (x)
  tabH: 2.5,           // C  épaisseur traversée par la vis longue (y)
  tabHolePos: 2.0,     // D  trou de vis, distance depuis la collerette
  barLen: 10.5,        // F  tige côté branche : longueur sous la collerette
  barW: 2.5,           // H  épaisseur traversée par la vis courte (épaisseur de la branche)
  barH: 2.5,           // G  hauteur
  barHolePos: 8.1,     // I  trou de vis, distance depuis la collerette
  slotClear: 0.15,     // jeu des logements (impression)
  // Vis Ø 1 mm en trou borgne : la longue dans le tenon, la courte par l'intérieur de la branche
  tenonScrewD: 0.8,    // avant-trou de la vis longue (PLA taraudé par la vis)
  tenonScrewLen: 6.0,  // longueur de la vis longue
  templeScrewD: 0.8,   // avant-trou de la vis courte
  templeScrewLen: 2.6, // longueur de la vis courte
  minSkin: 0.6,        // matière minimale laissée au fond d'un trou borgne
  hingeGap: 7.0,       // E  longueur visible de la charnière entre les collerettes
  faceMinWall: 1.2,    // mode 'face' : matière minimale entre le logement de patte et le verre
  // Branches (droites : l'angle est donné par la charnière gauche / droite)
  templeSize: 'M',     // taille de branche (S / M / L), voir TEMPLE_SIZES
  templeLength: 140,   // longueur totale depuis la collerette
  templeBend: 100,     // longueur jusqu'au coude
  templeDrop: 40,      // tombée de l'embout (style penché)
  templeThickness: 5.0, // à la charnière : ≥ H + 2 × 1,2 mm de paroi
  templeThin: 3.6,     // épaisseur du corps de branche, une fois passée la charnière (vue de dessus)
  templeHeightTip: 3.6,
  templeStyle: 'droite', // forme vue de côté : voir TEMPLE_STYLES
  templeTilt: 'droite',  // style : 'droite' | 'penchee' (embout qui tombe derrière l'oreille)
  templeRound: 1.0,    // arrondi des arêtes de la branche
  cordHole: 'aucun',   // trou pour le cordon : 'aucun' | 'petit' | 'grand'
  sizeMark: 'oui',     // grave la lettre de taille côté intérieur, près de la charnière
  templeText: '',      // texte libre gravé côté intérieur
  engraveDepth: 0.4,   // profondeur de gravure
  pantoscopic: 8,      // inclinaison de la face (angle pantoscopique), portée par les tenons
};

// Tailles de branche usuelles (longueur totale en mm).
export const TEMPLE_SIZES = { S: 135, M: 140, L: 145 };

// Cotes de charnière d'usine (fiche cotes-charniere.html), restaurées par « Cotes d'origine ».
export const HINGE_KEYS = ['tabLen', 'tabW', 'tabH', 'tabHolePos', 'hingeGap', 'barLen', 'barH', 'barW', 'barHolePos',
  'slotClear', 'tenonScrewD', 'tenonScrewLen', 'templeScrewD', 'templeScrewLen'];

// Profils de branche vus de côté : points [position, hauteur] après la zone de charnière.
// Position en mm si > 1, sinon en fraction de la longueur ; 'tip' = hauteur à l'embout.
// 'h0' = hauteur à la charnière ; start = hauteur dès la charnière (sinon h0) ; lin = raccords linéaires.
export const TEMPLE_STYLES = {
  droite: { label: 'Droite', pts: [[30, 5], [1, 'tip']] },
  olive: { label: 'Olive', pts: [[0.4, 8.5], [0.75, 5], [1, 'tip']] },
  retro: { label: 'Rétro', pts: [[0.55, 'h0'], [1, 'tip']] },
  triangulaire: { label: 'Triangulaire', start: 9, lin: true, pts: [[1, 'tip']] },
  large: { label: 'Large', pts: [[28, 8.5], [0.72, 7.5], [1, 'tip']] },
};
export const CORD_HOLES = { aucun: 0, petit: 1.2, grand: 2.0 };

// ---------- outils 2D ----------

function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

function resample(pts, n) {
  const ccw = signedArea(pts) > 0 ? pts : [...pts].reverse();
  const cum = [0];
  for (let i = 1; i <= ccw.length; i++) {
    const [x0, y0] = ccw[i - 1], [x1, y1] = ccw[i % ccw.length];
    cum.push(cum[i - 1] + Math.hypot(x1 - x0, y1 - y0));
  }
  const total = cum[cum.length - 1];
  const out = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const s = (k * total) / n;
    while (cum[j + 1] < s) j++;
    const t = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
    const [x0, y0] = ccw[j], [x1, y1] = ccw[(j + 1) % ccw.length];
    out.push([x0 + t * (x1 - x0), y0 + t * (y1 - y0)]);
  }
  return out;
}

// Normales extérieures lissées d'un contour CCW.
function normals(pts, smooth = 3) {
  const n = pts.length;
  const raw = pts.map((_, i) => {
    const [xa, ya] = pts[(i - 1 + n) % n], [xb, yb] = pts[(i + 1) % n];
    const dx = xb - xa, dy = yb - ya, l = Math.hypot(dx, dy) || 1;
    return [dy / l, -dx / l];
  });
  return raw.map((_, i) => {
    let sx = 0, sy = 0;
    for (let k = -smooth; k <= smooth; k++) {
      const [x, y] = raw[(i + k + n) % n];
      sx += x; sy += y;
    }
    const l = Math.hypot(sx, sy) || 1;
    return [sx / l, sy / l];
  });
}

// Abscisse du bord du contour sur la ligne horizontale y, côté signe sg.
function edgeAtY(pts, y, sg) {
  let best = null;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
    if ((y0 - y) * (y1 - y) > 0 || y0 === y1) continue;
    const x = x0 + ((y - y0) / (y1 - y0)) * (x1 - x0);
    if (best === null || x * sg > best * sg) best = x;
  }
  return best;
}

// Abscisses (triées) où l'horizontale y coupe les contours.
function crossingsAtY(polys, y) {
  const xs = [];
  for (const poly of polys)
    for (let i = 0; i < poly.length; i++) {
      const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % poly.length];
      if ((y0 - y) * (y1 - y) > 0 || y0 === y1) continue;
      xs.push(x0 + ((y - y0) / (y1 - y0)) * (x1 - x0));
    }
  return xs.sort((a, b) => a - b);
}

// Étendue verticale (min, max) des contours à l'abscisse x.
function yRangeAt(polys, x) {
  let lo = Infinity, hi = -Infinity;
  for (const poly of polys) {
    for (let i = 0; i < poly.length; i++) {
      const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % poly.length];
      if ((x0 - x) * (x1 - x) > 0 || x0 === x1) continue;
      const y = y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
      lo = Math.min(lo, y); hi = Math.max(hi, y);
    }
  }
  return [lo, hi];
}

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---------- maillages ----------

// Volume obtenu en reliant des anneaux superposés (même nombre de points), fermé par deux bouchons.
function loftRings(wasm, rings) {
  const { Manifold, Mesh } = wasm;
  const n = rings[0].length;
  const verts = [];
  for (const ring of rings) for (const p of ring) verts.push(p[0], p[1], p[2]);
  const tris = [];
  for (let k = 0; k < rings.length - 1; k++) {
    for (let i = 0; i < n; i++) {
      const a = k * n + i, b = k * n + ((i + 1) % n);
      const c = (k + 1) * n + ((i + 1) % n), d = (k + 1) * n + i;
      tris.push(a, c, b, a, d, c);
    }
  }
  const cap = (k, up) => {
    const ring = rings[k];
    const contour = ring.map(p => new Vector2(p[0], p[1]));
    for (const [i, j, l] of ShapeUtils.triangulateShape(contour, [])) {
      const [xa, ya] = ring[i], [xb, yb] = ring[j], [xc, yc] = ring[l];
      const ccw = (xb - xa) * (yc - ya) - (yb - ya) * (xc - xa) > 0;
      if (ccw === up) tris.push(k * n + i, k * n + j, k * n + l);
      else tris.push(k * n + i, k * n + l, k * n + j);
    }
  };
  cap(0, true);
  cap(rings.length - 1, false);
  const mesh = new Mesh({ numProp: 3, vertProperties: new Float32Array(verts), triVerts: new Uint32Array(tris) });
  mesh.merge();
  return new Manifold(mesh);
}

// Rééchantillonne un contour fermé à pas régulier, sans changer son sens de parcours.
function resampleKeep(pts, step) {
  const cum = [0];
  for (let i = 1; i <= pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i % pts.length];
    cum.push(cum[i - 1] + Math.hypot(x1 - x0, y1 - y0));
  }
  const total = cum[cum.length - 1];
  const n = Math.max(8, Math.ceil(total / step));
  const out = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const sv = (k * total) / n;
    while (cum[j + 1] < sv) j++;
    const t = (sv - cum[j]) / (cum[j + 1] - cum[j] || 1);
    const [x0, y0] = pts[j], [x1, y1] = pts[(j + 1) % pts.length];
    out.push([x0 + t * (x1 - x0), y0 + t * (y1 - y0)]);
  }
  return out;
}

// Extrusion à arêtes arrondies (quart de cercle de rayon r sur les faces avant et arrière).
// Le maillage est construit directement : chaque contour est décalé vers l'intérieur couche par couche
// puis les couches sont reliées. Une ouverture préalable (offset −r puis +r) arrondit les coins saillants
// pour que ces décalages ne se croisent jamais.
function roundedExtrude(wasm, cs, h, r, g) {
  const { Manifold, Mesh } = wasm;
  r = Math.min(r, h / 2 - 0.05);
  if (r <= 0.05) return g(Manifold.extrude(cs, h));
  const opened = g(g(cs.offset(-r * 1.05, 'Round', 2, 32)).offset(r * 1.05, 'Round', 2, 32));
  // les décalages peuvent laisser des contours dégénérés (aire nulle) : on les ignore
  const contours = opened.toPolygons().filter(c => c.length >= 4 && Math.abs(signedArea(c)) > 0.5).map(c => {
    const pts = resampleKeep(c, 0.5);
    return { pts, nrm: normals(pts, 1), outer: signedArea(pts) > 0 };
  });
  // couches : (z, retrait) en quart de cercle près des deux faces
  const n = Math.max(3, Math.ceil(r / 0.25));
  const layers = [];
  for (let k = 0; k <= n; k++) {
    const z = (r * k) / n;
    layers.push([z, r - Math.sqrt(Math.max(0, r * r - (r - z) ** 2))]);
  }
  for (let k = n; k >= 0; k--) layers.push([h - layers[k][0], layers[k][1]]);

  const verts = [];
  const tris = [];
  const base = [];
  for (const c of contours) {
    base.push(verts.length / 3);
    for (const [z, inset] of layers)
      for (let i = 0; i < c.pts.length; i++)
        verts.push(c.pts[i][0] - c.nrm[i][0] * inset, c.pts[i][1] - c.nrm[i][1] * inset, z);
  }
  // parois : la normale sort à droite du sens de parcours, donc hors matière (extérieur CCW, trous CW)
  contours.forEach((c, ci) => {
    const m = c.pts.length;
    for (let k = 0; k < layers.length - 1; k++)
      for (let i = 0; i < m; i++) {
        const a = base[ci] + k * m + i, b = base[ci] + k * m + ((i + 1) % m);
        const cc = base[ci] + (k + 1) * m + ((i + 1) % m), d = base[ci] + (k + 1) * m + i;
        tris.push(a, b, cc, a, cc, d);
      }
  });
  // bouchons : triangulation de manifold (garde tous les points, gère trous et contours multiples)
  const L = layers.length;
  const flat = contours.flatMap((c, ci) => c.pts.map((_, i) => [ci, i]));
  const tri = wasm.triangulate(contours.map(c => c.pts), 1e-6);
  for (const [layer, up] of [[0, false], [L - 1, true]]) {
    for (const t of tri) {
      // triangles rendus en sens trigo : tels quels pour le dessus, inversés pour le dessous
      const idx = t.map(f => { const [cj, i] = flat[f]; return base[cj] + layer * contours[cj].pts.length + i; });
      tris.push(...(up ? idx : [idx[0], idx[2], idx[1]]));
    }
  }
  try {
    const mesh = new Mesh({ numProp: 3, vertProperties: new Float32Array(verts), triVerts: new Uint32Array(tris) });
    const m = g(new Manifold(mesh));
    if (m.volume() > 0) return m;
  } catch (e) { /* repli ci-dessous */ }
  return g(Manifold.extrude(cs, h)); // repli sans arrondi
}

// ---------- génération ----------

export function buildFrame(wasm, oma, userParams = {}) {
  const { Manifold, CrossSection } = wasm;
  // Les objets WASM ne sont pas libérés par le ramasse-miettes : on les trace pour les supprimer.
  const bin = [];
  const g = o => (bin.push(o), o);
  const p = { ...DEFAULTS, ...userParams };
  const dbl = p.dbl ?? (Number.isFinite(oma.dbl) ? oma.dbl : 18);
  const T = p.thickness;

  const N = 256;
  const lenses = [
    { key: 'R', sg: -1, src: oma.right },
    { key: 'L', sg: 1, src: oma.left },
  ].map(l => {
    const cx = l.sg * (l.src.width / 2 + dbl / 2);
    const local = resample(l.src.pts, N);
    const pts = local.map(([x, y]) => [x + cx, y]);
    return { ...l, cx, pts, nrm: normals(pts), halfH: l.src.height / 2 };
  });
  const halfH = Math.max(...lenses.map(l => l.halfH));

  // Courbure : sphère de la base de cerclage centrée sur chaque verre, raccord progressif au pont, puis galbe.
  const Rb = p.baseCurve > 0 ? 530 / p.baseCurve : 0;
  const sag = (dx, y) => {
    if (!Rb) return 0;
    const r2 = Math.min(dx * dx + y * y, Rb * Rb * 0.98);
    return -(Rb - Math.sqrt(Rb * Rb - r2));
  };
  const wrapK = Math.tan((p.wrap * Math.PI) / 180);
  const [lR, lL] = lenses;
  const surf = (x, y) => {
    const w = smoothstep(-dbl / 2, dbl / 2, x);
    return (1 - w) * sag(x - lR.cx, y) + w * sag(x - lL.cx, y) - wrapK * (Math.sqrt(x * x + 25) - 5);
  };
  const warp = v => { v[2] += surf(v[0], v[1]); };

  // --- contour extérieur de la face (2D) ---
  const parts = [];
  // Contour dessiné (photo) : il donne toute la forme de la face (nez, pont, tenons compris) ;
  // on garantit seulement rimMin de matière autour de chaque verre.
  const drawn = p.faceOutline?.length >= 3;
  for (const l of lenses) {
    const cs = g(new CrossSection([l.pts]));
    if (drawn) {
      const rim = g(cs.offset(p.rimMin, 'Round', 2, 64));
      parts.push(rim);
      l.rimPolys = rim.toPolygons();
      continue;
    }
    const rim = g(cs.offset(p.rimWidth, 'Round', 2, 64));
    const rimUp = g(rim.translate([0, p.rimTop]));
    parts.push(rim, rimUp);
    l.rimPolys = g(rim.add(rimUp)).toPolygons(); // contour extérieur du cercle (plein)
  }
  if (drawn) parts.push(g(new CrossSection([p.faceOutline], 'Positive')));
  const rimTopY = Math.min(...lenses.map(l => Math.max(...l.rimPolys.flat().map(q => q[1]))));
  // pont(s) : barre horizontale d'un cercle à l'autre, accrochée au bord nasal du verre à cette hauteur
  // Bord haut : y + h/2 + topC·(x/bx)², bord bas : y − h/2 − botC·(x/bx)² (arche sous le pont).
  // La barre va jusqu'au bord nasal extérieur du cercle à sa hauteur, puis pénètre de 1,5 mm dans le cercle.
  const addBridge = (y, h, topC = 0, botC = 0) => {
    const nasal = lenses.map(l => {
      const xs = l.rimPolys.map(poly => edgeAtY(poly, y, -l.sg)).filter(v => v !== null);
      return xs.length ? Math.min(...xs.map(Math.abs)) : null;
    }).filter(v => v !== null);
    const bx = (nasal.length ? Math.max(...nasal) : dbl / 2 + p.rimWidth) + 1.5;
    const n = 24, top = [], bot = [];
    for (let i = 0; i <= n; i++) {
      const x = -bx + (2 * bx * i) / n, k = (x / bx) ** 2;
      top.push([x, y + h / 2 + topC * k]);
      bot.push([x, y - h / 2 - botC * k]);
    }
    parts.push(g(new CrossSection([[...bot, ...top.reverse()]], 'Positive')));
  };
  if (!drawn) addBridge(p.bridgePos, p.bridgeHeight, p.bridgeTopCurve, p.bridgeBotCurve);
  if (!drawn && p.doubleBridge === 'oui') {
    // le bord haut (extrémités comprises) ne dépasse jamais le haut des cercles : il lui est au plus tangent
    const yMax = rimTopY - p.bridge2Height / 2 - p.bridge2TopCurve;
    addBridge(Math.min(p.bridge2Pos, yMax), p.bridge2Height, p.bridge2TopCurve, p.bridge2BotCurve);
  }

  // Tenons : la branche (et la charnière, centrée sur la branche) affleure le bord extérieur du tenon.
  const tw = Math.max(p.tenonWidth, p.templeThickness);
  const tenons = lenses.map(l => {
    const y = p.tenonY * halfH;
    const edge = edgeAtY(l.pts, y, l.sg) ?? l.cx + l.sg * l.src.width / 2;
    let xOut = edge + l.sg * tw;
    // contour dessiné : la branche et la charnière se calent sur son bord extérieur à la hauteur du tenon
    // (au moins l'épaisseur de la branche au-delà du verre)
    let needRect = !drawn;
    if (drawn) {
      const xd = edgeAtY(p.faceOutline, y, l.sg);
      const xMin = edge + l.sg * (p.templeThickness + 0.5);
      xOut = xd !== null && (xd - xMin) * l.sg > 0 ? xd : xMin;
      needRect = xd === null || (xd - xMin) * l.sg <= 0;
    }
    let xc = xOut - (l.sg * p.templeThickness) / 2;
    // charnière dans la face : la patte traverse la face, on l'écarte du drageoir
    if (p.hingeMode === 'face') {
      const minC = edge + l.sg * (p.clearance + p.faceMinWall + (p.tabW + p.slotClear) / 2);
      const shift = (minC - xc) * l.sg;
      if (shift > 0) { xc += l.sg * shift; xOut += l.sg * shift; }
    }
    const xr = xOut - (l.sg * tw) / 2; // centre du bloc de tenon
    if (needRect) parts.push(g(g(CrossSection.square([tw, p.tenonHeight], true)).translate([xr, y])));
    return { ...l, xc, xr, y };
  });

  // zone des plaquettes : le cercle s'épaissit localement côté nez (ellipse lissée par l'arrondi des raccords)
  const padY = -0.3 * halfH + p.padOffsetY;
  if (p.pads === 'integrees' && p.padWidth > 0) {
    for (const l of lenses) {
      const ex = edgeAtY(l.pts, padY, -l.sg);
      if (ex === null) continue;
      const cx = ex - l.sg * p.rimWidth;
      parts.push(g(g(g(CrossSection.circle(1, 48)).scale([p.padWidth + 0.5, p.padHeight / 2]))
        .translate([cx, padY])));
    }
  }
  let outline = g(CrossSection.union(parts));
  if (p.fillet > 0) outline = g(g(outline.offset(p.fillet, 'Round', 2, 48)).offset(-p.fillet, 'Round', 2, 48));
  // Trous trop étroits (fentes entre pont et cercles) : on les bouche. Plus fins que deux fois l'arrondi
  // des arêtes, ils deviendraient des bulles internes ; de toute façon ils ne s'impriment pas proprement.
  {
    const polys = outline.toPolygons();
    const minHalf = Math.max(p.faceRound, 0.6) + 0.1;
    const kept = polys.filter(c => {
      if (signedArea(c) > 0) return true;
      const hole = g(new CrossSection([[...c].reverse()], 'Positive'));
      return !g(hole.offset(-minHalf, 'Round', 2, 16)).isEmpty();
    });
    if (kept.length !== polys.length) outline = g(new CrossSection(kept, 'EvenOdd'));
  }

  const outlinePolys = outline.toPolygons();
  // Chaque volume d'origine reçoit un identifiant : après les opérations booléennes, le maillage dit
  // de quel volume vient chaque triangle, ce qui permet de colorer les parties dans l'aperçu.
  const partIds = { face: [], tenon: [], pads: [], groove: [], hinge: [] };
  const tag = (m, part) => { const o = g(m.asOriginal()); partIds[part].push(o.originalID()); return o; };
  let face = tag(g(roundedExtrude(wasm, outline, T, p.faceRound, g).translate([0, 0, -T])), 'face');
  if (Rb || p.wrap) face = g(g(face.refineToLength(1.5)).warp(warp));

  // --- tenons : blocs vers l'arrière, inclinés de l'angle pantoscopique ---
  // Repère local du tenon : origine au dos de la face, axe de la charnière vers −z.
  // La rotation autour de x fait descendre la branche de l'angle pantoscopique : une fois portée,
  // la branche est horizontale et le bas de la face se rapproche des joues.
  // En mode 'face', il ne reste qu'un talon d'appui : la patte traverse la face.
  const inFace = p.hingeMode === 'face';
  const depth = inFace ? p.seatDepth : p.tenonDepth;
  const c = p.slotClear;
  const warnings = [];
  const toFrame = (m, t) => g(g(m.rotate([-p.pantoscopic, 0, 0])).translate([t.xc, t.y, t.zPivot]));
  for (const t of tenons) {
    const xs = [t.xr - tw / 2, t.xr, t.xr + tw / 2];
    t.zPivot = Math.min(...xs.map(x => surf(x, t.y))) - T;
    const overlap = Math.min(1.5, T - 1);
    // Biseau intérieur : pleine largeur contre le cercle, puis seulement la largeur de la charnière à l'arrière.
    // Repère local : x = 0 sur l'axe de la charnière, bord extérieur en sg·tt/2.
    const xo = (t.sg * p.templeThickness) / 2;
    // tranche fine à coins arrondis ; l'enveloppe convexe de deux tranches donne un bloc biseauté aux arêtes douces
    const slabX = (w, z0, z1) => {
      const rr = Math.min(1.2, w / 2 - 0.1, p.tenonHeight / 2 - 0.1);
      const sq = g(g(g(CrossSection.square([w, p.tenonHeight], false)).offset(-rr, 'Round', 2, 24)).offset(rr, 'Round', 2, 24));
      return g(g(Manifold.extrude(sq, z1 - z0)).translate([t.sg > 0 ? xo - w : xo, -p.tenonHeight / 2, z0]));
    };
    const backW = Math.min(tw, 4.9); // collerette de la charnière (4,5 mm) + 0,4 mm
    const block = tag(g(Manifold.hull([slabX(tw, -0.4, overlap), slabX(backW, -depth, -depth + 0.4)])), 'tenon');
    face = g(face.add(toFrame(block, t)));
  }

  // --- plaquettes repose-nez : matière du cercle pincée vers l'arrière ---
  // Sur la bande du cercle côté nez (entre le bord du verre et le bord extérieur), le dos est repoussé vers
  // l'arrière selon un relief lisse : nul sur les bords de la bande, maximal au sommet d'une goutte plus large
  // en bas. Rien ne dépasse du contour de la face : la plaquette est invisible de face.
  if (p.pads === 'integrees') {
    const padParts = [];
    for (const l of lenses) {
      const nose = -l.sg;
      const exAt = y => edgeAtY(l.pts, y, nose);
      const ex0 = exAt(padY);
      if (ex0 === null) continue;
      // bord extérieur du cercle côté nez : premier croisement du contour au-delà du bord du verre
      const outerAt = (y, exL) => {
        const xs = crossingsAtY(outlinePolys, y).filter(x => (x - exL) * nose > 0.05);
        return xs.length ? xs.reduce((a, b2) => (Math.abs(b2 - exL) < Math.abs(a - exL) ? b2 : a)) : null;
      };
      const L = p.padHeight;
      const ang = (l.sg * p.padFaceAngle * Math.PI) / 180;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const peak = 0.5 + 0.35 * Math.sin((Math.min(60, Math.max(0, p.padSplay)) * Math.PI) / 180); // position du sommet dans la bande
      const relief = (x, y) => {
        // position le long de la goutte (axe incliné de l'angle de face), 0 en bas, 1 en haut
        const t = ((-(x - ex0) * sa + (y - padY) * ca) / L) + 0.5;
        if (t <= 0 || t >= 1) return 0;
        const tt = Math.pow(t, 0.76); // sommet sous le milieu : goutte plus large en bas
        const fy = Math.pow(Math.sin(Math.PI * tt), 1.3);
        const exL = exAt(y);
        if (exL === null) return 0;
        const exO = outerAt(y, exL);
        if (exO === null) return 0;
        const u = (x - exL) / (exO - exL);
        if (u <= 0 || u >= 1) return 0;
        const v = u < peak ? (0.5 * u) / peak : 0.5 + (0.5 * (u - peak)) / (1 - peak);
        return fy * Math.pow(Math.sin(Math.PI * v), 0.9);
      };
      const zb = surf(ex0, padY) - T;
      // fenêtre autour de la plaquette, découpée dans le contour de la face
      const win = g(g(g(CrossSection.square([p.rimWidth + p.padWidth + 6, L + 2], true))
        .rotate((ang * 180) / Math.PI)).translate([ex0 + nose * (p.rimWidth + p.padWidth) / 2, padY]));
      const region = g(outline.intersect(win));
      if (region.isEmpty()) continue;
      const slab = g(g(Manifold.extrude(region, 1)).refineToLength(0.3));
      const pad = g(slab.warp(v => {
        const f = relief(v[0], v[1]);
        // z = 0 devient le dos repoussé (padDepth au sommet), z = 1 la face noyée dans le cercle
        v[2] = v[2] < 0.5 ? zb + 0.3 - (p.padDepth + 0.3) * f : zb + 0.8;
      }));
      padParts.push(tag(pad, 'pads'));
    }
    if (padParts.length) face = g(Manifold.union([face, ...padParts]));
  }

  // --- drageoir : découpe en V qui suit le contour du verre ---
  const half = ((p.bevelAngle / 2) * Math.PI) / 180;
  const zApex = -p.bevelPos * T;
  const zSpan = p.grooveDepth * Math.tan(half);
  const d = -p.grooveDepth + p.clearance;
  // les bouchons du gabarit restent plats après déformation : on les place loin de la face
  const profile = [
    [20, d],
    [zApex + zSpan, d],
    [zApex, p.clearance],
    [zApex - zSpan, d],
    [-T - depth - 20, d],
  ];
  for (const l of lenses) {
    const rings = profile.map(([z, off]) =>
      l.pts.map(([x, y], i) => [x + l.nrm[i][0] * off, y + l.nrm[i][1] * off, z]));
    const cutter = tag(g(g(loftRings(wasm, rings)).warp(warp)), 'groove');
    face = g(face.subtract(cutter));
  }

  // --- logement de la patte + avant-trou de la vis longue (borgne) ---
  // mode 'tenon' : vis par-dessous le bloc ; mode 'face' : patte traversante, vis par-dessus la face.
  for (const t of tenons) {
    const slotLen = inFace ? depth + T + 3 : p.tabLen + 0.3;
    const slot = g(g(Manifold.cube([p.tabW + c, p.tabH + c, slotLen + 1], false))
      .translate([-(p.tabW + c) / 2, -(p.tabH + c) / 2, -depth - 1]));
    // surfaces haute et basse (repère local, y = 0 au centre de la patte)
    const [lo, hi] = inFace ? yRangeAt(outlinePolys, t.xc).map(v => v - t.y)
      : [-p.tenonHeight / 2, p.tenonHeight / 2];
    const want = p.tenonScrewLen + 0.3;
    let y0, y1, cb = null;
    const tabHalf = (p.tabH + c) / 2;
    if (inFace) {
      // La vis entre par-dessus et doit traverser la patte : sa pointe va à 1 mm sous la patte.
      // Si la matière au-dessus est plus haute que la vis, un lamage (Ø 2,2) loge la tête plus bas.
      y0 = Math.max(-tabHalf - 1, lo + p.minSkin);
      const head = y0 + want;
      y1 = Math.max(head, tabHalf + 0.5);
      if (head < hi) cb = [head - 0.01, hi + 1];
      else y1 = hi + 1;
    } else { y0 = lo - 1; y1 = Math.min(lo + want, hi - p.minSkin); }
    const reach = inFace ? Math.min(hi, y1) - y0 : y1 - lo;
    if (!inFace && reach + 0.05 < want) warnings.push(`Vis longue : ${reach.toFixed(1)} mm de perçage possible pour ${want.toFixed(1)} mm voulus, agrandissez la hauteur du tenon.`);
    const vcyl = (r, ya, yb) => g(g(g(Manifold.cylinder(yb - ya, r, r, 24, false))
      .rotate([-90, 0, 0])).translate([0, ya, -depth + p.tabHolePos]));
    face = g(g(face.subtract(tag(toFrame(slot, t), 'hinge'))).subtract(tag(toFrame(vcyl(p.tenonScrewD / 2, y0, y1), t), 'hinge')));
    if (cb) face = g(face.subtract(tag(toFrame(vcyl(1.1, cb[0], cb[1]), t), 'hinge')));
  }

  // résidus de volume négligeable (fragments plats laissés par les fusions) : on les retire
  {
    const pieces = face.decompose();
    if (pieces.length > 1) {
      const kept = pieces.filter(m => Math.abs(m.volume()) > 1);
      face = g(Manifold.compose(kept));
    }
    pieces.forEach(m => m.delete());
  }

  const { right: templeR, left: templeL } = buildTemples(wasm, p, warnings);
  for (const o of bin) if (o !== face) o.delete();

  return {
    face,
    templeR,
    templeL,
    params: { ...p, dbl },
    warnings: [...new Set(warnings)],
    partIds,
    // verre au sommet du biseau : anneaux concentriques du centre vers le contour
    lenses: lenses.map(l => ({
      key: l.key,
      rings: [0.02, 0.15, 0.35, 0.55, 0.75, 0.9, 1].map(s => l.pts.map(([x, y]) => {
        const px = l.cx + s * (x - l.cx), py = s * y;
        return [px, py, surf(px, py) + zApex];
      })),
    })),
    // entrée du logement de charnière, et axe de la charnière (vers l'arrière, incliné)
    hinges: tenons.map(t => {
      const a = (p.pantoscopic * Math.PI) / 180;
      const dir = [0, -Math.sin(a), -Math.cos(a)];
      return { key: t.key, sg: t.sg, tilt: -p.pantoscopic, dir,
        x: t.xc, y: t.y + dir[1] * depth, z: t.zPivot + dir[2] * depth };
    }),
  };
}

// Branche dessinée de profil (u vers l'arrière, v vers le haut), extrudée sur son épaisseur (w).
// Elle s'imprime à plat, côté sur le plateau. La vis entre par la face intérieure (côté tête) :
// branche droite et branche gauche sont donc symétriques l'une de l'autre.
export function buildTemples(wasm, p, warnings = []) {
  const { Manifold, CrossSection } = wasm;
  const bin = [];
  const g = o => (bin.push(o), o);
  const panto = 0; // branche droite : l'inclinaison est portée par les tenons
  const drop = p.templeTilt === 'penchee' ? (p.templeDrop * Math.PI) / 180 : 0;
  const h0 = p.tenonHeight;
  const L0 = 8;
  const bendR = 32; // coude penché ample, comme les branches du commerce

  // ligne médiane échantillonnée tous les ~1 mm
  const path = [];
  const step = 1;
  let x = 0, y = 0, dir = 0, s = 0;
  const pushPt = () => path.push({ x, y, dir, s });
  pushPt();
  const advance = (len, dirFn) => {
    const n = Math.max(1, Math.ceil(len / step));
    for (let i = 0; i < n; i++) {
      dir = dirFn(i / n);
      x += Math.cos(dir) * (len / n);
      y += Math.sin(dir) * (len / n);
      s += len / n;
      pushPt();
    }
  };
  advance(L0, () => 0);
  const arc0 = 6; // petite transition (vers l'angle pantoscopique s'il y en a un)
  advance(arc0, t => -panto * t);
  const straight = Math.max(10, p.templeBend - L0 - arc0);
  advance(straight, () => -panto);
  if (drop > 0) advance(bendR * drop, t => -panto - drop * t);
  advance(Math.max(5, p.templeLength - s), () => -panto - drop);

  const total = s;
  // hauteur le long de la branche : zone de charnière à h0, puis points du profil choisi, raccords en cosinus
  const style = TEMPLE_STYLES[p.templeStyle] ?? TEMPLE_STYLES.standard;
  const hStart = style.start ? Math.max(h0, style.start) : h0;
  const val = h => (h === 'tip' ? p.templeHeightTip : h === 'h0' ? hStart : h);
  const ctrl = [[0, hStart], ...(style.lin ? [] : [[L0, hStart]]), ...style.pts.map(([a, h]) => [a > 1 ? a : a * total, val(h)])];
  const height = sv => {
    for (let i = 1; i < ctrl.length; i++) {
      const [s0, ha] = ctrl[i - 1], [s1, hb] = ctrl[i];
      if (sv <= s1) {
        const t = s1 > s0 ? (sv - s0) / (s1 - s0) : 1;
        return ha + (hb - ha) * (style.lin ? t : (1 - Math.cos(Math.PI * t)) / 2);
      }
    }
    return ctrl[ctrl.length - 1][1];
  };
  const top = [], bot = [];
  for (const q of path) {
    const nx = -Math.sin(q.dir), ny = Math.cos(q.dir);
    const h = height(q.s) / 2;
    top.push([q.x + nx * h, q.y + ny * h]);
    bot.push([q.x - nx * h, q.y - ny * h]);
  }
  const poly = [...bot, ...top.reverse()];
  const end = path[path.length - 1];
  const cs = g(new CrossSection([signedArea(poly) < 0 ? [...poly].reverse() : poly], 'Positive'));
  const tip = g(g(CrossSection.circle(height(total) / 2, 32)).translate([end.x, end.y]));
  // Épaisseur (w) : pleine sur la zone de la charnière, puis affinée côté intérieur (côté tête) ;
  // la face extérieure (w = 0) reste plane et alignée sur le bord du tenon.
  const tt = p.templeThickness;
  const u0 = p.barLen + 3, u1 = u0 + 18;
  const kMin = Math.min(1, Math.max(0.4, p.templeThin / tt));
  const kAt = u => (u <= u0 ? 1 : u >= u1 ? kMin : 1 + (kMin - 1) * smoothstep(u0, u1, u));
  const body = g(roundedExtrude(wasm, g(cs.add(tip)), tt, p.templeRound, g).warp(v => { v[2] *= kAt(v[0]); }));
  // logement de la tige de charnière + avant-trou de vis borgne depuis la face intérieure (w = épaisseur)
  const c = p.slotClear;
  const slot = g(g(Manifold.cube([p.barLen + 0.3 + 1, p.barH + c, p.barW + c], false))
    .translate([-1, -(p.barH + c) / 2, tt / 2 - (p.barW + c) / 2]));
  const want = p.templeScrewLen + 0.3;
  const w0 = Math.max(tt - want, p.minSkin);
  if (tt - w0 + 0.05 < want) warnings.push(`Vis courte : ${(tt - w0).toFixed(1)} mm de perçage possible pour ${want.toFixed(1)} mm voulus, épaississez la branche.`);
  const screw = g(g(Manifold.cylinder(tt + 1 - w0, p.templeScrewD / 2, p.templeScrewD / 2, 24, false))
    .translate([p.barHolePos, 0, w0]));
  let right = g(g(body.subtract(slot)).subtract(screw));

  // trou pour le cordon, à travers l'embout
  const cordD = CORD_HOLES[p.cordHole] ?? 0;
  if (cordD > 0) {
    const sAt = total - (height(total) / 2 + cordD / 2 + 0.6);
    const q = path.reduce((a, b) => (Math.abs(b.s - sAt) < Math.abs(a.s - sAt) ? b : a));
    const hole = g(g(Manifold.cylinder(tt + 2, cordD / 2, cordD / 2, 24, false)).translate([q.x, q.y, -1]));
    right = g(right.subtract(hole));
  }
  let left = g(g(right.mirror([0, 0, 1])).translate([0, 0, tt]));

  // gravures côté intérieur (côté tête) : texte libre au milieu, lettre de taille près de la charnière.
  // Les contours arrivent en mm (x = sens de lecture, y = haut), centrés sur l'origine.
  // Branche droite : intérieur en w = tt, lu dans le sens +u. Branche gauche : intérieur en w = 0, lu en miroir.
  const marks = [];
  if (p.textPolys?.length) {
    const uc = Math.min(0.45 * total, total - 30);
    const at = path.reduce((a, b) => (Math.abs(b.s - uc) < Math.abs(a.s - uc) ? b : a));
    marks.push({ polys: p.textPolys, u: at.x, v: at.y, h: Math.max(1.5, height(uc) - 1.8) });
  }
  if (p.sizeMark === 'oui' && p.sizePolys?.length) {
    const uc = p.barLen + 6;
    marks.push({ polys: p.sizePolys, u: uc, v: 0, h: Math.max(1.5, height(uc) - 2.4) });
  }
  for (const m of marks) {
    const cs0 = g(new CrossSection(m.polys, 'EvenOdd'));
    const b = cs0.bounds();
    const k = m.h / Math.max(0.01, b.max[1] - b.min[1]);
    const cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2;
    const placed = mirror => g(g(g(cs0.translate([-cx, -cy])).scale([mirror ? -k : k, k])).translate([m.u, m.v]));
    const d = p.engraveDepth;
    const wIn = tt * kAt(m.u); // face intérieure à cet endroit (branche affinée)
    right = g(right.subtract(g(g(Manifold.extrude(placed(false), d + 1)).translate([0, 0, wIn - d]))));
    left = g(left.subtract(g(g(Manifold.extrude(placed(true), d + 1)).translate([0, 0, tt - wIn - 1]))));
  }
  for (const o of bin) if (o !== right && o !== left) o.delete();
  return { right, left };
}
