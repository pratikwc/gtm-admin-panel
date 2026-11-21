/**
 * Normalisation maps that turn messy source values into a small, stable set
 * of buckets. Each map is plain data, so the same rules drive both the SQL
 * CASE expressions and the TypeScript helpers (and their tests).
 *
 * Pattern syntax: a plain string matches anywhere (substring). A pattern
 * wrapped in \b...\b-style word marks is written with a leading "=" and
 * must match a whole word (for short tokens such as "hr", "it", "ui").
 */

type Rule = readonly [bucket: string, patterns: readonly string[]];

export const UNCLASSIFIED = 'Unclassified';
export const OTHER = 'Other';

/** LinkedIn `job_function` (GTM) -> function bucket. First match wins. */
export const FUNCTION_RULES: readonly Rule[] = [
  ['Engineering & IT', ['engineering', 'information technology', 'software', 'technology']],
  ['Marketing', ['marketing', 'advertising', 'public relations']],
  ['Finance & Accounting', ['finance', 'accounting', 'auditing']],
  ['Sales & BD', ['sales', 'business development']],
  ['HR & Admin', ['human resources', 'administrative']],
  ['Healthcare', ['health care', 'healthcare']],
  ['Education', ['education', 'training']],
  ['Customer Service', ['customer service']],
  ['Supply Chain', ['supply chain', 'distribution', 'purchasing', 'logistics']],
  ['Manufacturing', ['manufacturing', 'production', 'quality assurance']],
  ['Management & Consulting', ['management', 'consulting', 'strategy', 'general business']],
  ['Legal', ['legal']],
  ['Design & Creative', ['design', 'art/creative', 'writing', 'editing']],
  ['Research & Science', ['research', 'science', 'analyst']],
];

/** JD free-text `location` -> country. Mirrors bolt-jobs-duniya/lib/seo/{location,landing-config}.ts. */
export const COUNTRY_RULES: readonly Rule[] = [
  ['United Arab Emirates', ['united arab emirates', '=uae', 'dubai', 'abu dhabi', 'sharjah', 'ajman', 'ras al khaimah', 'fujairah', 'umm al quwain']],
  ['Saudi Arabia', ['saudi arabia', 'riyadh', 'jeddah', 'makkah', 'madinah', 'dammam', 'khobar', 'al-qassim', 'asir region']],
  ['Kuwait', ['kuwait']],
  ['Qatar', ['qatar', 'doha']],
  ['Bahrain', ['bahrain', 'manama']],
  ['Oman', ['oman', 'muscat']],
  ['Singapore', ['singapore']],
  ['Hong Kong', ['hong kong']],
  ['India', ['india', 'bengaluru', 'bangalore', 'mumbai', 'delhi', 'hyderabad', 'chennai', 'kolkata', 'pune']],
  ['Philippines', ['philippines', 'manila', 'makati', 'taguig', 'cebu']],
];

