import { describe, it, expect } from 'vitest';
import {
  parseCSVLine, escapeCSVCell, rowsToCSV, parseCSVContent,
  normalizeStatus, VALID_DEVICE_TYPES, VALID_STATUSES
} from '../js/io/csv.js';

describe('parseCSVLine', () => {
  it('splits a plain row', () => {
    expect(parseCSVLine('a,b,c')).toEqual(['a', 'b', 'c']);
  });
  it('keeps commas inside quotes together', () => {
    expect(parseCSVLine('a,"b,c",d')).toEqual(['a', 'b,c', 'd']);
  });
  it('unescapes a doubled quote', () => {
    expect(parseCSVLine('a,"say ""hi""",c')).toEqual(['a', 'say "hi"', 'c']);
  });
  it('preserves empty fields', () => {
    expect(parseCSVLine('a,,c')).toEqual(['a', '', 'c']);
    expect(parseCSVLine(',,')).toEqual(['', '', '']);
  });
  it('trims surrounding whitespace', () => {
    expect(parseCSVLine(' a , b ')).toEqual(['a', 'b']);
  });
  it('handles a single field and an empty line', () => {
    expect(parseCSVLine('solo')).toEqual(['solo']);
    expect(parseCSVLine('')).toEqual(['']);
  });
});

describe('escapeCSVCell', () => {
  it('leaves ordinary values alone', () => {
    expect(escapeCSVCell('plain')).toBe('plain');
  });
  it('quotes values containing a comma, quote or newline', () => {
    expect(escapeCSVCell('a,b')).toBe('"a,b"');
    expect(escapeCSVCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCSVCell('two\nlines')).toBe('"two\nlines"');
  });
  it('renders null and undefined as empty, not as the words', () => {
    expect(escapeCSVCell(null)).toBe('');
    expect(escapeCSVCell(undefined)).toBe('');
  });
  it('round-trips through parseCSVLine', () => {
    for (const v of ['plain', 'a,b', 'say "hi"', '', '  pad  ']) {
      expect(parseCSVLine(escapeCSVCell(v))[0]).toBe(v.trim());
    }
  });
});

describe('rowsToCSV', () => {
  it('writes comments, then headers, then rows', () => {
    const out = rowsToCSV(['A', 'B'], [['1', '2']], ['# note']);
    expect(out).toBe('# note\nA,B\n1,2\n');
  });
  it('works without comments', () => {
    expect(rowsToCSV(['A'], [['1']])).toBe('A\n1\n');
  });
  it('escapes cells on the way out', () => {
    expect(rowsToCSV(['A'], [['x,y']])).toBe('A\n"x,y"\n');
  });
});

describe('parseCSVContent', () => {
  const body = [
    '# Valid types: router, switch',
    'Type,Name,IP Address',
    'router,Edge,203.0.113.1',
    'switch,Core,192.168.1.2'
  ].join('\n');

  it('skips comment lines and keys rows by squashed header', () => {
    const { rows } = parseCSVContent(body);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ type: 'router', name: 'Edge', ipaddress: '203.0.113.1' });
  });

  it('reports unrecognised types instead of dropping them silently', () => {
    const { rows, skipped } = parseCSVContent(
      'Type,Name\nrouter,A\ntoaster,B\nswitch,C'
    );
    expect(rows.map(r => r.name)).toEqual(['A', 'C']);
    expect(skipped).toBe(1);
  });

  it('accepts a type in any case', () => {
    expect(parseCSVContent('Type,Name\nROUTER,A').rows).toHaveLength(1);
  });

  it('returns an empty result for a header-only or empty file', () => {
    expect(parseCSVContent('Type,Name').rows).toEqual([]);
    expect(parseCSVContent('').headers).toEqual([]);
    expect(parseCSVContent('# only a comment').headers).toEqual([]);
  });

  it('fills missing trailing columns with empty strings', () => {
    const { rows } = parseCSVContent('Type,Name,IP Address\nrouter,Edge');
    expect(rows[0].ipaddress).toBe('');
  });

  it('accepts every type the app can create', () => {
    const csv = 'Type,Name\n' + VALID_DEVICE_TYPES.map((t, i) => `${t},D${i}`).join('\n');
    const { rows, skipped } = parseCSVContent(csv);
    expect(skipped).toBe(0);
    expect(rows).toHaveLength(VALID_DEVICE_TYPES.length);
  });
});

describe('normalizeStatus', () => {
  it('passes through every supported status', () => {
    VALID_STATUSES.forEach(s => expect(normalizeStatus(s)).toBe(s));
  });
  it('lowercases input', () => {
    expect(normalizeStatus('ONLINE')).toBe('online');
  });
  it('falls back to online for anything unrecognised', () => {
    expect(normalizeStatus('banana')).toBe('online');
    expect(normalizeStatus('')).toBe('online');
    expect(normalizeStatus(undefined)).toBe('online');
  });
});
