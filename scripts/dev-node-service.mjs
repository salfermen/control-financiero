// Modo desarrollo para servicios Node compilados con tsc (API y worker).
// Compila en modo watch y reinicia el proceso cuando cambia dist/. Multiplataforma
// (Windows, macOS, Linux) y sin dependencias: NestJS necesita los metadatos de
// decoradores que emite tsc, por eso no se usa tsx/esbuild.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const cwd = process.cwd();
const require = createRequire(path.join(cwd, 'package.json'));
const tsc = require.resolve('typescript/bin/tsc');
const entry = path.join(cwd, 'dist', 'main.js');

const children = [];
const run = (args, label) => {
  const child = spawn(process.execPath, args, { cwd, stdio: 'inherit' });
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) console.error(`[dev] ${label} terminó con código ${code}`);
  });
  children.push(child);
  return child;
};

run([tsc, '-p', 'tsconfig.build.json', '--watch', '--preserveWatchOutput'], 'tsc');

const waitForBuild = () =>
  new Promise((resolve) => {
    const timer = setInterval(() => {
      if (existsSync(entry)) {
        clearInterval(timer);
        resolve();
      }
    }, 500);
  });

await waitForBuild();
run(['--enable-source-maps', '--watch-path=dist', entry], 'servicio');

const stop = () => {
  for (const child of children) child.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
