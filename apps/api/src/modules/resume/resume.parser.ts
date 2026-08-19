import { DEGREES, canonicalizeSkills, type Degree } from '@odp/shared';
import { extractSkills } from '../../ingestion/parser';

/**
 * Resume parsing.
 *
 * Extracts a *proposal*, not a fact: everything returned here is presented to
 * the user for review before it touches their profile (requirement 10). Fields
 * the parser cannot read confidently are simply omitted.
 */

export interface ParsedEducation {
  degree: Degree;
  branch: string | null;
  college: string | null;
  graduationYear: number | null;
  cgpa: number | null;
  percentage: number | null;
}

export interface ParsedExperience {
  kind: 'INTERNSHIP' | 'JOB' | 'PROJECT' | 'FREELANCE';
  title: string;
  organization: string | null;
  description: string | null;
}

export interface ParsedResume {
  name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  skills: string[];
  education: ParsedEducation[];
  experience: ParsedExperience[];
  certifications: string[];
  /** Confidence 0–1 per field group, so the UI can flag what to double-check. */
  confidence: { name: number; contact: number; education: number; skills: number; experience: number };
}

const SECTION_HEADINGS = [
  'education', 'academic', 'qualification',
  'experience', 'employment', 'work history', 'internship',
  'project', 'skill', 'technical skill',
  'certification', 'course', 'training',
  'achievement', 'award', 'publication',
  'summary', 'objective', 'profile',
  'declaration', 'reference', 'hobby', 'interest', 'personal',
];

