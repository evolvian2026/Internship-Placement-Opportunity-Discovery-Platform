import {
  GOVERNMENT_CATEGORIES,
  INDUSTRY_SEED,
  PSU_CATEGORIES,
  type OpportunityType,
  type WorkMode,
} from '@odp/shared';

/**
 * Classification: assigns the controlled taxonomy to a posting.
 *
 * Deterministic and rule-based so results are reproducible and auditable.
 * The `confidence` value lets the quality validator route low-confidence rows
 * to the admin review queue instead of publishing a wrong category.
 */

export interface Classification<T> {
  value: T;
  confidence: number;
  reason: string;
}

const TYPE_RULES: { pattern: RegExp; type: OpportunityType; confidence: number }[] = [
  { pattern: /\b(psu|public\s+sector\s+undertaking|bhel|ongc|ntpc|gail|iocl|sail|hal\b|drdo|isro|bpcl|hpcl|nhpc|powergrid)\b/i, type: 'PSU_JOB', confidence: 0.9 },
  { pattern: /\b(government\s+internship|govt\.?\s+internship)\b/i, type: 'GOVERNMENT_INTERNSHIP', confidence: 0.95 },
  { pattern: /\b(upsc|ssc\b|ibps|rrb\b|railway\s+recruitment|state\s+public\s+service|government\s+of\s+india|ministry\s+of|sarkari)\b/i, type: 'GOVERNMENT_JOB', confidence: 0.85 },
  { pattern: /\bapprentice(ship)?\b/i, type: 'APPRENTICESHIP', confidence: 0.9 },
  { pattern: /\bfellowship\b/i, type: 'FELLOWSHIP', confidence: 0.9 },
  { pattern: /\b(research\s+(intern|associate|assistant|scholar|position)|jrf\b|srf\b)\b/i, type: 'RESEARCH_OPPORTUNITY', confidence: 0.8 },
  { pattern: /\bintern(ship)?\b/i, type: 'INTERNSHIP', confidence: 0.9 },
  { pattern: /\bwalk[\s-]?in\b/i, type: 'WALK_IN', confidence: 0.9 },
  { pattern: /\b(off[\s-]?campus\s+drive|mega\s+drive|recruitment\s+drive)\b/i, type: 'OFF_CAMPUS_DRIVE', confidence: 0.85 },
  { pattern: /\b(hiring\s+challenge|hackathon|coding\s+(contest|challenge)|codeathon)\b/i, type: 'HIRING_CHALLENGE', confidence: 0.9 },
  { pattern: /\b(graduate\s+(engineer\s+)?trainee|get\b|graduate\s+program(me)?|campus\s+hire)\b/i, type: 'GRADUATE_PROGRAM', confidence: 0.8 },
  { pattern: /\b(management\s+trainee|trainee\s+engineer|software\s+trainee|trainee)\b/i, type: 'TRAINEE', confidence: 0.75 },
  { pattern: /\bpart[\s-]?time\b/i, type: 'PART_TIME', confidence: 0.85 },
  { pattern: /\b(contract(ual)?|fixed[\s-]term|temporary)\b/i, type: 'CONTRACT', confidence: 0.75 },
  { pattern: /\bfull[\s-]?time\b/i, type: 'FULL_TIME', confidence: 0.8 },
];

export function classifyType(input: {
  title: string;
  description?: string;
  typeHint?: string;
  organizationName?: string;
}): Classification<OpportunityType> {
  const hint = input.typeHint?.trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (hint && TYPE_RULES.some((r) => r.type === hint)) {
    return { value: hint as OpportunityType, confidence: 1, reason: 'source declared the type' };
  }

  // Title carries far more signal than the body, so score it first.
  const title = input.title ?? '';
  for (const rule of TYPE_RULES) {
    if (rule.pattern.test(title)) {
      return { value: rule.type, confidence: rule.confidence, reason: `title matched ${rule.pattern.source}` };
    }
  }

  const body = `${input.organizationName ?? ''} ${input.description ?? ''}`;
  for (const rule of TYPE_RULES) {
    if (rule.pattern.test(body)) {
      return {
        value: rule.type,
        confidence: rule.confidence * 0.7,
        reason: `description matched ${rule.pattern.source}`,
      };
    }
  }

  return { value: 'FULL_TIME', confidence: 0.4, reason: 'defaulted — no explicit signal' };
}

