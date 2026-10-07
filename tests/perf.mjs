import Module from 'manifold-3d';
import fs from 'fs';
import { parseOMA } from '../src/oma.js';
import { buildFrame } from '../src/frame.js';
const wasm = await Module(); wasm.setup();
const oma = parseOMA(fs.readFileSync(new URL('../exemples/109530.oma', import.meta.url), 'latin1'));
// un « R » grossier en polygone pour tester la gravure
const letter = [[[0, 0], [1, 0], [1, 2], [2, 0], [3, 0], [2, 2.2], [3, 3], [3, 4], [0, 4]]];
const cases = [
  {},
  { doubleBridge: 'oui', pads: 'aucune', hingeMode: 'face' },
  { templeStyle: 'olive', templeTilt: 'penchee', cordHole: 'grand', textPolys: letter, sizePolys: letter },
  { templeStyle: 'triangulaire', tenonWidth: 15 },
  { templeStyle: 'retro', templeTilt: 'penchee', cordHole: 'petit' },
  { templeStyle: 'large' },
];
for (const opts of cases) {
  const t = Date.now();
  const r = buildFrame(wasm, oma, opts);
  const st = [r.face.status(), r.templeR.status(), r.templeL.status()];
  const lbl = JSON.stringify(Object.fromEntries(Object.entries(opts).filter(([k]) => !k.endsWith('Polys'))));
  console.log(lbl, Date.now() - t, 'ms', st.join(','), 'genre face', r.face.genus(), 'branches', r.templeR.genus(), r.templeL.genus(),
    'vol', r.face.volume().toFixed(0), r.templeR.volume().toFixed(0), r.templeL.volume().toFixed(0), r.warnings.join('|'));
  r.face.delete(); r.templeR.delete(); r.templeL.delete();
}
