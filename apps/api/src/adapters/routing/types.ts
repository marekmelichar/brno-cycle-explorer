import type { RouteRequest, RouteResponse } from '@bce/shared';

export interface RoutingProvider {
  readonly id: string;
  readonly available: boolean;
  readonly description: string;
  readonly attribution: string;
  route(req: RouteRequest): Promise<RouteResponse>;
}

export class RoutingError extends Error {
  constructor(message: string, readonly statusCode = 502) {
    super(message);
  }
}

/** Used when no routing provider is configured – never fabricates routes. */
export class NoRoutingProvider implements RoutingProvider {
  readonly id = 'none';
  readonly available = false;
  readonly description = 'Automatické plánování není nakonfigurováno (ROUTING_PROVIDER=none).';
  readonly attribution = '';
  async route(): Promise<RouteResponse> {
    throw new RoutingError('Automatické plánování tras není nakonfigurováno.', 503);
  }
}
