export interface Kpi {
  value: number | null;
  /** Same measure over the previous period, for the delta chip. */
  previous?: number | null;
  format?: 'number' | 'percent';
  hint?: string;
}

export interface Bucket {
  label: string;
  value: number;
  key?: string;
}

export interface TrendPoint {
  /** ISO date (yyyy-mm-dd) of the bucket start. */
  t: string;
  value: number;
}

export interface Paged<T> {
  rows: T[];
  total: number;
}
