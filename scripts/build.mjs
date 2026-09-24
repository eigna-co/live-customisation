import { build } from 'esbuild';

await build({
  entryPoints: ['src/app.jsx'],
  outfile: 'app.js',
  bundle: true,
  minify: true,
  sourcemap: false,
  legalComments: 'none',
  define: {
    'process.env.NODE_ENV': '"production"',
  },
});
