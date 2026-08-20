import {
  DEGREES,
  EXPERIENCE_BANDS,
  DEGREE_LABELS,
  OPPORTUNITY_TYPES,
  SKILL_LOOKUP,
  canonicalizeSkill,
  type Degree,
  type OpportunityFilters,
  type OpportunityType,
} from '@odp/shared';

/**
 * Natural-language query parser.
 *
 * Turns "Government jobs for BTech CSE 2026 in Bengaluru" into structured
 * filters, and leaves whatever it could not classify as free-text `q`.
 *
 * This runs before any LLM is involved, so natural-language search works
 * identically with or without an API key configured.
 */

interface Rule {
  pattern: RegExp;
  apply: (filters: Partial<OpportunityFilters>, match: RegExpMatchArray) => void;
  /** Human-readable note added to the interpretation summary. */
  describe: (match: RegExpMatchArray) => string;
}

const TYPE_PHRASES: { pattern: RegExp; types: OpportunityType[]; label: string }[] = [
  { pattern: /\b(internships?|intern)\b/i, types: ['INTERNSHIP', 'GOVERNMENT_INTERNSHIP'], label: 'internships' },
  { pattern: /\bgovernment\s+internships?\b/i, types: ['GOVERNMENT_INTERNSHIP'], label: 'government internships' },
  { pattern: /\b(govt|government|sarkari)\s+(jobs?|vacanc(y|ies)|recruitment)\b/i, types: ['GOVERNMENT_JOB'], label: 'government jobs' },
  { pattern: /\bpsu\b/i, types: ['PSU_JOB'], label: 'PSU opportunities' },
  { pattern: /\bapprenticeships?\b/i, types: ['APPRENTICESHIP'], label: 'apprenticeships' },
  { pattern: /\bwalk[\s-]?ins?\b/i, types: ['WALK_IN'], label: 'walk-in drives' },
  { pattern: /\boff[\s-]?campus\b/i, types: ['OFF_CAMPUS_DRIVE'], label: 'off-campus drives' },
  { pattern: /\b(hiring\s+challenges?|hackathons?|coding\s+contests?)\b/i, types: ['HIRING_CHALLENGE'], label: 'hiring challenges' },
  { pattern: /\b(graduate\s+(program|trainee)|get|management\s+trainee)\b/i, types: ['GRADUATE_PROGRAM', 'TRAINEE'], label: 'graduate programmes' },
  { pattern: /\bfellowships?\b/i, types: ['FELLOWSHIP'], label: 'fellowships' },
  { pattern: /\bresearch\s+(opportunit(y|ies)|positions?)\b/i, types: ['RESEARCH_OPPORTUNITY'], label: 'research opportunities' },
  { pattern: /\b(full[\s-]?time|permanent)\b/i, types: ['FULL_TIME'], label: 'full-time roles' },
  { pattern: /\bpart[\s-]?time\b/i, types: ['PART_TIME'], label: 'part-time roles' },
  { pattern: /\bcontract\b/i, types: ['CONTRACT'], label: 'contract roles' },
];

/** Cities the platform sees most often; unmatched cities still work via `q`. */
const KNOWN_CITIES = [
  'Bengaluru', 'Bangalore', 'Hyderabad', 'Pune', 'Chennai', 'Mumbai', 'Delhi', 'New Delhi',
  'Noida', 'Gurugram', 'Gurgaon', 'Kolkata', 'Ahmedabad', 'Jaipur', 'Kochi', 'Coimbatore',
  'Indore', 'Bhubaneswar', 'Chandigarh', 'Lucknow', 'Nagpur', 'Vadodara', 'Visakhapatnam',
  'Thiruvananthapuram', 'Mysuru', 'Mohali', 'Bhopal', 'Surat', 'Patna', 'Guwahati',
];

const CITY_CANONICAL: Record<string, string> = {
  bangalore: 'Bengaluru',
  gurgaon: 'Gurugram',
  'new delhi': 'Delhi',
};

const DEGREE_PHRASES: { pattern: RegExp; degree: Degree }[] = [
  { pattern: /\bb[\s.-]?tech\b/i, degree: 'B_TECH' },
  { pattern: /\bb[\s.-]?e\b/i, degree: 'B_E' },
  { pattern: /\bb[\s.-]?sc\b/i, degree: 'B_SC' },
  { pattern: /\bb[\s.-]?com\b/i, degree: 'B_COM' },
  { pattern: /\bbca\b/i, degree: 'BCA' },
  { pattern: /\bbba\b/i, degree: 'BBA' },
  { pattern: /\bm[\s.-]?tech\b/i, degree: 'M_TECH' },
  { pattern: /\bm[\s.-]?sc\b/i, degree: 'M_SC' },
  { pattern: /\bmca\b/i, degree: 'MCA' },
  { pattern: /\bmba\b/i, degree: 'MBA' },
  { pattern: /\bpgdm\b/i, degree: 'PGDM' },
  { pattern: /\bdiploma\b/i, degree: 'DIPLOMA' },
  { pattern: /\bph[\s.-]?d\b/i, degree: 'PHD' },
];

