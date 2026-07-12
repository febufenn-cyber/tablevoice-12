import { describe, expect, it } from 'vitest';
import { csvRecords, parseCsv } from '../src/lib/csv';

describe('CSV parser', () => {
  it('parses quoted commas and escaped quotes', () => {
    const rows = parseCsv('review_text,rating\n"Good food, but slow",3\n"He said ""great""",5\n');
    expect(rows[1]).toEqual(['Good food, but slow', '3']);
    expect(rows[2]).toEqual(['He said "great"', '5']);
  });

  it('maps headers to records', () => {
    expect(csvRecords('platform,rating\ngoogle,5\n')).toEqual([{ platform: 'google', rating: '5' }]);
  });
});
