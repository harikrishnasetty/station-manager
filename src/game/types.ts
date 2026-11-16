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
  /** Which route(s) this signal protects. */
  routes: string[];
  label: string;
}

export type TrainPhase = 'approach' | 'dwell' | 'depart' | 'waiting';

export interface Car {
  kind: 'loco' | 'coach' | 'wagon';
  offset: number;
  length: number;
}

export interface Train {
  id: string;
  name: string;
  phase: TrainPhase;
  direction: 'west' | 'east';
  routeId: string;
  progress: number;
  speed: number;
  maxSpeed: number;
  cars: Car[];
  length: number;
  color: number;
  platform: number | null;
  dwellTimer: number;
  freight: boolean;
  arrived: boolean;
}

export interface Track {
  id: string;
  points: Vec[];
  kind: 'main' | 'platform';
}
