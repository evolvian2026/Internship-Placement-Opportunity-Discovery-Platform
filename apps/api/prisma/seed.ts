/**
 * Database seed.
 *
 * Creates:
 *  - the industry / domain taxonomy (admin-extensible afterwards)
 *  - the canonical skill catalogue
 *  - source connectors, including the mock source used by DATA_SOURCE=mock
 *  - an admin account and a demo student with a complete profile
 *
 * Safe to run repeatedly: everything is an upsert.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { INDUSTRY_SEED, SKILLS, skillSlug } from '@odp/shared';

const prisma = new PrismaClient();

async function seedTaxonomy(): Promise<void> {
  let industries = 0;
  let domains = 0;

  for (const [index, industry] of INDUSTRY_SEED.entries()) {
    const row = await prisma.industry.upsert({
      where: { slug: industry.slug },
      update: { name: industry.name, sortOrder: index },
      create: { name: industry.name, slug: industry.slug, sortOrder: index },
    });
    industries += 1;

    for (const domain of industry.domains) {
      await prisma.domain.upsert({
        where: { slug: domain.slug },
        update: { name: domain.name, industryId: row.id },
        create: { name: domain.name, slug: domain.slug, industryId: row.id },
      });
      domains += 1;
    }
  }

  console.log(`  taxonomy: ${industries} industries, ${domains} domains`);
}

async function seedSkills(): Promise<void> {
  for (const skill of SKILLS) {
    await prisma.skill.upsert({
      where: { name: skill.name },
      update: { category: skill.category, slug: skillSlug(skill.name) },
      create: { name: skill.name, slug: skillSlug(skill.name), category: skill.category },
    });
  }
  console.log(`  skills: ${SKILLS.length} canonical skills`);
}

async function seedSources(): Promise<void> {
  const sources = [
    {
      slug: 'mock-generator',
      name: 'Sample Data Generator',
      kind: 'MOCK' as const,
      trustLevel: 'PARTNER' as const,
      baseUrl: null,
      enabled: true,
      scheduleCron: '0 */6 * * *',
      rateLimitPerMinute: 1000,
      config: { count: 160, seed: 20260819 },
      accessPolicyNote:
        'Generates synthetic sample data locally. Makes no network requests and represents no real employer or posting.',
    },
    {
      slug: 'greenhouse-boards',
      name: 'Greenhouse Job Boards',
      kind: 'GREENHOUSE' as const,
      trustLevel: 'OFFICIAL' as const,
      baseUrl: 'https://boards-api.greenhouse.io',
      // Disabled until an administrator supplies board tokens for employers
      // who have made their board public.
      enabled: false,
      scheduleCron: '0 */4 * * *',
      rateLimitPerMinute: 30,
      config: { boardTokens: [] },
      accessPolicyNote:
        'Public, documented Greenhouse Job Board API. No authentication and no page scraping.',
    },
    {
      slug: 'lever-postings',
      name: 'Lever Postings',
      kind: 'LEVER' as const,
      trustLevel: 'OFFICIAL' as const,
      baseUrl: 'https://api.lever.co',
      enabled: false,
      scheduleCron: '0 */4 * * *',
      rateLimitPerMinute: 30,
      config: { companies: [] },
      accessPolicyNote: 'Public, documented Lever postings API. No authentication and no page scraping.',
    },
    {
      slug: 'government-notifications-feed',
      name: 'Government Notifications Feed',
      kind: 'GOVERNMENT_FEED' as const,
      trustLevel: 'OFFICIAL' as const,
      baseUrl: null,
      // Configure with the RSS endpoint of an official recruitment portal
      // before enabling. Verify the portal's terms first.
      enabled: false,
      scheduleCron: '0 */6 * * *',
      rateLimitPerMinute: 10,
      config: { feedUrls: [], organizationName: 'Government of India' },
      accessPolicyNote:
        'Reads only the officially published RSS/Atom feed. robots.txt honoured; no login wall is bypassed.',
    },
    {
      slug: 'partner-json-api',
      name: 'Partner JSON API',
      kind: 'JSON_API' as const,
      trustLevel: 'PARTNER' as const,
      baseUrl: null,
      enabled: false,
      scheduleCron: '0 */6 * * *',
      rateLimitPerMinute: 20,
      config: { url: '', itemsPath: 'data', mapping: {} },
      accessPolicyNote: 'Calls a documented partner endpoint under an agreed data-sharing arrangement.',
    },
    {
      slug: 'manual-entry',
      name: 'Manual Admin Entry',
      kind: 'MANUAL' as const,
      trustLevel: 'OFFICIAL' as const,
      baseUrl: null,
      enabled: true,
      scheduleCron: null,
      rateLimitPerMinute: 1000,
      config: {},
      accessPolicyNote: 'Opportunities entered by an administrator from an official notification.',
    },
  ];

  for (const source of sources) {
    await prisma.sourceConnector.upsert({
      where: { slug: source.slug },
      update: {
        name: source.name,
        kind: source.kind,
        trustLevel: source.trustLevel,
        baseUrl: source.baseUrl,
        scheduleCron: source.scheduleCron,
        rateLimitPerMinute: source.rateLimitPerMinute,
        accessPolicyNote: source.accessPolicyNote,
      },
      create: source,
    });
  }
  console.log(`  sources: ${sources.length} connectors`);
}

