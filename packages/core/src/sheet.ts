// Sheets live in content/sheets/<id>.yaml. A sheet may `extends:` another and override any of its
// top-level fields (the deep-time world sheet is the world sheet with an earlier window).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';
import { Sheet } from './schema.ts';

export function loadSheet(root: string, id: string): Sheet {
  const raw = (sid: string): Record<string, unknown> => {
    const own = YAML.parse(readFileSync(join(root, `content/sheets/${sid}.yaml`), 'utf8')) as Record<string, unknown>;
    if (typeof own.extends !== 'string') return own;
    const { extends: base, ...rest } = own;
    return { ...raw(base as string), ...rest };
  };
  return Sheet.parse(raw(id));
}