/** Domain keyword table, derived from the seed taxonomy plus role synonyms. */
const DOMAIN_KEYWORDS: { domain: string; industry: string; patterns: RegExp[] }[] = [
  { domain: 'Software Development', industry: 'Technology', patterns: [/\bsoftware\s+(engineer|developer|development)\b/i, /\bsde\b/i, /\bapplication\s+developer\b/i] },
  { domain: 'Web Development', industry: 'Technology', patterns: [/\b(front[\s-]?end|back[\s-]?end|full[\s-]?stack|web\s+developer|react|angular|node\.js)\b/i] },
  { domain: 'Mobile Development', industry: 'Technology', patterns: [/\b(android|ios|mobile\s+(app\s+)?developer|flutter|react\s+native)\b/i] },
  { domain: 'Cloud', industry: 'Technology', patterns: [/\b(cloud\s+(engineer|architect)|aws|azure|gcp)\b/i] },
  { domain: 'DevOps', industry: 'Technology', patterns: [/\b(devops|site\s+reliability|sre\b|platform\s+engineer)\b/i] },
  { domain: 'Cybersecurity', industry: 'Technology', patterns: [/\b(cyber\s?security|information\s+security|soc\s+analyst|penetration\s+test)\b/i] },
  { domain: 'Networking', industry: 'Technology', patterns: [/\b(network\s+engineer|ccna|routing\s+and\s+switching)\b/i] },
  { domain: 'QA / Testing', industry: 'Technology', patterns: [/\b(qa\b|quality\s+assurance|test\s+engineer|sdet|automation\s+tester)\b/i] },
  { domain: 'Embedded Systems', industry: 'Technology', patterns: [/\b(embedded|firmware|rtos|microcontroller)\b/i] },
  { domain: 'IT Support', industry: 'Technology', patterns: [/\b(it\s+support|help\s?desk|desktop\s+support|technical\s+support)\b/i] },

  { domain: 'Data Analytics', industry: 'Data & AI', patterns: [/\b(data\s+analyst|business\s+intelligence\s+analyst|analytics\s+(intern|associate))\b/i] },
  { domain: 'Data Science', industry: 'Data & AI', patterns: [/\bdata\s+scientist\b/i] },
  { domain: 'Machine Learning', industry: 'Data & AI', patterns: [/\b(machine\s+learning|ml\s+engineer)\b/i] },
  { domain: 'Artificial Intelligence', industry: 'Data & AI', patterns: [/\b(artificial\s+intelligence|ai\s+(engineer|researcher|intern))\b/i] },
  { domain: 'Generative AI', industry: 'Data & AI', patterns: [/\b(generative\s+ai|gen\s?ai|llm\s+engineer|prompt\s+engineer)\b/i] },
  { domain: 'Data Engineering', industry: 'Data & AI', patterns: [/\b(data\s+engineer|etl\s+developer|data\s+pipeline)\b/i] },
  { domain: 'Business Intelligence', industry: 'Data & AI', patterns: [/\b(bi\s+(analyst|developer)|power\s?bi\s+developer|tableau\s+developer)\b/i] },

  { domain: 'Product Management', industry: 'Product & Business', patterns: [/\bproduct\s+(manager|management|owner)\b/i] },
  { domain: 'Business Analysis', industry: 'Product & Business', patterns: [/\bbusiness\s+analyst\b/i] },
  { domain: 'Consulting', industry: 'Product & Business', patterns: [/\b(consultant|consulting\s+(analyst|associate))\b/i] },
  { domain: 'Project Management', industry: 'Product & Business', patterns: [/\b(project\s+manager|program\s+manager|pmo)\b/i] },
  { domain: 'Business Operations', industry: 'Product & Business', patterns: [/\b(business\s+operations|operations\s+analyst)\b/i] },

  { domain: 'Banking', industry: 'Finance', patterns: [/\b(probationary\s+officer|bank\s+clerk|banking\s+associate|relationship\s+manager)\b/i] },
  { domain: 'Investment Banking', industry: 'Finance', patterns: [/\binvestment\s+banking\b/i] },
  { domain: 'Financial Analysis', industry: 'Finance', patterns: [/\b(financial\s+analyst|finance\s+(intern|associate)|fp&a)\b/i] },
  { domain: 'Accounting', industry: 'Finance', patterns: [/\b(accountant|accounts\s+executive|book\s?keeping)\b/i] },
  { domain: 'FinTech', industry: 'Finance', patterns: [/\bfintech\b/i] },
  { domain: 'Risk Management', industry: 'Finance', patterns: [/\b(risk\s+(analyst|manager)|credit\s+risk)\b/i] },
  { domain: 'Audit', industry: 'Finance', patterns: [/\b(audit(or)?|internal\s+audit)\b/i] },

  { domain: 'Sales', industry: 'Sales & Marketing', patterns: [/\b(sales\s+(executive|associate|intern|manager)|inside\s+sales)\b/i] },
  { domain: 'Business Development', industry: 'Sales & Marketing', patterns: [/\bbusiness\s+development\b/i] },
  { domain: 'Digital Marketing', industry: 'Sales & Marketing', patterns: [/\bdigital\s+marketing\b/i] },
  { domain: 'Content Marketing', industry: 'Sales & Marketing', patterns: [/\b(content\s+(writer|marketing)|copywriter)\b/i] },
  { domain: 'SEO', industry: 'Sales & Marketing', patterns: [/\bseo\b/i] },
  { domain: 'Market Research', industry: 'Sales & Marketing', patterns: [/\bmarket\s+research\b/i] },

  { domain: 'Mechanical', industry: 'Core Engineering', patterns: [/\bmechanical\s+(engineer|design)\b/i] },
  { domain: 'Civil', industry: 'Core Engineering', patterns: [/\b(civil\s+engineer|site\s+engineer|structural\s+engineer)\b/i] },
  { domain: 'Electrical', industry: 'Core Engineering', patterns: [/\belectrical\s+engineer\b/i] },
  { domain: 'Electronics', industry: 'Core Engineering', patterns: [/\belectronics\s+engineer\b/i] },
  { domain: 'Chemical', industry: 'Core Engineering', patterns: [/\bchemical\s+engineer\b/i] },
  { domain: 'Automobile', industry: 'Core Engineering', patterns: [/\b(automobile|automotive)\s+engineer\b/i] },
  { domain: 'Aerospace', industry: 'Core Engineering', patterns: [/\baerospace\s+engineer\b/i] },
  { domain: 'Robotics', industry: 'Core Engineering', patterns: [/\brobotics\b/i] },

  { domain: 'Healthcare', industry: 'Healthcare', patterns: [/\b(nurse|medical\s+officer|healthcare\s+(assistant|executive))\b/i] },
  { domain: 'Pharmaceuticals', industry: 'Healthcare', patterns: [/\b(pharma(ceutical)?|drug\s+safety|formulation)\b/i] },
  { domain: 'Biotechnology', industry: 'Healthcare', patterns: [/\bbio\s?technolog(y|ist)\b/i] },
  { domain: 'Medical Research', industry: 'Healthcare', patterns: [/\b(clinical\s+research|medical\s+research)\b/i] },

  { domain: 'HR', industry: 'Human Resources', patterns: [/\b(human\s+resources?|hr\s+(intern|executive|associate|generalist)|talent\s+acquisition|recruiter)\b/i] },
  { domain: 'Legal', industry: 'Legal', patterns: [/\b(legal\s+(intern|associate|counsel)|advocate|paralegal)\b/i] },
  { domain: 'Teaching', industry: 'Education', patterns: [/\b(teacher|lecturer|assistant\s+professor|faculty)\b/i] },
  { domain: 'Scientific Research', industry: 'Research', patterns: [/\b(scientist|research\s+(associate|fellow|officer))\b/i] },
  { domain: 'Supply Chain', industry: 'Operations & Supply Chain', patterns: [/\b(supply\s+chain|logistics|procurement|warehouse)\b/i] },
  { domain: 'UI/UX Design', industry: 'Design', patterns: [/\b(ui\s*\/?\s*ux|ux\s+(designer|researcher)|product\s+designer)\b/i] },
  { domain: 'Graphic Design', industry: 'Design', patterns: [/\bgraphic\s+design(er)?\b/i] },
  { domain: 'Architecture', industry: 'Architecture', patterns: [/\barchitect(ure)?\b/i] },
  { domain: 'Production', industry: 'Manufacturing', patterns: [/\b(production\s+(engineer|executive)|plant\s+operations)\b/i] },
  { domain: 'Quality Control', industry: 'Manufacturing', patterns: [/\b(quality\s+(control|engineer)|qa\s+chemist)\b/i] },
  { domain: 'Solar', industry: 'Renewable Energy', patterns: [/\bsolar\b/i] },
  { domain: 'Telecom Networks', industry: 'Telecommunications', patterns: [/\b(telecom|5g\b|rf\s+engineer)\b/i] },
  { domain: 'E-commerce', industry: 'Retail & E-commerce', patterns: [/\be[\s-]?commerce\b/i] },
  { domain: 'Administrative Services', industry: 'Public Administration', patterns: [/\b(administrative\s+officer|clerk|assistant\s+section\s+officer)\b/i] },
  { domain: 'Defence Services', industry: 'Defence', patterns: [/\b(defence|defense|indian\s+(army|navy|air\s+force))\b/i] },
];

