// Sheets live in content/sheets/<id>.yaml.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';
import { Sheet } from './schema.ts';

export function loadSheet(root: string, id: string): Sheet {
  return Sheet.parse(YAML.parse(readFileSync(join(root, `content/sheets/${id}.yaml`), 'utf8')));
}
