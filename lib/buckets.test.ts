import { describe, expect, it } from 'vitest';
import { caseSql, COUNTRY_RULES, countryBucket, functionBucket, roleBucket } from './buckets';
import { parseFilters } from './filters';

describe('functionBucket', () => {
  it('collapses overlapping LinkedIn labels', () => {
    expect(functionBucket('Sales')).toBe('Sales & BD');
    expect(functionBucket('Business Development and Sales')).toBe('Sales & BD');
    expect(functionBucket('Sales and Business Development')).toBe('Sales & BD');
    expect(functionBucket('Engineering and Information Technology')).toBe('Engineering & IT');
    expect(functionBucket('Marketing and Sales')).toBe('Marketing');
  });
  it('separates missing from unknown', () => {
    expect(functionBucket(null)).toBe('Unclassified');
    expect(functionBucket('  ')).toBe('Unclassified');
    expect(functionBucket('Other')).toBe('Other');
  });
});

describe('countryBucket', () => {
  it('parses LinkedIn-style locations', () => {
    expect(countryBucket('Dubai, Dubai, United Arab Emirates')).toBe('United Arab Emirates');
    expect(countryBucket('Riyadh Region')).toBe('Saudi Arabia');
    expect(countryBucket('Greater Bengaluru Area')).toBe('India');
    expect(countryBucket('Hong Kong SAR')).toBe('Hong Kong');
    expect(countryBucket('Not specified')).toBe('Other');
  });
  it('matches UAE only as a word', () => {
    expect(countryBucket('Remote, UAE')).toBe('United Arab Emirates');
    expect(countryBucket('Guaemas')).toBe('Other');
  });
});

describe('roleBucket', () => {
  it('handles short tokens as whole words', () => {
    expect(roleBucket('HR, Administration')).toBe('HR & Admin');
    expect(roleBucket('IT')).toBe('Software & IT');
    expect(roleBucket('Driver')).toBe('Driver');
    expect(roleBucket('sitting manager')).toBe('Management');
    expect(roleBucket('سائق')).toBe('Driver');
  });
});

describe('caseSql', () => {
  it('escapes and uses word boundaries for = patterns', () => {
    const sql = caseSql(COUNTRY_RULES, 'j.location');
    expect(sql).toContain("j.location ~* '\\muae\\M'");
    expect(sql).toContain("j.location ILIKE '%dubai%'");
    expect(sql.startsWith('(CASE')).toBe(true);
  });
});

describe('parseFilters', () => {
  const now = new Date('2026-11-20T00:00:00Z');
  it('defaults and validates', () => {
    const f = parseFilters({ range: 'bogus', market: 'Mars' }, now);
    expect(f.range).toBe('90d');
    expect(f.market).toBeNull();
    expect(f.page).toBe(1);
  });
  it('computes period windows', () => {
    const f = parseFilters({ range: '7d', market: 'India', page: '3' }, now);
    expect(f.from?.toISOString()).toBe('2026-11-13T00:00:00.000Z');
    expect(f.prevFrom?.toISOString()).toBe('2026-11-06T00:00:00.000Z');
    expect(f.market).toBe('India');
    expect(f.page).toBe(3);
    expect(parseFilters({ range: 'all' }, now).from).toBeNull();
  });
});
