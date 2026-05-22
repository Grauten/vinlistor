// Minimal .env loader (no dependency). Import this first in entrypoints.
// Reads ../../.env and sets process.env for keys not already defined.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
try {
  const raw = await readFile(join(here, '..', '..', '.env'), 'utf8')
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    const key = m[1]
    let val = m[2].trim().replace(/^["']|["']$/g, '')
    if (val && process.env[key] === undefined) process.env[key] = val
  }
} catch {
  // No .env — rely on real environment variables.
}
