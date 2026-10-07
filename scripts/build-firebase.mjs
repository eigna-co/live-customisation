import { build } from 'esbuild';
import { mkdir, copyFile, cp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = fileURLToPath(new URL('../dist/', import.meta.url));
// Only this generated output directory is cleaned; source files are untouched.
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await build({
  absWorkingDir: root,
  entryPoints: ['src/app.jsx'],
  outfile: 'dist/app.js',
  bundle: true,
  minify: true,
  sourcemap: false,
  legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"' },
});
// Explicit public assets only: never publish source, credentials or functions.
await copyFile(new URL('../index.html', import.meta.url), new URL('../dist/index.html', import.meta.url));
await cp(new URL('../images/', import.meta.url), new URL('../dist/images/', import.meta.url), { recursive: true });
