#!/usr/bin/env node
// Checks the app prerequisites. Docker is only required for the optional local Supabase stack.
import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

let failed = false;
const ok = (m) => console.log(`  OK   ${m}`);
const bad = (m) => { failed = true; console.log(`  FAIL ${m}`); };
const warn = (m) => console.log(`  INFO ${m}`);

const major = Number(process.versions.node.split('.')[0]);
major >= 20 ? ok(`Node ${process.versions.node}`) : bad(`Node 20+ required (found ${process.versions.node})`);

try { ok(`npm ${execSync('npm --version', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()}`); }
catch { bad('npm not found'); }

const envFile = 'apps/web/.env.local';
if (!existsSync(envFile)) {
  bad(`${envFile} is missing. Run: npm run setup`);
} else {
  const env = Object.fromEntries(
    readFileSync(envFile, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.trim() && !l.trim().startsWith('#') && l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
  );

  for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
    const value = env[key];
    if (!value || value.startsWith('replace-with')) bad(`${key} is not configured in ${envFile}`);
    else ok(`${key} is configured`);
  }

  if (env.NEXT_PUBLIC_SUPABASE_URL?.includes('127.0.0.1') || env.NEXT_PUBLIC_SUPABASE_URL?.includes('localhost')) {
    try { ok(`Docker ${execSync('docker --version', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()}`); }
    catch { bad('Docker Desktop is required because your Supabase URL is local'); }
  } else {
    warn('Using hosted Supabase; Docker is not required to run the web app.');
  }
}

if (failed) {
  console.log('\nFix the items marked FAIL, then run: npm run setup:check');
  process.exit(1);
}
console.log('\nSetup looks good. Start the app with: npm run dev');
