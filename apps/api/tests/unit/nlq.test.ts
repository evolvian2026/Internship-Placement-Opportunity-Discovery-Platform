import { describe, expect, it } from 'vitest';
import { parseNaturalLanguageQuery } from '../../src/engines/nlq';

describe('parseNaturalLanguageQuery', () => {
  it('understands "Software Engineer fresher"', () => {
    const { filters } = parseNaturalLanguageQuery('Software Engineer fresher');
    expect(filters.experienceBands).toContain('FRESHER');
    expect(filters.domains).toContain('Software Development');
  });

  it('understands "Data Analyst internship"', () => {
    const { filters } = parseNaturalLanguageQuery('Data Analyst internship');
    expect(filters.types).toContain('INTERNSHIP');
    expect(filters.domains).toContain('Data Analytics');
  });

  it('understands "AI internship remote"', () => {
    const { filters } = parseNaturalLanguageQuery('AI internship remote');
    expect(filters.types).toContain('INTERNSHIP');
    expect(filters.workModes).toEqual(['REMOTE']);
  });

  it('understands "Government jobs for BTech CSE"', () => {
    const { filters } = parseNaturalLanguageQuery('Government jobs for BTech CSE');
    expect(filters.types).toContain('GOVERNMENT_JOB');
    expect(filters.degrees).toContain('B_TECH');
    expect(filters.branches).toContain('CSE');
  });

  it('understands "PSU jobs 2026"', () => {
    const { filters } = parseNaturalLanguageQuery('PSU jobs 2026');
    expect(filters.types).toContain('PSU_JOB');
    expect(filters.graduationYears).toContain(2026);
  });

  it('understands "Mechanical engineering jobs"', () => {
    const { filters } = parseNaturalLanguageQuery('Mechanical engineering jobs');
    expect(filters.branches).toContain('Mechanical');
  });

  it('understands "MBA marketing internship"', () => {
    const { filters } = parseNaturalLanguageQuery('MBA marketing internship');
    expect(filters.degrees).toContain('MBA');
    expect(filters.types).toContain('INTERNSHIP');
  });

  it('understands "Python developer fresher"', () => {
    const { filters } = parseNaturalLanguageQuery('Python developer fresher');
    expect(filters.skills).toContain('Python');
    expect(filters.experienceBands).toContain('FRESHER');
  });

  it('extracts a city', () => {
    const { filters } = parseNaturalLanguageQuery('data analyst jobs in Bengaluru');
    expect(filters.cities).toContain('Bengaluru');
  });

  it('canonicalises Bangalore to Bengaluru', () => {
    const { filters } = parseNaturalLanguageQuery('jobs in Bangalore');
    expect(filters.cities).toContain('Bengaluru');
  });

  it('understands a closing-soon query', () => {
    const { filters } = parseNaturalLanguageQuery('opportunities closing this week');
    expect(filters.deadlineWithinDays).toBe(7);
  });

  it('understands "product companies hiring CSE freshers"', () => {
    const { filters } = parseNaturalLanguageQuery('product companies hiring CSE freshers');
    expect(filters.companyTypes).toEqual(['PRODUCT']);
    expect(filters.branches).toContain('CSE');
    expect(filters.experienceBands).toContain('FRESHER');
  });

  it('maps a spoken experience range onto the canonical bands', () => {
    const { filters } = parseNaturalLanguageQuery('jobs with 2-5 years experience');
    expect(filters.experienceBands?.length).toBeGreaterThan(0);
    expect(filters.experienceBands).toContain('TWO_FIVE');
  });

  it('strips filler words out of the residual free text', () => {
    const { filters } = parseNaturalLanguageQuery('find me jobs for a data analyst');
    expect(filters.q ?? '').not.toMatch(/\b(find|me|for|a)\b/);
  });

  it('always returns a human-readable interpretation', () => {
    const result = parseNaturalLanguageQuery('remote AI internship in Pune 2026');
    expect(result.interpretation.length).toBeGreaterThan(10);
    expect(result.interpretation).toContain('Pune');
  });

  it('handles an empty query without throwing', () => {
    const result = parseNaturalLanguageQuery('');
    expect(result.filters.q).toBeUndefined();
    expect(result.interpretation).toBeTruthy();
  });
});
