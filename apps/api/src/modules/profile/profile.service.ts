import type { Prisma } from '@prisma/client';
import type { UserProfileDto } from '@odp/shared';
import { prisma } from '../../lib/prisma';
import { NotFoundError } from '../../lib/errors';
import { toIso } from '../../lib/dates';
import { invalidateCache } from '../../lib/redis';
import { replaceUserSkills } from './skills.service';
import type { UpdateProfileInput } from './profile.schemas';

const profileInclude = {
  user: { select: { id: true, name: true, email: true } },
  education: { orderBy: [{ isPrimary: 'desc' }, { graduationYear: 'desc' }] },
  skills: { include: { skill: true }, orderBy: { createdAt: 'asc' } },
  experience: { orderBy: { startDate: 'desc' } },
  preferences: true,
} satisfies Prisma.UserProfileInclude;

type ProfileWithRelations = Prisma.UserProfileGetPayload<{ include: typeof profileInclude }>;

/**
 * Profile completion drives onboarding nudges and feeds the career-readiness
 * score. Weights are intentionally explicit so the number is explainable.
 */
export function computeProfileCompletion(profile: ProfileWithRelations): number {
  const checks: { weight: number; done: boolean }[] = [
    { weight: 10, done: Boolean(profile.user.name) },
    { weight: 5, done: Boolean(profile.phone) },
    { weight: 10, done: Boolean(profile.city) },
    { weight: 20, done: profile.education.length > 0 },
    {
      weight: 10,
      done: profile.education.some((e) => e.graduationYear != null && (e.cgpa != null || e.percentage != null)),
    },
    { weight: 20, done: profile.skills.length >= 3 },
    { weight: 10, done: profile.experience.length > 0 },
    {
      weight: 10,
      done:
        (profile.preferences?.desiredRoles.length ?? 0) > 0 ||
        (profile.preferences?.desiredIndustries.length ?? 0) > 0,
    },
    { weight: 5, done: Boolean(profile.activeResumeId) },
  ];

  const earned = checks.reduce((sum, c) => sum + (c.done ? c.weight : 0), 0);
  return Math.min(100, earned);
}

export function toProfileDto(profile: ProfileWithRelations): UserProfileDto {
  return {
    id: profile.id,
    userId: profile.userId,
    name: profile.user.name,
    email: profile.user.email,
    phone: profile.phone,
    city: profile.city,
    state: profile.state,
    country: profile.country,
    headline: profile.headline,
    yearsOfExperience: profile.yearsOfExperience,
    dateOfBirth: toIso(profile.dateOfBirth),
    skills: profile.skills.map((s) => s.skill.name),
    education: profile.education.map((e) => ({
      id: e.id,
      degree: e.degree,
      branch: e.branch,
      university: e.university,
      college: e.college,
      graduationYear: e.graduationYear,
      currentYear: e.currentYear,
      cgpa: e.cgpa,
      percentage: e.percentage,
      backlogs: e.backlogs,
      isPrimary: e.isPrimary,
    })),
    experience: profile.experience.map((x) => ({
      id: x.id,
      kind: x.kind,
      title: x.title,
      organization: x.organization,
      description: x.description,
      startDate: toIso(x.startDate),
      endDate: toIso(x.endDate),
      isCurrent: x.isCurrent,
      skills: x.skills,
    })),
    preferences: {
      desiredRoles: profile.preferences?.desiredRoles ?? [],
      desiredIndustries: profile.preferences?.desiredIndustries ?? [],
      preferredLocations: profile.preferences?.preferredLocations ?? [],
      remotePreference: (profile.preferences?.remotePreference ?? 'ANY') as never,
      minSalaryExpectation: profile.preferences?.minSalaryExpectation ?? null,
      opportunityPreference: (profile.preferences?.opportunityPreference ?? 'ANY') as never,
      sectorPreference: (profile.preferences?.sectorPreference ?? 'ANY') as never,
      willingToRelocate: profile.preferences?.willingToRelocate ?? true,
    },
    profileCompletion: profile.profileCompletion,
    resumeId: profile.activeResumeId,
    updatedAt: profile.updatedAt.toISOString(),
  };
}

/** Fetches the profile, creating an empty one if the account predates it. */
export async function getOrCreateProfile(userId: string): Promise<ProfileWithRelations> {
  const existing = await prisma.userProfile.findUnique({
    where: { userId },
    include: profileInclude,
  });
  if (existing) return existing;

  const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
  if (!user) throw new NotFoundError('User');

  await prisma.userProfile.create({
    data: { userId, country: 'India', preferences: { create: {} } },
  });
  return prisma.userProfile.findUniqueOrThrow({ where: { userId }, include: profileInclude });
}

export async function getProfile(userId: string): Promise<UserProfileDto> {
  return toProfileDto(await getOrCreateProfile(userId));
}

