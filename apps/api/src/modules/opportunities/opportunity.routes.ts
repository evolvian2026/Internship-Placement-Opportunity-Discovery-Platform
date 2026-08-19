import { Router } from 'express';
import {
  FRESHER_TYPES,
  GOVERNMENT_TYPES,
  INTERNSHIP_TYPES,
  PSU_TYPES,
  type OpportunityFilters,
  type OpportunityType,
} from '@odp/shared';
import { asyncHandler } from '../../middleware/error';
import { optionalAuth, requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { searchQuerySchema, type SearchQueryInput } from './opportunity.schemas';
import * as service from './opportunity.service';

export const opportunityRouter = Router();

function toFilters(query: SearchQueryInput): OpportunityFilters {
  return {
    q: query.q,
    types: query.types,
    industries: query.industries,
    domains: query.domains,
    skills: query.skills,
    companyIds: query.companyIds,
    workModes: query.workModes,
    cities: query.cities,
    states: query.states,
    countries: query.countries,
    degrees: query.degrees,
    branches: query.branches,
    graduationYears: query.graduationYears,
    experienceBands: query.experienceBands,
    companyTypes: query.companyTypes,
    statuses: query.statuses,
    governmentCategories: query.governmentCategories,
    psuCategories: query.psuCategories,
    internshipCategories: query.internshipCategories,
    minSalary: query.minSalary,
    maxSalary: query.maxSalary,
    deadlineWithinDays: query.deadlineWithinDays,
    postedWithinDays: query.postedWithinDays,
    minMatchScore: query.minMatchScore,
    eligibleOnly: query.eligibleOnly,
    sort: query.sort,
    page: query.page,
    pageSize: query.pageSize,
  };
}

/** Shared handler for the dedicated module routes (internships, gov, PSU...). */
function moduleRoute(forcedTypes: OpportunityType[]) {
  return asyncHandler(async (req, res) => {
    const query = req.query as unknown as SearchQueryInput;
    const filters = toFilters(query);
    // A caller-supplied type filter is intersected with the module's types, so
    // /internships can never return a full-time job.
    filters.types = filters.types?.length
      ? filters.types.filter((t) => forcedTypes.includes(t))
      : forcedTypes;
    if (filters.types.length === 0) filters.types = forcedTypes;

    res.json(
      await service.searchOpportunities(filters, {
        userId: req.auth?.userId,
        naturalLanguage: query.nl !== false,
      }),
    );
  });
}

opportunityRouter.get(
  '/',
  optionalAuth,
  validate(searchQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as SearchQueryInput;
    res.json(
      await service.searchOpportunities(toFilters(query), {
        userId: req.auth?.userId,
        naturalLanguage: query.nl !== false,
      }),
    );
  }),
);

opportunityRouter.get(
  '/internships',
  optionalAuth,
  validate(searchQuerySchema, 'query'),
  moduleRoute(INTERNSHIP_TYPES),
);

opportunityRouter.get(
  '/government',
  optionalAuth,
  validate(searchQuerySchema, 'query'),
  moduleRoute([...GOVERNMENT_TYPES, 'PSU_JOB']),
);

opportunityRouter.get('/psu', optionalAuth, validate(searchQuerySchema, 'query'), moduleRoute(PSU_TYPES));

opportunityRouter.get(
  '/freshers',
  optionalAuth,
  validate(searchQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as SearchQueryInput;
    const filters = toFilters(query);
    filters.types = filters.types?.length
      ? filters.types.filter((t) => FRESHER_TYPES.includes(t))
      : FRESHER_TYPES;
    if (filters.types.length === 0) filters.types = FRESHER_TYPES;
    // The fresher dashboard is defined by experience, not only by type.
    filters.experienceBands = filters.experienceBands?.length
      ? filters.experienceBands
      : ['FRESHER', 'ZERO_ONE'];

    res.json(
      await service.searchOpportunities(filters, {
        userId: req.auth?.userId,
        naturalLanguage: query.nl !== false,
      }),
    );
  }),
);

opportunityRouter.get(
  '/deadlines',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const savedOnly = req.query.savedOnly === 'true';
    res.json(await service.getDeadlineGroups(req.auth?.userId, { savedOnly }));
  }),
);

opportunityRouter.get(
  '/counts',
  asyncHandler(async (_req, res) => {
    res.json(await service.getCategoryCounts());
  }),
);

/** Recompute this user's cached match scores across the active catalogue. */
opportunityRouter.post(
  '/recompute-matches',
  requireAuth,
  asyncHandler(async (req, res) => {
    const count = await service.recomputeUserMatches(req.auth!.userId);
    res.json({ scored: count });
  }),
);

opportunityRouter.get(
  '/:slugOrId',
  optionalAuth,
  asyncHandler(async (req, res) => {
    res.json(await service.getOpportunityBySlugOrId(req.params.slugOrId, req.auth?.userId));
  }),
);
