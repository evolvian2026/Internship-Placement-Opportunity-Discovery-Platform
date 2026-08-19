/**
 * Building blocks for the mock data generator (requirement 49).
 *
 * These are clearly fictional organisations. Real company names are avoided
 * on purpose: mock rows must never be mistaken for a real opening, and the
 * platform's core rule is that it never invents a real employer's posting.
 */

export interface MockCompany {
  name: string;
  type: 'STARTUP' | 'MNC' | 'PRODUCT' | 'SERVICE' | 'GOVERNMENT' | 'PSU' | 'NGO' | 'RESEARCH_ORGANIZATION';
  industry: string;
  website: string;
  hq: string;
  size: string;
}

export const MOCK_COMPANIES: MockCompany[] = [
  { name: 'Northwind Product Labs', type: 'PRODUCT', industry: 'Technology', website: 'https://example.com/northwind', hq: 'Bengaluru', size: '1,000–5,000' },
  { name: 'Sentinel Cloud Systems', type: 'PRODUCT', industry: 'Technology', website: 'https://example.com/sentinel', hq: 'Hyderabad', size: '500–1,000' },
  { name: 'Vertex Digital Services', type: 'SERVICE', industry: 'Technology', website: 'https://example.com/vertex', hq: 'Pune', size: '10,000+' },
  { name: 'Meridian Consulting Group', type: 'MNC', industry: 'Product & Business', website: 'https://example.com/meridian', hq: 'Gurugram', size: '10,000+' },
  { name: 'Clearwater Analytics Co.', type: 'PRODUCT', industry: 'Data & AI', website: 'https://example.com/clearwater', hq: 'Bengaluru', size: '200–500' },
  { name: 'Tessellate AI', type: 'STARTUP', industry: 'Data & AI', website: 'https://example.com/tessellate', hq: 'Bengaluru', size: '50–200' },
  { name: 'Harbourline Financial', type: 'MNC', industry: 'Finance', website: 'https://example.com/harbourline', hq: 'Mumbai', size: '5,000–10,000' },
  { name: 'Perigee Capital Advisors', type: 'PRODUCT', industry: 'Finance', website: 'https://example.com/perigee', hq: 'Mumbai', size: '200–500' },
  { name: 'Brightpath Media Network', type: 'STARTUP', industry: 'Sales & Marketing', website: 'https://example.com/brightpath', hq: 'Delhi', size: '50–200' },
  { name: 'Ironbridge Manufacturing', type: 'MNC', industry: 'Core Engineering', website: 'https://example.com/ironbridge', hq: 'Chennai', size: '5,000–10,000' },
  { name: 'Kaveri Motors Limited', type: 'MNC', industry: 'Core Engineering', website: 'https://example.com/kaveri', hq: 'Pune', size: '10,000+' },
  { name: 'Southgate Infrastructure', type: 'SERVICE', industry: 'Construction', website: 'https://example.com/southgate', hq: 'Ahmedabad', size: '1,000–5,000' },
  { name: 'Amaranth Life Sciences', type: 'PRODUCT', industry: 'Healthcare', website: 'https://example.com/amaranth', hq: 'Hyderabad', size: '1,000–5,000' },
  { name: 'Solstice Renewables', type: 'STARTUP', industry: 'Renewable Energy', website: 'https://example.com/solstice', hq: 'Jaipur', size: '200–500' },
  { name: 'Longview Retail Group', type: 'MNC', industry: 'Retail & E-commerce', website: 'https://example.com/longview', hq: 'Bengaluru', size: '10,000+' },
  { name: 'Fieldstone Logistics', type: 'SERVICE', industry: 'Operations & Supply Chain', website: 'https://example.com/fieldstone', hq: 'Kolkata', size: '1,000–5,000' },
  { name: 'Quarry Lane Design Studio', type: 'STARTUP', industry: 'Design', website: 'https://example.com/quarrylane', hq: 'Bengaluru', size: '10–50' },
  { name: 'National Institute of Applied Research', type: 'RESEARCH_ORGANIZATION', industry: 'Research', website: 'https://example.gov.in/niar', hq: 'New Delhi', size: '1,000–5,000' },
  { name: 'Bharat Heavy Systems Nigam', type: 'PSU', industry: 'Core Engineering', website: 'https://example.gov.in/bhsn', hq: 'New Delhi', size: '10,000+' },
  { name: 'National Power Utilities Corporation', type: 'PSU', industry: 'Energy', website: 'https://example.gov.in/npuc', hq: 'New Delhi', size: '10,000+' },
  { name: 'Indian Minerals & Metals Nigam', type: 'PSU', industry: 'Manufacturing', website: 'https://example.gov.in/immn', hq: 'Ranchi', size: '10,000+' },
  { name: 'Department of Public Administration', type: 'GOVERNMENT', industry: 'Public Administration', website: 'https://example.gov.in/dpa', hq: 'New Delhi', size: '10,000+' },
  { name: 'State Rural Development Mission', type: 'GOVERNMENT', industry: 'Public Administration', website: 'https://example.gov.in/srdm', hq: 'Bhopal', size: '5,000–10,000' },
  { name: 'Central Banking Recruitment Board', type: 'GOVERNMENT', industry: 'Finance', website: 'https://example.gov.in/cbrb', hq: 'Mumbai', size: '10,000+' },
];

