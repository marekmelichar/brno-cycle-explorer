import type { RouteRequest, RouteResponse, RoutingEngineInfo } from '@bce/shared';
import { RoutingError, type RoutingProvider } from './types';

const LABELS: Record<string, string> = {
  brouter: 'BRouter (profily pro klidnou jízdu)',
  valhalla: 'Valhalla',
};

/** Several routing engines behind one API; the request picks one with `engine`, else the first. */
export class MultiRoutingProvider implements RoutingProvider {
  readonly id: string;
  readonly available: boolean;

  constructor(private readonly engines: RoutingProvider[]) {
    this.id = engines.map((e) => e.id).join('+') || 'none';
    this.available = engines.some((e) => e.available);
  }

  get description() {
    return this.engines.map((e) => e.description).join(' · ');
  }

  get attribution() {
    return this.engines.map((e) => e.attribution).join(' · ');
  }

  get defaultEngine(): string | null {
    return this.engines[0]?.id ?? null;
  }

  get engineInfo(): RoutingEngineInfo[] {
    return this.engines.map((e) => ({ id: e.id, label: LABELS[e.id] ?? e.id, description: e.description, attribution: e.attribution }));
  }

  route(req: RouteRequest): Promise<RouteResponse> {
    const id = req.engine ?? this.defaultEngine;
    const engine = this.engines.find((e) => e.id === id);
    if (!engine) return Promise.reject(new RoutingError(`Neznámý směrovač: ${id}`, 400));
    return engine.route(req);
  }
}