const VALID_INDUSTRIES = new Set(INDUSTRY_SEED.map((i) => i.name));

export function classifyDomain(input: {
  title: string;
  description?: string;
  domainHint?: string;
  industryHint?: string;
  skills?: string[];
}): Classification<{ industry: string | null; domain: string | null }> {
  if (input.domainHint) {
    const seedIndustry = INDUSTRY_SEED.find((i) =>
      i.domains.some((d) => d.name.toLowerCase() === input.domainHint!.toLowerCase()),
    );
    if (seedIndustry) {
      const domain = seedIndustry.domains.find(
        (d) => d.name.toLowerCase() === input.domainHint!.toLowerCase(),
      )!;
      return {
        value: { industry: seedIndustry.name, domain: domain.name },
        confidence: 1,
        reason: 'source declared the domain',
      };
    }
  }

  const title = input.title ?? '';
  for (const entry of DOMAIN_KEYWORDS) {
    if (entry.patterns.some((p) => p.test(title))) {
      return {
        value: { industry: entry.industry, domain: entry.domain },
        confidence: 0.9,
        reason: 'matched the job title',
      };
    }
  }

  const body = input.description ?? '';
  for (const entry of DOMAIN_KEYWORDS) {
    if (entry.patterns.some((p) => p.test(body))) {
      return {
        value: { industry: entry.industry, domain: entry.domain },
        confidence: 0.6,
        reason: 'matched the description',
      };
    }
  }

  // Fall back to the industry hint alone when it is one we recognise.
  if (input.industryHint && VALID_INDUSTRIES.has(input.industryHint)) {
    return {
      value: { industry: input.industryHint, domain: null },
      confidence: 0.5,
      reason: 'source declared the industry',
    };
  }

  return { value: { industry: null, domain: null }, confidence: 0, reason: 'no classification signal' };
}

