#!/usr/bin/env node
import { existsSync, copyFileSync, mkdirSync } from 'node:fs';

const source = '.env.example';
const target = 'apps/web/.env.local';

if (!existsSync(source)) {
  console.error(`Missing ${source}`);
  process.exit(1);
}

if (existsSync(target)) {
  console.log(`${target} already exists. Nothing changed.`);
  process.exit(0);
}

mkdirSync('apps/web', { recursive: true });
copyFileSync(source, target);
console.log(`Created ${target} from ${source}.`);
console.log('Next: fill in the Supabase values, then run: npm run setup:check');
