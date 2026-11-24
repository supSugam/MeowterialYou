import * as esbuild from 'esbuild';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

const DIST_DIR = path.resolve('dist');

async function build() {
  console.log('Building MeowterialYou TypeScript extension...');

  // Ensure clean dist directory
  if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(DIST_DIR, { recursive: true });

  // Bundle extension.ts, prefs.ts, and cli.ts
  await esbuild.build({
    entryPoints: {
      extension: 'src/extension.ts',
      prefs: 'src/prefs.ts',
      cli: 'src/cli.ts',
    },
    outdir: 'dist',
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    external: [
      'gi://*',
      'resource://*',
      'system',
      'gettext',
      'cairo',
      'console',
    ],
    sourcemap: false,
    minify: false,
  });

  // Copy static assets
  fs.copyFileSync('metadata.json', path.join(DIST_DIR, 'metadata.json'));
  fs.copyFileSync('stylesheet.css', path.join(DIST_DIR, 'stylesheet.css'));

  // Copy schemas and compile
  fs.cpSync('schemas', path.join(DIST_DIR, 'schemas'), { recursive: true });
  execSync(`glib-compile-schemas "${path.join(DIST_DIR, 'schemas')}"`);

  // Copy templates and icon templates
  fs.cpSync('data', path.join(DIST_DIR, 'data'), { recursive: true });

  // Copy extension symbolic icons
  if (fs.existsSync('icons')) {
    fs.cpSync('icons', path.join(DIST_DIR, 'icons'), { recursive: true });
  }

  console.log('Build completed successfully -> dist/');
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
