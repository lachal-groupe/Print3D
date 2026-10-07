// Contour de face dessiné (photo) : génère toutes les combinaisons utiles et vérifie qu'on obtient
// une seule pièce valide, sans avertissement.
import Module from 'manifold-3d';
import fs from 'fs';
import { parseOMA } from '../src/oma.js';
import { buildFrame } from '../src/frame.js';
const wasm = await Module(); wasm.setup();
const dir = process.env.USERPROFILE + '/Downloads/fichier_oma/';
let bad = 0, n = 0;
for (const f of fs.readdirSync(dir)) {
  const oma = parseOMA(fs.readFileSync(dir + f, 'latin1'));
  // contour type « œil de chat » autour des deux verres, pont et tenons compris
  const W = oma.right.width + (oma.dbl || 18) / 2, H = oma.right.height / 2;
  const half = [[0, H + 1], [-W * 0.5, H + 3], [-W - 3, H + 4], [-W - 5, 2], [-W - 1, -H - 1], [-W * 0.5, -H - 4], [-9, -H + 2], [-6, -4], [0, -1]];
  const outline = [...half, ...half.slice(1, -1).reverse().map(([x, y]) => [-x, y])];
  for (const o of [{}, { hingeMode: 'face' }, { pads: 'aucune' }]) {
    n++;
    const r = buildFrame(wasm, oma, { ...o, faceOutline: outline });
    const k = r.face.decompose().length;
    if (k !== 1 || r.face.status() !== 'NoError' || r.warnings.length) { bad++; console.log('PB', f, JSON.stringify(o), k, r.warnings); }
    r.face.delete(); r.templeR.delete(); r.templeL.delete();
  }
}
console.log('contour dessiné :', n - bad, '/', n, 'valides');
