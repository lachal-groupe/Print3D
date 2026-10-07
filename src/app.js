import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import Module from 'manifold-3d';
import { parseOMA } from './oma.js';
import { buildFrame, DEFAULTS, TEMPLE_SIZES, TEMPLE_STYLES, CORD_HOLES, HINGE_KEYS } from './frame.js';
import { meshToArrays, to3MF } from './export.js';
import { textToPolys } from './text.js';
import { openPhotoEditor } from './photo.js';

// ---------- icônes (traits, 24 × 24) ----------
const ICONS = {
  lens: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5"/>',
  face: '<circle cx="6.5" cy="13" r="4"/><circle cx="17.5" cy="13" r="4"/><path d="M10.5 13q1.5-1.6 3 0M2.5 12 1.5 9M21.5 12l1-3"/>',
  photo: '<path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13.5" r="3.5"/>',
  bridge: '<path d="M3 17c0-5.5 4-9 9-9s9 3.5 9 9"/><path d="M7.5 17c0-3 2-5 4.5-5s4.5 2 4.5 5"/>',
  pads: '<path d="M12 3c3 4.5 6 7.8 6 11a6 6 0 0 1-12 0c0-3.2 3-6.5 6-11z"/><path d="M9.5 15a2.5 2.5 0 0 0 2.5 2.5"/>',
  tenon: '<path d="M3 7h10l5 5v5H3z"/><path d="M13 7v5h5M18 14.5h3"/>',
  hinge: '<rect x="2.5" y="9" width="7" height="6" rx="1.2"/><rect x="14.5" y="9" width="7" height="6" rx="1.2"/><path d="M9.5 12h5"/><circle cx="12" cy="12" r="1.6"/>',
  temple: '<path d="M2.5 9h12.5c3.2 0 4.6 2.2 6.5 6.5"/><path d="M2.5 7v4"/>',
};
const svg = k => `<svg viewBox="0 0 24 24">${ICONS[k]}</svg>`;
const CHEV = '<svg viewBox="0 0 24 24" class="chev"><path d="M9 6l6 6-6 6"/></svg>';

// ---------- couleurs ----------
const PARTS = {
  face: { label: 'Face', color: '#2dd4bf' },
  groove: { label: 'Drageoir', color: '#a3e635' },
  pads: { label: 'Plaquettes', color: '#a78bfa' },
  tenon: { label: 'Tenons', color: '#f5a524' },
  hinge: { label: 'Logements de charnière', color: '#f472b6' },
  temples: { label: 'Branches', color: '#60a5fa' },
  metal: { label: 'Charnières métal', color: '#cbd5e1' },
};
const MATIERES = [
  ['Blanc', '#eef1f4'], ['Bleu marine', '#1f3b5c'], ['Noir', '#17191e'], ['Vert sapin', '#1f4d3d'], ['Écaille', '#5a3a22'],
  ['Bordeaux', '#6b1d2a'], ['Gris', '#8a929e'], ['Cristal', '#cfd9e0'],
];

// ---------- réglages affichés ----------
// r(clé, libellé, min, max, pas, unité, aide) : curseur ; sel(clé, libellé, options) : choix.
// off(p) : vrai quand le réglage n'a pas d'effet avec les choix actuels (il est alors grisé).
const r = (k, label, min, max, step, unit = 'mm', hint = '') => ({ k, label, min, max, step, unit, hint });
const sel = (k, label, options, hint = '') => ({ k, label, type: 'select', options, hint });
const ouiNon = [['non', 'Non'], ['oui', 'Oui']];

