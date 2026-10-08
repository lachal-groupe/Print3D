// Vérifie que les trous de vis existent bien (volume retiré ≈ π r² × longueur) sur le tenon et les branches.
import Module from 'manifold-3d';
import fs from 'fs';
import { parseOMA } from '../src/oma.js';
import { buildFrame, DEFAULTS } from '../src/frame.js';
const wasm = await Module(); wasm.setup();
const oma = parseOMA(fs.readFileSync(new URL('../exemples/823-7.oma', import.meta.url), 'latin1'));
const vol = o => { const r = buildFrame(wasm, oma, o); const v = [r.face.volume(), r.templeR.volume(), r.templeL.volume()]; r.face.delete(); r.templeR.delete(); r.templeL.delete(); return v; };
const plein = vol({ tenonScrewD: 0.01, templeScrewD: 0.01 });
const perce = vol({});
const d = DEFAULTS.tenonScrewD;
console.log(`Ø ${d} mm : retiré face ${(plein[0] - perce[0]).toFixed(2)} mm³ (2 vis), branche D ${(plein[1] - perce[1]).toFixed(2)}, G ${(plein[2] - perce[2]).toFixed(2)} mm³`);
console.log(`attendu ≈ ${(Math.PI * (d / 2) ** 2 * (DEFAULTS.tenonScrewLen + 0.3) * 2).toFixed(2)} (face) et ≈ ${(Math.PI * (d / 2) ** 2 * (DEFAULTS.templeScrewLen + 0.3)).toFixed(2)} (branche)`);
