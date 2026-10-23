import type { DisplayList } from '../../../packages/render/src/displaylist.ts';
import { Viewer } from './viewer.ts';

const CHART_URL = '/chart/proof-east-asia.json';

const dl: DisplayList = await fetch(CHART_URL).then((r) => r.json());
document.title = `Mappa Temporis — ${dl.title}`;
const viewer = new Viewer(document.getElementById('view') as HTMLCanvasElement, dl, CHART_URL, document.getElementById('status')!);
// Handy for debugging from the console.
(window as unknown as { viewer: Viewer }).viewer = viewer;
