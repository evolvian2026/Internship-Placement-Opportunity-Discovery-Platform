/**
 * Seed taxonomy for industries and their domains.
 *
 * This is the *initial* content of the `industries` / `domains` tables only.
 * The application always reads the taxonomy from the database, so an admin can
 * add an industry or a domain at runtime and it immediately becomes filterable
 * without any code change.
 */

export interface DomainSeed {
  slug: string;
  name: string;
}

export interface IndustrySeed {
  slug: string;
  name: string;
  domains: DomainSeed[];
}

const d = (name: string): DomainSeed => ({
  name,
  slug: name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, ''),
});

export const INDUSTRY_SEED: IndustrySeed[] = [
  {
    slug: 'technology',
    name: 'Technology',
    domains: [
      'Software Development',
      'Web Development',
      'Mobile Development',
      'Cloud',
      'DevOps',
      'Cybersecurity',
      'Networking',
      'IT Support',
      'QA / Testing',
      'Embedded Systems',
      'IoT',
    ].map(d),
  },
  {
    slug: 'data-and-ai',
    name: 'Data & AI',
    domains: [
      'Data Analytics',
      'Data Science',
      'Machine Learning',
      'Artificial Intelligence',
      'Generative AI',
      'NLP',
      'Computer Vision',
      'Data Engineering',
      'Business Intelligence',
      'Big Data',
      'MLOps',
      'AI Engineering',
    ].map(d),
  },
  {
    slug: 'product-and-business',
    name: 'Product & Business',
    domains: [
      'Product Management',
      'Product Operations',
      'Business Analysis',
      'Business Operations',
      'Strategy',
      'Consulting',
      'Program Management',
      'Project Management',
    ].map(d),
  },
  {
    slug: 'finance',
    name: 'Finance',
    domains: [
      'Banking',
      'Investment Banking',
      'Financial Analysis',
      'Accounting',
      'FinTech',
      'Insurance',
      'Risk Management',
      'Credit',
      'Audit',
    ].map(d),
  },
  {
    slug: 'sales-and-marketing',
    name: 'Sales & Marketing',
    domains: [
      'Sales',
      'Business Development',
      'Digital Marketing',
      'Performance Marketing',
      'Content Marketing',
      'SEO',
      'Social Media',
      'Brand Management',
      'Market Research',
    ].map(d),
  },
  {
    slug: 'core-engineering',
    name: 'Core Engineering',
    domains: [
      'Mechanical',
      'Civil',
      'Electrical',
      'Electronics',
      'Chemical',
      'Automobile',
      'Aerospace',
      'Industrial Engineering',
      'Manufacturing Engineering',
      'Robotics',
    ].map(d),
  },
  {
    slug: 'healthcare',
    name: 'Healthcare',
    domains: [
      'Healthcare',
      'Biotechnology',
      'Pharmaceuticals',
      'Medical Research',
      'Hospital Administration',
    ].map(d),
  },
  {
    slug: 'human-resources',
    name: 'Human Resources',
    domains: ['HR', 'Talent Acquisition', 'Learning & Development', 'HR Operations'].map(d),
  },
  {
    slug: 'legal',
    name: 'Legal',
    domains: ['Legal', 'Compliance', 'Corporate Law', 'Intellectual Property'].map(d),
  },
  {
    slug: 'education',
    name: 'Education',
    domains: ['Teaching', 'Academic Research', 'EdTech', 'Training'].map(d),
  },
  {
    slug: 'research',
    name: 'Research',
    domains: ['Scientific Research', 'Policy Research', 'R&D', 'Space Research'].map(d),
  },
  {
    slug: 'operations-and-supply-chain',
    name: 'Operations & Supply Chain',
    domains: ['Operations', 'Supply Chain', 'Logistics', 'Procurement', 'Warehousing'].map(d),
  },
  {
    slug: 'hospitality',
    name: 'Hospitality',
    domains: ['Hotel Management', 'Travel & Tourism', 'Food & Beverage', 'Events'].map(d),
  },
  {
    slug: 'media',
    name: 'Media',
    domains: ['Journalism', 'Content Writing', 'Video Production', 'Advertising'].map(d),
  },
  {
    slug: 'design',
    name: 'Design',
    domains: ['UI/UX Design', 'Graphic Design', 'Product Design', 'Industrial Design'].map(d),
  },
  {
    slug: 'architecture',
    name: 'Architecture',
    domains: ['Architecture', 'Urban Planning', 'Interior Design'].map(d),
  },
  {
    slug: 'agriculture',
    name: 'Agriculture',
    domains: ['Agriculture', 'Agri-Business', 'Food Technology', 'Horticulture'].map(d),
  },
  {
    slug: 'environment',
    name: 'Environment',
    domains: ['Environmental Engineering', 'Sustainability', 'Climate & ESG'].map(d),
  },
  {
    slug: 'energy',
    name: 'Energy',
    domains: ['Oil & Gas', 'Power', 'Nuclear', 'Energy Operations'].map(d),
  },
  {
    slug: 'renewable-energy',
    name: 'Renewable Energy',
    domains: ['Solar', 'Wind', 'Green Hydrogen', 'Energy Storage'].map(d),
  },
  {
    slug: 'telecommunications',
    name: 'Telecommunications',
    domains: ['Telecom Networks', 'RF Engineering', '5G', 'Telecom Operations'].map(d),
  },
  {
    slug: 'retail-and-ecommerce',
    name: 'Retail & E-commerce',
    domains: ['Retail Operations', 'E-commerce', 'Category Management', 'Merchandising'].map(d),
  },
  {
    slug: 'manufacturing',
    name: 'Manufacturing',
    domains: ['Production', 'Quality Control', 'Plant Operations', 'Maintenance'].map(d),
  },
  {
    slug: 'construction',
    name: 'Construction',
    domains: ['Site Engineering', 'Project Execution', 'Structural Design', 'Quantity Surveying'].map(d),
  },
  {
    slug: 'real-estate',
    name: 'Real Estate',
    domains: ['Real Estate Sales', 'Property Management', 'Facility Management'].map(d),
  },
  {
    slug: 'public-administration',
    name: 'Public Administration',
    domains: ['Administrative Services', 'Public Policy', 'Municipal Services', 'Revenue Services'].map(d),
  },
  {
    slug: 'defence',
    name: 'Defence',
    domains: ['Defence Services', 'Defence Research', 'Defence Manufacturing'].map(d),
  },
];

