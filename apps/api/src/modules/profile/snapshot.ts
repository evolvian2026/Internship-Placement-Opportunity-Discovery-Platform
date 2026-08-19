import type { WorkMode } from '@odp/shared';
import { prisma } from '../../lib/prisma';
import type { ProfileSnapshot } from '../../engines/types';

/**
 * Builds the flattened profile the engines consume.
 * Returns null when the user has no profile yet — callers then fall back to
 * non-personalised results rather than inventing a profile.
 */
export async function buildProfileSnapshot(userId: string): Promise<ProfileSnapshot | null> {
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    include: {
      user: { select: { name: true } },
      education: true,
      skills: { include: { skill: { select: { name: true } } } },
      experience: true,
      preferences: true,
    },
  });
  if (!profile) return null;

  const remotePreference = (profile.preferences?.remotePreference ?? 'ANY') as WorkMode | 'ANY';

  return {
    userId,
    name: profile.user.name,
    city: profile.city,
    state: profile.state,
    country: profile.country,
    dateOfBirth: profile.dateOfBirth,
    yearsOfExperience: profile.yearsOfExperience,
    skills: profile.skills.map((s) => s.skill.name),
    education: profile.education.map((e) => ({
      degree: e.degree,
      branch: e.branch,
      graduationYear: e.graduationYear,
      currentYear: e.currentYear,
      cgpa: e.cgpa,
      percentage: e.percentage,
      backlogs: e.backlogs,
      isPrimary: e.isPrimary,
    })),
    experienceCount: profile.experience.filter((x) => x.kind === 'JOB' || x.kind === 'FREELANCE').length,
    projectCount: profile.experience.filter((x) => x.kind === 'PROJECT').length,
    internshipCount: profile.experience.filter((x) => x.kind === 'INTERNSHIP').length,
    preferences: {
      desiredRoles: profile.preferences?.desiredRoles ?? [],
      desiredIndustries: profile.preferences?.desiredIndustries ?? [],
      preferredLocations: profile.preferences?.preferredLocations ?? [],
      remotePreference,
      minSalaryExpectation: profile.preferences?.minSalaryExpectation ?? null,
      opportunityPreference: (profile.preferences?.opportunityPreference ?? 'ANY') as never,
      sectorPreference: (profile.preferences?.sectorPreference ?? 'ANY') as never,
      willingToRelocate: profile.preferences?.willingToRelocate ?? true,
    },
    profileCompletion: profile.profileCompletion,
    hasResume: Boolean(profile.activeResumeId),
  };
}
