import type { RouteRequest, RouteResponse } from '@bce/shared';

export interface RoutingProvider {
  readonly id: string;
  readonly available: boolean;
  readonly description: string;
  readonly attribution: string;
  route(req: RouteRequest): Promise<RouteResponse>;
}

export type RoutingErrorCode = 'invalid' | 'no_route' | 'routing_not_configured' | 'routing_unavailable';

export class RoutingError extends Error {
  /** `detail`: raw upstream message (often English), shown after the translated text. */
  constructor(message: string, readonly statusCode = 502, readonly detail?: string) {
    super(message);
  }

  get code(): RoutingErrorCode {
    return this.statusCode === 400 ? 'invalid' : this.statusCode === 422 ? 'no_route' : this.statusCode === 503 ? 'routing_not_configured' : 'routing_unavailable';
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
