import { describe, expect, it } from 'vitest';
import type { EligibilitySummaryDto } from '@odp/shared';
import { collectNearMisses, collectUnlocks } from '../../src/engines/insights';
import { evaluateEligibility } from '../../src/engines/eligibility';
import { makeOpportunity, makeProfile } from '../fixtures';

const summary = (over: Partial<EligibilitySummaryDto>): EligibilitySummaryDto => ({
  verdict: 'ELIGIBLE',
  score: 100,
  passed: [],
  failed: [],
  warnings: [],
  unknown: [],
  ...over,
});

const unlockInput = (id: string, eligibility: EligibilitySummaryDto) => ({
  opportunityId: id,
  slug: `slug-${id}`,
  title: `Role ${id}`,
  organizationName: `Org ${id}`,
  eligibility,
});

describe('collectUnlocks', () => {
  it('ranks fields by how many opportunities each would resolve', () => {
    const percentage = summary({
      verdict: 'NEEDS_REVIEW',
      unknown: [{ key: 'percentage', label: 'Percentage', passed: null, message: '', resolvedBy: 'education.percentage' }],
    });
    const age = summary({
      verdict: 'NEEDS_REVIEW',
      unknown: [{ key: 'age', label: 'Age', passed: null, message: '', resolvedBy: 'profile.dateOfBirth' }],
    });

    const result = collectUnlocks([
      unlockInput('1', percentage),
      unlockInput('2', percentage),
      unlockInput('3', percentage),
      unlockInput('4', age),
      unlockInput('5', summary({})),
    ]);

    expect(result.examinedCount).toBe(5);
    expect(result.unresolvedCount).toBe(4);
    expect(result.unlocks[0].field).toBe('education.percentage');
    expect(result.unlocks[0].blockedCount).toBe(3);
    expect(result.unlocks[1].field).toBe('profile.dateOfBirth');
  });

  it('counts an opportunity towards every field that blocks it', () => {
    const both = summary({
      verdict: 'NEEDS_REVIEW',
      unknown: [
        { key: 'cgpa', label: 'CGPA', passed: null, message: '', resolvedBy: 'education.cgpa' },
        { key: 'age', label: 'Age', passed: null, message: '', resolvedBy: 'profile.dateOfBirth' },
      ],
    });
    const result = collectUnlocks([unlockInput('1', both)]);

    expect(result.unlocks).toHaveLength(2);
    expect(result.unlocks.every((u) => u.blockedCount === 1)).toBe(true);
  });

  it('ignores decided verdicts', () => {
    const result = collectUnlocks([
      unlockInput('1', summary({})),
      unlockInput('2', summary({ verdict: 'NOT_ELIGIBLE' })),
    ]);
    expect(result.unlocks).toHaveLength(0);
    expect(result.unresolvedCount).toBe(0);
  });

  it('gives each unlock a prompt, a reason and somewhere to go', () => {
    const result = collectUnlocks([
      unlockInput(
        '1',
        summary({
          verdict: 'NEEDS_REVIEW',
          unknown: [{ key: 'cgpa', label: 'CGPA', passed: null, message: '', resolvedBy: 'education.cgpa' }],
        }),
      ),
    ]);
    const unlock = result.unlocks[0];
    expect(unlock.prompt.length).toBeGreaterThan(5);
    expect(unlock.detail.length).toBeGreaterThan(20);
    expect(unlock.href).toContain('/profile');
    expect(unlock.examples).toHaveLength(1);
  });

  it('is driven by the real engine output', () => {
    // A profile with no percentage, against a posting that publishes one.
    const profile = makeProfile({
      education: [{ ...makeProfile().education[0], cgpa: null, percentage: null }],
    });
    const opportunity = makeOpportunity({
      eligibility: { ...makeOpportunity().eligibility!, minCgpa: null, minPercentage: 60 },
    });
    const eligibility = evaluateEligibility(profile, opportunity);

    const result = collectUnlocks([unlockInput('1', eligibility)]);
    expect(result.unlocks[0].field).toBe('education.percentage');
  });
});

