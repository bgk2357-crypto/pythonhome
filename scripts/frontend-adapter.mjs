import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
export function pythonAdapter() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const source = path.join(root, 'frontend');
  const replacements = new Map(['auth', 'data', 'runtime-config', 'auth/session', 'resource-data', 'member-store'].map(name => [path.join(root, 'app', name).replaceAll('\\', '/'), path.join(source, name === 'auth/session' ? 'session.ts' : name + '.ts')]));
  return { name: 'python-frontend-adapter', enforce: 'pre',
    resolveId(id, importer) {
      if (id === 'next/navigation') return path.join(source, 'navigation.ts');
      if (!importer || !id.startsWith('.')) return;
      return replacements.get(path.resolve(path.dirname(importer.split('?')[0]), id).replaceAll('\\', '/').replace(/\.(tsx?|jsx?)$/, ''));
    },
    async load(id) {
      if (id.replaceAll('\\', '/') !== path.join(root, 'app/components.tsx').replaceAll('\\', '/')) return;
      const code = await readFile(id, 'utf8');
      if (!code.includes('export async function Header()') || !code.includes('const user = await getUser();')) throw Error('Header adapter needs updating');
      return code.replace('export async function Header()', 'export function Header()').replace('const user = await getUser();', 'const user = getUser();');
    },
  };
}
