import { describe, expect, it } from 'vitest';
import { isValidKey, keyBetween, keysBetween } from './sortkey';

describe('keyBetween', () => {
  it('mints the first key of an empty list', () => {
    expect(keyBetween(null, null)).toBe('a0');
  });

  it('lands strictly between its bounds', () => {
    const a = keyBetween(null, null);
    const b = keyBetween(a, null);
    const mid = keyBetween(a, b);
    expect(a < mid).toBe(true);
    expect(mid < b).toBe(true);
  });

  it('rejects bounds in the wrong order', () => {
    const a = keyBetween(null, null);
    const b = keyBetween(a, null);
    expect(() => keyBetween(b, a)).toThrow();
  });

  it('rejects malformed bounds rather than minting a bad key', () => {
    expect(() => keyBetween('', null)).toThrow();
    expect(() => keyBetween('a00', null)).toThrow(); // trailing zero
    expect(() => keyBetween('0', null)).toThrow(); // no integer head
  });

  it('keeps keys short when appending — the Enter-at-the-end case', () => {
    let key = keyBetween(null, null);
    const keys = [key];
    for (let i = 0; i < 500; i++) {
      key = keyBetween(key, null);
      keys.push(key);
    }
    expect([...keys].sort()).toEqual(keys);
    expect(Math.max(...keys.map((k) => k.length))).toBeLessThanOrEqual(4);
  });

  it('keeps keys short when prepending', () => {
    let key = keyBetween(null, null);
    const keys = [key];
    for (let i = 0; i < 500; i++) {
      key = keyBetween(null, key);
      keys.unshift(key);
    }
    expect([...keys].sort()).toEqual(keys);
    expect(Math.max(...keys.map((k) => k.length))).toBeLessThanOrEqual(4);
  });

  it('survives repeated insertion at the same spot', () => {
    const first = keyBetween(null, null);
    const last = keyBetween(first, null);
    let upper = last;
    const inserted: string[] = [];
    for (let i = 0; i < 200; i++) {
      upper = keyBetween(first, upper);
      inserted.unshift(upper);
    }
    const all = [first, ...inserted, last];
    expect([...all].sort()).toEqual(all);
    expect(new Set(all).size).toBe(all.length);
  });

  it('holds order under random insertions', () => {
    let keys = keysBetween(null, null, 8);
    for (let i = 0; i < 400; i++) {
      const at = Math.floor(Math.random() * (keys.length + 1));
      const key = keyBetween(keys[at - 1] ?? null, keys[at] ?? null);
      keys = [...keys.slice(0, at), key, ...keys.slice(at)];
    }
    expect([...keys].sort()).toEqual(keys);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('keysBetween', () => {
  it('returns n ascending keys inside the bounds', () => {
    const keys = keysBetween(null, null, 10);
    expect(keys).toHaveLength(10);
    expect([...keys].sort()).toEqual(keys);

    const inner = keysBetween(keys[0], keys[1], 5);
    expect([...inner].sort()).toEqual(inner);
    expect(keys[0] < inner[0]).toBe(true);
    expect(inner[4] < keys[1]).toBe(true);
  });

  it('returns nothing for a non-positive count', () => {
    expect(keysBetween(null, null, 0)).toEqual([]);
    expect(keysBetween(null, null, -3)).toEqual([]);
  });
});

describe('isValidKey', () => {
  it('accepts minted keys and rejects everything else', () => {
    expect(isValidKey(keyBetween(null, null))).toBe(true);
    expect(isValidKey('a0')).toBe(true);
    expect(isValidKey('a00')).toBe(false); // fractional part ends in zero
    expect(isValidKey('')).toBe(false);
    expect(isValidKey('a')).toBe(false); // integer part truncated
    expect(isValidKey('!!')).toBe(false);
    expect(isValidKey(undefined)).toBe(false);
    expect(isValidKey(42)).toBe(false);
  });
});
