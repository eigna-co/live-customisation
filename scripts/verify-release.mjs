import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
const tests = readdirSync(new URL('../test/', import.meta.url)).filter(file => file.endsWith('.test.js')).sort().map(file => `test/${file}`);
for (const args of [['--test', '--test-isolation=none', ...tests], ['scripts/build-firebase.mjs'], ['scripts/build.mjs']]) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', cwd: new URL('../', import.meta.url), shell: false });
  if (result.error || result.status !== 0) {
    console.error('Release verification failed; nothing was deployed.');
    process.exit(result.status || 1);
  }
}
console.log('Tests and both production builds passed. This check does not publish anything.');
