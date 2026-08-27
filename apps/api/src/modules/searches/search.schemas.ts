import { NOTIFICATION_FREQUENCIES } from '@odp/shared';
import { z } from 'zod';
import { searchQuerySchema } from '../opportunities/opportunity.schemas';

/**
 * A saved search stores the same filter shape the search endpoint accepts, so
 * re-running it later needs no translation layer.
 */
export const savedSearchFiltersSchema = searchQuerySchema
  .omit({ page: true, pageSize: true, nl: true, sort: true })
  .partial();

export const createSavedSearchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  /** The natural-language query, kept so the alert can explain itself. */
  query: z.string().trim().max(300).nullable().optional(),
  filters: savedSearchFiltersSchema.optional().default({}),
  alertsEnabled: z.boolean().optional().default(true),
  frequency: z.enum(NOTIFICATION_FREQUENCIES).optional().default('DAILY'),
});

export const updateSavedSearchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  alertsEnabled: z.boolean().optional(),
  frequency: z.enum(NOTIFICATION_FREQUENCIES).optional(),
});

export type CreateSavedSearchInput = z.infer<typeof createSavedSearchSchema>;
