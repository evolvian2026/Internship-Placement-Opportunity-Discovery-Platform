import type { CareerReadinessDto } from '@odp/shared';
import type { ProfileSnapshot } from './types';

/**
 * Career-readiness score (requirement 27).
 *
 * Deliberately transparent: every component states how it was earned and what
 * would raise it, and the weights live in one place so they are configurable.
 */

export interface ReadinessWeights {
  resume: number;
  technicalSkills: number;
  projects: number;
  certifications: number;
  interviewPrep: number;
  applications: number;
}

export const DEFAULT_READINESS_WEIGHTS: ReadinessWeights = {
  resume: 0.2,
  technicalSkills: 0.25,
  projects: 0.15,
  certifications: 0.1,
  interviewPrep: 0.1,
  applications: 0.2,
};

export interface ReadinessInputs {
  profile: ProfileSnapshot;
  certificationCount: number;
  applicationCount: number;
  /** Applications that reached an interview stage. */
  interviewCount: number;
  savedCount: number;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function computeReadiness(
  inputs: ReadinessInputs,
  weights: ReadinessWeights = DEFAULT_READINESS_WEIGHTS,
): CareerReadinessDto {
  const { profile } = inputs;

  // Resume: having one at all is most of it; profile completeness does the rest.
  const resume = clamp((profile.hasResume ? 60 : 0) + profile.profileCompletion * 0.4);

  // Technical skills: 10 listed skills is a strong profile.
  const skillCount = profile.skills.length;
  const technicalSkills = clamp(Math.min(100, (skillCount / 10) * 100));

  // Projects and internships both demonstrate applied work.
  const projects = clamp(Math.min(100, (profile.projectCount * 25) + (profile.internshipCount * 30)));

  const certifications = clamp(Math.min(100, inputs.certificationCount * 34));

  // Interview preparation is inferred from how far applications have travelled.
  const interviewPrep = clamp(
    inputs.interviewCount > 0
      ? Math.min(100, 50 + inputs.interviewCount * 15)
      : inputs.applicationCount > 0
        ? 35
        : 15,
  );

  // Applications: consistent activity, not raw volume.
  const applications = clamp(
    Math.min(100, inputs.applicationCount * 10 + Math.min(inputs.savedCount, 10) * 2),
  );

  const breakdown = [
    {
      key: 'resume',
      label: 'Resume',
      score: resume,
      weight: weights.resume,
      hint: profile.hasResume
        ? 'Keep your profile complete so recruiters see a full picture.'
        : 'Upload a resume to auto-fill your profile and lift this score.',
    },
    {
      key: 'technicalSkills',
      label: 'Technical Skills',
      score: technicalSkills,
      weight: weights.technicalSkills,
      hint:
        skillCount >= 10
          ? 'Strong skill coverage.'
          : `Add ${10 - skillCount} more skill${10 - skillCount === 1 ? '' : 's'} to reach full marks.`,
    },
    {
      key: 'projects',
      label: 'Projects',
      score: projects,
      weight: weights.projects,
      hint:
        profile.projectCount + profile.internshipCount > 0
          ? 'Add outcomes and technologies to each project entry.'
          : 'Add at least two projects or an internship.',
    },
    {
      key: 'certifications',
      label: 'Certifications',
      score: certifications,
      weight: weights.certifications,
      hint:
        inputs.certificationCount > 0
          ? 'Certifications recorded from your resume.'
          : 'Add certifications from your resume or courses you have completed.',
    },
    {
      key: 'interviewPrep',
      label: 'Interview Prep',
      score: interviewPrep,
      weight: weights.interviewPrep,
      hint:
        inputs.interviewCount > 0
          ? 'You are converting applications into interviews.'
          : 'Track your applications through to interview stage to measure this.',
    },
    {
      key: 'applications',
      label: 'Applications',
      score: applications,
      weight: weights.applications,
      hint:
        inputs.applicationCount >= 10
          ? 'Good application volume.'
          : 'Apply to more matched opportunities and track them here.',
    },
  ];

  const overall = clamp(breakdown.reduce((sum, item) => sum + item.score * item.weight, 0));

  return { overall, breakdown, updatedAt: new Date().toISOString() };
}
