const fs = require('fs');
const path = require('path');

function readFile(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch (e) {
    console.error(`Could not read ${p}: ${e.message}`);
    process.exit(3);
  }
}

function parsePoints(source) {
  // Match POINTS = { ... } (const or export const)
  const m = source.match(/\bPOINTS\s*=\s*{([\s\S]*?)}/);
  if (!m) return null;
  const body = m[1];
  const obj = {};
  const re = /([A-Z0-9_]+)\s*:\s*([0-9]+)/g;
  let r;
  while ((r = re.exec(body)) !== null) {
    obj[r[1]] = Number(r[2]);
  }
  return obj;
}

function equal(a, b) {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  if (ka.length !== kb.length) return false;
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] !== kb[i]) return false;
    if (a[ka[i]] !== b[kb[i]]) return false;
  }
  return true;
}

(function main(){
  const repoRoot = process.cwd();
  const backendPath = path.join(repoRoot, 'supabase/functions/family-api/index.ts');
  const frontendPath = path.join(repoRoot, 'apps/shared/config.js');

  const backendSrc = readFile(backendPath);
  const backendPoints = parsePoints(backendSrc);
  if (!backendPoints) {
    console.log('No POINTS found in backend (supabase/functions/family-api/index.ts). Nothing to compare.');
    process.exit(0);
  }

  let frontendSrc = null;
  try { frontendSrc = readFile(frontendPath); } catch (e) { /* handled below */ }
  const frontendPoints = frontendSrc ? parsePoints(frontendSrc) : null;

  if (!frontendPoints) {
    console.log('No POINTS object found in apps/shared/config.js. Consider adding a POINTS object there to keep frontend in sync with backend.');
    console.log('Backend POINTS:', JSON.stringify(backendPoints, null, 2));
    process.exit(0);
  }

  if (!equal(backendPoints, frontendPoints)) {
    console.error('Mismatch detected between backend POINTS and frontend POINTS.');
    console.error('Backend POINTS:', JSON.stringify(backendPoints, null, 2));
    console.error('Frontend POINTS:', JSON.stringify(frontendPoints, null, 2));
    process.exit(2);
  }

  console.log('POINTS match between backend and frontend.');
  process.exit(0);
})();