async function seedUsers(): Promise<void> {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345';
  const studentEmail = process.env.SEED_STUDENT_EMAIL ?? 'student@example.com';
  const studentPassword = process.env.SEED_STUDENT_PASSWORD ?? 'Student@12345';

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: 'ADMIN' },
    create: {
      email: adminEmail,
      name: 'Platform Administrator',
      role: 'ADMIN',
      emailVerified: true,
      passwordHash: await bcrypt.hash(adminPassword, 12),
      profile: { create: { country: 'India', preferences: { create: {} } } },
    },
  });
  await prisma.notificationPreference.upsert({
    where: { userId: admin.id },
    update: {},
    create: { userId: admin.id },
  });

  const student = await prisma.user.upsert({
    where: { email: studentEmail },
    update: {},
    create: {
      email: studentEmail,
      name: 'Rahul Sharma',
      role: 'STUDENT',
      emailVerified: true,
      passwordHash: await bcrypt.hash(studentPassword, 12),
    },
  });
  await prisma.notificationPreference.upsert({
    where: { userId: student.id },
    update: {},
    create: { userId: student.id },
  });

  const currentYear = new Date().getFullYear();

  const profile = await prisma.userProfile.upsert({
    where: { userId: student.id },
    update: {},
    create: {
      userId: student.id,
      phone: '+91 98765 43210',
      city: 'Bengaluru',
      state: 'Karnataka',
      country: 'India',
      headline: 'Final-year B.Tech CSE student · Data & backend',
      dateOfBirth: new Date(`${currentYear - 21}-04-12`),
      yearsOfExperience: 0,
      profileCompletion: 85,
    },
  });

  await prisma.education.deleteMany({ where: { profileId: profile.id } });
  await prisma.education.create({
    data: {
      profileId: profile.id,
      degree: 'B_TECH',
      branch: 'CSE',
      university: 'Visvesvaraya Technological University',
      college: 'RV College of Engineering',
      graduationYear: currentYear,
      currentYear: 4,
      cgpa: 8.4,
      backlogs: 0,
      isPrimary: true,
    },
  });

  const demoSkills = ['Python', 'SQL', 'Pandas', 'Excel', 'Java', 'Git', 'Data Structures', 'React'];
  const skillRows = await prisma.skill.findMany({ where: { name: { in: demoSkills } } });
  await prisma.userSkill.deleteMany({ where: { profileId: profile.id } });
  await prisma.userSkill.createMany({
    data: skillRows.map((s) => ({ profileId: profile.id, skillId: s.id })),
    skipDuplicates: true,
  });

  await prisma.experience.deleteMany({ where: { profileId: profile.id } });
  await prisma.experience.createMany({
    data: [
      {
        profileId: profile.id,
        kind: 'INTERNSHIP',
        title: 'Data Analytics Intern',
        organization: 'Clearwater Analytics Co.',
        description: 'Built recurring SQL reports and a Power BI dashboard for the operations team.',
        startDate: new Date(`${currentYear - 1}-05-01`),
        endDate: new Date(`${currentYear - 1}-07-31`),
        skills: ['SQL', 'Excel', 'Power BI'],
      },
      {
        profileId: profile.id,
        kind: 'PROJECT',
        title: 'Campus Placement Tracker',
        description: 'Full-stack app to track placement drives, built with React and Node.js.',
        skills: ['React', 'Node.js', 'PostgreSQL'],
      },
    ],
  });

  await prisma.userPreference.upsert({
    where: { profileId: profile.id },
    update: {},
    create: {
      profileId: profile.id,
      desiredRoles: ['Data Analyst', 'Software Engineer', 'Business Analyst'],
      desiredIndustries: ['Data & AI', 'Technology'],
      preferredLocations: ['Bengaluru', 'Hyderabad', 'Remote'],
      remotePreference: 'ANY',
      minSalaryExpectation: 600_000,
      opportunityPreference: 'ANY',
      sectorPreference: 'ANY',
      willingToRelocate: true,
    },
  });

  console.log(`  users: admin <${adminEmail}>, student <${studentEmail}>`);
}

async function main(): Promise<void> {
  console.log('Seeding database…');
  await seedTaxonomy();
  await seedSkills();
  await seedSources();
  await seedUsers();
  console.log('Seed complete.');
  console.log('');
  console.log('  Admin    : admin@example.com / Admin@12345');
  console.log('  Student  : student@example.com / Student@12345');
  console.log('');
  console.log('  Load sample opportunities with:  npm run ingest -w @odp/api');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
