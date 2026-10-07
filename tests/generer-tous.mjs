import Module from 'manifold-3d';
import fs from 'fs';
import { parseOMA } from '../src/oma.js';
import { buildFrame } from '../src/frame.js';
const wasm = await Module(); wasm.setup();
const dir = process.env.USERPROFILE + '/Downloads/fichier_oma/';
for (const f of fs.readdirSync(dir)) {
  const t0 = Date.now();
  try {
    const oma = parseOMA(fs.readFileSync(dir + f, 'latin1'));
    const r = buildFrame(wasm, oma);
    const b = r.face.boundingBox();
    console.log(f, 'dbl', oma.dbl, 'face', r.face.status(), 'vol', r.face.volume().toFixed(0), 'genus', r.face.genus(), 'tris', r.face.numTri(),
      'bbox', b.min.map(v=>v.toFixed(1)).join(','), '/', b.max.map(v=>v.toFixed(1)).join(','),
      'branches', r.templeR.volume().toFixed(0), r.templeL.volume().toFixed(0), r.templeR.genus(), r.templeL.status(), (Date.now()-t0)+'ms');
  r.face.delete(); r.templeR.delete(); r.templeL.delete();
  } catch (e) { console.log(f, 'ERREUR', e.message, e.stack); }
}