const GROUPS = [
  { title: 'Verre et drageoir', sub: 'Serrage et forme du biseau', icon: 'lens', c: 'var(--lime)', fields: [
    r('clearance', 'Jeu au fond du drageoir', -0.3, 0.4, 0.05, 'mm', '+ = verre plus libre, − = plus serré'),
    r('grooveDepth', 'Profondeur du drageoir', 0.4, 1.5, 0.05),
    r('bevelAngle', 'Angle du biseau', 90, 130, 1, '°'),
  ] },
  { title: 'Face', sub: 'Cercles, épaisseur, arrondis', icon: 'face', c: 'var(--teal)', fields: [
    r('dbl', 'Longueur du pont', 10, 26, 0.5, 'mm', 'Distance entre les verres (DBL du fichier)'),
    r('thickness', 'Épaisseur de face', 3.5, 7, 0.1),
    { ...r('rimWidth', 'Largeur du cercle', 2, 8, 0.1, 'mm', 'Sans effet quand le contour est dessiné sur une photo'), off: p => !!p.faceOutline },
    { ...r('rimTop', 'Surépaisseur haute', 0, 6, 0.1), off: p => !!p.faceOutline },
    r('fillet', 'Arrondi des raccords', 0, 5, 0.1, 'mm', 'Congés entre cercles, pont et tenons, vus de face'),
    r('faceRound', 'Arrondi des arêtes', 0, 2, 0.1, 'mm', '0 = arêtes vives'),
  ] },
  { title: 'Contour photo', sub: 'Dessin complet de la face sur une photo', icon: 'photo', c: 'var(--lime)', custom: 'photo', fields: [
    { ...r('rimMin', 'Matière minimale autour du verre', 1.2, 4, 0.1, 'mm', 'Gardée autour du drageoir, même si le dessin passe plus près'), off: p => !p.faceOutline },
  ] },
  { title: 'Pont', sub: 'Position, courbes, double pont', icon: 'bridge', c: 'var(--pink)', fields: [
    ...[
      r('bridgePos', 'Hauteur du pont', -10, 25, 0.5, 'mm', 'Au-dessus de la ligne des centres des verres'),
      r('bridgeHeight', 'Épaisseur du pont', 2, 10, 0.1, 'mm', 'Au milieu du pont'),
      r('bridgeTopCurve', 'Courbe supérieure', 0, 8, 0.1, 'mm', 'Remontée du bord haut vers les cercles'),
      r('bridgeBotCurve', 'Courbe inférieure', 0, 10, 0.1, 'mm', 'Arche du bord bas'),
      sel('doubleBridge', 'Double pont', ouiNon),
    ].map(f => ({ ...f, off: p => !!p.faceOutline })),
    ...[
      r('bridge2Pos', 'Hauteur du double pont', 5, 30, 0.5, 'mm', 'Au maximum, le bord haut est tangent au haut des cercles'),
      r('bridge2Height', 'Épaisseur du double pont', 1.5, 6, 0.1),
      r('bridge2TopCurve', 'Courbe supérieure du double pont', 0, 6, 0.1),
      r('bridge2BotCurve', 'Courbe inférieure du double pont', 0, 6, 0.1),
    ].map(f => ({ ...f, off: p => !!p.faceOutline || p.doubleBridge !== 'oui' })),
  ] },
  { title: 'Plaquettes', sub: 'Repose-nez intégrés au cercle', icon: 'pads', c: 'var(--purple)', fields: [
    sel('pads', 'Plaquettes repose-nez', [['integrees', 'Intégrées'], ['aucune', 'Aucune']]),
    ...[
      r('padFaceAngle', 'Angle de face', -30, 30, 1, '°', 'Inclinaison de la goutte, haut vers le nez'),
      r('padSplay', 'Angle de chasse', 0, 60, 1, '°', 'Ouvre le flanc de contact vers l’aile du nez'),
      r('padDepth', 'Profondeur des plaquettes', 1, 6, 0.1, 'mm', 'Saillie derrière le cercle'),
      r('padHeight', 'Longueur des plaquettes', 6, 30, 0.1),
      r('padWidth', 'Épaississement du cercle', 0, 4, 0.1, 'mm', 'Le cercle s’élargit côté nez pour asseoir la plaquette'),
      r('padOffsetY', 'Décalage vertical', -8, 8, 0.1),
    ].map(f => ({ ...f, off: p => p.pads !== 'integrees' })),
  ] },
  { title: 'Tenons', sub: 'Montage, inclinaison, dimensions', icon: 'tenon', c: 'var(--orange)', fields: [
    sel('hingeMode', 'Montage de la charnière', [['tenon', 'Tenon arrière'], ['face', 'Dans la face']], 'Tenon : vis par-dessous ; dans la face : vis par-dessus'),
    r('pantoscopic', 'Inclinaison de la face', 0, 15, 0.5, '°', 'Angle pantoscopique : 8 à 10° en standard'),
    r('tenonY', 'Hauteur des tenons', 0, 1, 0.01, '', '1 = haut du verre'),
    r('tenonWidth', 'Largeur du tenon', 4.5, 15, 0.1, 'mm', 'Du bord du verre au bord extérieur ; branche et charnière s’alignent sur ce bord'),
    r('tenonHeight', 'Épaisseur du tenon', 6, 12, 0.1, 'mm', 'Au moins 6 mm pour la collerette'),
    { ...r('tenonDepth', 'Profondeur du tenon', 4, 12, 0.1), off: p => p.hingeMode === 'face' },
    { ...r('seatDepth', 'Talon d’appui', 0.5, 3, 0.1, 'mm', 'Appui de la collerette quand la charnière est dans la face'), off: p => p.hingeMode !== 'face' },
  ] },
  { title: 'Charnière', sub: 'Cotes du kit (fiche A à I) et vis', icon: 'hinge', c: 'var(--pink)', reset: true, fields: [
    r('tabLen', 'A · Patte : longueur', 2, 6, 0.1, 'mm', 'Voir la fiche des cotes'),
    r('tabW', 'B · Patte : largeur', 0.8, 4, 0.05, 'mm', 'Vue 1, la face où l’on voit le trou'),
    r('tabH', 'C · Patte : épaisseur', 0.5, 4, 0.05, 'mm', 'Vue 2, traversée par la vis longue'),
    r('tabHolePos', 'D · Patte : collerette → trou', 0.5, 5, 0.05),
    r('hingeGap', 'E · Entre collerettes', 2, 9, 0.1, 'mm', 'Partie visible de la charnière'),
    r('barLen', 'F · Tige : longueur', 6, 14, 0.1),
    r('barH', 'G · Tige : hauteur', 0.8, 4.5, 0.05, 'mm', 'Vue 2, la face où l’on voit le trou'),
    r('barW', 'H · Tige : épaisseur', 0.5, 4, 0.05, 'mm', 'Vue 1, traversée par la vis courte'),
    r('barHolePos', 'I · Tige : collerette → trou', 3, 13, 0.05),
    r('slotClear', 'Jeu des logements', 0, 0.5, 0.05),
    r('tenonScrewD', 'Vis longue : avant-trou', 0.5, 1.2, 0.05, 'mm', 'Vis Ø 1 mm dans le tenon, trou borgne'),
    r('tenonScrewLen', 'Vis longue : longueur', 3, 9, 0.1),
    r('templeScrewD', 'Vis courte : avant-trou', 0.5, 1.2, 0.05, 'mm', 'Vis Ø 1 mm par l’intérieur de la branche, trou borgne'),
    r('templeScrewLen', 'Vis courte : longueur', 1.5, 5, 0.1),
  ] },
  { title: 'Branches', sub: 'Taille, forme, gravure', icon: 'temple', c: 'var(--blue)', fields: [
    sel('templeSize', 'Taille', Object.entries(TEMPLE_SIZES).map(([k, v]) => [k, `${k} · ${v} mm`]).concat([['perso', 'Sur mesure']])),
    r('templeLength', 'Longueur des branches', 120, 155, 1),
    sel('templeStyle', 'Forme de branche', Object.entries(TEMPLE_STYLES).map(([k, v]) => [k, v.label])),
    sel('templeTilt', 'Style de branche', [['droite', 'Droite'], ['penchee', 'Penchée']]),
    { ...r('templeDrop', 'Tombée de l’embout', 10, 60, 1, '°'), off: p => p.templeTilt !== 'penchee' },
    { ...r('templeBend', 'Longueur au coude', 70, 125, 1), off: p => p.templeTilt !== 'penchee' },
    sel('cordHole', 'Trou pour le cordon', Object.keys(CORD_HOLES).map(k => [k, k[0].toUpperCase() + k.slice(1)])),
    { k: 'templeText', label: 'Texte personnalisé', type: 'text', hint: 'Gravé côté intérieur, au milieu de la branche' },
    sel('sizeMark', 'Graver la lettre de taille', [['oui', 'Oui'], ['non', 'Non']], 'Côté intérieur, près de la charnière'),
    r('templeThickness', 'Épaisseur à la charnière', 4.5, 7, 0.1),
    r('templeThin', 'Épaisseur du corps', 2.5, 7, 0.1, 'mm', 'Vue de dessus, une fois passée la charnière'),
    r('templeHeightTip', 'Hauteur à l’embout', 2.5, 6, 0.1),
    r('templeRound', 'Arrondi des arêtes', 0, 2, 0.1, 'mm', '0 = arêtes vives'),
  ] },
];

