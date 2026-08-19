/**
 * Canonical skill dictionary.
 *
 * Used by:
 *  - the resume parser, to recognise skills in free text
 *  - the normalizer, to canonicalise skills scraped from source postings
 *  - the matching engine, to compare user skills with opportunity skills
 *  - skill-gap analysis, to recommend what to learn next
 *
 * `aliases` are matched case-insensitively against word boundaries.
 * Skills not present here are still accepted (users may add unlimited skills);
 * they are simply canonicalised by lower-casing and trimming.
 */

export interface SkillDefinition {
  /** Canonical, human-readable name. */
  name: string;
  /** Stable lookup key (lower-cased canonical name). */
  key: string;
  category: string;
  aliases: string[];
  /** Skills commonly learned alongside this one — powers "recommended learning". */
  related?: string[];
}

interface RawSkill {
  name: string;
  category: string;
  aliases?: string[];
  related?: string[];
}

const RAW: RawSkill[] = [
  // Programming languages
  { name: 'Java', category: 'Programming', aliases: ['core java', 'java 8', 'java8'], related: ['Spring Boot', 'Hibernate'] },
  { name: 'Python', category: 'Programming', aliases: ['python3', 'py'], related: ['Pandas', 'NumPy', 'Django'] },
  { name: 'C++', category: 'Programming', aliases: ['cpp', 'c plus plus'] },
  { name: 'C', category: 'Programming', aliases: ['c language'] },
  { name: 'C#', category: 'Programming', aliases: ['csharp', 'c sharp'], related: ['.NET'] },
  { name: 'JavaScript', category: 'Programming', aliases: ['js', 'es6', 'ecmascript'], related: ['TypeScript', 'React'] },
  { name: 'TypeScript', category: 'Programming', aliases: ['ts'] },
  { name: 'Go', category: 'Programming', aliases: ['golang'] },
  { name: 'Rust', category: 'Programming' },
  { name: 'Kotlin', category: 'Programming', related: ['Android'] },
  { name: 'Swift', category: 'Programming', related: ['iOS'] },
  { name: 'PHP', category: 'Programming', related: ['Laravel'] },
  { name: 'Ruby', category: 'Programming', related: ['Ruby on Rails'] },
  { name: 'R', category: 'Programming', aliases: ['r language'], related: ['Statistics'] },
  { name: 'Scala', category: 'Programming', related: ['Apache Spark'] },
  { name: 'MATLAB', category: 'Programming', related: ['Simulink'] },
  { name: 'VBA', category: 'Programming', related: ['Excel'] },

  // Web / frontend
  { name: 'HTML', category: 'Frontend', aliases: ['html5'] },
  { name: 'CSS', category: 'Frontend', aliases: ['css3'] },
  { name: 'React', category: 'Frontend', aliases: ['react.js', 'reactjs'], related: ['Next.js', 'Redux'] },
  { name: 'Next.js', category: 'Frontend', aliases: ['nextjs', 'next js'] },
  { name: 'Angular', category: 'Frontend', aliases: ['angularjs', 'angular 2'] },
  { name: 'Vue.js', category: 'Frontend', aliases: ['vue', 'vuejs'] },
  { name: 'Redux', category: 'Frontend' },
  { name: 'Tailwind CSS', category: 'Frontend', aliases: ['tailwind', 'tailwindcss'] },
  { name: 'Bootstrap', category: 'Frontend' },

  // Backend
  { name: 'Node.js', category: 'Backend', aliases: ['nodejs', 'node js', 'node'] },
  { name: 'Express.js', category: 'Backend', aliases: ['express', 'expressjs'] },
  { name: 'NestJS', category: 'Backend', aliases: ['nest.js', 'nest js'] },
  { name: 'Spring Boot', category: 'Backend', aliases: ['springboot', 'spring'] },
  { name: 'Django', category: 'Backend' },
  { name: 'Flask', category: 'Backend' },
  { name: 'FastAPI', category: 'Backend', aliases: ['fast api'] },
  { name: '.NET', category: 'Backend', aliases: ['dotnet', 'asp.net', 'aspnet'] },
  { name: 'Laravel', category: 'Backend' },
  { name: 'Ruby on Rails', category: 'Backend', aliases: ['rails'] },
  { name: 'GraphQL', category: 'Backend' },
  { name: 'REST API', category: 'Backend', aliases: ['rest', 'restful api', 'rest apis'] },
  { name: 'Microservices', category: 'Backend' },
  { name: 'Hibernate', category: 'Backend' },

  // Databases
  { name: 'SQL', category: 'Database', aliases: ['structured query language'], related: ['PostgreSQL', 'MySQL'] },
  { name: 'PostgreSQL', category: 'Database', aliases: ['postgres', 'psql'] },
  { name: 'MySQL', category: 'Database' },
  { name: 'MongoDB', category: 'Database', aliases: ['mongo'] },
  { name: 'Redis', category: 'Database' },
  { name: 'Oracle', category: 'Database', aliases: ['oracle db', 'pl/sql', 'plsql'] },
  { name: 'SQL Server', category: 'Database', aliases: ['mssql', 'microsoft sql server', 't-sql'] },
  { name: 'Cassandra', category: 'Database' },
  { name: 'Elasticsearch', category: 'Database', aliases: ['elastic search', 'opensearch'] },

  // Cloud / DevOps
  { name: 'AWS', category: 'Cloud', aliases: ['amazon web services', 'ec2', 's3'] },
  { name: 'Azure', category: 'Cloud', aliases: ['microsoft azure'] },
  { name: 'Google Cloud', category: 'Cloud', aliases: ['gcp', 'google cloud platform'] },
  { name: 'Docker', category: 'DevOps', related: ['Kubernetes'] },
  { name: 'Kubernetes', category: 'DevOps', aliases: ['k8s'] },
  { name: 'CI/CD', category: 'DevOps', aliases: ['ci cd', 'continuous integration'] },
  { name: 'Jenkins', category: 'DevOps' },
  { name: 'Terraform', category: 'DevOps' },
  { name: 'Linux', category: 'DevOps', aliases: ['unix', 'ubuntu', 'shell scripting'] },
  { name: 'Git', category: 'DevOps', aliases: ['github', 'gitlab', 'version control'] },
  { name: 'Ansible', category: 'DevOps' },

  // Data / AI
  { name: 'Pandas', category: 'Data', related: ['NumPy', 'Python'] },
  { name: 'NumPy', category: 'Data', aliases: ['numpy'] },
  { name: 'Machine Learning', category: 'AI', aliases: ['ml'], related: ['Scikit-learn', 'Deep Learning'] },
  { name: 'Deep Learning', category: 'AI', related: ['TensorFlow', 'PyTorch'] },
  { name: 'TensorFlow', category: 'AI', aliases: ['tensor flow'] },
  { name: 'PyTorch', category: 'AI', aliases: ['torch'] },
  { name: 'Scikit-learn', category: 'AI', aliases: ['sklearn', 'scikit learn'] },
  { name: 'NLP', category: 'AI', aliases: ['natural language processing'] },
  { name: 'Computer Vision', category: 'AI', aliases: ['opencv', 'cv'] },
  { name: 'Generative AI', category: 'AI', aliases: ['gen ai', 'genai', 'llm', 'large language models'] },
  { name: 'MLOps', category: 'AI', aliases: ['ml ops'] },
  { name: 'Data Analytics', category: 'Data', aliases: ['data analysis', 'analytics'], related: ['Power BI', 'Tableau', 'SQL'] },
  { name: 'Data Engineering', category: 'Data', related: ['Apache Spark', 'Airflow'] },
  { name: 'Apache Spark', category: 'Data', aliases: ['spark', 'pyspark'] },
  { name: 'Airflow', category: 'Data', aliases: ['apache airflow'] },
  { name: 'Hadoop', category: 'Data' },
  { name: 'Power BI', category: 'Data', aliases: ['powerbi', 'power-bi'] },
  { name: 'Tableau', category: 'Data' },
  { name: 'Excel', category: 'Data', aliases: ['ms excel', 'microsoft excel', 'advanced excel'] },
  { name: 'Statistics', category: 'Data', aliases: ['statistical analysis'] },

  // Testing / QA
  { name: 'Selenium', category: 'QA' },
  { name: 'Jest', category: 'QA' },
  { name: 'JUnit', category: 'QA' },
  { name: 'Cypress', category: 'QA' },
  { name: 'Manual Testing', category: 'QA' },
  { name: 'Automation Testing', category: 'QA', aliases: ['test automation'] },

  // Mobile / embedded
  { name: 'Android', category: 'Mobile', aliases: ['android development'] },
  { name: 'iOS', category: 'Mobile', aliases: ['ios development'] },
  { name: 'React Native', category: 'Mobile', aliases: ['react-native'] },
  { name: 'Flutter', category: 'Mobile', related: ['Dart'] },
  { name: 'Dart', category: 'Mobile' },
  { name: 'Embedded C', category: 'Embedded', aliases: ['embedded c programming'] },
  { name: 'VLSI', category: 'Embedded' },
  { name: 'Verilog', category: 'Embedded' },
  { name: 'VHDL', category: 'Embedded' },
  { name: 'PLC', category: 'Embedded', aliases: ['plc programming', 'scada'] },
  { name: 'IoT', category: 'Embedded', aliases: ['internet of things'] },
  { name: 'Arduino', category: 'Embedded' },
  { name: 'Raspberry Pi', category: 'Embedded' },

  // Security / networking
  { name: 'Cybersecurity', category: 'Security', aliases: ['cyber security', 'information security'] },
  { name: 'Penetration Testing', category: 'Security', aliases: ['pentesting', 'ethical hacking'] },
  { name: 'Networking', category: 'Security', aliases: ['ccna', 'tcp/ip'] },

  // Core engineering
  { name: 'AutoCAD', category: 'Core Engineering', aliases: ['auto cad'] },
  { name: 'SolidWorks', category: 'Core Engineering', aliases: ['solid works'] },
  { name: 'CATIA', category: 'Core Engineering' },
  { name: 'ANSYS', category: 'Core Engineering' },
  { name: 'Creo', category: 'Core Engineering' },
  { name: 'STAAD Pro', category: 'Core Engineering', aliases: ['staad.pro', 'staad'] },
  { name: 'Revit', category: 'Core Engineering' },
  { name: 'Primavera', category: 'Core Engineering' },
  { name: 'Six Sigma', category: 'Core Engineering', aliases: ['lean six sigma'] },
  { name: 'CNC', category: 'Core Engineering', aliases: ['cnc programming'] },
  { name: 'Thermodynamics', category: 'Core Engineering' },
  { name: 'Simulink', category: 'Core Engineering' },

  // Business / finance
  { name: 'Financial Modelling', category: 'Finance', aliases: ['financial modeling'] },
  { name: 'Accounting', category: 'Finance', aliases: ['tally', 'bookkeeping'] },
  { name: 'Taxation', category: 'Finance', aliases: ['gst', 'income tax'] },
  { name: 'Equity Research', category: 'Finance' },
  { name: 'Risk Management', category: 'Finance' },
  { name: 'Business Analysis', category: 'Business', aliases: ['business analyst', 'requirement gathering'] },
  { name: 'Product Management', category: 'Business', aliases: ['product manager'] },
  { name: 'Agile', category: 'Business', aliases: ['scrum', 'kanban'] },
  { name: 'JIRA', category: 'Business', aliases: ['atlassian jira'] },

  // Marketing
  { name: 'Digital Marketing', category: 'Marketing' },
  { name: 'SEO', category: 'Marketing', aliases: ['search engine optimization'] },
  { name: 'SEM', category: 'Marketing', aliases: ['google ads', 'ppc'] },
  { name: 'Content Writing', category: 'Marketing', aliases: ['copywriting', 'content marketing'] },
  { name: 'Social Media Marketing', category: 'Marketing', aliases: ['smm'] },
  { name: 'Google Analytics', category: 'Marketing', aliases: ['ga4'] },
  { name: 'Market Research', category: 'Marketing' },

  // Design
  { name: 'Figma', category: 'Design' },
  { name: 'Adobe Photoshop', category: 'Design', aliases: ['photoshop'] },
  { name: 'Adobe Illustrator', category: 'Design', aliases: ['illustrator'] },
  { name: 'UI/UX Design', category: 'Design', aliases: ['ui ux', 'ux design', 'ui design'] },

  // Healthcare / pharma
  { name: 'Clinical Research', category: 'Healthcare' },
  { name: 'Pharmacovigilance', category: 'Healthcare' },
  { name: 'GMP', category: 'Healthcare', aliases: ['good manufacturing practice'] },
  { name: 'Molecular Biology', category: 'Healthcare' },

  // Soft skills
  { name: 'Communication', category: 'Soft Skills', aliases: ['communication skills'] },
  { name: 'Teamwork', category: 'Soft Skills' },
  { name: 'Problem Solving', category: 'Soft Skills' },
  { name: 'Leadership', category: 'Soft Skills' },
  { name: 'Data Structures', category: 'Fundamentals', aliases: ['dsa', 'data structures and algorithms'] },
  { name: 'Algorithms', category: 'Fundamentals' },
  { name: 'Operating Systems', category: 'Fundamentals', aliases: ['os'] },
  { name: 'DBMS', category: 'Fundamentals', aliases: ['database management systems'] },
  { name: 'Computer Networks', category: 'Fundamentals' },
  { name: 'OOP', category: 'Fundamentals', aliases: ['object oriented programming'] },
];

