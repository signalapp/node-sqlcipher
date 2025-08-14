import { join } from 'node:path';
import requireAddon from 'require-addon';
import { fileURLToPath } from 'node:url';

// esbuild is configured to replace:
// - `import.meta.url` => `undefined` for CJS
// - `__dirname` => `undefined` for ESM
const ROOT_DIR = import.meta.url
  ? fileURLToPath(new URL('..', import.meta.url))
  : join(__dirname, '..');

export default requireAddon('.', ROOT_DIR);
