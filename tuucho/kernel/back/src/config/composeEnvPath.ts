import { join, resolve } from 'node:path';

/**
 * Shop-generated Docker Compose env file (POSTGRES_*).
 * Lives under `paths.outputDir` / `OUTPUT_DIR` (default `<shopRoot>/output`),
 * never under `tuucho/`. Apply and pack updates must not touch this path.
 */
export function composeEnvFile(shopRoot: string): string {
  const raw = process.env.OUTPUT_DIR?.trim();
  const outputDir = raw ? resolve(shopRoot, raw) : join(shopRoot, 'output');
  return join(outputDir, 'docker', '.compose.env');
}
