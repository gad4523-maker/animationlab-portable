import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
await build({
  absWorkingDir: root, entryPoints: ['rigby/pixi.mjs'], outfile: 'dist/pixi.mjs',
  bundle: true, minify: true, format: 'esm', platform: 'browser', legalComments: 'linked',
});
await build({
  absWorkingDir: root, entryPoints: ['rigby/probe-pixi.mjs'], outfile: 'dist/probe-pixi.js',
  bundle: true, minify: true, format: 'iife', platform: 'browser', legalComments: 'linked',
});
