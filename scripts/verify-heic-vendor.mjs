import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const vendor = new URL('../admin.vendor/', import.meta.url);
const hashes = JSON.parse(await readFile(new URL('SHA256SUMS.json', vendor), 'utf8'));
for (const [name, expected] of Object.entries(hashes)) {
  const actual = createHash('sha256').update(await readFile(new URL(name, vendor))).digest('hex');
  assert.equal(actual, expected, `Vendored HEIC file changed: ${name}`);
}
const library = await readFile(new URL('libheif-1.23.5.js', vendor), 'utf8');
assert.ok(!/\beval\s*\(|\bnew\s+Function\s*\(/.test(library), 'Decoder must remain the CSP build');
console.log(`Verified ${Object.keys(hashes).length} pinned HEIC vendor files.`);