const $ = s => document.querySelector(s);
const params = { ...DEFAULTS };
let oma = null, fileName = '', result = null, wasm = null, refit = true;
let showParts = false, matiere = MATIERES[0][1];
let photoEdit = null; // dernière session de dessin sur photo (photo, calage, points), pour la reprendre

// ---------- scène 3D ----------
const viewport = $('#viewport');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
viewport.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 1, 3000);
camera.position.set(-110, 70, 230);
const controls = new OrbitControls(camera, renderer.domElement);
// clic gauche : tourner, clic molette ou clic droit : déplacer la vue, molette : zoom
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
controls.screenSpacePanning = true;
controls.enableDamping = true;
controls.target.set(0, 0, -40);
scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x1a2233, 1.5));
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(80, 150, 200);
scene.add(key);
const rim = new THREE.DirectionalLight(0x8fb4ff, 1.2);
rim.position.set(-120, 40, -220);
scene.add(rim);

const group = new THREE.Group();
scene.add(group);
const mat = color => new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.05 });
const frameMat = mat(matiere);
const partMats = Object.fromEntries(Object.entries(PARTS).map(([k, v]) => [k, mat(v.color)]));
const metalMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.28, metalness: 0.9 });
const lensMat = new THREE.MeshPhysicalMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.22, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false });

