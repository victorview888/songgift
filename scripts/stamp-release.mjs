import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

// Workers Builds supplies the checked-out revision. Local builds use Git.
let sha = process.env.WORKERS_CI_COMMIT_SHA || '';
if (!/^[a-f0-9]{40}$/i.test(sha)) {
  try { sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { sha = ''; }
}
const file = 'dist/server/wrangler.json';
const config = JSON.parse(await readFile(file, 'utf8'));
if (/^[a-f0-9]{40}$/i.test(sha)) {
  config.vars = { ...config.vars, SONGGIFT_RELEASE_SHA: sha.toLowerCase() };
  await writeFile(file, JSON.stringify(config));
  console.log('Release revision: ' + sha.toLowerCase());
} else {
  console.log('Release revision unavailable; system status will show 未上报.');
}
