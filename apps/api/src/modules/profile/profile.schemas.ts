import { DEGREES } from '@odp/shared';
import { z } from 'zod';

const currentYear = new Date().getFullYear();

export const educationSchema = z.object({
  id: z.string().uuid().optional(),
  degree: z.enum(DEGREES),
  branch: z.string().trim().max(120).nullable().optional().default(null),
  university: z.string().trim().max(160).nullable().optional().default(null),
  college: z.string().trim().max(160).nullable().optional().default(null),
  graduationYear: z
    .number()
    .int()
    .min(1970)
    .max(currentYear + 10)
    .nullable()
    .optional()
    .default(null),
  currentYear: z.number().int().min(1).max(6).nullable().optional().default(null),
  cgpa: z.number().min(0).max(10).nullable().optional().default(null),
  percentage: z.number().min(0).max(100).nullable().optional().default(null),
  backlogs: z.number().int().min(0).max(60).nullable().optional().default(0),
  isPrimary: z.boolean().optional().default(false),
});

export const experienceSchema = z.object({
  id: z.string().uuid().optional(),
  kind: z.enum(['INTERNSHIP', 'JOB', 'PROJECT', 'FREELANCE']),
  title: z.string().trim().min(1).max(160),
  organization: z.string().trim().max(160).nullable().optional().default(null),
  description: z.string().trim().max(4000).nullable().optional().default(null),
  startDate: z.string().datetime().nullable().optional().default(null),
  endDate: z.string().datetime().nullable().optional().default(null),
  isCurrent: z.boolean().optional().default(false),
  skills: z.array(z.string().trim().min(1).max(60)).max(50).optional().default([]),
});

export const preferencesSchema = z.object({
  desiredRoles: z.array(z.string().trim().min(1).max(80)).max(20).optional().default([]),
  desiredIndustries: z.array(z.string().trim().min(1).max(80)).max(20).optional().default([]),
  preferredLocations: z.array(z.string().trim().min(1).max(80)).max(20).optional().default([]),
  remotePreference: z.enum(['REMOTE', 'ONSITE', 'HYBRID', 'ANY']).optional().default('ANY'),
  minSalaryExpectation: z.number().int().min(0).max(100_000_000).nullable().optional().default(null),
  opportunityPreference: z.enum(['INTERNSHIP', 'FULL_TIME', 'ANY']).optional().default('ANY'),
  sectorPreference: z.enum(['GOVERNMENT', 'PRIVATE', 'ANY']).optional().default('ANY'),
  willingToRelocate: z.boolean().optional().default(true),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  phone: z
    .string()
    .trim()
    .regex(/^[+]?[0-9 ()-]{6,20}$/, 'Enter a valid phone number')
    .nullable()
    .optional(),
  city: z.string().trim().max(80).nullable().optional(),
  state: z.string().trim().max(80).nullable().optional(),
  country: z.string().trim().max(80).nullable().optional(),
  headline: z.string().trim().max(160).nullable().optional(),
  dateOfBirth: z.string().datetime().nullable().optional(),
  yearsOfExperience: z.number().min(0).max(60).optional(),
  isPublic: z.boolean().optional(),
  skills: z.array(z.string().trim().min(1).max(60)).max(200).optional(),
  education: z.array(educationSchema).max(10).optional(),
  experience: z.array(experienceSchema).max(30).optional(),
  preferences: preferencesSchema.partial().optional(),
});

export const addSkillsSchema = z.object({
  skills: z.array(z.string().trim().min(1).max(60)).min(1).max(100),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