function resize() {
  const { clientWidth: w, clientHeight: h } = viewport;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(viewport);
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });

function geometryFrom({ pos, idx, runs }, idToPart) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  // normales lissées sur les surfaces courbes, arêtes vives au-delà de 35°
  const ng = toCreasedNormals(g, (35 * Math.PI) / 180);
  g.dispose();
  ng.clearGroups();
  if (idToPart) {
    // Sans groupe, un maillage à plusieurs matériaux ne s'affiche pas du tout :
    // à défaut d'information par pièce, toute la face prend la couleur « Face ».
    const order = Object.keys(PARTS);
    if (runs?.length) for (const run of runs) ng.addGroup(run.start, run.count, Math.max(0, order.indexOf(idToPart[run.id] ?? 'face')));
    else ng.addGroup(0, ng.attributes.position.count, 0);
  }
  return ng;
}

function clearGroup() {
  for (const o of [...group.children]) {
    o.geometry?.dispose();
    group.remove(o);
  }
}

// Place une branche (repère u arrière, v haut, w épaisseur) sur le tenon, en position ouverte.
function templeMatrix(h, tt, gap) {
  const m = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0));
  m.premultiply(new THREE.Matrix4().makeRotationX((h.tilt * Math.PI) / 180));
  m.setPosition(h.x - tt / 2, h.y + h.dir[1] * gap, h.z + h.dir[2] * gap);
  return m;
}

const partMaterialArray = () => Object.keys(PARTS).map(k => partMats[k]);
function applyMaterials() {
  for (const o of group.children) {
    if (o.userData.kind === 'face') o.material = showParts ? partMaterialArray() : frameMat;
    if (o.userData.kind === 'temple') o.material = showParts ? partMats.temples : frameMat;
  }
  frameMat.color.set(matiere);
  $('#legend').hidden = !showParts;
  $('#parts-toggle').classList.toggle('on', showParts);
}

function showResult(res) {
  clearGroup();
  const idToPart = {};
  for (const [part, ids] of Object.entries(res.partIds || {})) for (const id of ids) idToPart[id] = part;
  res.faceArr = meshToArrays(res.face);
  // affichage « comme portée » : branches horizontales, face inclinée de l'angle pantoscopique
  group.rotation.x = (res.params.pantoscopic * Math.PI) / 180;
  res.templeRArr = meshToArrays(res.templeR);
  res.templeLArr = meshToArrays(res.templeL);
  const faceMesh = new THREE.Mesh(geometryFrom(res.faceArr, idToPart), frameMat);
  faceMesh.userData.kind = 'face';
  group.add(faceMesh);
  const P = res.params;
  for (const h of res.hinges) {
    const mesh = new THREE.Mesh(geometryFrom(h.key === 'R' ? res.templeRArr : res.templeLArr), frameMat);
    mesh.userData.kind = 'temple';
    mesh.applyMatrix4(templeMatrix(h, P.templeThickness, P.hingeGap));
    group.add(mesh);
    // charnière : deux collerettes 4,5 × 6 et le bloc ressort entre les deux, dans l'axe incliné
    const box = (w, hh, d, along) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), metalMat);
      m.rotation.x = (h.tilt * Math.PI) / 180;
      m.position.set(h.x, h.y + h.dir[1] * along, h.z + h.dir[2] * along);
      group.add(m);
    };
    box(4.5, 6, 0.7, 0.35);
    box(4.5, 6, 0.7, P.hingeGap - 0.35);
    box(3.2, 4.2, P.hingeGap - 1.4, P.hingeGap / 2);
  }
  // verres (surface au sommet du biseau)
  for (const l of res.lenses) {
    const n = l.rings[0].length;
    const pos = new Float32Array(l.rings.length * n * 3);
    l.rings.flat().forEach((p, i) => pos.set(p, i * 3));
    const idx = [];
    for (let k = 0; k < l.rings.length - 1; k++)
      for (let i = 0; i < n; i++) {
        const a = k * n + i, b = k * n + (i + 1) % n, c = (k + 1) * n + (i + 1) % n, d = (k + 1) * n + i;
        idx.push(a, b, c, a, c, d);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    group.add(new THREE.Mesh(g, lensMat));
  }
  applyMaterials();
}

