import type { Degree, OpportunityType, WorkMode } from '@odp/shared';

/**
 * Flattened view of a user that the engines operate on.
 *
 * Engines are deliberately pure functions over these snapshots: they take no
 * Prisma client, which makes them trivially unit-testable and reusable from the
 * API, the workers and the assistant.
 */
export interface ProfileSnapshot {
  userId: string;
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  dateOfBirth: Date | null;
  yearsOfExperience: number;
  /** Canonical skill names. */
  skills: string[];
  education: {
    degree: Degree;
    branch: string | null;
    graduationYear: number | null;
    currentYear: number | null;
    cgpa: number | null;
    percentage: number | null;
    backlogs: number | null;
    isPrimary: boolean;
  }[];
  experienceCount: number;
  projectCount: number;
  internshipCount: number;
  preferences: {
    desiredRoles: string[];
    desiredIndustries: string[];
    preferredLocations: string[];
    remotePreference: WorkMode | 'ANY';
    minSalaryExpectation: number | null;
    opportunityPreference: 'INTERNSHIP' | 'FULL_TIME' | 'ANY';
    sectorPreference: 'GOVERNMENT' | 'PRIVATE' | 'ANY';
    willingToRelocate: boolean;
  };
  profileCompletion: number;
  hasResume: boolean;
}

/** Flattened view of an opportunity for the engines. */
export interface OpportunitySnapshot {
  id: string;
  title: string;
  organizationName: string;
  opportunityType: OpportunityType;
  industryName: string | null;
  domainName: string | null;
  role: string | null;
  workMode: WorkMode;
  skills: { name: string; isRequired: boolean; weight: number }[];
  locations: { city: string | null; state: string | null; country: string | null; isRemote: boolean }[];
  salaryMin: number | null;
  salaryMax: number | null;
  stipendMin: number | null;
  stipendMax: number | null;
  applicationDeadline: Date | null;
  eligibility: {
    degrees: Degree[];
    branches: string[];
    graduationYears: number[];
    minCgpa: number | null;
    minPercentage: number | null;
    maxBacklogs: number | null;
    minExperienceYears: number | null;
    maxExperienceYears: number | null;
    minAge: number | null;
    maxAge: number | null;
    genderRequirement: string | null;
    citizenship: string | null;
    workAuthorization: string | null;
    rawText: string | null;
  } | null;
}
