import { describe, expect, it } from 'vitest';
import { normalize, parseLocationText } from '../../src/ingestion/normalizer';
import { validate } from '../../src/ingestion/validator';
import type { RawOpportunity } from '../../src/ingestion/types';

const base: RawOpportunity = {
  externalId: 'ext-1',
  title: 'Data Analyst Intern',
  organizationName: 'Acme Analytics',
  sourceUrl: 'https://careers.example.com/jobs/1',
};

describe('parseLocationText', () => {
  it('parses "City, State"', () => {
    expect(parseLocationText('Bengaluru, Karnataka')).toEqual([
      { city: 'Bengaluru', state: 'Karnataka', country: 'India', isRemote: false },
    ]);
  });

  it('parses multiple locations separated by a pipe', () => {
    const result = parseLocationText('Pune | Hyderabad');
    expect(result).toHaveLength(2);
    expect(result.map((l) => l.city)).toEqual(['Pune', 'Hyderabad']);
  });

  it('recognises a remote location', () => {
    expect(parseLocationText('Remote')).toEqual([
      { city: null, state: null, country: 'India', isRemote: true },
    ]);
  });

  it('records a bare state as a state, not a city', () => {
    expect(parseLocationText('Karnataka')[0]).toEqual({
      city: null,
      state: 'Karnataka',
      country: 'India',
      isRemote: false,
    });
  });

  it('returns nothing for empty input rather than inventing a location', () => {
    expect(parseLocationText(undefined)).toEqual([]);
    expect(parseLocationText('')).toEqual([]);
  });
});

describe('normalize', () => {
  it('classifies an internship from its title', () => {
    const result = normalize(base);
    expect(result.opportunityType).toBe('INTERNSHIP');
    expect(result.domainName).toBe('Data Analytics');
  });

  it('treats a monthly figure on an internship as a stipend, not a salary', () => {
    const result = normalize({ ...base, salaryText: 'Rs 25000 per month' });
    expect(result.stipendMin).toBe(25_000);
    expect(result.salaryMin).toBeNull();
  });

  it('treats an LPA figure on a full-time role as a salary', () => {
    const result = normalize({
      ...base,
      title: 'Software Engineer',
      salaryText: '8-12 LPA',
    });
    expect(result.salaryMin).toBe(800_000);
    expect(result.salaryMax).toBe(1_200_000);
    expect(result.salaryPeriod).toBe('YEAR');
  });

  it('leaves compensation null when the source publishes none', () => {
    const result = normalize(base);
    expect(result.salaryMin).toBeNull();
    expect(result.stipendMin).toBeNull();
  });

  it('prefers what the source states over what the parser infers', () => {
    const result = normalize({
      ...base,
      opportunityType: 'GOVERNMENT_JOB',
      eligibility: { degrees: ['MBA'], minCgpa: 6 },
      eligibilityText: 'B.Tech candidates with 8 CGPA',
    });
    expect(result.opportunityType).toBe('GOVERNMENT_JOB');
    expect(result.eligibility?.degrees).toEqual(['MBA']);
    expect(result.eligibility?.minCgpa).toBe(6);
  });

  it('keeps the source eligibility text verbatim', () => {
    const text = 'Only 2026 batch B.Tech CSE with 7.5 CGPA and no backlogs.';
    const result = normalize({ ...base, eligibilityText: text });
    expect(result.eligibility?.rawText).toBe(text);
  });

  it('defaults the application URL to the source URL when none is given', () => {
    expect(normalize(base).applicationUrl).toBe(base.sourceUrl);
  });
});

describe('validate', () => {
  it('accepts a well-formed opportunity', () => {
    const result = validate(
      normalize({
        ...base,
        description: 'A detailed description of the internship that runs for several sentences to be useful.',
        applicationDeadline: new Date(Date.now() + 20 * 86_400_000),
        locations: [{ city: 'Pune' }],
        skills: ['SQL'],
        eligibilityText: 'B.Tech CSE, 2026 batch',
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects a posting whose deadline has already passed', () => {
    const result = validate(
      normalize({ ...base, applicationDeadline: new Date(Date.now() - 86_400_000) }),
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/deadline/i);
  });

  it('rejects an invalid application URL', () => {
    const result = validate({ ...normalize(base), applicationUrl: 'not-a-url' });
    expect(result.ok).toBe(false);
  });

  it('warns rather than rejects when detail is merely missing', () => {
    const result = validate(normalize(base));
    expect(result.ok).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.completeness).toBeLessThan(60);
  });
});
