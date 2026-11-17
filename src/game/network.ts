import type { Route, Signal, Track, Vec } from './types';

export const W = 1280;
export const H = 720;

export const PLATFORM_Y = [160, 280, 400, 520];
export const PLATFORM_X0 = 360;
export const PLATFORM_X1 = 920;
export const PLATFORM_MID = (PLATFORM_X0 + PLATFORM_X1) / 2;
export const JUNC_W = 260;
export const JUNC_E = 1020;
export const MAIN_Y = 340;
export const MAIN_IN_Y = 328;
export const MAIN_OUT_Y = 352;
/** Where arriving trains wait, visibly, before a platform is assigned. */
export const HOLD_PROGRESS = 170;

function dist(a: Vec, b: Vec): number { return Math.hypot(b.x - a.x, b.y - a.y); }
function len(pts: Vec[]): number {
  let t = 0;
  for (let i = 1; i < pts.length; i++) t += dist(pts[i - 1], pts[i]);
  return t;
}

function route(id: string, points: Vec[]): Route {
  return { id, points, length: len(points) };
}

/** Build all routes. Each platform has arrival + departure in both directions. */
export function buildNetwork(): { routes: Route[]; signals: Signal[]; tracks: Track[] } {
  const routes: Route[] = [];
  const tracks: Track[] = [];

  // Two main lines: arrival (upper) and departure (lower), so opposing trains never meet head-on.
  tracks.push({ id: 'main-in', kind: 'main', points: [{ x: 0, y: MAIN_IN_Y }, { x: JUNC_W, y: MAIN_IN_Y }, { x: JUNC_E, y: MAIN_IN_Y }, { x: W, y: MAIN_IN_Y }] });
  tracks.push({ id: 'main-out', kind: 'main', points: [{ x: 0, y: MAIN_OUT_Y }, { x: JUNC_W, y: MAIN_OUT_Y }, { x: JUNC_E, y: MAIN_OUT_Y }, { x: W, y: MAIN_OUT_Y }] });

  for (let i = 0; i < 4; i++) {
    const y = PLATFORM_Y[i];
    tracks.push({ id: `p${i}`, kind: 'platform', points: [{ x: PLATFORM_X0, y }, { x: PLATFORM_X1, y }] });

    // West -> platform i (arrives on upper main)
    routes.push(route(`w2p${i}`, [
      { x: -40, y: MAIN_IN_Y },
      { x: JUNC_W, y: MAIN_IN_Y },
      { x: PLATFORM_X0, y },
      { x: PLATFORM_MID, y },
    ]));
    // East -> platform i (arrives on upper main)
    routes.push(route(`e2p${i}`, [
      { x: W + 40, y: MAIN_IN_Y },
      { x: JUNC_E, y: MAIN_IN_Y },
      { x: PLATFORM_X1, y },
      { x: PLATFORM_MID, y },
    ]));
    // Platform i -> east (departs on lower main)
    routes.push(route(`p${i}2e`, [
      { x: PLATFORM_MID, y },
      { x: PLATFORM_X1, y },
      { x: JUNC_E, y: MAIN_OUT_Y },
      { x: W + 40, y: MAIN_OUT_Y },
    ]));
    // Platform i -> west (departs on lower main)
    routes.push(route(`p${i}2w`, [
      { x: PLATFORM_MID, y },
      { x: PLATFORM_X0, y },
      { x: JUNC_W, y: MAIN_OUT_Y },
      { x: -40, y: MAIN_OUT_Y },
    ]));
  }

  // Signals are the controls: the main signals govern entry from each side,
  // each platform has an ENTRY signal at each end (which platform a waiting
  // train is routed to) and an EXIT signal at each end (which way it leaves).
  const signals: Signal[] = [
    { id: 'sig-w', x: JUNC_W - 30, y: MAIN_IN_Y, state: 'red', routes: [], label: 'W' },
    { id: 'sig-e', x: JUNC_E + 30, y: MAIN_IN_Y, state: 'red', routes: [], label: 'E' },
  ];
  for (let i = 0; i < 4; i++) {
    const y = PLATFORM_Y[i];
    // Left end: entry for west-arrivals, exit for west-departures.
    signals.push({ id: `sig-p${i}-in-w`, x: PLATFORM_X0 - 48, y, state: 'red', routes: [], label: `IN${i + 1}W` });
    signals.push({ id: `sig-p${i}-out-w`, x: PLATFORM_X0 - 16, y, state: 'red', routes: [`p${i}2w`], label: `OUT${i + 1}W` });
    // Right end: exit for east-departures, entry for east-arrivals.
    signals.push({ id: `sig-p${i}-out-e`, x: PLATFORM_X1 + 16, y, state: 'red', routes: [`p${i}2e`], label: `OUT${i + 1}E` });
    signals.push({ id: `sig-p${i}-in-e`, x: PLATFORM_X1 + 48, y, state: 'red', routes: [], label: `IN${i + 1}E` });
  }

  return { routes, signals, tracks };
}

export function pointAt(points: Vec[], d: number): Vec {
  if (points.length < 2) return points[0] ?? { x: 0, y: 0 };
  const total = len(points);
  let rem = Math.max(0, Math.min(d, total));
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const seg = dist(a, b);
    if (rem <= seg || i === points.length - 1) {
      const t = seg === 0 ? 0 : rem / seg;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    rem -= seg;
  }
  return points[points.length - 1];
}

export function angleAt(points: Vec[], d: number): number {
  const a = pointAt(points, Math.max(0, d - 2));
  const b = pointAt(points, Math.min(len(points), d + 2));
  return Math.atan2(b.y - a.y, b.x - a.x);
}