export interface MockRoleTemplate {
  title: string;
  role: string;
  industry: string;
  domain: string;
  skills: string[];
  degrees: string[];
  branches: string[];
  responsibilities: string[];
  requirements: string[];
  /** Annual salary band in INR for full-time; monthly stipend for internships. */
  salaryBand: [number, number];
  stipendBand: [number, number];
}

export const MOCK_ROLES: MockRoleTemplate[] = [
  {
    title: 'Software Engineer',
    role: 'Software Engineer',
    industry: 'Technology',
    domain: 'Software Development',
    skills: ['Java', 'Python', 'Data Structures', 'SQL', 'Git', 'REST API'],
    degrees: ['B_TECH', 'B_E', 'MCA', 'M_TECH'],
    branches: ['CSE', 'IT', 'ECE'],
    responsibilities: [
      'Design, build and ship backend services used by millions of requests a day',
      'Write unit and integration tests for everything you deliver',
      'Participate in code reviews and design discussions',
      'Debug production issues alongside the on-call rotation',
    ],
    requirements: [
      'Strong fundamentals in data structures and algorithms',
      'Working knowledge of at least one object-oriented language',
      'Familiarity with relational databases and SQL',
    ],
    salaryBand: [600_000, 1_400_000],
    stipendBand: [20_000, 50_000],
  },
  {
    title: 'Frontend Developer',
    role: 'Frontend Developer',
    industry: 'Technology',
    domain: 'Web Development',
    skills: ['JavaScript', 'TypeScript', 'React', 'HTML', 'CSS', 'Git'],
    degrees: ['B_TECH', 'B_E', 'BCA', 'MCA'],
    branches: ['CSE', 'IT'],
    responsibilities: [
      'Build accessible, responsive interfaces from design specifications',
      'Improve page performance and Core Web Vitals',
      'Collaborate with designers and backend engineers on API contracts',
    ],
    requirements: [
      'Solid JavaScript fundamentals and DOM knowledge',
      'Experience with a modern component framework',
      'An eye for detail in UI implementation',
    ],
    salaryBand: [500_000, 1_200_000],
    stipendBand: [18_000, 45_000],
  },
  {
    title: 'Data Analyst',
    role: 'Data Analyst',
    industry: 'Data & AI',
    domain: 'Data Analytics',
    skills: ['SQL', 'Excel', 'Python', 'Power BI', 'Tableau', 'Statistics'],
    degrees: ['B_TECH', 'B_E', 'B_SC', 'BCA', 'MBA', 'M_SC'],
    branches: ['CSE', 'IT', 'All Branches'],
    responsibilities: [
      'Build and maintain dashboards that business teams rely on daily',
      'Write SQL to answer questions from product and operations',
      'Turn analyses into clear written recommendations',
    ],
    requirements: [
      'Comfortable writing intermediate SQL (joins, window functions)',
      'Working knowledge of a BI tool such as Power BI or Tableau',
      'Ability to explain findings to a non-technical audience',
    ],
    salaryBand: [450_000, 1_100_000],
    stipendBand: [15_000, 40_000],
  },
  {
    title: 'Machine Learning Engineer',
    role: 'ML Engineer',
    industry: 'Data & AI',
    domain: 'Machine Learning',
    skills: ['Python', 'Machine Learning', 'PyTorch', 'TensorFlow', 'SQL', 'Scikit-learn'],
    degrees: ['B_TECH', 'M_TECH', 'M_SC', 'PHD'],
    branches: ['CSE', 'IT', 'ECE'],
    responsibilities: [
      'Train, evaluate and deploy models into production services',
      'Build reproducible training and evaluation pipelines',
      'Monitor deployed models for drift and regressions',
    ],
    requirements: [
      'Strong grounding in probability, statistics and linear algebra',
      'Hands-on experience with a deep-learning framework',
      'Python engineering skills beyond notebooks',
    ],
    salaryBand: [800_000, 2_200_000],
    stipendBand: [25_000, 60_000],
  },
  {
    title: 'Business Analyst',
    role: 'Business Analyst',
    industry: 'Product & Business',
    domain: 'Business Analysis',
    skills: ['SQL', 'Excel', 'Business Analysis', 'Communication', 'JIRA', 'Power BI'],
    degrees: ['MBA', 'PGDM', 'B_TECH', 'BBA', 'B_COM'],
    branches: ['All Branches'],
    responsibilities: [
      'Gather and document requirements from business stakeholders',
      'Translate business problems into analytical questions',
      'Own reporting for a business line end to end',
    ],
    requirements: [
      'Structured problem-solving and clear written communication',
      'Comfort with spreadsheets and basic SQL',
    ],
    salaryBand: [500_000, 1_300_000],
    stipendBand: [15_000, 35_000],
  },
  {
    title: 'Financial Analyst',
    role: 'Financial Analyst',
    industry: 'Finance',
    domain: 'Financial Analysis',
    skills: ['Excel', 'Financial Modelling', 'Accounting', 'SQL', 'Communication'],
    degrees: ['B_COM', 'MBA', 'PGDM', 'M_COM', 'BBA'],
    branches: ['All Branches'],
    responsibilities: [
      'Prepare monthly variance analysis and management reporting',
      'Build and maintain three-statement financial models',
      'Support the annual budgeting cycle',
    ],
    requirements: [
      'Advanced Excel, including lookups and pivot tables',
      'Understanding of financial statements',
    ],
    salaryBand: [450_000, 1_200_000],
    stipendBand: [12_000, 30_000],
  },
  {
    title: 'Digital Marketing Executive',
    role: 'Digital Marketing Executive',
    industry: 'Sales & Marketing',
    domain: 'Digital Marketing',
    skills: ['Digital Marketing', 'SEO', 'Google Analytics', 'Content Writing', 'Social Media Marketing'],
    degrees: ['BBA', 'MBA', 'B_A', 'B_COM', 'PGDM'],
    branches: ['All Branches'],
    responsibilities: [
      'Plan and run performance campaigns across paid channels',
      'Own SEO for the content site and report on organic growth',
      'Produce weekly performance reporting',
    ],
    requirements: [
      'Familiarity with Google Analytics and at least one ad platform',
      'Strong written English',
    ],
    salaryBand: [300_000, 900_000],
    stipendBand: [10_000, 25_000],
  },
  {
    title: 'Mechanical Design Engineer',
    role: 'Design Engineer',
    industry: 'Core Engineering',
    domain: 'Mechanical',
    skills: ['AutoCAD', 'SolidWorks', 'CATIA', 'ANSYS', 'Thermodynamics'],
    degrees: ['B_TECH', 'B_E', 'DIPLOMA', 'M_TECH'],
    branches: ['Mechanical', 'Automobile', 'Production'],
    responsibilities: [
      'Produce component drawings and assemblies to drawing standards',
      'Run structural and thermal simulations on new designs',
      'Support the prototype build and design validation',
    ],
    requirements: [
      'Proficiency in a 3D CAD package',
      'Understanding of GD&T and manufacturing processes',
    ],
    salaryBand: [350_000, 900_000],
    stipendBand: [10_000, 25_000],
  },
  {
    title: 'Civil Site Engineer',
    role: 'Site Engineer',
    industry: 'Construction',
    domain: 'Site Engineering',
    skills: ['AutoCAD', 'STAAD Pro', 'Primavera', 'Communication'],
    degrees: ['B_TECH', 'B_E', 'DIPLOMA'],
    branches: ['Civil'],
    responsibilities: [
      'Supervise daily site execution against the approved drawings',
      'Track material consumption and raise indents',
      'Maintain quality and safety records for the site',
    ],
    requirements: ['Willingness to work at project sites', 'Knowledge of construction drawings'],
    salaryBand: [300_000, 800_000],
    stipendBand: [10_000, 20_000],
  },
  {
    title: 'Clinical Research Associate',
    role: 'Clinical Research Associate',
    industry: 'Healthcare',
    domain: 'Medical Research',
    skills: ['Clinical Research', 'Pharmacovigilance', 'Communication', 'Excel'],
    degrees: ['B_PHARM', 'B_SC', 'M_SC', 'MBBS'],
    branches: ['Biotechnology', 'All Branches'],
    responsibilities: [
      'Monitor trial sites for protocol and GCP compliance',
      'Verify source data against case report forms',
      'Prepare monitoring visit reports',
    ],
    requirements: ['Life-sciences background', 'Attention to documentation detail'],
    salaryBand: [350_000, 900_000],
    stipendBand: [12_000, 25_000],
  },
  {
    title: 'Supply Chain Analyst',
    role: 'Supply Chain Analyst',
    industry: 'Operations & Supply Chain',
    domain: 'Supply Chain',
    skills: ['Excel', 'SQL', 'Six Sigma', 'Power BI'],
    degrees: ['B_TECH', 'MBA', 'PGDM', 'B_COM'],
    branches: ['All Branches'],
    responsibilities: [
      'Analyse demand and inventory across regional warehouses',
      'Identify cost-to-serve reduction opportunities',
    ],
    requirements: ['Analytical mindset', 'Comfort with large spreadsheets'],
    salaryBand: [400_000, 1_000_000],
    stipendBand: [12_000, 28_000],
  },
  {
    title: 'UI/UX Designer',
    role: 'Product Designer',
    industry: 'Design',
    domain: 'UI/UX Design',
    skills: ['Figma', 'UI/UX Design', 'Adobe Illustrator', 'Communication'],
    degrees: ['B_TECH', 'B_A', 'OTHER', 'B_SC'],
    branches: ['All Branches'],
    responsibilities: [
      'Turn product requirements into wireframes and high-fidelity designs',
      'Run usability sessions and fold findings back into the design',
    ],
    requirements: ['A portfolio of shipped or academic design work', 'Proficiency in Figma'],
    salaryBand: [400_000, 1_200_000],
    stipendBand: [12_000, 30_000],
  },
  {
    title: 'Solar Project Engineer',
    role: 'Project Engineer',
    industry: 'Renewable Energy',
    domain: 'Solar',
    skills: ['AutoCAD', 'Communication', 'Excel'],
    degrees: ['B_TECH', 'B_E', 'DIPLOMA'],
    branches: ['Electrical', 'EEE', 'Mechanical'],
    responsibilities: [
      'Execute rooftop and ground-mount solar installations',
      'Coordinate with vendors on delivery schedules',
    ],
    requirements: ['Basic electrical engineering knowledge', 'Site travel readiness'],
    salaryBand: [300_000, 800_000],
    stipendBand: [10_000, 22_000],
  },
  {
    title: 'Quality Control Chemist',
    role: 'QC Chemist',
    industry: 'Manufacturing',
    domain: 'Quality Control',
    skills: ['GMP', 'Molecular Biology', 'Excel'],
    degrees: ['B_SC', 'M_SC', 'B_PHARM'],
    branches: ['All Branches'],
    responsibilities: [
      'Perform routine analysis on in-process and finished goods',
      'Maintain instrument calibration and QC records',
    ],
    requirements: ['Chemistry or pharmacy background', 'Familiarity with GMP documentation'],
    salaryBand: [280_000, 700_000],
    stipendBand: [10_000, 20_000],
  },
  {
    title: 'HR Executive',
    role: 'HR Executive',
    industry: 'Human Resources',
    domain: 'HR',
    skills: ['Communication', 'Excel', 'Teamwork'],
    degrees: ['MBA', 'PGDM', 'BBA', 'B_A'],
    branches: ['All Branches'],
    responsibilities: [
      'Run end-to-end recruitment for entry-level roles',
      'Support onboarding and employee engagement programmes',
    ],
    requirements: ['Strong interpersonal communication', 'Comfort with HR systems'],
    salaryBand: [280_000, 750_000],
    stipendBand: [10_000, 20_000],
  },
];

