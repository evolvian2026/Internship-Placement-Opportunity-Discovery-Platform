import { describe, expect, it } from 'vitest';
import {
  extractBacklogs,
  extractBranches,
  extractCgpa,
  extractDegrees,
  extractExperience,
  extractGraduationYears,
  extractSkills,
  extractVacancies,
  parseOpportunityText,
} from '../../src/ingestion/parser';
import { parseCompensation } from '../../src/lib/money';

describe('extractDegrees', () => {
  it('reads degrees written in the usual Indian abbreviations', () => {
    expect(extractDegrees('Open to B.Tech / B.E. candidates')).toEqual(
      expect.arrayContaining(['B_TECH', 'B_E']),
    );
    expect(extractDegrees('MBA or PGDM required')).toEqual(expect.arrayContaining(['MBA', 'PGDM']));
  });

  it('returns nothing when no degree is mentioned', () => {
    expect(extractDegrees('We are hiring an engineer')).toEqual([]);
  });
});

describe('extractBranches', () => {
  it('recognises an all-branches posting', () => {
    expect(extractBranches('Any discipline may apply')).toEqual(['All Branches']);
    expect(extractBranches('All branches eligible')).toEqual(['All Branches']);
  });

  it('extracts named branches', () => {
    expect(extractBranches('Eligible: CSE, IT and ECE')).toEqual(
      expect.arrayContaining(['CSE', 'IT', 'ECE']),
    );
  });
});

describe('extractGraduationYears', () => {
  it('reads batch years only when the text is about a batch', () => {
    expect(extractGraduationYears('2026 and 2027 batch only')).toEqual([2026, 2027]);
  });

  it('ignores an unrelated year', () => {
    // "Founded in 2010" is not a batch year and is out of the plausible window.
    expect(extractGraduationYears('A company founded in 2010')).toEqual([]);
  });
});

describe('extractCgpa', () => {
  it('reads a stated minimum CGPA in several phrasings', () => {
    expect(extractCgpa('Minimum 7.5 CGPA required')).toBe(7.5);
    expect(extractCgpa('CGPA: 6.5 and above')).toBe(6.5);
    expect(extractCgpa('7 CGPA and above')).toBe(7);
  });

  it('returns null rather than guessing', () => {
    expect(extractCgpa('Good academic record required')).toBeNull();
  });
});

describe('extractBacklogs', () => {
  it('reads a no-backlogs requirement', () => {
    expect(extractBacklogs('No active backlogs at the time of joining')).toBe(0);
    expect(extractBacklogs('Backlogs are not allowed')).toBe(0);
  });

  it('reads a numeric allowance', () => {
    expect(extractBacklogs('Maximum 2 backlogs permitted')).toBe(2);
  });

  it('returns null when backlogs are not mentioned', () => {
    expect(extractBacklogs('Strong academics preferred')).toBeNull();
  });
});

describe('extractExperience', () => {
  it('reads a fresher posting as zero experience', () => {
    expect(extractExperience('Freshers may apply')).toEqual({ min: 0, max: 0 });
  });

  it('reads a range', () => {
    expect(extractExperience('2-5 years of experience')).toEqual({ min: 2, max: 5 });
  });

  it('reads an open-ended minimum', () => {
    expect(extractExperience('5+ years experience')).toEqual({ min: 5, max: null });
  });
});

describe('extractVacancies', () => {
  it('reads a vacancy count from a government notification', () => {
    expect(extractVacancies('No. of Posts: 1250')).toBe(1250);
    expect(extractVacancies('Total Posts - 45')).toBe(45);
  });
});

describe('extractSkills', () => {
  it('recognises skills including punctuated ones', () => {
    const skills = extractSkills('Strong in C++, Python and Power BI. Knowledge of .NET is a plus.');
    expect(skills).toEqual(expect.arrayContaining(['C++', 'Python', 'Power BI', '.NET']));
  });

  it('does not match a skill name inside an unrelated word', () => {
    const skills = extractSkills('We value integrity and rigour');
    expect(skills).not.toContain('R');
  });
});

describe('parseCompensation', () => {
  it('reads an LPA range into rupees per year', () => {
    expect(parseCompensation('8-12 LPA')).toEqual({ min: 800_000, max: 1_200_000, period: 'YEAR' });
  });

  it('reads a monthly stipend', () => {
    expect(parseCompensation('Stipend: Rs. 25000 per month')).toEqual({
      min: 25_000,
      max: 25_000,
      period: 'MONTH',
    });
  });

  it('returns nulls when no figure is published', () => {
    expect(parseCompensation('Salary as per industry standards')).toEqual({
      min: null,
      max: null,
      period: null,
    });
  });
});

describe('parseOpportunityText', () => {
  it('pulls a full eligibility picture out of a realistic posting', () => {
    const text = `
      Software Engineer — Graduate Trainee

      Eligibility: B.Tech / B.E. in CSE, IT or ECE. 2026 batch only.
      Minimum 7.0 CGPA required. No active backlogs.
      Freshers may apply.

      Compensation: 8-12 LPA

      Selection process:
      • Online assessment
      • Technical interview
      • HR interview

      Last date to apply: 28-08-2026
    `;

    const parsed = parseOpportunityText(text);

    expect(parsed.degrees).toEqual(expect.arrayContaining(['B_TECH', 'B_E']));
    expect(parsed.branches).toEqual(expect.arrayContaining(['CSE', 'IT', 'ECE']));
    expect(parsed.graduationYears).toContain(2026);
    expect(parsed.minCgpa).toBe(7);
    expect(parsed.maxBacklogs).toBe(0);
    expect(parsed.minExperienceYears).toBe(0);
    expect(parsed.compensation.min).toBe(800_000);
    expect(parsed.selectionProcess.length).toBeGreaterThan(0);
    expect(parsed.deadline).not.toBeNull();
  });
});