export function classifyWorkMode(input: {
  workMode?: WorkMode;
  locationText?: string;
  title?: string;
  description?: string;
}): WorkMode {
  if (input.workMode && input.workMode !== 'NOT_SPECIFIED') return input.workMode;

  const haystack = `${input.title ?? ''} ${input.locationText ?? ''} ${input.description ?? ''}`;
  if (/\b(work\s+from\s+home|wfh|fully\s+remote|remote)\b/i.test(haystack)) return 'REMOTE';
  if (/\bhybrid\b/i.test(haystack)) return 'HYBRID';
  if (/\b(on[\s-]?site|in[\s-]?office|work\s+from\s+office|wfo)\b/i.test(haystack)) return 'ONSITE';
  return 'NOT_SPECIFIED';
}

export function classifyGovernmentCategory(input: {
  title: string;
  organizationName: string;
  description?: string;
}): string | null {
  const haystack = `${input.title} ${input.organizationName} ${input.description ?? ''}`;

  const rules: [RegExp, (typeof GOVERNMENT_CATEGORIES)[number]][] = [
    [/\bupsc|union\s+public\s+service\b/i, 'UPSC'],
    [/\bssc\b|staff\s+selection\s+commission/i, 'SSC'],
    [/\bibps\b|institute\s+of\s+banking/i, 'IBPS'],
    [/\bsbi\b|state\s+bank\s+of\s+india/i, 'SBI'],
    [/\brailway|rrb\b|indian\s+railways/i, 'Railways'],
    [/\bdefence|defense|drdo|indian\s+(army|navy|air\s+force)/i, 'Defence'],
    [/\bisro|csir|icar|iisc|research\s+organis/i, 'Research Organizations'],
    [/\b(teacher|lecturer|professor|tgt|pgt|net\b)/i, 'Teaching'],
    [/\b(junior\s+engineer|assistant\s+engineer|technical\s+officer)\b/i, 'Engineering'],
    [/\b(nurse|medical\s+officer|aiims|hospital)\b/i, 'Healthcare'],
    [/\b(clerk|administrative|assistant\s+section\s+officer)\b/i, 'Administrative'],
    [/\bstate\s+(government|public\s+service)\b/i, 'State Government'],
    [/\bpsu|public\s+sector\s+undertaking\b/i, 'PSU'],
  ];

  for (const [pattern, category] of rules) {
    if (pattern.test(haystack)) return category;
  }
  return null;
}

