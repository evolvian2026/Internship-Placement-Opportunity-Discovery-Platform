import { canonicalizeSkills, skillSlug, SKILL_BY_NAME } from '@odp/shared';
import { prisma } from '../../lib/prisma';

/**
 * Resolve free-text skill names to `Skill` rows, creating any that do not yet
 * exist. Users may add unlimited skills, so the catalogue grows at runtime.
 */
export async function resolveSkillIds(rawNames: string[]): Promise<{ id: string; name: string }[]> {
  const names = canonicalizeSkills(rawNames);
  if (names.length === 0) return [];

  const existing = await prisma.skill.findMany({
    where: { name: { in: names } },
    select: { id: true, name: true },
  });
  const found = new Map(existing.map((s) => [s.name, s]));

  const missing = names.filter((n) => !found.has(n));
  for (const name of missing) {
    // createMany would skip the returned ids; upsert keeps this race-safe.
    const created = await prisma.skill.upsert({
      where: { name },
      update: {},
      create: {
        name,
        slug: skillSlug(name) || name.toLowerCase(),
        category: SKILL_BY_NAME.get(name)?.category ?? null,
      },
      select: { id: true, name: true },
    });
    found.set(name, created);
  }

  // Preserve the caller's ordering.
  return names.map((n) => found.get(n)!).filter(Boolean);
}

export async function replaceUserSkills(
  profileId: string,
  rawNames: string[],
  opts: { fromResume?: boolean } = {},
): Promise<void> {
  const skills = await resolveSkillIds(rawNames);
  const keepIds = new Set(skills.map((s) => s.id));

  await prisma.$transaction([
    prisma.userSkill.deleteMany({
      where: { profileId, skillId: { notIn: [...keepIds] } },
    }),
    ...skills.map((skill) =>
      prisma.userSkill.upsert({
        where: { profileId_skillId: { profileId, skillId: skill.id } },
        update: {},
        create: { profileId, skillId: skill.id, isFromResume: opts.fromResume ?? false },
      }),
    ),
  ]);
}

export async function addUserSkills(profileId: string, rawNames: string[]): Promise<void> {
  const skills = await resolveSkillIds(rawNames);
  await prisma.$transaction(
    skills.map((skill) =>
      prisma.userSkill.upsert({
        where: { profileId_skillId: { profileId, skillId: skill.id } },
        update: {},
        create: { profileId, skillId: skill.id },
      }),
    ),
  );
}
