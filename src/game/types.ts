export interface Vec { x: number; y: number; }

export interface Route {
  id: string;
  points: Vec[];
  length: number;
}

export type SignalState = 'red' | 'green';

export interface Signal {
  id: string;
  x: number;
  y: number;
  state: SignalState;
  /** Simulation time when the aspect last changed (for visible dwell). */
  changedAt: number;
  /** Which route(s) this signal protects. */
  routes: string[];
  label: string;
}

/** waiting: at the holding signal. approaching: entering a platform.
 *  docked: at the platform. departing: leaving the station. */
export type TrainState = 'waiting' | 'approaching' | 'docked' | 'departing';

export interface Car {
  kind: 'loco' | 'coach' | 'wagon';
  offset: number;
  length: number;
}

export interface Train {
  id: string;
  name: string;
  state: TrainState;
  direction: 'west' | 'east';
  routeId: string;
  progress: number;
  holdProgress: number;
  speed: number;
  maxSpeed: number;
  cars: Car[];
  length: number;
  color: number;
  platform: number | null;
  dwellTimer: number;
  freight: boolean;
  blocked: boolean;
  exitLocked: boolean;
}

export interface Track {
  id: string;
  points: Vec[];
  kind: 'main' | 'platform';
}
