import { describe, expect, it } from 'vitest';
import { computeMatch, scoreSkills } from '../../src/engines/matching';
import { makeOpportunity, makeProfile } from '../fixtures';

describe('scoreSkills', () => {
  it('scores full marks when every required skill is present', () => {
    const opportunity = makeOpportunity({
      skills: [
        { name: 'Python', isRequired: true, weight: 1 },
        { name: 'SQL', isRequired: true, weight: 1 },
      ],
    });
    const result = scoreSkills(makeProfile(), opportunity);

    expect(result.score).toBe(100);
    expect(result.matched).toEqual(expect.arrayContaining(['Python', 'SQL']));
    expect(result.missing).toHaveLength(0);
  });

  it('lists the skills the user is missing', () => {
    const result = scoreSkills(makeProfile(), makeOpportunity());
    expect(result.missing).toContain('Power BI');
    expect(result.matched).toEqual(expect.arrayContaining(['SQL', 'Python']));
  });

  it('stays neutral rather than penalising when a posting lists no skills', () => {
    const result = scoreSkills(makeProfile(), makeOpportunity({ skills: [] }));
    expect(result.score).toBe(70);
    expect(result.explanation).toContain('does not list');
  });

  it('gives partial credit through the related-skills graph', () => {
    const profile = makeProfile({ skills: ['Pandas', 'NumPy'] });
    const opportunity = makeOpportunity({
      skills: [{ name: 'Python', isRequired: true, weight: 1 }],
    });
    const result = scoreSkills(profile, opportunity);

    // Pandas and NumPy are related to Python, so this is not a zero.
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(100);
  });
});

describe('computeMatch', () => {
  it('produces a high score for an eligible, well-matched candidate', () => {
    const result = computeMatch(makeProfile(), makeOpportunity());

    expect(result.overall).toBeGreaterThanOrEqual(75);
    expect(result.eligibilityVerdict).toBe('ELIGIBLE');
    expect(result.components).toHaveLength(6);
  });

  it('caps the score for an ineligible candidate no matter how good the skills are', () => {
    // Perfect skill overlap, but the wrong branch.
    const profile = makeProfile({
      skills: ['SQL', 'Python', 'Power BI'],
      education: [{ ...makeProfile().education[0], branch: 'Mechanical' }],
    });
    const result = computeMatch(profile, makeOpportunity());

    expect(result.eligibilityVerdict).toBe('NOT_ELIGIBLE');
    expect(result.overall).toBeLessThanOrEqual(35);
  });

  it('caps the score when eligibility could not be confirmed', () => {
    const profile = makeProfile({
      skills: ['SQL', 'Python', 'Power BI'],
      education: [{ ...makeProfile().education[0], cgpa: null, percentage: null }],
    });
    const result = computeMatch(profile, makeOpportunity());

    expect(result.eligibilityVerdict).toBe('NEEDS_REVIEW');
    expect(result.overall).toBeLessThanOrEqual(82);
  });

  it('never recommends an opportunity whose deadline has passed', () => {
    const opportunity = makeOpportunity({
      applicationDeadline: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });
    const result = computeMatch(makeProfile(), opportunity);
    expect(result.overall).toBeLessThanOrEqual(20);
  });

  it('rewards a location that matches the user city', () => {
    const local = computeMatch(makeProfile(), makeOpportunity());
    const remoteCity = computeMatch(
      makeProfile(),
      makeOpportunity({ locations: [{ city: 'Kolkata', state: 'West Bengal', country: 'India', isRemote: false }] }),
    );

    const localScore = local.components.find((c) => c.key === 'location')!.score;
    const otherScore = remoteCity.components.find((c) => c.key === 'location')!.score;
    expect(localScore).toBeGreaterThan(otherScore);
  });

  it('penalises a full-time role for a user who only wants internships', () => {
    const profile = makeProfile({
      preferences: { ...makeProfile().preferences, opportunityPreference: 'INTERNSHIP' },
    });
    const withPreference = computeMatch(profile, makeOpportunity());
    const neutral = computeMatch(makeProfile(), makeOpportunity());

    const preferenceScore = withPreference.components.find((c) => c.key === 'preferences')!.score;
    const neutralScore = neutral.components.find((c) => c.key === 'preferences')!.score;
    expect(preferenceScore).toBeLessThan(neutralScore);
  });

  it('boosts a government posting for a user who prefers the public sector', () => {
    const profile = makeProfile({
      preferences: { ...makeProfile().preferences, sectorPreference: 'GOVERNMENT' },
    });
    const government = computeMatch(profile, makeOpportunity({ opportunityType: 'GOVERNMENT_JOB' }));
    const priv = computeMatch(profile, makeOpportunity({ opportunityType: 'FULL_TIME' }));

    const govScore = government.components.find((c) => c.key === 'preferences')!.score;
    const privScore = priv.components.find((c) => c.key === 'preferences')!.score;
    expect(govScore).toBeGreaterThan(privScore);
  });

  it('keeps component weights summing to one', () => {
    const result = computeMatch(makeProfile(), makeOpportunity());
    const total = result.components.reduce((sum, c) => sum + c.weight, 0);
    expect(total).toBeCloseTo(1, 5);
  });

  it('explains every component', () => {
    const result = computeMatch(makeProfile(), makeOpportunity());
    for (const component of result.components) {
      expect(component.explanation.length).toBeGreaterThan(5);
    }
  });
});
