import { describe, it, expect } from 'vitest';
import { uniqueEntryNames, matchEntryNames } from './name-suggest';
import type { Entry } from './vault';

const entry = (id: string, name: string): Entry => ({ id, name, username: '', password: '', categoryId: '', updatedAt: '' });

describe('unique entry names', () => {
  it('trims, drops blanks and dedupes case-insensitively, keeping the first spelling', () => {
    const names = uniqueEntryNames([
      entry('1', ' AppleID '),
      entry('2', 'appleid'),
      entry('3', 'GitHub'),
      entry('4', '   '),
      entry('5', ''),
      entry('6', 'Cloudflare'),
    ]);
    expect(names).toEqual(['AppleID', 'Cloudflare', 'GitHub']);
  });
  it('excludes the entry currently being edited', () => {
    expect(uniqueEntryNames([entry('1', 'AppleID'), entry('2', 'GitHub')], '1')).toEqual(['GitHub']);
  });
});

describe('entry name suggestions', () => {
  const names = ['AppleID', 'apple music', 'Big Apple', 'GitHub', 'GitLab'];
  it('matches case-insensitive substrings and never echoes the exact typed value', () => {
    expect(matchEntryNames(names, 'APPLE')).toEqual(['apple music', 'AppleID', 'Big Apple']);
    expect(matchEntryNames(names, 'AppleID')).toEqual([]);
  });
  it('ranks prefix matches before inner matches', () => {
    expect(matchEntryNames(['Big Apple', 'AppleID', 'Apple Music'], 'apple')).toEqual(['Apple Music', 'AppleID', 'Big Apple']);
  });
  it('returns nothing for blank queries and caps the result count', () => {
    expect(matchEntryNames(names, '   ')).toEqual([]);
    expect(matchEntryNames(Array.from({ length: 20 }, (_, i) => `Site ${i + 1}`), 'site', 5)).toHaveLength(5);
    expect(matchEntryNames(names, 'missing')).toEqual([]);
  });
});
