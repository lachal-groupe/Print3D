// Fabrique un plateau .3mf de test (face à plat + deux branches), disposé comme dans le site.
import Module from 'manifold-3d';
import fs from 'fs';
import { parseOMA } from '../src/oma.js';
import { buildFrame } from '../src/frame.js';
import { meshToArrays, to3MF } from '../src/export.js';
const [, , omaPath, out, bedW = '256'] = process.argv;
const wasm = await Module(); wasm.setup();
const r = buildFrame(wasm, parseOMA(fs.readFileSync(omaPath, 'latin1')), {});
const turned = (a, axis) => {
  const pos = new Float32Array(a.pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    pos[i] = axis === 'y' ? -a.pos[i] : a.pos[i];
    pos[i + 1] = axis === 'x' ? -a.pos[i + 1] : a.pos[i + 1];
    pos[i + 2] = -a.pos[i + 2];
  }
  return { pos, idx: a.idx };
};
const bbox = a => {
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let i = 0; i < a.pos.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], a.pos[i + k]); mx[k] = Math.max(mx[k], a.pos[i + k]); }
  return { mn, mx };
};
const parts = [['Branche droite', meshToArrays(r.templeR)], ['Branche gauche', turned(meshToArrays(r.templeL), 'x')], ['Face', turned(meshToArrays(r.face), 'y')]];
let y = 8; const items = [];
for (const [name, a] of parts) {
  const b = bbox(a), dx = +bedW / 2 - (b.mn[0] + b.mx[0]) / 2, dy = y - b.mn[1], dz = -b.mn[2];
  const pos = a.pos.map((v, i) => v + [dx, dy, dz][i % 3]);
  items.push({ name, pos, idx: a.idx });
  y = bbox({ pos }).mx[1] + 6;
}
fs.writeFileSync(out, Buffer.from(await to3MF(items).arrayBuffer()));
console.log('plateau', out, 'hauteur occupée', y.toFixed(0), 'mm');