export const MOCK_CITIES: { city: string; state: string }[] = [
  { city: 'Bengaluru', state: 'Karnataka' },
  { city: 'Hyderabad', state: 'Telangana' },
  { city: 'Pune', state: 'Maharashtra' },
  { city: 'Chennai', state: 'Tamil Nadu' },
  { city: 'Mumbai', state: 'Maharashtra' },
  { city: 'Delhi', state: 'Delhi' },
  { city: 'Gurugram', state: 'Haryana' },
  { city: 'Noida', state: 'Uttar Pradesh' },
  { city: 'Kolkata', state: 'West Bengal' },
  { city: 'Ahmedabad', state: 'Gujarat' },
  { city: 'Jaipur', state: 'Rajasthan' },
  { city: 'Kochi', state: 'Kerala' },
  { city: 'Coimbatore', state: 'Tamil Nadu' },
  { city: 'Indore', state: 'Madhya Pradesh' },
  { city: 'Bhubaneswar', state: 'Odisha' },
  { city: 'Chandigarh', state: 'Chandigarh' },
];

export const MOCK_GOVERNMENT_POSTS = [
  { title: 'Junior Engineer (Civil)', category: 'Engineering', branches: ['Civil'], degrees: ['B_TECH', 'B_E', 'DIPLOMA'] },
  { title: 'Junior Engineer (Electrical)', category: 'Engineering', branches: ['Electrical', 'EEE'], degrees: ['B_TECH', 'B_E', 'DIPLOMA'] },
  { title: 'Assistant Section Officer', category: 'Administrative', branches: ['All Branches'], degrees: ['B_A', 'B_COM', 'B_SC', 'B_TECH'] },
  { title: 'Probationary Officer', category: 'IBPS', branches: ['All Branches'], degrees: ['B_A', 'B_COM', 'B_SC', 'B_TECH', 'BBA'] },
  { title: 'Clerk', category: 'SSC', branches: ['All Branches'], degrees: ['B_A', 'B_COM', 'B_SC'] },
  { title: 'Scientist / Engineer — Grade B', category: 'Research Organizations', branches: ['CSE', 'ECE', 'Mechanical'], degrees: ['B_TECH', 'M_TECH'] },
  { title: 'Senior Resident Medical Officer', category: 'Healthcare', branches: ['All Branches'], degrees: ['MBBS'] },
  { title: 'Trained Graduate Teacher', category: 'Teaching', branches: ['All Branches'], degrees: ['B_A', 'B_SC', 'M_A', 'M_SC'] },
  { title: 'Station Master', category: 'Railways', branches: ['All Branches'], degrees: ['B_A', 'B_COM', 'B_SC'] },
  { title: 'Sub Inspector (Technical)', category: 'Defence', branches: ['All Branches'], degrees: ['B_A', 'B_SC', 'B_TECH'] },
];

export const MOCK_PSU_POSTS = [
  { title: 'Graduate Engineer Trainee', category: 'Graduate Trainee', gate: true, branches: ['Mechanical', 'Electrical', 'Civil', 'ECE', 'CSE'] },
  { title: 'Executive Trainee (Finance)', category: 'Finance', gate: false, branches: ['All Branches'] },
  { title: 'Executive Trainee (HR)', category: 'HR', gate: false, branches: ['All Branches'] },
  { title: 'Management Trainee (Operations)', category: 'Operations', gate: false, branches: ['All Branches'] },
  { title: 'Assistant Engineer (IT)', category: 'IT', gate: true, branches: ['CSE', 'IT'] },
  { title: 'Technician Apprentice', category: 'Apprentice', gate: false, branches: ['Mechanical', 'Electrical'] },
];