/** Free-text "role looking for" (applications) -> role bucket. */
export const ROLE_RULES: readonly Rule[] = [
  ['Driver', ['driver', 'driving', 'chauffeur', 'سائق']],
  ['Healthcare', ['nurs', 'doctor', 'pharmac', 'medical', 'health', 'dentist', 'dental', 'physio', 'caregiv', 'pathology']],
  ['Software & IT', ['software', 'developer', '=it', 'information technology', 'programmer', 'full stack', 'frontend', 'backend', 'devops', 'cyber', 'network', 'help desk', 'helpdesk', 'penetration', '=dlp', '=t24', 'oracle', '=java', 'تقنية معلومات', 'artificial intelligence', '=ai', 'ذكاء اصطناعي']],
  ['Data & Analytics', ['data', 'analyst', 'analytics', 'محلل بيانات']],
  ['Engineering', ['engineer', 'mechanical engineer', 'civil', 'electrical engineer', '=mep', 'autocad', 'draftsman', 'quality control', 'qc inspector', 'qhse', 'مهندس']],
  ['Sales & BD', ['sales', 'sale ', 'business development', 'property consultant', 'travel advisor', 'مبيعات']],
  ['Retail', ['cashier', 'merchand', 'buyer', 'retail', 'shop', 'بايع']],
  ['Marketing', ['marketing', 'social media', '=seo', 'content', 'digital', 'public relations', 'media']],
  ['Finance & Accounting', ['accountant', 'accounting', 'accounts', 'finance', 'audit', 'bookkeep', 'treasury', 'financ', 'banking', 'investment', 'mortgage', '=aml', 'compliance', 'quant', 'trader', 'محاسب']],
  ['HR & Admin', ['=hr', 'h.r', 'human resource', 'recruit', 'talent', 'learning and development', 'admin', 'secretary', 'office', 'receptionist', 'front desk', 'document con', 'documents con', 'computer operator', 'computer oprator', 'clerk', 'موارد بشرية', 'الموارد البشرية', 'التوظيف', 'مساعد اداري', 'سكرتارية']],
  ['Customer Service', ['customer', 'call center', 'call centre', 'support']],
  ['Operations & Logistics', ['operation', 'logistic', 'supply chain', 'procurement', 'warehouse', 'store keeper', 'storekeeper', 'inventory', 'loader', 'work permit']],
  ['Hospitality & F&B', ['hotel', 'hospitality', 'chef', '=cook', '=commi', 'wait', 'barista', 'bartender', 'bar back', 'restaurant', 'housekeep', 'kitchen', 'steward', 'food', 'butcher', 'pizza', 'pizaa', 'bakery', 'sushi', 'hostess', 'party host', 'event', 'شاف', 'ظباخ', 'طباخ']],
  ['Beauty & Wellness', ['spa', 'massage', 'groom', 'hair', 'beauty', 'salon', 'make up', 'makeup', 'personal trainer', 'coach']],
  ['Education', ['teacher', 'tutor', 'lecturer', 'teaching', 'education', 'professor']],
  ['Design & Creative', ['design', 'graphic', 'video', 'photograph', '=ui', '=ux']],
  ['Trades & Technicians', ['technician', 'electrician', 'electrican', 'electronics', 'maintenance', 'plumber', 'welder', 'mechanic', 'carpenter', 'labour', 'labor', 'security', 'hvac', '=bms', 'scaffold', 'construction', 'tiles', 'cleaning', 'cleaner', 'operator', 'oprater', 'foreman', 'farmer', 'فني', 'تكييف', 'لحام', 'سقالات']],
  ['Management', ['project', 'manager', 'manger', 'management', 'director', 'supervisor', 'supvisor', 'team leader', 'regional head', 'coordinator', 'مدير', 'مشرف']],
];

const norm = (s: string) => s.toLowerCase().normalize('NFKC').replace(/\s+/g, ' ').trim();
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function matches(text: string, pattern: string): boolean {
  if (pattern.startsWith('=')) {
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(pattern.slice(1))}([^\\p{L}\\p{N}]|$)`, 'u').test(text);
  }
  return text.includes(pattern);
}

function classify(rules: readonly Rule[], raw: string | null | undefined): string {
  if (!raw || !raw.trim()) return UNCLASSIFIED;
  const text = norm(raw);
  for (const [bucket, pats] of rules) if (pats.some(p => matches(text, p))) return bucket;
  return OTHER;
}

export const functionBucket = (v: string | null | undefined) => classify(FUNCTION_RULES, v);
export const countryBucket = (v: string | null | undefined) => classify(COUNTRY_RULES, v);
export const roleBucket = (v: string | null | undefined) => classify(ROLE_RULES, v);

const sqlLit = (s: string) => `'${s.replace(/'/g, "''")}'`;

function patternSql(column: string, pattern: string): string {
  if (pattern.startsWith('=')) {
    // Postgres ARE word boundaries: \m start of word, \M end of word.
    return `${column} ~* ${sqlLit(`\\m${escapeRe(pattern.slice(1))}\\M`)}`;
  }
  return `${column} ILIKE ${sqlLit(`%${pattern.replace(/[%_\\]/g, m => `\\${m}`)}%`)}`;
}

/** Build a SQL CASE over `column`. Literals come from the constants above, never from user input. */
export function caseSql(rules: readonly Rule[], column: string): string {
  const whens = rules
    .map(([bucket, pats]) => `WHEN ${pats.map(p => patternSql(column, p)).join(' OR ')} THEN ${sqlLit(bucket)}`)
    .join(' ');
  return `(CASE WHEN ${column} IS NULL OR btrim(${column}) = '' THEN ${sqlLit(UNCLASSIFIED)} ${whens} ELSE ${sqlLit(OTHER)} END)`;
}

export const functionCaseSql = (col: string) => caseSql(FUNCTION_RULES, col);
export const countryCaseSql = (col: string) => caseSql(COUNTRY_RULES, col);
