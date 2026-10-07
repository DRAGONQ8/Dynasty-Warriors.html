import {readFile, writeFile, readdir, mkdir} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Script} from 'node:vm';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fragments = (await readdir(resolve(root, 'src'))).filter(name => /^\d+-.+\.js$/.test(name)).sort();
const game = (await Promise.all(fragments.map(name => readFile(resolve(root, 'src', name), 'utf8')))).join('\n');
new Script(game, {filename: 'rift-code.js'});
const [template, styles] = await Promise.all(['template.html', 'styles.css'].map(name => readFile(resolve(root, 'src', name), 'utf8')));
let html = template.replace('{{STYLES}}', () => styles).replace('{{GAME}}', () => game);
const vendor = await readFile(resolve(root, 'vendor/babylon.js'), 'utf8');
html = html.replace('<script src="vendor/babylon.js"></script>', () => '<script>' + vendor + '</script>');
await writeFile(resolve(root, 'index.html'), html);
if (process.argv.includes('--standalone')) {
  await mkdir(resolve(root, 'dist'), {recursive: true});
  await writeFile(resolve(root, 'dist/riftbanner.html'), html);
}
console.log(`Built index.html from ${fragments.length} source fragments${process.argv.includes('--standalone') ? ' and dist/riftbanner.html' : ''}.`);
