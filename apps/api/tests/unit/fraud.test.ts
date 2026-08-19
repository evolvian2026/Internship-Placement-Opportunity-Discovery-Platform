import { describe, expect, it } from 'vitest';
import { FRAUD_REVIEW_THRESHOLD, assessFraudRisk } from '../../src/ingestion/fraud';

describe('assessFraudRisk', () => {
  const clean = {
    title: 'Software Engineer',
    description: 'Build backend services. Apply through our careers page.',
    applicationUrl: 'https://careers.example.com/jobs/1',
    trustLevel: 'OFFICIAL',
    opportunityType: 'FULL_TIME',
  };

  it('flags nothing on a clean official posting', () => {
    const result = assessFraudRisk(clean);
    expect(result.flags).toHaveLength(0);
    expect(result.score).toBe(0);
  });

  it('flags a posting that demands a registration fee', () => {
    const result = assessFraudRisk({
      ...clean,
      description: 'Pay a registration fee of Rs 2000 to confirm your seat.',
      trustLevel: 'THIRD_PARTY',
    });
    expect(result.flags).toContain('PAYMENT_REQUIRED');
    expect(result.score).toBeGreaterThanOrEqual(FRAUD_REVIEW_THRESHOLD);
  });

  it('does not flag a legitimate government application fee', () => {
    const result = assessFraudRisk({
      ...clean,
      description: 'Application fee: Rs 500 (no fee for SC/ST candidates).',
      opportunityType: 'GOVERNMENT_JOB',
    });
    expect(result.flags).not.toContain('PAYMENT_REQUIRED');
  });

  it('flags a request for bank details', () => {
    const result = assessFraudRisk({
      ...clean,
      description: 'Share your bank account number and debit card details to proceed.',
    });
    expect(result.flags).toContain('BANK_DETAILS_REQUESTED');
  });

  it('flags a guaranteed-job claim', () => {
    const result = assessFraudRisk({ ...clean, description: '100% job guarantee after training.' });
    expect(result.flags).toContain('GUARANTEED_JOB');
  });

  it('flags an application routed through a personal messaging link', () => {
    const result = assessFraudRisk({ ...clean, applicationUrl: 'https://wa.me/919999999999' });
    expect(result.flags).toContain('UNVERIFIED_APPLY_CHANNEL');
  });

  it('flags an implausible salary for an internship', () => {
    const result = assessFraudRisk({
      ...clean,
      opportunityType: 'INTERNSHIP',
      salaryMax: 90_000_000,
    });
    expect(result.flags).toContain('UNUSUAL_COMPENSATION');
  });

  it('describes every signal in plain language for the reviewer', () => {
    const result = assessFraudRisk({ ...clean, description: 'Guaranteed placement, limited seats only!' });
    for (const signal of result.signals) {
      expect(signal.label.length).toBeGreaterThan(10);
    }
  });
});
