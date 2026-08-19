import { APPLICATION_STATUSES } from '@odp/shared';
import { z } from 'zod';

export const createApplicationSchema = z.object({
  opportunityId: z.string().uuid(),
  status: z.enum(APPLICATION_STATUSES).optional().default('SAVED'),
  notes: z.string().trim().max(5000).nullable().optional(),
});

export const updateApplicationSchema = z.object({
  status: z.enum(APPLICATION_STATUSES).optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
  appliedAt: z.string().datetime().nullable().optional(),
  interviewDate: z.string().datetime().nullable().optional(),
  followUpDate: z.string().datetime().nullable().optional(),
  recruiterName: z.string().trim().max(120).nullable().optional(),
  recruiterEmail: z.string().trim().email().max(160).nullable().optional(),
  recruiterPhone: z.string().trim().max(30).nullable().optional(),
  referenceNumber: z.string().trim().max(80).nullable().optional(),
  documents: z.array(z.string().trim().max(300)).max(20).optional(),
  /** Optional note attached to the status-change event. */
  eventNote: z.string().trim().max(500).optional(),
});

export const saveOpportunitySchema = z.object({
  opportunityId: z.string().uuid(),
  note: z.string().trim().max(1000).nullable().optional(),
});