export function classifyPsuCategory(input: { title: string; description?: string }): string | null {
  const haystack = `${input.title} ${input.description ?? ''}`;
  const rules: [RegExp, (typeof PSU_CATEGORIES)[number]][] = [
    [/\bapprentice\b/i, 'Apprentice'],
    [/\b(graduate\s+(engineer\s+)?trainee|management\s+trainee|executive\s+trainee)\b/i, 'Graduate Trainee'],
    [/\b(engineer|engineering|technical)\b/i, 'Engineering'],
    [/\b(finance|accounts|chartered\s+accountant)\b/i, 'Finance'],
    [/\b(hr|human\s+resources?|personnel)\b/i, 'HR'],
    [/\b(it\b|information\s+technology|systems)\b/i, 'IT'],
    [/\b(operations|plant|production)\b/i, 'Operations'],
    [/\b(management|manager|mba)\b/i, 'Management'],
  ];
  for (const [pattern, category] of rules) {
    if (pattern.test(haystack)) return category;
  }
  return null;
}

export function classifyInternshipCategory(input: {
  title: string;
  description?: string;
  workMode?: WorkMode;
  stipendMin?: number | null;
  opportunityType?: OpportunityType;
}): string | null {
  const haystack = `${input.title} ${input.description ?? ''}`;
  if (/\bsummer\s+internship\b/i.test(haystack)) return 'Summer';
  if (/\bwinter\s+internship\b/i.test(haystack)) return 'Winter';
  if (/\bresearch\s+intern/i.test(haystack)) return 'Research';
  if (input.opportunityType === 'GOVERNMENT_INTERNSHIP') return 'Government';
  if (input.workMode === 'REMOTE') return 'Remote';
  if (/\bunpaid\b/i.test(haystack)) return 'Unpaid';
  if (input.stipendMin != null && input.stipendMin > 0) return 'Paid';
  if (/\bintern/i.test(haystack)) return 'Corporate';
  return null;
}
