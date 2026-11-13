import fs from 'fs';
import path from 'path';

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    if (file === 'node_modules' || file === '.git') continue;
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat && stat.isDirectory()) results = results.concat(walk(full));
    else if (file.endsWith('.js') || file.endsWith('.jsx')) results.push(full);
  }
  return results;
}

const files = walk('backend');
const mismatches = [];

for (const f of files) {
  const content = fs.readFileSync(f, 'utf8');
  const importRegex = /(?:from\s+['"](\.[^'"]+)['"])|(?:import\s+['"](\.[^'"]+)['"])/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const rel = match[1] || match[2];
    let resolved = path.resolve(path.dirname(f), rel);
    if (!path.extname(resolved)) {
      if (fs.existsSync(resolved + '.js')) resolved += '.js';
      else if (fs.existsSync(resolved + '/index.js')) resolved = path.join(resolved, 'index.js');
    }
    const targetDir = path.dirname(resolved);
    const targetBase = path.basename(resolved);
    if (!fs.existsSync(targetDir)) {
      mismatches.push({ file: f, import: rel, error: 'Dir not found' });
      continue;
    }
    const realFiles = fs.readdirSync(targetDir);
    const exact = realFiles.find(name => name === targetBase);
    const caseMatch = realFiles.find(name => name.toLowerCase() === targetBase.toLowerCase());
    if (!exact && caseMatch) {
      mismatches.push({ file: f, import: rel, expected: caseMatch });
    } else if (!exact && !caseMatch) {
      mismatches.push({ file: f, import: rel, error: 'Not found' });
    }
  }
}

console.log(JSON.stringify(mismatches, null, 2));