export async function updateProfile(
  userId: string,
  input: UpdateProfileInput,
): Promise<UserProfileDto> {
  const profile = await getOrCreateProfile(userId);

  if (input.name) {
    await prisma.user.update({ where: { id: userId }, data: { name: input.name } });
  }

  await prisma.userProfile.update({
    where: { id: profile.id },
    data: {
      phone: input.phone === undefined ? undefined : input.phone,
      city: input.city === undefined ? undefined : input.city,
      state: input.state === undefined ? undefined : input.state,
      country: input.country === undefined ? undefined : input.country,
      headline: input.headline === undefined ? undefined : input.headline,
      dateOfBirth:
        input.dateOfBirth === undefined
          ? undefined
          : input.dateOfBirth === null
            ? null
            : new Date(input.dateOfBirth),
      yearsOfExperience: input.yearsOfExperience,
      isPublic: input.isPublic,
    },
  });

  if (input.skills) {
    await replaceUserSkills(profile.id, input.skills);
  }

  if (input.education) {
    // The client always sends the full list, so a replace keeps ids stable for
    // rows it echoed back and drops the ones it removed.
    const keepIds = input.education.map((e) => e.id).filter((id): id is string => Boolean(id));
    await prisma.education.deleteMany({
      where: { profileId: profile.id, id: { notIn: keepIds.length ? keepIds : ['__none__'] } },
    });
    for (const [index, edu] of input.education.entries()) {
      const data = {
        degree: edu.degree,
        branch: edu.branch ?? null,
        university: edu.university ?? null,
        college: edu.college ?? null,
        graduationYear: edu.graduationYear ?? null,
        currentYear: edu.currentYear ?? null,
        cgpa: edu.cgpa ?? null,
        percentage: edu.percentage ?? null,
        backlogs: edu.backlogs ?? 0,
        // Exactly one education row is primary; default to the first.
        isPrimary: edu.isPrimary || (index === 0 && !input.education.some((e) => e.isPrimary)),
      };
      if (edu.id) {
        await prisma.education.update({ where: { id: edu.id }, data });
      } else {
        await prisma.education.create({ data: { ...data, profileId: profile.id } });
      }
    }
  }

  if (input.experience) {
    const keepIds = input.experience.map((e) => e.id).filter((id): id is string => Boolean(id));
    await prisma.experience.deleteMany({
      where: { profileId: profile.id, id: { notIn: keepIds.length ? keepIds : ['__none__'] } },
    });
    for (const exp of input.experience) {
      const data = {
        kind: exp.kind,
        title: exp.title,
        organization: exp.organization ?? null,
        description: exp.description ?? null,
        startDate: exp.startDate ? new Date(exp.startDate) : null,
        endDate: exp.endDate ? new Date(exp.endDate) : null,
        isCurrent: exp.isCurrent ?? false,
        skills: exp.skills ?? [],
      };
      if (exp.id) {
        await prisma.experience.update({ where: { id: exp.id }, data });
      } else {
        await prisma.experience.create({ data: { ...data, profileId: profile.id } });
      }
    }
  }

  if (input.preferences) {
    await prisma.userPreference.upsert({
      where: { profileId: profile.id },
      update: input.preferences,
      create: { profileId: profile.id, ...input.preferences },
    });
  }

  const updated = await prisma.userProfile.findUniqueOrThrow({
    where: { id: profile.id },
    include: profileInclude,
  });
  const completion = computeProfileCompletion(updated);
  const saved = await prisma.userProfile.update({
    where: { id: profile.id },
    data: { profileCompletion: completion },
    include: profileInclude,
  });

  // Cached match scores are stale once the profile changes.
  await prisma.matchScore.deleteMany({ where: { userId } });
  await invalidateCache(`feed:${userId}:*`);

  return toProfileDto(saved);
}

/** GDPR-style export of everything the platform holds about a user. */
export async function exportUserData(userId: string): Promise<Record<string, unknown>> {
  const [user, profile, resumes, applications, saved, followed, notifications] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, createdAt: true, lastLoginAt: true },
    }),
    prisma.userProfile.findUnique({ where: { userId }, include: profileInclude }),
    prisma.resume.findMany({
      where: { userId, deletedAt: null },
      select: { id: true, fileName: true, createdAt: true, parseStatus: true, extractedData: true },
    }),
    prisma.application.findMany({
      where: { userId },
      include: { opportunity: { select: { title: true, organizationName: true, applicationUrl: true } }, events: true },
    }),
    prisma.savedOpportunity.findMany({
      where: { userId },
      include: { opportunity: { select: { title: true, organizationName: true } } },
    }),
    prisma.followedCompany.findMany({
      where: { userId },
      include: { company: { select: { name: true } } },
    }),
    prisma.notification.findMany({ where: { userId }, take: 500, orderBy: { createdAt: 'desc' } }),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    user,
    profile: profile ? toProfileDto(profile) : null,
    resumes,
    applications,
    savedOpportunities: saved,
    followedCompanies: followed,
    notifications,
  };
}

/**
 * Account deletion. Cascades remove every child row; the user row itself is
 * hard-deleted so no personal data is retained (requirement 47).
 */
export async function deleteAccount(userId: string): Promise<void> {
  await prisma.user.delete({ where: { id: userId } });
  await invalidateCache(`feed:${userId}:*`);
}
