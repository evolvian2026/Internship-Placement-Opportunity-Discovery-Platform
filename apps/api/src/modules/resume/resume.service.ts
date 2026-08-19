import mammoth from 'mammoth';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { BadRequestError, NotFoundError, UnsupportedMediaTypeError } from '../../lib/errors';
import { deleteObject, getObject, putObject } from '../../lib/storage';
import { getOrCreateProfile, updateProfile } from '../profile/profile.service';
import { parseResume, type ParsedResume } from './resume.parser';

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
];

/** Magic bytes, so a renamed executable cannot masquerade as a resume. */
function detectFileType(buffer: Buffer): 'pdf' | 'docx' | null {
  if (buffer.length < 4) return null;
  // %PDF
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) return 'pdf';
  // PK zip header — docx is a zip container.
  if (buffer[0] === 0x50 && buffer[1] === 0x4b && (buffer[2] === 0x03 || buffer[2] === 0x05)) return 'docx';
  return null;
}

async function extractText(buffer: Buffer, kind: 'pdf' | 'docx'): Promise<string> {
  if (kind === 'docx') {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  // pdf-parse is CommonJS and reads a sample file at import time in some
  // versions, so it is required lazily from its implementation entry point.
  const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default as (
    data: Buffer,
  ) => Promise<{ text: string }>;
  const result = await pdfParse(buffer);
  return result.text;
}

export interface UploadResult {
  resumeId: string;
  fileName: string;
  parseStatus: 'PARSED' | 'FAILED';
  extracted: ParsedResume | null;
  parseError: string | null;
}

/**
 * Stores the file and extracts a *proposal*.
 * The profile is not modified until the user confirms (requirement 10).
 */
export async function uploadResume(
  userId: string,
  file: { originalname: string; mimetype: string; buffer: Buffer; size: number },
): Promise<UploadResult> {
  const kind = detectFileType(file.buffer);
  if (!kind) {
    throw new UnsupportedMediaTypeError('Only PDF and DOCX resumes are supported.');
  }
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    throw new UnsupportedMediaTypeError('Only PDF and DOCX resumes are supported.');
  }

  const stored = await putObject(userId, file.originalname, file.buffer, file.mimetype);

  let extractedText: string | null = null;
  let extracted: ParsedResume | null = null;
  let parseError: string | null = null;

  try {
    extractedText = await extractText(file.buffer, kind);
    if (!extractedText.trim()) {
      // Almost always a scanned document with no text layer.
      throw new Error('No text could be read from this file. If it is a scan, upload a text-based PDF or DOCX.');
    }
    extracted = parseResume(extractedText);
  } catch (err) {
    parseError = err instanceof Error ? err.message : String(err);
    logger.warn({ err, userId }, 'resume parsing failed');
  }

  const resume = await prisma.$transaction(async (tx) => {
    // Only one resume is active at a time.
    await tx.resume.updateMany({ where: { userId, isActive: true }, data: { isActive: false } });

    const created = await tx.resume.create({
      data: {
        userId,
        fileName: file.originalname.slice(0, 200),
        storageKey: stored.key,
        mimeType: file.mimetype,
        sizeBytes: stored.size,
        parseStatus: extracted ? 'PARSED' : 'FAILED',
        parseError,
        extractedText: extractedText?.slice(0, 100_000) ?? null,
        extractedData: (extracted as unknown as object) ?? undefined,
        isActive: true,
      },
    });

    const profile = await tx.userProfile.findUnique({ where: { userId }, select: { id: true } });
    if (profile) {
      await tx.userProfile.update({ where: { id: profile.id }, data: { activeResumeId: created.id } });
    }
    return created;
  });

  return {
    resumeId: resume.id,
    fileName: resume.fileName,
    parseStatus: extracted ? 'PARSED' : 'FAILED',
    extracted,
    parseError,
  };
}

export async function listResumes(userId: string) {
  const rows = await prisma.resume.findMany({
    where: { userId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      sizeBytes: true,
      parseStatus: true,
      parseError: true,
      isActive: true,
      createdAt: true,
    },
  });
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

/** Returns the extraction so the user can review and correct it. */
export async function getExtraction(userId: string, resumeId: string): Promise<ParsedResume | null> {
  const resume = await prisma.resume.findFirst({
    where: { id: resumeId, userId, deletedAt: null },
    select: { extractedData: true },
  });
  if (!resume) throw new NotFoundError('Resume');
  return (resume.extractedData as unknown as ParsedResume) ?? null;
}

/**
 * Applies a *user-reviewed* extraction to the profile.
 * The client sends back the (possibly corrected) values, so nothing is written
 * that the user has not seen.
 */
export async function applyExtraction(
  userId: string,
  resumeId: string,
  reviewed: Partial<ParsedResume>,
): Promise<void> {
  const resume = await prisma.resume.findFirst({
    where: { id: resumeId, userId, deletedAt: null },
    select: { id: true },
  });
  if (!resume) throw new NotFoundError('Resume');

  const profile = await getOrCreateProfile(userId);
  const existingSkills = profile.skills.map((s) => s.skill.name);

  await updateProfile(userId, {
    ...(reviewed.name ? { name: reviewed.name } : {}),
    ...(reviewed.phone !== undefined ? { phone: reviewed.phone } : {}),
    ...(reviewed.city !== undefined ? { city: reviewed.city } : {}),
    // Extracted skills are merged with what the user already listed, never
    // replacing it.
    ...(reviewed.skills ? { skills: [...new Set([...existingSkills, ...reviewed.skills])] } : {}),
    ...(reviewed.education?.length
      ? {
          education: reviewed.education.map((e, index) => ({
            degree: e.degree,
            branch: e.branch ?? null,
            university: null,
            college: e.college ?? null,
            graduationYear: e.graduationYear ?? null,
            currentYear: null,
            cgpa: e.cgpa ?? null,
            percentage: e.percentage ?? null,
            backlogs: 0,
            isPrimary: index === 0,
          })),
        }
      : {}),
    ...(reviewed.experience?.length
      ? {
          experience: reviewed.experience.map((x) => ({
            kind: x.kind,
            title: x.title,
            organization: x.organization ?? null,
            description: x.description ?? null,
            startDate: null,
            endDate: null,
            isCurrent: false,
            skills: [],
          })),
        }
      : {}),
  });
}

export async function downloadResume(
  userId: string,
  resumeId: string,
): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
  const resume = await prisma.resume.findFirst({
    where: { id: resumeId, userId, deletedAt: null },
  });
  if (!resume) throw new NotFoundError('Resume');

  const buffer = await getObject(resume.storageKey);
  return { buffer, fileName: resume.fileName, mimeType: resume.mimeType };
}

/** Deletes both the stored file and the extracted text (requirement 47). */
export async function deleteResume(userId: string, resumeId: string): Promise<void> {
  const resume = await prisma.resume.findFirst({ where: { id: resumeId, userId, deletedAt: null } });
  if (!resume) throw new NotFoundError('Resume');

  await deleteObject(resume.storageKey);

  await prisma.$transaction(async (tx) => {
    await tx.resume.update({
      where: { id: resumeId },
      data: {
        deletedAt: new Date(),
        isActive: false,
        // The extracted content is purged, not merely hidden.
        extractedText: null,
        extractedData: undefined,
        storageKey: '',
      },
    });
    await tx.userProfile.updateMany({
      where: { userId, activeResumeId: resumeId },
      data: { activeResumeId: null },
    });
  });
}

export { BadRequestError };
