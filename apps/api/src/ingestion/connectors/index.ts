import type { SourceKind } from '@odp/shared';
import type { Connector } from '../types';
import { greenhouseConnector } from './greenhouse';
import { jsonApiConnector } from './jsonApi';
import { leverConnector } from './lever';
import { mockConnector } from './mock';
import { rssConnector } from './rss';

/**
 * Connector registry.
 *
 * Adding a new source type means adding a `Connector` here; adding a new
 * *source* of an existing type needs no code at all — an admin creates a
 * `SourceConnector` row with the right `kind` and `config`.
 */
const REGISTRY: Partial<Record<SourceKind, Connector>> = {
  MOCK: mockConnector,
  RSS: rssConnector,
  JSON_API: jsonApiConnector,
  GREENHOUSE: greenhouseConnector,
  LEVER: leverConnector,
  // GOVERNMENT_FEED reuses the RSS reader: Indian government portals that
  // publish machine-readable notifications do so as RSS.
  GOVERNMENT_FEED: rssConnector,
};

export function getConnector(kind: SourceKind): Connector | null {
  return REGISTRY[kind] ?? null;
}

export function listConnectorKinds(): SourceKind[] {
  return Object.keys(REGISTRY) as SourceKind[];
}

export { greenhouseConnector, jsonApiConnector, leverConnector, mockConnector, rssConnector };
