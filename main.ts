import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { solve } from './solve.js';

const input = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const output = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

for (const id of readdirSync(input).sort()) {
  const level = readFileSync(join(input, id, 'level.txt'), 'utf8');
  const answer = solve(level);
  mkdirSync(join(output, id), { recursive: true });
  writeFileSync(join(output, id, 'solution.txt'), answer + '\n');
}
