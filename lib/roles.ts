/**
 * Role buckets, copied from bolt-jobs-duniya/lib/seo/landing-config.ts so the
 * panel's role counts match the public Jobs Duniya landing pages.
 * `query` is websearch_to_tsquery syntax matched against job titles.
 * The broad "engineer" bucket is left out on purpose: it swallows every
 * specific engineering role and drowns the chart.
 */
export const ROLES: { slug: string; label: string; query: string }[] = [
  { slug: 'software-engineer', label: 'Software Engineer', query: '"software engineer" or "software developer" or "software development engineer"' },
  { slug: 'data-analyst', label: 'Data Analyst', query: '"data analyst" or "data scientist" or "data engineer"' },
  { slug: 'it-support', label: 'IT Support', query: '"it support" or "help desk" or helpdesk or "desktop support"' },
  { slug: 'product-manager', label: 'Product Manager', query: '"product manager" or "product owner"' },
  { slug: 'project-manager', label: 'Project Manager', query: '"project manager"' },
  { slug: 'civil-engineer', label: 'Civil Engineer', query: '"civil engineer" or "site engineer" or "structural engineer"' },
  { slug: 'mechanical-engineer', label: 'Mechanical Engineer', query: '"mechanical engineer" or "mep engineer"' },
  { slug: 'electrical-engineer', label: 'Electrical Engineer', query: '"electrical engineer"' },
  { slug: 'accountant', label: 'Accountant', query: 'accountant or accounting' },
  { slug: 'financial-analyst', label: 'Financial Analyst', query: '"financial analyst" or "finance analyst"' },
  { slug: 'hr', label: 'HR', query: 'hr or "human resources" or "people partner"' },
  { slug: 'recruiter', label: 'Recruiter', query: 'recruiter or "talent acquisition" or recruitment' },
  { slug: 'sales', label: 'Sales', query: 'sales' },
  { slug: 'marketing', label: 'Marketing', query: 'marketing' },
  { slug: 'business-analyst', label: 'Business Analyst', query: '"business analyst"' },
  { slug: 'operations-manager', label: 'Operations Manager', query: '"operations manager" or "operations lead"' },
  { slug: 'customer-service', label: 'Customer Service', query: '"customer service" or "customer support" or "customer success" or "call center"' },
  { slug: 'admin-assistant', label: 'Admin Assistant', query: '"administrative assistant" or "admin assistant" or "office administrator" or secretary' },
  { slug: 'receptionist', label: 'Receptionist', query: 'receptionist or "front desk"' },
  { slug: 'teacher', label: 'Teacher', query: 'teacher or teaching or tutor or lecturer' },
  { slug: 'nurse', label: 'Nurse', query: 'nurse or nursing' },
  { slug: 'doctor', label: 'Doctor', query: 'doctor or physician or surgeon or "medical officer" or dentist' },
  { slug: 'pharmacist', label: 'Pharmacist', query: 'pharmacist' },
  { slug: 'chef', label: 'Chef', query: 'chef or cook' },
  { slug: 'hospitality', label: 'Hospitality', query: 'hotel or hospitality or waiter or waitress or barista or housekeeping' },
  { slug: 'driver', label: 'Driver', query: 'driver or chauffeur' },
  { slug: 'security-guard', label: 'Security Guard', query: '"security guard" or "security officer"' },
  { slug: 'electrician', label: 'Electrician', query: 'electrician' },
  { slug: 'technician', label: 'Technician', query: 'technician' },
  { slug: 'logistics', label: 'Logistics', query: 'logistics or "supply chain" or procurement' },
  { slug: 'warehouse', label: 'Warehouse', query: 'warehouse or storekeeper or "store keeper"' },
  { slug: 'graphic-designer', label: 'Graphic Designer', query: '"graphic designer" or "visual designer" or "ui designer" or "ux designer"' },
  { slug: 'cashier', label: 'Cashier', query: 'cashier' },
];