// ---------- gravures (contours de texte, mis en cache) ----------
const textCache = new Map();
const polysOf = t => {
  if (!textCache.has(t)) textCache.set(t, textToPolys(t));
  return textCache.get(t);
};
const engravings = () => ({
  textPolys: polysOf(params.templeText || ''),
  sizePolys: TEMPLE_SIZES[params.templeSize] ? polysOf(params.templeSize) : [],
});

// ---------- génération ----------
let pending = null;
function regenerate() {
  clearTimeout(pending);
  pending = setTimeout(() => {
    if (!oma || !wasm) return;
    $('#status').textContent = 'Calcul…';
    // petite pause pour que « Calcul… » s'affiche avant le calcul (pas de requestAnimationFrame :
    // il est suspendu quand l'onglet n'est pas visible)
    setTimeout(() => {
      const t0 = performance.now();
      try {
        const res = buildFrame(wasm, oma, { ...params, ...engravings() });
        if (result) { result.face.delete(); result.templeR.delete(); result.templeL.delete(); }
        result = res;
        showResult(res);
        if (refit) { fitView(); refit = false; }
        const bb = res.face.boundingBox();
        const ms = Math.round(performance.now() - t0);
        $('#st-size').textContent = `${(bb.max[0] - bb.min[0]).toFixed(1)} × ${(bb.max[1] - bb.min[1]).toFixed(1)}`;
        $('#st-face').textContent = `${((res.face.volume() / 1000) * 1.24).toFixed(1)} g`;
        $('#st-temples').textContent = `${((2 * res.templeR.volume() / 1000) * 1.24).toFixed(1)} g`;
        $('#st-time').textContent = `${ms} ms`;
        $('#status').textContent = `${fileName} · ${res.params.templeSize} ${res.params.templeLength} mm · ${params.faceOutline ? 'contour photo' : 'dessin atelier'}`;
        $('#warnings').innerHTML = res.warnings.map(w => `<div>⚠ ${w}</div>`).join('');
        setExportEnabled(true);
      } catch (e) {
        console.error(e);
        $('#status').textContent = `Erreur de génération : ${e.message}`;
      }
    }, 30);
  }, 150);
}

// ---------- interface ----------
const rows = [];
const fillTrack = el => {
  const p = ((+el.value - +el.min) / (+el.max - +el.min)) * 100;
  el.style.setProperty('--p', `${Math.max(0, Math.min(100, p))}%`);
};
function buildControls() {
  const host = $('#controls');
  for (const grp of GROUPS) {
    const det = document.createElement('details');
    det.className = 'sec';
    det.open = !!grp.open;
    det.style.setProperty('--c', grp.c);
    det.innerHTML = `<summary><span class="icon-tile">${svg(grp.icon)}</span>
      <span class="t"><b>${grp.title}</b><span>${grp.sub}</span></span>${CHEV}</summary>`;
    const body = document.createElement('div');
    body.className = 'sec-body';
    det.appendChild(body);
    if (grp.custom === 'photo') body.appendChild(photoBlock());
    for (const f of grp.fields) {
      const row = document.createElement('div');
      row.className = 'field';
      row.off = f.off;
      const hint = f.hint ? `title="${f.hint}"` : '';
      if (f.type === 'select' && f.options.length <= 3) {
        // choix courts : boutons segmentés
        row.innerHTML = `<label ${hint}>${f.label}</label>
          <div class="seg">${f.options.map(([v, t]) => `<button type="button" data-v="${v}">${t}</button>`).join('')}</div>`;
        const btns = [...row.querySelectorAll('button')];
        btns.forEach(b => b.addEventListener('click', () => { params[f.k] = b.dataset.v; syncControls(); regenerate(); }));
        row.sync = () => btns.forEach(b => b.classList.toggle('on', b.dataset.v === String(params[f.k])));
      } else if (f.type === 'select') {
        row.innerHTML = `<label for="f-${f.k}" ${hint}>${f.label}</label>
          <select id="f-${f.k}">${f.options.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>`;
        const el = row.querySelector('select');
        el.addEventListener('change', () => {
          params[f.k] = el.value;
          if (f.k === 'templeSize' && TEMPLE_SIZES[el.value]) params.templeLength = TEMPLE_SIZES[el.value];
          syncControls();
          regenerate();
        });
        row.sync = () => { el.value = params[f.k]; };
      } else if (f.type === 'text') {
        row.innerHTML = `<label for="f-${f.k}" ${hint}>${f.label}</label>
          <input type="text" id="f-${f.k}" maxlength="24" placeholder="ex. nom du magasin">`;
        const el = row.querySelector('input');
        el.addEventListener('input', () => { params[f.k] = el.value; regenerate(); });
        row.sync = () => { el.value = params[f.k] ?? ''; };
      } else {
        row.innerHTML = `
          <label for="f-${f.k}" ${hint}>${f.label}</label>
          <div class="inputs">
            <input type="range" id="r-${f.k}" min="${f.min}" max="${f.max}" step="${f.step}" aria-label="${f.label}">
            <input type="number" id="f-${f.k}" min="${f.min}" max="${f.max}" step="${f.step}">
            <span class="unit">${f.unit}</span>
          </div>`;
        const range = row.querySelector('input[type=range]');
        const num = row.querySelector('input[type=number]');
        const set = v => {
          if (!Number.isFinite(v)) return;
          params[f.k] = v;
          if (f.k === 'templeLength') params.templeSize = Object.keys(TEMPLE_SIZES).find(k => TEMPLE_SIZES[k] === v) ?? 'perso';
          syncControls();
          regenerate();
        };
        range.addEventListener('input', () => set(+range.value));
        num.addEventListener('change', () => set(+num.value));
        row.sync = () => { range.value = params[f.k] ?? ''; num.value = params[f.k] ?? ''; fillTrack(range); };
      }
      body.appendChild(row);
      rows.push(row);
    }
    if (grp.reset) {
      const btn = document.createElement('button');
      btn.className = 'small';
      btn.textContent = 'Cotes d’origine de la charnière';
      btn.addEventListener('click', () => {
        for (const k of HINGE_KEYS) params[k] = DEFAULTS[k];
        syncControls();
        regenerate();
      });
      body.appendChild(btn);
    }
    host.appendChild(det);
  }
}

