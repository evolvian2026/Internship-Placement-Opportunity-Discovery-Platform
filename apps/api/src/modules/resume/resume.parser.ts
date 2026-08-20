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
  // Resumes write the same number many ways: "+91 98765 43210", "9876543210",
  // "+91-98765-43210", "(+91) 98765 43210". Match a candidate run of digits
  // and separators, then validate on the digits alone so the separators
  // themselves cannot cause a miss.
  const candidates = text.match(/(?:\+\d{1,3}[\s.-]?)?(?:\(\d{1,4}\)[\s.-]?)?\d[\d\s.-]{7,17}\d/g);
  if (!candidates) return null;

  for (const candidate of candidates) {
    const digits = candidate.replace(/\D/g, '');

    // 10-digit Indian mobile, optionally prefixed with 91 or 0.
    const local = digits.replace(/^(?:0|91)/, '');
    if (local.length === 10 && /^[6-9]/.test(local)) return candidate.trim();

    // Other international numbers: a plausible length and an explicit +.
    if (candidate.includes('+') && digits.length >= 8 && digits.length <= 15) return candidate.trim();
  }
  return null;
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

/**
 * Groups an education section into blocks.
 *
 * A qualification is routinely written across two or three lines:
 *
 *   B.Tech in Computer Science, RV College of Engineering
 *   2022 - 2026 | CGPA: 8.4
 *
 * A block therefore starts at a line naming a degree and runs until the next
 * such line, so the year and grade stay attached to the degree they belong to.
 */
function groupEducationBlocks(text: string): string[] {
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const blocks: string[] = [];
  let current: string[] = [];

  const namesADegree = (line: string): boolean => DEGREE_PATTERNS.some((d) => d.pattern.test(line));

  for (const line of lines) {
    if (namesADegree(line) && current.length > 0) {
      blocks.push(current.join('\n'));
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length) blocks.push(current.join('\n'));

  // Only blocks that actually name a degree are qualifications.
  return blocks.filter(namesADegree);
}

export function extractEducation(text: string): ParsedEducation[] {
  const out: ParsedEducation[] = [];
  const currentYear = new Date().getFullYear();
  const entries = groupEducationBlocks(text);

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

    // [^\S\n] is "whitespace but not a newline": a block spans several lines,
    // and \s would let the name run on into the next one and swallow the year.
    const collegeMatch = entry.match(
      /((?:[A-Z][\w.&'-]*[^\S\n]+){0,5}(?:Institute|College|University|School|Academy|Vidyalaya)(?:[^\S\n]+of[^\S\n]+[\w][^\n]{1,30})?)/,
    );

    out.push({
      degree: degreeMatch.degree,
      branch,
      college: collegeMatch ? collegeMatch[1].replace(/[\s,;|]+$/, '').trim().slice(0, 160) : null,
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
    // An entry begins at a heading-like line; everything after it, until the
    // next heading, is that entry's description. Without this a wrapped
    // sentence such as "Built recurring SQL reports…" becomes a job title.
    const looksLikeHeading = (line: string): boolean => {
      const clean = line.replace(/^[•▪●\-*\s]+/, '').trim();
      if (clean.length < 4 || clean.length > 90) return false;
      if (/[.;]$/.test(clean)) return false;
      if (/^(built|created|developed|designed|implemented|worked|used|responsible|led|managed|analysed|analyzed|improved|reduced|increased)\b/i.test(clean)) {
        return false;
      }
      return /^[A-Z0-9]/.test(clean);
    };

    const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
    const entries: string[] = [];
    let buffer: string[] = [];

    for (const line of lines) {
      if (looksLikeHeading(line) && buffer.length > 0) {
        entries.push(buffer.join('\n'));
        buffer = [line];
      } else {
        buffer.push(line);
      }
    }
    if (buffer.length) entries.push(buffer.join('\n'));

    for (const entry of entries.slice(0, 8)) {
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