/** Categories for the dedicated Government module (section 20). */
export const GOVERNMENT_CATEGORIES = [
  'UPSC',
  'SSC',
  'IBPS',
  'SBI',
  'Railways',
  'Defence',
  'State Government',
  'PSU',
  'Research Organizations',
  'Teaching',
  'Engineering',
  'Healthcare',
  'Administrative',
] as const;
export type GovernmentCategory = (typeof GOVERNMENT_CATEGORIES)[number];

/** Categories for the dedicated PSU module (section 21). */
export const PSU_CATEGORIES = [
  'Engineering',
  'Management',
  'Finance',
  'HR',
  'IT',
  'Operations',
  'Graduate Trainee',
  'Apprentice',
] as const;
export type PsuCategory = (typeof PSU_CATEGORIES)[number];

/** Internship sub-categories for the internship dashboard (section 22). */
export const INTERNSHIP_CATEGORIES = [
  'Summer',
  'Winter',
  'Research',
  'Corporate',
  'Government',
  'Remote',
  'Paid',
  'Unpaid',
  'International',
] as const;
export type InternshipCategory = (typeof INTERNSHIP_CATEGORIES)[number];

/** Fresher dashboard categories (section 23). */
export const FRESHER_CATEGORIES = [
  '0–1 Years',
  'Freshers',
  'Graduate Trainee',
  'Off-Campus Drive',
  'Walk-in',
  'Mass Hiring',
  'Product Companies',
  'Service Companies',
  'Startups',
] as const;
export type FresherCategory = (typeof FRESHER_CATEGORIES)[number];