// bloc « contour photo » : état + bouton d'ouverture de l'éditeur
function photoBlock() {
  const el = document.createElement('div');
  el.innerHTML = `<div class="photo-state"><span class="dot"></span><span class="txt"></span></div>
    <button class="small btn-icon" style="justify-content:center">${svg('photo')}<span class="lbl"></span></button>`;
  const btn = el.querySelector('button');
  btn.addEventListener('click', () => {
    if (!oma) return;
    openPhotoEditor({
      oma, dbl: params.dbl ?? oma.dbl, outline: params.faceOutline, edit: params.faceOutline ? photoEdit : null,
      onApply: ({ outline, dbl, edit }) => { params.faceOutline = outline; params.dbl = dbl; photoEdit = edit; refit = true; syncControls(); regenerate(); },
      onClear: () => { params.faceOutline = null; photoEdit = null; syncControls(); regenerate(); },
    });
  });
  el.sync = () => {
    const on = !!params.faceOutline;
    el.querySelector('.dot').classList.toggle('on', on);
    el.querySelector('.txt').textContent = on ? 'Contour dessiné sur la photo' : 'Dessin de l’atelier (cercles + pont)';
    el.querySelector('.lbl').textContent = on ? 'Modifier le contour' : 'Importer une photo de face';
    btn.disabled = !oma;
  };
  rows.push(el);
  return el;
}

// Met les champs à jour et grise ceux qui n'ont pas d'effet avec les choix actuels.
function syncControls() {
  for (const row of rows) {
    row.sync();
    if (!row.off) continue;
    const off = !!row.off(params);
    row.classList.toggle('off', off);
    row.querySelectorAll('input, select, button').forEach(el => { el.disabled = off; });
  }
}