export const SKILLS: SkillDefinition[] = RAW.map((s) => ({
  name: s.name,
  key: s.name.toLowerCase(),
  category: s.category,
  aliases: s.aliases ?? [],
  related: s.related,
}));

/** name/alias (lower-cased) -> canonical name */
export const SKILL_LOOKUP: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const skill of SKILLS) {
    map.set(skill.key, skill.name);
    for (const alias of skill.aliases) map.set(alias.toLowerCase(), skill.name);
  }
  return map;
})();

export const SKILL_BY_NAME: Map<string, SkillDefinition> = new Map(
  SKILLS.map((s) => [s.name, s]),
);

/**
 * Canonicalise a free-text skill.
 * Unknown skills are preserved (trimmed + collapsed whitespace) rather than
 * dropped, because users may add any skill they like.
 */
export function canonicalizeSkill(raw: string): string {
  const cleaned = raw.trim().replace(/\s+/g, ' ');
  if (!cleaned) return '';
  return SKILL_LOOKUP.get(cleaned.toLowerCase()) ?? cleaned;
}

export function canonicalizeSkills(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const canonical = canonicalizeSkill(item);
    if (!canonical) continue;
    const dedupeKey = canonical.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push(canonical);
  }
  return out;
}

/**
 * Slug for a skill name.
 *
 * Symbols carry meaning in skill names — C, C++ and C# are three different
 * skills — so they are spelled out rather than stripped, which a plain
 * slugifier would collapse into one.
 */
export function skillSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\+\+/g, '-plus-plus')
    .replace(/\+/g, '-plus')
    .replace(/#/g, '-sharp')
    .replace(/\.net\b/g, 'dotnet')
    .replace(/&/g, '-and-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
