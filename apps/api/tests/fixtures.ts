import type { OpportunitySnapshot, ProfileSnapshot } from '../src/engines/types';

/** A final-year B.Tech CSE student, the platform's core persona. */
export function makeProfile(overrides: Partial<ProfileSnapshot> = {}): ProfileSnapshot {
  return {
    userId: 'user-1',
    name: 'Test Student',
    city: 'Bengaluru',
    state: 'Karnataka',
    country: 'India',
    dateOfBirth: new Date('2004-04-12'),
    yearsOfExperience: 0,
    skills: ['Python', 'SQL', 'Pandas', 'Excel'],
    education: [
      {
        degree: 'B_TECH',
        branch: 'CSE',
        graduationYear: 2026,
        currentYear: 4,
        cgpa: 8.4,
        percentage: null,
        backlogs: 0,
        isPrimary: true,
      },
    ],
    experienceCount: 0,
    projectCount: 2,
    internshipCount: 1,
    preferences: {
      desiredRoles: ['Data Analyst'],
      desiredIndustries: ['Data & AI'],
      preferredLocations: ['Bengaluru'],
      remotePreference: 'ANY',
      minSalaryExpectation: null,
      opportunityPreference: 'ANY',
      sectorPreference: 'ANY',
      willingToRelocate: true,
    },
    profileCompletion: 85,
    hasResume: true,
    ...overrides,
  };
}

export function makeOpportunity(overrides: Partial<OpportunitySnapshot> = {}): OpportunitySnapshot {
  return {
    id: 'opp-1',
    title: 'Data Analyst',
    organizationName: 'Acme Analytics',
    opportunityType: 'FULL_TIME',
    industryName: 'Data & AI',
    domainName: 'Data Analytics',
    role: 'Data Analyst',
    workMode: 'ONSITE',
    skills: [
      { name: 'SQL', isRequired: true, weight: 1 },
      { name: 'Python', isRequired: true, weight: 1 },
      { name: 'Power BI', isRequired: true, weight: 1 },
    ],
    locations: [{ city: 'Bengaluru', state: 'Karnataka', country: 'India', isRemote: false }],
    salaryMin: 600_000,
    salaryMax: 900_000,
    stipendMin: null,
    stipendMax: null,
    applicationDeadline: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
    eligibility: {
      degrees: ['B_TECH', 'B_E'],
      branches: ['CSE', 'IT'],
      graduationYears: [2026],
      minCgpa: 7,
      minPercentage: null,
      maxBacklogs: 0,
      minExperienceYears: 0,
      maxExperienceYears: 1,
      minAge: null,
      maxAge: null,
      genderRequirement: null,
      citizenship: null,
      workAuthorization: null,
      rawText: null,
    },
    ...overrides,
  };
}
