import { describe, expect, it } from 'vitest';
import { branchSatisfies, degreeSatisfies, evaluateEligibility } from '../../src/engines/eligibility';
import { makeOpportunity, makeProfile } from '../fixtures';

describe('degreeSatisfies', () => {
  it('accepts an exact degree match', () => {
    expect(degreeSatisfies('B_TECH', ['B_TECH', 'MCA'])).toBe(true);
  });

  it('treats B.Tech and B.E. as interchangeable', () => {
    expect(degreeSatisfies('B_E', ['B_TECH'])).toBe(true);
    expect(degreeSatisfies('B_TECH', ['B_E'])).toBe(true);
  });

  it('treats MBA and PGDM as interchangeable', () => {
    expect(degreeSatisfies('PGDM', ['MBA'])).toBe(true);
  });

  it('does not assume a postgraduate degree satisfies an undergraduate requirement', () => {
    expect(degreeSatisfies('M_TECH', ['B_TECH'])).toBe(false);
  });
});

describe('branchSatisfies', () => {
  it('matches an exact branch', () => {
    expect(branchSatisfies('CSE', ['CSE', 'IT'])).toBe(true);
  });

  it('matches a branch through its common synonyms', () => {
    expect(branchSatisfies('Computer Science', ['CSE'])).toBe(true);
    expect(branchSatisfies('CSE', ['Computer Science and Engineering'])).toBe(true);
  });

  it('accepts a posting that is open to all branches', () => {
    expect(branchSatisfies('Mechanical', ['All Branches'])).toBe(true);
    expect(branchSatisfies('Civil', ['Any Discipline'])).toBe(true);
  });

  it('rejects an unrelated branch', () => {
    expect(branchSatisfies('Mechanical', ['CSE', 'IT'])).toBe(false);
  });
});

describe('evaluateEligibility', () => {
  it('marks a fully-qualified candidate eligible and explains why', () => {
    const result = evaluateEligibility(makeProfile(), makeOpportunity());

    expect(result.verdict).toBe('ELIGIBLE');
    expect(result.failed).toHaveLength(0);
    expect(result.passed.map((c) => c.key)).toEqual(
      expect.arrayContaining(['degree', 'branch', 'graduationYear', 'cgpa', 'backlogs', 'experience']),
    );
    expect(result.score).toBe(100);
  });

  it('fails a candidate whose CGPA is below the published minimum', () => {
    const profile = makeProfile({
      education: [{ ...makeProfile().education[0], cgpa: 6.2 }],
    });
    const result = evaluateEligibility(profile, makeOpportunity());

    expect(result.verdict).toBe('NOT_ELIGIBLE');
    expect(result.failed.some((c) => c.key === 'cgpa')).toBe(true);
    expect(result.failed[0].message).toContain('7');
  });

  it('fails a candidate from a branch the posting does not accept', () => {
    const profile = makeProfile({
      education: [{ ...makeProfile().education[0], branch: 'Mechanical' }],
    });
    const result = evaluateEligibility(profile, makeOpportunity());

    expect(result.verdict).toBe('NOT_ELIGIBLE');
    expect(result.failed.some((c) => c.key === 'branch')).toBe(true);
  });

  it('fails a candidate from the wrong graduation batch', () => {
    const profile = makeProfile({
      education: [{ ...makeProfile().education[0], graduationYear: 2029 }],
    });
    const result = evaluateEligibility(profile, makeOpportunity());

    expect(result.verdict).toBe('NOT_ELIGIBLE');
    expect(result.failed.some((c) => c.key === 'graduationYear')).toBe(true);
  });

  it('returns NEEDS_REVIEW rather than guessing when the profile lacks a CGPA', () => {
    const profile = makeProfile({
      education: [{ ...makeProfile().education[0], cgpa: null, percentage: null }],
    });
    const result = evaluateEligibility(profile, makeOpportunity());

    expect(result.verdict).toBe('NEEDS_REVIEW');
    expect(result.unknown.some((c) => c.key === 'cgpa')).toBe(true);
    // The critical property: an unknown must never read as eligible.
    expect(result.verdict).not.toBe('ELIGIBLE');
  });

  it('lets a percentage satisfy a CGPA requirement, but never fail it', () => {
    const strongProfile = makeProfile({
      education: [{ ...makeProfile().education[0], cgpa: null, percentage: 85 }],
    });
    expect(evaluateEligibility(strongProfile, makeOpportunity()).verdict).toBe('ELIGIBLE');

    const weakProfile = makeProfile({
      education: [{ ...makeProfile().education[0], cgpa: null, percentage: 55 }],
    });
    const weak = evaluateEligibility(weakProfile, makeOpportunity());
    // 55% converts to ~5.8 CGPA, below the bar — but conversion is approximate,
    // so it must ask for review rather than reject outright.
    expect(weak.verdict).toBe('NEEDS_REVIEW');
    expect(weak.failed).toHaveLength(0);
  });

  it('fails a candidate with more backlogs than allowed', () => {
    const profile = makeProfile({
      education: [{ ...makeProfile().education[0], backlogs: 3 }],
    });
    const result = evaluateEligibility(profile, makeOpportunity());

    expect(result.verdict).toBe('NOT_ELIGIBLE');
    expect(result.failed.some((c) => c.key === 'backlogs')).toBe(true);
  });

  it('treats a location mismatch as a warning, not a rejection', () => {
    const opportunity = makeOpportunity({
      locations: [{ city: 'Hyderabad', state: 'Telangana', country: 'India', isRemote: false }],
    });
    const result = evaluateEligibility(makeProfile(), opportunity);

    expect(result.verdict).toBe('ELIGIBLE');
    expect(result.warnings.some((c) => c.key === 'location')).toBe(true);
  });

  it('enforces an age limit when the profile has a date of birth', () => {
    const opportunity = makeOpportunity({
      eligibility: { ...makeOpportunity().eligibility!, minAge: 30, maxAge: 40 },
    });
    const result = evaluateEligibility(makeProfile(), opportunity);

    expect(result.verdict).toBe('NOT_ELIGIBLE');
    expect(result.failed.some((c) => c.key === 'age')).toBe(true);
  });

  it('asks for review when an age limit applies but the birth date is unknown', () => {
    const opportunity = makeOpportunity({
      eligibility: { ...makeOpportunity().eligibility!, minAge: 18, maxAge: 30 },
    });
    const result = evaluateEligibility(makeProfile({ dateOfBirth: null }), opportunity);

    expect(result.verdict).toBe('NEEDS_REVIEW');
    expect(result.unknown.some((c) => c.key === 'age')).toBe(true);
  });

  it('asks for review when the posting publishes no structured criteria at all', () => {
    const result = evaluateEligibility(makeProfile(), makeOpportunity({ eligibility: null }));
    expect(result.verdict).toBe('NEEDS_REVIEW');
  });

  it('warns about citizenship conditions on government postings', () => {
    const opportunity = makeOpportunity({ opportunityType: 'GOVERNMENT_JOB', eligibility: null });
    const result = evaluateEligibility(makeProfile(), opportunity);
    expect([...result.warnings, ...result.unknown].some((c) => c.key === 'citizenship')).toBe(true);
  });

  it('surfaces an officially-stated gender requirement without failing anyone', () => {
    const opportunity = makeOpportunity({
      eligibility: { ...makeOpportunity().eligibility!, genderRequirement: 'Women candidates only' },
    });
    const result = evaluateEligibility(makeProfile(), opportunity);

    expect(result.warnings.some((c) => c.key === 'gender')).toBe(true);
    expect(result.failed.some((c) => c.key === 'gender')).toBe(false);
  });
});
