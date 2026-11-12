// Plateau placé à la main (face en haut à droite, branche tournée de 90°) : vérifie qu'OrcaSlicer garde les positions.
import Module from 'manifold-3d';
import fs from 'fs';
import { parseOMA } from '../src/oma.js';
import { buildFrame } from '../src/frame.js';
import { meshToArrays, to3MF } from '../src/export.js';
import { placeParts } from '../src/plate.js';
const [, , omaPath, out] = process.argv;
const wasm = await Module(); wasm.setup();
const r = buildFrame(wasm, parseOMA(fs.readFileSync(omaPath, 'latin1')), {});
const flipY = a => ({ pos: a.pos.map((v, i) => (i % 3 === 1 ? v : -v)), idx: a.idx });
const parts = [['Face', flipY(meshToArrays(r.face))], ['Branche droite', meshToArrays(r.templeR)]];
const layout = { Face: { x: 170, y: 190, a: 0 }, 'Branche droite': { x: 30, y: 128, a: 90 } };
fs.writeFileSync(out, Buffer.from(await to3MF(placeParts(parts, layout, [256, 256])).arrayBuffer()));
console.log('attendu : face centrée en x=170 y=190, branche verticale centrée en x=30 y=128');
