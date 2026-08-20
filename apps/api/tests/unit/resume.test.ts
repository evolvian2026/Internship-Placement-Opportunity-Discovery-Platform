import { describe, expect, it } from 'vitest';
import {
  extractCity,
  extractEducation,
  extractEmail,
  extractName,
  extractPhone,
  parseResume,
} from '../../src/modules/resume/resume.parser';

describe('extractPhone', () => {
  // Regression: the spaced form most Indian resumes use was never matched.
  it('reads a number written with internal spaces', () => {
    expect(extractPhone('Contact: +91 98765 43210')).toBe('+91 98765 43210');
  });

  it('reads the other common separators', () => {
    expect(extractPhone('+91-98765-43210')).toBe('+91-98765-43210');
    expect(extractPhone('9876543210')).toBe('9876543210');
    expect(extractPhone('Phone: 098765 43210')).toContain('98765');
  });

  it('does not mistake a year range or a PIN code for a phone number', () => {
    expect(extractPhone('2022 - 2026')).toBeNull();
    expect(extractPhone('Bengaluru 560059')).toBeNull();
  });
});

describe('extractEducation', () => {
  // Regression: degree on one line with dates and grade on the next is one of
  // the most common resume layouts, and it dropped both fields.
  it('associates a year and CGPA written on the following line', () => {
    const text = [
      'B.Tech in Computer Science and Engineering, RV College of Engineering',
      '2022 - 2026 | CGPA: 8.4',
    ].join('\n');

    const [education] = extractEducation(text);
    expect(education.degree).toBe('B_TECH');
    expect(education.branch).toBe('CSE');
    expect(education.graduationYear).toBe(2026);
    expect(education.cgpa).toBe(8.4);
    expect(education.college).toBe('RV College of Engineering');
    // The college name must not run on into the next line and absorb the year.
    expect(education.college).not.toMatch(/\n|\d{4}/);
  });

  it('still reads a qualification written on a single line', () => {
    const [education] = extractEducation('MBA in Marketing, 2025, 72%');
    expect(education.degree).toBe('MBA');
    expect(education.percentage).toBe(72);
  });

  it('keeps two qualifications separate', () => {
    const text = [
      'M.Tech in Data Science, IIT Delhi',
      '2024 - 2026 | CGPA: 9.1',
      'B.Tech in Information Technology, VIT',
      '2020 - 2024 | CGPA: 8.0',
    ].join('\n');

    const rows = extractEducation(text);
    expect(rows).toHaveLength(2);
    expect(rows[0].degree).toBe('M_TECH');
    expect(rows[0].cgpa).toBe(9.1);
    expect(rows[1].degree).toBe('B_TECH');
    expect(rows[1].cgpa).toBe(8);
  });

  it('takes the later year of a range as the graduation year', () => {
    const [education] = extractEducation('B.Sc Physics\n2019 - 2022');
    expect(education.graduationYear).toBe(2022);
  });
});

describe('extractName / extractEmail / extractCity', () => {
  it('reads the header block of a resume', () => {
    const header = 'Rahul Sharma\nBengaluru, Karnataka\nrahul.sharma@example.com';
    expect(extractName(header, null)).toBe('Rahul Sharma');
    expect(extractEmail(header)).toBe('rahul.sharma@example.com');
    expect(extractCity(header)).toBe('Bengaluru');
  });

  it('canonicalises Bangalore to Bengaluru', () => {
    expect(extractCity('Bangalore, India')).toBe('Bengaluru');
  });
});

describe('parseResume', () => {
  const RESUME = `Rahul Sharma
Bengaluru, Karnataka
rahul.sharma@example.com | +91 98765 43210

EDUCATION
B.Tech in Computer Science and Engineering, RV College of Engineering
2022 - 2026 | CGPA: 8.4

TECHNICAL SKILLS
Python, SQL, Pandas, NumPy, Power BI, Excel, Java, Git, Machine Learning

EXPERIENCE
Data Analytics Intern at Clearwater Analytics
Built recurring SQL reports and a Power BI dashboard for the operations team.

PROJECTS
Campus Placement Tracker
Full-stack application built with React and Node.js.

CERTIFICATIONS
Microsoft Power BI Data Analyst (PL-300)
Google Data Analytics Professional Certificate
`;

  it('extracts every field the eligibility engine needs', () => {
    const parsed = parseResume(RESUME);

    expect(parsed.name).toBe('Rahul Sharma');
    expect(parsed.email).toBe('rahul.sharma@example.com');
    expect(parsed.phone).toContain('98765');
    expect(parsed.city).toBe('Bengaluru');

    expect(parsed.education[0].degree).toBe('B_TECH');
    expect(parsed.education[0].branch).toBe('CSE');
    expect(parsed.education[0].graduationYear).toBe(2026);
    expect(parsed.education[0].cgpa).toBe(8.4);

    expect(parsed.skills).toEqual(expect.arrayContaining(['Python', 'SQL', 'Power BI', 'Machine Learning']));
    expect(parsed.certifications.length).toBeGreaterThan(0);
  });

  // Regression: a wrapped sentence used to be recorded as a job title.
  it('does not turn a description line into a job title', () => {
    const parsed = parseResume(RESUME);
    for (const entry of parsed.experience) {
      expect(entry.title).not.toMatch(/^Built /);
      expect(entry.title.length).toBeLessThanOrEqual(90);
    }
    expect(parsed.experience.some((e) => e.title.includes('Data Analytics Intern'))).toBe(true);
  });

  it('separates the organisation from the title', () => {
    const parsed = parseResume(RESUME);
    const internship = parsed.experience.find((e) => e.title.includes('Data Analytics Intern'));
    expect(internship?.organization).toContain('Clearwater');
  });

  it('reports confidence per field group', () => {
    const parsed = parseResume(RESUME);
    expect(parsed.confidence.education).toBeGreaterThan(0);
    expect(parsed.confidence.skills).toBeGreaterThan(0);
  });

  it('returns empty structures rather than throwing on junk input', () => {
    const parsed = parseResume('....\n\n1234\n');
    expect(parsed.education).toEqual([]);
    expect(parsed.skills).toEqual([]);
  });
});