const BRANCH_PHRASES: { pattern: RegExp; branch: string }[] = [
  { pattern: /\b(cse|computer\s+science)\b/i, branch: 'CSE' },
  { pattern: /\b(it|information\s+technology)\b/i, branch: 'IT' },
  { pattern: /\b(ece|electronics\s*(and|&)?\s*communication)\b/i, branch: 'ECE' },
  { pattern: /\b(eee|electrical\s*(and|&)?\s*electronics)\b/i, branch: 'EEE' },
  { pattern: /\b(mechanical|mech)\b/i, branch: 'Mechanical' },
  { pattern: /\bcivil\b/i, branch: 'Civil' },
  { pattern: /\bchemical\b/i, branch: 'Chemical' },
  { pattern: /\belectrical\b/i, branch: 'Electrical' },
  { pattern: /\baerospace\b/i, branch: 'Aerospace' },
  { pattern: /\bbiotech(nology)?\b/i, branch: 'Biotechnology' },
];

const DOMAIN_PHRASES: { pattern: RegExp; domain: string }[] = [
  { pattern: /\b(data\s+analytics|data\s+analyst)\b/i, domain: 'Data Analytics' },
  { pattern: /\b(data\s+scien(ce|tist))\b/i, domain: 'Data Science' },
  { pattern: /\b(machine\s+learning|ml\s+engineer)\b/i, domain: 'Machine Learning' },
  { pattern: /\b(artificial\s+intelligence|ai\s+(engineer|internship|jobs?))\b/i, domain: 'Artificial Intelligence' },
  { pattern: /\b(gen\s?ai|generative\s+ai)\b/i, domain: 'Generative AI' },
  { pattern: /\b(software\s+(development|engineer|developer)|sde)\b/i, domain: 'Software Development' },
  { pattern: /\b(web\s+development|frontend|front[\s-]end|backend|back[\s-]end|full[\s-]?stack)\b/i, domain: 'Web Development' },
  { pattern: /\bcyber\s?security\b/i, domain: 'Cybersecurity' },
  { pattern: /\bdevops\b/i, domain: 'DevOps' },
  { pattern: /\b(cloud)\b/i, domain: 'Cloud' },
  { pattern: /\b(business\s+analy(st|sis))\b/i, domain: 'Business Analysis' },
  { pattern: /\b(product\s+manage(ment|r))\b/i, domain: 'Product Management' },
  { pattern: /\b(digital\s+marketing)\b/i, domain: 'Digital Marketing' },
  { pattern: /\b(investment\s+banking)\b/i, domain: 'Investment Banking' },
  { pattern: /\b(ui\s*\/?\s*ux|ux\s+design)\b/i, domain: 'UI/UX Design' },
];

export interface NlqResult {
  filters: Partial<OpportunityFilters>;
  /** One-sentence description of what the parser understood. */
  interpretation: string;
  /** Text that could not be classified — passed to full-text search. */
  residual: string;
}