/** Splits the resume into labelled sections. */
export function splitSections(text: string): Map<string, string> {
  const lines = text.split(/\r?\n/);
  const sections = new Map<string, string>();
  let current = 'header';
  let buffer: string[] = [];

  const flush = (): void => {
    if (buffer.length) {
      sections.set(current, `${sections.get(current) ?? ''}\n${buffer.join('\n')}`.trim());
      buffer = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    // A heading is a short line that matches a known section word.
    const isHeading =
      trimmed.length > 0 &&
      trimmed.length < 60 &&
      SECTION_HEADINGS.some((h) => new RegExp(`^[^a-z]*${h}s?\\b`, 'i').test(trimmed));

    if (isHeading) {
      flush();
      const matched = SECTION_HEADINGS.find((h) => new RegExp(`^[^a-z]*${h}s?\\b`, 'i').test(trimmed))!;
      current = matched;
      continue;
    }
    buffer.push(line);
  }
  flush();
  return sections;
}

export function extractEmail(text: string): string | null {
  const match = text.match(/[\w.+-]+@[\w-]+\.[\w.-]{2,}/);
  return match ? match[0].toLowerCase() : null;
}

export function extractPhone(text: string): string | null {
  // Indian and international formats, avoiding years and PIN codes.
  const match = text.match(/(?:\+91[\s-]?)?[6-9]\d{9}\b|\+\d{1,3}[\s-]?\d{6,12}\b/);
  return match ? match[0].trim() : null;
}

export function extractName(text: string, email: string | null): string | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 8);

  for (const line of lines) {
    // A name line: 2–4 capitalised words, no digits, no contact punctuation.
    if (/@|\d|www\.|http/i.test(line)) continue;
    if (line.length > 50) continue;
    const words = line.split(/\s+/);
    if (words.length < 2 || words.length > 4) continue;
    if (SECTION_HEADINGS.some((h) => new RegExp(`\\b${h}`, 'i').test(line))) continue;
    if (words.every((w) => /^[A-Z][a-zA-Z.'-]*$/.test(w) || /^[A-Z.]+$/.test(w))) {
      return words
        .map((w) => (w === w.toUpperCase() && w.length > 1 ? w[0] + w.slice(1).toLowerCase() : w))
        .join(' ');
    }
  }

  // Fall back to the email local part, which is usually name-shaped.
  if (email) {
    const local = email.split('@')[0].replace(/[._\d]+/g, ' ').trim();
    if (local.length > 2 && local.includes(' ')) {
      return local
        .split(/\s+/)
        .map((w) => w[0].toUpperCase() + w.slice(1))
        .join(' ');
    }
  }
  return null;
}

const INDIAN_CITIES = [
  'Bengaluru', 'Bangalore', 'Hyderabad', 'Pune', 'Chennai', 'Mumbai', 'Delhi', 'New Delhi',
  'Noida', 'Gurugram', 'Gurgaon', 'Kolkata', 'Ahmedabad', 'Jaipur', 'Kochi', 'Coimbatore',
  'Indore', 'Bhubaneswar', 'Chandigarh', 'Lucknow', 'Nagpur', 'Vadodara', 'Visakhapatnam',
  'Thiruvananthapuram', 'Mysuru', 'Mohali', 'Bhopal', 'Surat', 'Patna', 'Guwahati', 'Ranchi',
];

export function extractCity(text: string): string | null {
  const head = text.slice(0, 800);
  for (const city of INDIAN_CITIES) {
    if (new RegExp(`\\b${city}\\b`, 'i').test(head)) {
      return city === 'Bangalore' ? 'Bengaluru' : city === 'Gurgaon' ? 'Gurugram' : city;
    }
  }
  return null;
}

const DEGREE_PATTERNS: { pattern: RegExp; degree: Degree }[] = [
  { pattern: /\bb\.?\s?tech\b|bachelor\s+of\s+technology/i, degree: 'B_TECH' },
  { pattern: /\bb\.?\s?e\.?\b|bachelor\s+of\s+engineering/i, degree: 'B_E' },
  { pattern: /\bm\.?\s?tech\b|master\s+of\s+technology/i, degree: 'M_TECH' },
  { pattern: /\bm\.?\s?e\.?\b(?!\w)/i, degree: 'M_E' },
  { pattern: /\bmca\b|master\s+of\s+computer\s+application/i, degree: 'MCA' },
  { pattern: /\bbca\b|bachelor\s+of\s+computer\s+application/i, degree: 'BCA' },
  { pattern: /\bmba\b|master\s+of\s+business/i, degree: 'MBA' },
  { pattern: /\bpgdm\b/i, degree: 'PGDM' },
  { pattern: /\bbba\b/i, degree: 'BBA' },
  { pattern: /\bb\.?\s?sc\b|bachelor\s+of\s+science/i, degree: 'B_SC' },
  { pattern: /\bm\.?\s?sc\b|master\s+of\s+science/i, degree: 'M_SC' },
  { pattern: /\bb\.?\s?com\b/i, degree: 'B_COM' },
  { pattern: /\bm\.?\s?com\b/i, degree: 'M_COM' },
  { pattern: /\bb\.?\s?a\.?\b(?!\w)/i, degree: 'B_A' },
  { pattern: /\bm\.?\s?a\.?\b(?!\w)/i, degree: 'M_A' },
  { pattern: /\bb\.?\s?pharm\b/i, degree: 'B_PHARM' },
  { pattern: /\bmbbs\b/i, degree: 'MBBS' },
  { pattern: /\bph\.?\s?d\b|doctorate/i, degree: 'PHD' },
  { pattern: /\bdiploma\b/i, degree: 'DIPLOMA' },
  { pattern: /\biti\b/i, degree: 'ITI' },
];

const BRANCH_PATTERNS: { pattern: RegExp; branch: string }[] = [
  { pattern: /\b(cse|computer\s+science)/i, branch: 'CSE' },
  { pattern: /\b(information\s+technology|\bit\b)/i, branch: 'IT' },
  { pattern: /\b(ece|electronics\s*(and|&)?\s*communication)/i, branch: 'ECE' },
  { pattern: /\b(eee|electrical\s*(and|&)?\s*electronics)/i, branch: 'EEE' },
  { pattern: /\bmechanical\b/i, branch: 'Mechanical' },
  { pattern: /\bcivil\b/i, branch: 'Civil' },
  { pattern: /\bchemical\b/i, branch: 'Chemical' },
  { pattern: /\belectrical\b/i, branch: 'Electrical' },
  { pattern: /\bbio\s?technology\b/i, branch: 'Biotechnology' },
  { pattern: /\bfinance\b/i, branch: 'Finance' },
  { pattern: /\bmarketing\b/i, branch: 'Marketing' },
];

export function extractEducation(text: string): ParsedEducation[] {
  const out: ParsedEducation[] = [];
  const currentYear = new Date().getFullYear();
  // Look at each line/entry separately so degree, branch and year stay together.
  const entries = text.split(/\n{1,}/).filter((l) => l.trim().length > 5);

  for (const entry of entries) {
    const degreeMatch = DEGREE_PATTERNS.find((d) => d.pattern.test(entry));
    if (!degreeMatch) continue;
    if (out.some((e) => e.degree === degreeMatch.degree)) continue;

    const branch = BRANCH_PATTERNS.find((b) => b.pattern.test(entry))?.branch ?? null;

    // Graduation year: prefer the later year in a range like "2022 – 2026".
    const years = [...entry.matchAll(/\b(19|20)\d{2}\b/g)]
      .map((m) => Number(m[0]))
      .filter((y) => y >= currentYear - 15 && y <= currentYear + 8);
    const graduationYear = years.length ? Math.max(...years) : null;

    const cgpaMatch = entry.match(/(?:cgpa|gpa)\s*[:\-–]?\s*(\d(?:\.\d+)?)|(\d(?:\.\d+)?)\s*(?:\/\s*10)?\s*(?:cgpa|gpa)/i);
    const cgpa = cgpaMatch ? Number(cgpaMatch[1] ?? cgpaMatch[2]) : null;

    const pctMatch = entry.match(/(\d{2}(?:\.\d+)?)\s*%/);
    const percentage = pctMatch ? Number(pctMatch[1]) : null;

    const collegeMatch = entry.match(
      /((?:[A-Z][\w.&'-]*\s+){0,5}(?:Institute|College|University|School|Academy|Vidyalaya)(?:\s+of\s+[\w\s]{2,30})?)/,
    );

    out.push({
      degree: degreeMatch.degree,
      branch,
      college: collegeMatch ? collegeMatch[1].trim().slice(0, 160) : null,
      graduationYear,
      cgpa: cgpa != null && cgpa > 0 && cgpa <= 10 ? cgpa : null,
      percentage: percentage != null && percentage >= 30 && percentage <= 100 ? percentage : null,
    });
  }

  // Explicit taxonomy tokens, in case the resume was machine-generated.
  if (out.length === 0) {
    for (const degree of DEGREES) {
      if (new RegExp(`\\b${degree}\\b`).test(text)) {
        out.push({ degree, branch: null, college: null, graduationYear: null, cgpa: null, percentage: null });
        break;
      }
    }
  }

  return out.slice(0, 5);
}

export function extractExperience(sections: Map<string, string>): ParsedExperience[] {
  const out: ParsedExperience[] = [];

  const pushFrom = (text: string | undefined, kind: ParsedExperience['kind']): void => {
    if (!text) return;
    const entries = text
      .split(/\n(?=[A-Z•\-*])/)
      .map((e) => e.trim())
      .filter((e) => e.length > 15 && e.length < 1200)
      .slice(0, 8);

    for (const entry of entries) {
      const firstLine = entry.split('\n')[0].replace(/^[•\-*\s]+/, '').trim();
      if (firstLine.length < 4) continue;

      // "Data Analyst Intern at Acme Corp" / "Data Analyst — Acme Corp"
      const split = firstLine.match(/^(.{3,90}?)\s*(?:\bat\b|[—–|,])\s*(.{2,80})$/i);
      out.push({
        kind,
        title: (split ? split[1] : firstLine).slice(0, 160).trim(),
        organization: split ? split[2].replace(/\(.*?\)/g, '').trim().slice(0, 160) : null,
        description: entry.split('\n').slice(1).join(' ').trim().slice(0, 1000) || null,
      });
    }
  };

  pushFrom(sections.get('internship'), 'INTERNSHIP');
  pushFrom(sections.get('experience') ?? sections.get('employment') ?? sections.get('work history'), 'JOB');
  pushFrom(sections.get('project'), 'PROJECT');

  return out.slice(0, 15);
}

export function extractCertifications(sections: Map<string, string>): string[] {
  const text = sections.get('certification') ?? sections.get('course') ?? sections.get('training');
  if (!text) return [];

  return text
    .split(/\n|[•▪●]/)
    .map((l) => l.replace(/^[\s\-*•▪●\d.)]+/, '').trim())
    .filter((l) => l.length > 4 && l.length < 160)
    .slice(0, 15);
}

export function parseResume(rawText: string): ParsedResume {
  // Normalise the whitespace PDF extraction tends to produce.
  const text = rawText.replace(/\r\n/g, '\n').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n');
  const sections = splitSections(text);

  const email = extractEmail(text);
  const phone = extractPhone(text);
  const name = extractName(text, email);
  const city = extractCity(text);

  const educationText =
    sections.get('education') ?? sections.get('academic') ?? sections.get('qualification') ?? text;
  const education = extractEducation(educationText);

  const skillsText =
    [sections.get('skill'), sections.get('technical skill')].filter(Boolean).join('\n') || text;
  const skills = canonicalizeSkills(extractSkills(skillsText));

  const experience = extractExperience(sections);
  const certifications = extractCertifications(sections);

  return {
    name,
    email,
    phone,
    city,
    skills,
    education,
    experience,
    certifications,
    confidence: {
      name: name ? 0.75 : 0,
      contact: email ? (phone ? 0.95 : 0.7) : 0.2,
      education: education.length ? (education[0].graduationYear ? 0.85 : 0.6) : 0,
      // Skills found inside a dedicated section are more trustworthy.
      skills: skills.length === 0 ? 0 : sections.has('skill') ? 0.9 : 0.6,
      experience: experience.length ? 0.7 : 0,
    },
  };
}