describe('collectNearMisses', () => {
  const nearMiss = (key: string, shortfall: number | null, unit: string | null, closable = true) =>
    summary({
      verdict: 'NOT_ELIGIBLE',
      failed: [
        {
          key,
          label: key,
          passed: false,
          message: `blocked by ${key}`,
          gap: { required: 'X', actual: 'Y', shortfall, unit, closable },
        },
      ],
    });

  it('groups rejections by the criterion that blocked them', () => {
    const result = collectNearMisses([
      { opportunity: { id: 'a' }, eligibility: nearMiss('cgpa', 0.2, 'CGPA') },
      { opportunity: { id: 'b' }, eligibility: nearMiss('cgpa', 0.5, 'CGPA') },
      { opportunity: { id: 'c' }, eligibility: nearMiss('backlogs', 1, 'backlogs') },
    ]);

    expect(result.ineligibleCount).toBe(3);
    const cgpa = result.groups.find((g) => g.key === 'cgpa')!;
    expect(cgpa.items).toHaveLength(2);
    // Closest first: acting on the smallest gap gives the quickest win.
    expect(cgpa.items[0].gap.shortfall).toBe(0.2);
  });

  it('excludes gaps that are too wide to be near', () => {
    const result = collectNearMisses([
      { opportunity: { id: 'a' }, eligibility: nearMiss('cgpa', 0.4, 'CGPA') },
      { opportunity: { id: 'b' }, eligibility: nearMiss('cgpa', 4.0, 'CGPA') },
    ]);
    expect(result.groups.find((g) => g.key === 'cgpa')!.items).toHaveLength(1);
  });

  it('puts groups the student can act on first', () => {
    const result = collectNearMisses([
      { opportunity: { id: 'a' }, eligibility: nearMiss('branch', null, null, false) },
      { opportunity: { id: 'b' }, eligibility: nearMiss('cgpa', 0.2, 'CGPA', true) },
    ]);
    expect(result.groups[0].closable).toBe(true);
    expect(result.groups[0].key).toBe('cgpa');
  });

  it('quotes both ends when a group spans several cut-offs', () => {
    const result = collectNearMisses([
      {
        opportunity: { id: 'a' },
        eligibility: summary({
          verdict: 'NOT_ELIGIBLE',
          failed: [{ key: 'cgpa', label: 'CGPA', passed: false, message: '', gap: { required: '6.5', actual: '6.0', shortfall: 0.5, unit: 'CGPA', closable: true } }],
        }),
      },
      {
        opportunity: { id: 'b' },
        eligibility: summary({
          verdict: 'NOT_ELIGIBLE',
          failed: [{ key: 'cgpa', label: 'CGPA', passed: false, message: '', gap: { required: '7.5', actual: '6.0', shortfall: 0.9, unit: 'CGPA', closable: true } }],
        }),
      },
    ]);

    const advice = result.groups[0].advice;
    // Quoting only the nearest cut-off would overstate what reaching it unlocks.
    expect(advice).toContain('6.5');
    expect(advice).toContain('7.5');
  });

  it('ignores eligible opportunities', () => {
    const result = collectNearMisses([{ opportunity: { id: 'a' }, eligibility: summary({}) }]);
    expect(result.groups).toHaveLength(0);
  });

  it('reads real gaps produced by the eligibility engine', () => {
    const profile = makeProfile({ education: [{ ...makeProfile().education[0], cgpa: 6.8 }] });
    const eligibility = evaluateEligibility(profile, makeOpportunity()); // needs 7.0

    const result = collectNearMisses([{ opportunity: { id: 'a' }, eligibility }]);
    const gap = result.groups[0].items[0].gap;
    expect(gap.shortfall).toBeCloseTo(0.2, 5);
    expect(gap.unit).toBe('CGPA');
    expect(gap.closable).toBe(true);
  });
});