async function loadFile(file) {
  try {
    const text = await file.text();
    oma = parseOMA(text);
    fileName = file.name.replace(/\.[^.]+$/, '');
    params.dbl = Number.isFinite(oma.dbl) ? oma.dbl : 18;
    params.faceOutline = null;
    photoEdit = null;
    refit = true;
    syncControls();
    $('#file-info').innerHTML = `<strong>${file.name}</strong>
      <div class="chips"><span class="chip">${oma.right.width.toFixed(1)} × ${oma.right.height.toFixed(1)}</span>
      <span class="chip">DBL ${oma.dbl ?? '?'}</span>${oma.job ? `<span class="chip">job ${oma.job}</span>` : ''}</div>
      ${oma.device ? `<div style="margin-top:4px">${oma.device}${oma.traceType ? ` · tracé ${oma.traceType}` : ''}</div>` : ''}`;
    $('#empty').hidden = true;
    regenerate();
  } catch (e) {
    $('#file-info').textContent = `Fichier illisible : ${e.message}`;
  }
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function setExportEnabled(on) {
  document.querySelectorAll('[data-export]').forEach(b => { b.disabled = !on; });
}

// Copie translatée d'un maillage.
function placed(arr, dx, dy, dz) {
  const pos = new Float32Array(arr.pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    pos[i] = arr.pos[i] + dx; pos[i + 1] = arr.pos[i + 1] + dy; pos[i + 2] = arr.pos[i + 2] + dz;
  }
  return { pos, idx: arr.idx };
}
function bbox(arr) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < arr.pos.length; i += 3)
    for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], arr.pos[i + k]); mx[k] = Math.max(mx[k], arr.pos[i + k]); }
  return { mn, mx };
}
// Pose l'objet sur le plateau (z min = 0) et le centre en x sur le plateau, bas à y0.
function onPlate(arr, y0, plate = 256) {
  const b = bbox(arr);
  return placed(arr, plate / 2 - (b.mn[0] + b.mx[0]) / 2, y0 - b.mn[1], -b.mn[2]);
}
// Rotation de 180° : autour de y (face à plat, avant contre le plateau) ou de x (branche gauche, intérieur dessus).
function turned(arr, axis) {
  const pos = new Float32Array(arr.pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    pos[i] = axis === 'y' ? -arr.pos[i] : arr.pos[i];
    pos[i + 1] = axis === 'x' ? -arr.pos[i + 1] : arr.pos[i + 1];
    pos[i + 2] = -arr.pos[i + 2];
  }
  return { pos, idx: arr.idx };
}

// Range les pièces les unes au-dessus des autres sur le plateau de la machine et renvoie le .3mf.
function plate3MF(parts, bed) {
  const items = [];
  let y = 8;
  for (const [name, arr] of parts) {
    const p = onPlate(arr, y, bed[0]);
    items.push({ name, ...p });
    y = bbox(p).mx[1] + 6;
  }
  return { blob: to3MF(items), fits: y - 6 <= bed[1] - 2 };
}
const facePart = () => ['Face', turned(result.faceArr, 'y')];
const templeParts = () => [
  [`Branche droite ${result.params.templeSize}`, result.templeRArr],
  [`Branche gauche ${result.params.templeSize}`, turned(result.templeLArr, 'x')],
];
const PART_SETS = {
  all: () => [...templeParts(), facePart()],
  face: () => [facePart()],
  temples: () => templeParts(),
};
const partsSuffix = () => ({ all: 'complet', face: 'face', temples: `branches_${result.params.templeSize}` })[$('#parts').value];

// ---------- impression : agent local (OrcaSlicer invisible sur le PC du magasin) ----------
const AGENT = 'http://127.0.0.1:47913';
let machines = {
  p1s: { label: 'Bambu Lab P1S', bed: [256, 256], output: 'gcode.3mf' },
  k1max: { label: 'Creality K1 Max', bed: [300, 300], output: 'gcode' },
};
let agentOk = false;
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* stockage indisponible */ } } };

function fillMachines() {
  const sel = $('#machine');
  const cur = sel.value || store.get('atelier.machine') || 'p1s';
  sel.innerHTML = Object.entries(machines).map(([id, m]) => `<option value="${id}">${m.label}</option>`).join('');
  sel.value = machines[cur] ? cur : Object.keys(machines)[0];
}
async function checkAgent() {
  let st = null;
  try {
    const r = await fetch(`${AGENT}/status`, { cache: 'no-store' });
    st = await r.json();
  } catch { /* agent absent */ }
  agentOk = !!(st && st.agent === 'atelier-monture' && st.orca);
  if (st?.machines && Object.keys(st.machines).length) { machines = st.machines; fillMachines(); }
  const b = $('#agent');
  b.classList.toggle('ok', agentOk);
  b.classList.toggle('off', !agentOk);
  b.querySelector('.lbl').textContent = agentOk ? 'Agent prêt' : 'Agent absent';
  b.title = agentOk ? `Agent d’impression ${st.version} connecté` : 'Installer l’agent d’impression';
}