export function parseNaturalLanguageQuery(rawQuery: string): NlqResult {
  const filters: Partial<OpportunityFilters> = {};
  const notes: string[] = [];

  /**
   * Text that has already become a structured filter.
   *
   * Every pattern is matched against the *original* query and the matched text
   * recorded here; the residual is computed once at the end by subtracting all
   * of it. Doing this at the end rather than incrementally matters: consuming
   * "internship" early would otherwise stop a later multi-word rule such as
   * /ai\s+(engineer|internship)/ from matching, leaving "AI" behind as a
   * free-text term that silently narrows the search.
   */
  const consumed: string[] = [];

  const consume = (pattern: RegExp) => {
    // Always read from the untouched query, never from a partially-eaten copy.
    for (const match of rawQuery.matchAll(new RegExp(pattern.source, 'gi'))) {
      if (match[0].trim()) consumed.push(match[0]);
    }
  };

  /* ---- Opportunity types ---- */
  const types = new Set<OpportunityType>();
  for (const phrase of TYPE_PHRASES) {
    if (phrase.pattern.test(rawQuery)) {
      phrase.types.forEach((t) => types.add(t));
      notes.push(phrase.label);
      consume(phrase.pattern);
    }
  }
  // Explicit taxonomy tokens, e.g. someone pasting "GRADUATE_PROGRAM".
  for (const type of OPPORTUNITY_TYPES) {
    if (new RegExp(`\\b${type}\\b`, 'i').test(rawQuery)) types.add(type);
  }
  if (types.size) filters.types = [...types];

  /* ---- Work mode ---- */
  if (/\bremote\b/i.test(rawQuery) || /\bwork\s+from\s+home\b/i.test(rawQuery)) {
    filters.workModes = ['REMOTE'];
    notes.push('remote');
    consume(/\bremote\b/);
    consume(/\bwork\s+from\s+home\b/);
  } else if (/\bhybrid\b/i.test(rawQuery)) {
    filters.workModes = ['HYBRID'];
    notes.push('hybrid');
    consume(/\bhybrid\b/);
  } else if (/\bon[\s-]?site\b/i.test(rawQuery) || /\bin[\s-]?office\b/i.test(rawQuery)) {
    filters.workModes = ['ONSITE'];
    notes.push('on-site');
    consume(/\bon[\s-]?site\b/);
  }

  /* ---- Experience ---- */
  if (/\b(fresher|freshers|entry[\s-]level|no\s+experience|0\s*years?)\b/i.test(rawQuery)) {
    filters.experienceBands = ['FRESHER'];
    notes.push('freshers');
    consume(/\b(freshers?|entry[\s-]level)\b/);
  }
  const expRange = rawQuery.match(/\b(\d+)\s*(?:-|–|to)\s*(\d+)\s*(?:\+)?\s*(?:years?|yrs?)\b/i);
  if (expRange) {
    const lo = Number(expRange[1]);
    const hi = Number(expRange[2]);
    // Snap the spoken range onto the canonical bands the filters use.
    const bands = EXPERIENCE_BANDS.filter(
      (b) => b.minYears <= hi && (b.maxYears === null || b.maxYears >= lo),
    ).map((b) => b.id as string);
    if (bands.length) {
      filters.experienceBands = bands;
      notes.push(`${lo}–${hi} years experience`);
    }
    consume(/\b\d+\s*(?:-|–|to)\s*\d+\s*(?:\+)?\s*(?:years?|yrs?)\b/);
  }

  /* ---- Degrees ---- */
  const degrees = new Set<Degree>();
  for (const phrase of DEGREE_PHRASES) {
    if (phrase.pattern.test(rawQuery)) {
      degrees.add(phrase.degree);
      notes.push(DEGREE_LABELS[phrase.degree]);
      consume(phrase.pattern);
    }
  }
  for (const degree of DEGREES) {
    if (new RegExp(`\\b${degree}\\b`).test(rawQuery)) degrees.add(degree);
  }
  if (degrees.size) filters.degrees = [...degrees];

  /* ---- Branches ---- */
  const branches = new Set<string>();
  for (const phrase of BRANCH_PHRASES) {
    if (phrase.pattern.test(rawQuery)) {
      branches.add(phrase.branch);
      consume(phrase.pattern);
    }
  }
  if (branches.size) {
    filters.branches = [...branches];
    notes.push([...branches].join('/'));
  }

  /* ---- Domains ---- */
  const domains = new Set<string>();
  for (const phrase of DOMAIN_PHRASES) {
    if (phrase.pattern.test(rawQuery)) {
      domains.add(phrase.domain);
      notes.push(phrase.domain);
      consume(phrase.pattern);
    }
  }
  if (domains.size) filters.domains = [...domains];

  /* ---- Locations ---- */
  const cities = new Set<string>();
  for (const city of KNOWN_CITIES) {
    const pattern = new RegExp(`\\b${city}\\b`, 'i');
    if (pattern.test(rawQuery)) {
      cities.add(CITY_CANONICAL[city.toLowerCase()] ?? city);
      consume(pattern);
    }
  }
  if (cities.size) {
    filters.cities = [...cities];
    notes.push(`in ${[...cities].join(', ')}`);
  }

  /* ---- Graduation year / batch ---- */
  const years = new Set<number>();
  const yearMatches = rawQuery.matchAll(/\b(20\d{2})\b/g);
  for (const m of yearMatches) {
    const year = Number(m[1]);
    // Only plausible batch years, so "2010" in a company name is ignored.
    const thisYear = new Date().getFullYear();
    if (year >= thisYear - 6 && year <= thisYear + 6) {
      years.add(year);
      consume(new RegExp(`\\b${year}\\b`));
    }
  }
  if (years.size) {
    filters.graduationYears = [...years];
    notes.push(`${[...years].join(', ')} batch`);
  }

  /* ---- Deadline windows ---- */
  if (/\b(closing|expiring|ending)\s+(this\s+week|in\s+7\s+days)\b/i.test(rawQuery)) {
    filters.deadlineWithinDays = 7;
    notes.push('closing this week');
    consume(/\b(closing|expiring|ending)\s+(this\s+week|in\s+7\s+days)\b/);
  } else if (/\b(closing|expiring|ending)\s+(today|tomorrow)\b/i.test(rawQuery)) {
    filters.deadlineWithinDays = /tomorrow/i.test(rawQuery) ? 1 : 0;
    notes.push('closing very soon');
    consume(/\b(closing|expiring|ending)\s+(today|tomorrow)\b/);
  } else if (/\bclosing\s+in\s+(\d+)\s+days?\b/i.test(rawQuery)) {
    const m = rawQuery.match(/\bclosing\s+in\s+(\d+)\s+days?\b/i)!;
    filters.deadlineWithinDays = Number(m[1]);
    notes.push(`closing in ${m[1]} days`);
    consume(/\bclosing\s+in\s+\d+\s+days?\b/);
  }

  /* ---- Company type ---- */
  if (/\bproduct\s+(compan(y|ies)|based)\b/i.test(rawQuery)) {
    filters.companyTypes = ['PRODUCT'];
    notes.push('product companies');
    consume(/\bproduct\s+(compan(y|ies)|based)\b/);
  } else if (/\bservice\s+(compan(y|ies)|based)\b/i.test(rawQuery)) {
    filters.companyTypes = ['SERVICE'];
    notes.push('service companies');
    consume(/\bservice\s+(compan(y|ies)|based)\b/);
  } else if (/\bstart[\s-]?ups?\b/i.test(rawQuery)) {
    filters.companyTypes = ['STARTUP'];
    notes.push('startups');
    consume(/\bstart[\s-]?ups?\b/);
  } else if (/\bmnc\b/i.test(rawQuery)) {
    filters.companyTypes = ['MNC'];
    notes.push('MNCs');
    consume(/\bmnc\b/);
  }

  /* ---- Paid / stipend ---- */
  if (/\bpaid\b/i.test(rawQuery)) {
    filters.minSalary = 1;
    notes.push('paid only');
    consume(/\bpaid\b/);
  }

  /* ---- Skills ---- */
  const skills = new Set<string>();
  for (const token of rawQuery.split(/[\s,]+/)) {
    const cleaned = token.replace(/[^\w+#.]/g, '');
    if (cleaned.length < 2) continue;
    const canonical = SKILL_LOOKUP.get(cleaned.toLowerCase());
    if (canonical) {
      skills.add(canonical);
      consumed.push(cleaned);
    }
  }
  // Multi-word skills ("machine learning", "power bi").
  for (const [alias, canonical] of SKILL_LOOKUP.entries()) {
    if (!alias.includes(' ')) continue;
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\b${escaped}\\b`, 'gi');
    for (const match of rawQuery.matchAll(pattern)) {
      skills.add(canonical);
      consumed.push(match[0]);
    }
  }
  if (skills.size) {
    filters.skills = [...skills];
    notes.push([...skills].join(', '));
  }

  /* ---- Residual free text ---- */

  // Words that carry no discriminating power in a query and would otherwise
  // become mandatory substring filters.
  const stopWords = new Set([
    'for', 'in', 'at', 'on', 'to', 'the', 'a', 'an', 'with', 'and', 'or', 'of',
    'me', 'my', 'find', 'show', 'get', 'give', 'list', 'search', 'searching',
    'looking', 'look', 'want', 'need', 'which', 'what', 'who', 'where', 'when',
    'how', 'any', 'some', 'all', 'is', 'are', 'be', 'do', 'does', 'should',
    'jobs', 'job', 'roles', 'role', 'opportunities', 'opportunity', 'openings',
    'opening', 'hiring', 'hire', 'apply', 'application', 'vacancy', 'vacancies',
    'recruitment', 'company', 'companies', 'organisation', 'organisations',
    'organization', 'organizations', 'employer', 'employers',
    'can', 'i', 'am', 'eligible', 'eligibility', 'best', 'good', 'top', 'near',
    'around', 'please', 'available', 'currently', 'right', 'now',
  ]);

  let residual = ` ${rawQuery.trim()} `;
  // Longest first, so "machine learning" is removed before "learning".
  for (const text of [...consumed].sort((a, b) => b.length - a.length)) {
    const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    residual = residual.replace(new RegExp(escaped, 'gi'), ' ');
  }

  const residualTokens = residual
    .split(/[\s,]+/)
    .map((t) => t.replace(/[^\w+#.&-]/g, '').trim())
    .filter((t) => t.length > 1 && !stopWords.has(t.toLowerCase()));

  const residualText = residualTokens.join(' ').trim();
  if (residualText) filters.q = residualText;

  const interpretation = notes.length
    ? `Searching ${notes.join(' · ')}${residualText ? ` · matching "${residualText}"` : ''}`
    : residualText
      ? `Searching for "${residualText}"`
      : 'Showing all opportunities';

  return { filters, interpretation, residual: residualText };
}

export { canonicalizeSkill };