async function printFile() {
  if (!result) return;
  const id = $('#machine').value, m = machines[id];
  const { blob, fits } = plate3MF(PART_SETS[$('#parts').value](), m.bed);
  if (!fits) $('#warnings').innerHTML += `<div>⚠ Les pièces dépassent le plateau de la ${m.label} : imprimez la face et les branches séparément.</div>`;
  if (!agentOk) { await checkAgent(); if (!agentOk) { $('#agent-dialog').showModal(); return; } }
  const btn = $('#print');
  btn.classList.add('busy'); btn.disabled = true;
  btn.querySelector('span').textContent = 'Découpe en cours…';
  try {
    const q = $('#quality').value;
    const r = await fetch(`${AGENT}/slice?machine=${id}&quality=${q}`, { method: 'POST', body: blob, headers: { 'Content-Type': 'application/octet-stream' } });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `erreur ${r.status}`);
    const ext = m.output === 'gcode.3mf' ? '.gcode.3mf' : '.gcode';
    download(await r.blob(), `${fileName || 'monture'}_${partsSuffix()}_${id}_${q}${ext}`);
    $('#status').textContent = `Fichier d’impression ${m.label} créé`;
  } catch (e) {
    $('#warnings').innerHTML += `<div>⚠ Fichier d’impression : ${e.message}</div>`;
  } finally {
    btn.classList.remove('busy'); btn.disabled = false;
    btn.querySelector('span').textContent = 'Fichier d’impression';
  }
}

// ---------- évènements ----------
$('#file').addEventListener('change', e => e.target.files[0] && loadFile(e.target.files[0]));
const drop = $('#drop');
['dragenter', 'dragover'].forEach(ev => document.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => document.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
document.addEventListener('drop', e => {
  const f = e.dataTransfer.files[0];
  if (f && !f.type.startsWith('image/')) loadFile(f);
});

$('#print').addEventListener('click', printFile);
$('#exp-3mf').addEventListener('click', () => {
  const m = machines[$('#machine').value];
  download(plate3MF(PART_SETS[$('#parts').value](), m.bed).blob, `${fileName || 'monture'}_${partsSuffix()}.3mf`);
});
$('#agent').addEventListener('click', () => { if (!agentOk) $('#agent-dialog').showModal(); else checkAgent(); });
$('#machine').addEventListener('change', e => store.set('atelier.machine', e.target.value));
$('#quality').value = store.get('atelier.quality') || 'rapide';
$('#quality').addEventListener('change', e => store.set('atelier.quality', e.target.value));
fillMachines();
checkAgent();
setInterval(checkAgent, 15000);
$('#reset').addEventListener('click', () => {
  Object.assign(params, DEFAULTS, { dbl: oma && Number.isFinite(oma.dbl) ? oma.dbl : DEFAULTS.dbl });
  params.templeText = '';
  syncControls();
  regenerate();
});
$('#parts-toggle').addEventListener('click', () => { showParts = !showParts; applyMaterials(); });

// légende des pièces et palette de matière
$('#legend').innerHTML = Object.values(PARTS).map(p => `<div><i style="--c:${p.color}"></i>${p.label}</div>`).join('');
for (const [name, hex] of MATIERES) {
  const b = document.createElement('button');
  b.title = name;
  b.style.setProperty('--sw', hex);
  b.classList.toggle('on', hex === matiere);
  b.addEventListener('click', () => {
    matiere = hex;
    $('#colors').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    applyMaterials();
  });
  $('#colors').appendChild(b);
}

// Cadre toute la monture selon une direction de vue.
const VIEWS = { 'v-front': [0, 0, 1], 'v-side': [-1, 0.05, 0], 'v-top': [0, 1, 0.35], 'v-3q': [-0.45, 0.3, 0.85] };
let currentView = 'v-3q';
function fitView(id = currentView) {
  currentView = id;
  const box = new THREE.Box3().setFromObject(group);
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  const radius = box.getSize(new THREE.Vector3()).length() / 2;
  const fov = (camera.fov * Math.PI) / 180;
  const fit = Math.min(fov, 2 * Math.atan(Math.tan(fov / 2) * camera.aspect));
  const dist = (radius / Math.sin(fit / 2)) * 0.95;
  const dir = new THREE.Vector3(...VIEWS[id]).normalize();
  camera.position.copy(center).addScaledVector(dir, dist);
  controls.target.copy(center);
}
for (const id of Object.keys(VIEWS)) $('#' + id).addEventListener('click', () => fitView(id));

buildControls();
syncControls();
setExportEnabled(false);
$('#status').textContent = 'Chargement du moteur 3D…';
Module().then(m => {
  m.setup();
  wasm = m;
  $('#status').textContent = 'Prêt · importez un fichier OMA';
  regenerate();
});

// ?oma=chemin/fichier.oma : charge directement un fichier (exemples, tests)
const demo = new URLSearchParams(location.search).get('oma');
if (demo) fetch(demo).then(res => res.blob()).then(b => loadFile(new File([b], demo.split('/').pop())));
