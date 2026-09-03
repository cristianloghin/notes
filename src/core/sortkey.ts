/**
 * Fractional index keys: strings that sort lexicographically and always
 * admit a new key strictly between any two neighbours. Order therefore
 * lives in each row rather than in a positional array, so inserting or
 * moving a row is a single-key JSON merge patch instead of a rewritten
 * order list — the property that lets a stored override change structure
 * without cloning the note body.
 *
 * Base-62 with a length-encoding integer part (Figma's scheme, as
 * published in the `fractional-indexing` package). The integer part is
 * what keeps appends cheap: adding at the end of a list mints 'a0', 'a1',
 * … 'az', 'b00', so key length grows with log(n) rather than n. Without
 * it the common case — Enter at the end of a note — would lengthen the
 * key every few rows.
 *
 * A valid key satisfies two invariants, both checked by `isValidKey`:
 * - its first character encodes the length of the integer part;
 * - its fractional part never ends in '0', because '…x' and '…x0' would
 *   otherwise denote the same fraction and admit no midpoint between them.
 */

const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const ZERO = DIGITS[0];
const LAST = DIGITS[DIGITS.length - 1];

/** The lowest integer part; reserved, so it is never a whole valid key. */
const SMALLEST_INT = `A${ZERO.repeat(26)}`;

/** 'a' → 2 ('a0'), 'z' → 27; 'Z' → 2, 'A' → 27. */
function integerLength(head: string): number {
  if (head >= 'a' && head <= 'z') return head.charCodeAt(0) - 97 + 2;
  if (head >= 'A' && head <= 'Z') return 90 - head.charCodeAt(0) + 2;
  throw new Error(`invalid sort key head: ${head}`);
}

function integerPart(key: string): string {
  const length = integerLength(key[0]);
  if (length > key.length) throw new Error(`invalid sort key: ${key}`);
  return key.slice(0, length);
}

function validateInteger(int: string): void {
  if (int.length !== integerLength(int[0])) {
    throw new Error(`invalid integer part of sort key: ${int}`);
  }
}

/**
 * Tolerant check for keys arriving from storage. `parseDoc` uses it to
 * decide whether a stored key can be trusted; `keyBetween` uses it to
 * reject programming errors loudly.
 */
export function isValidKey(key: unknown): key is string {
  if (typeof key !== 'string' || key === '' || key === SMALLEST_INT) return false;
  for (const ch of key) if (!DIGITS.includes(ch)) return false;
  try {
    const int = integerPart(key);
    return !key.slice(int.length).endsWith(ZERO);
  } catch {
    return false;
  }
}

function validateKey(key: string): void {
  if (!isValidKey(key)) throw new Error(`invalid sort key: ${key}`);
}

/** Next integer part, or null when the space is exhausted at the top. */
function incrementInteger(x: string): string | null {
  validateInteger(x);
  const [head, ...digits] = x.split('');
  let carry = true;
  for (let i = digits.length - 1; carry && i >= 0; i--) {
    const d = DIGITS.indexOf(digits[i]) + 1;
    if (d === DIGITS.length) digits[i] = ZERO;
    else {
      digits[i] = DIGITS[d];
      carry = false;
    }
  }
  if (!carry) return head + digits.join('');
  if (head === 'Z') return `a${ZERO}`;
  if (head === 'z') return null;
  const next = String.fromCharCode(head.charCodeAt(0) + 1);
  if (next > 'a') digits.push(ZERO);
  else digits.pop();
  return next + digits.join('');
}

/** Previous integer part, or null when the space is exhausted at the bottom. */
function decrementInteger(x: string): string | null {
  validateInteger(x);
  const [head, ...digits] = x.split('');
  let borrow = true;
  for (let i = digits.length - 1; borrow && i >= 0; i--) {
    const d = DIGITS.indexOf(digits[i]) - 1;
    if (d === -1) digits[i] = LAST;
    else {
      digits[i] = DIGITS[d];
      borrow = false;
    }
  }
  if (!borrow) return head + digits.join('');
  if (head === 'a') return `Z${LAST}`;
  if (head === 'A') return null;
  const prev = String.fromCharCode(head.charCodeAt(0) - 1);
  if (prev < 'Z') digits.push(LAST);
  else digits.pop();
  return prev + digits.join('');
}

/**
 * A fraction strictly between `a` and `b`, both read as digits after an
 * implicit "0." — `b === null` means 1. Never returns a string ending in
 * '0', preserving the invariant above.
 */
function midpoint(a: string, b: string | null): string {
  if (b !== null && a >= b) throw new Error(`${a} >= ${b}`);
  if (a.endsWith(ZERO) || b?.endsWith(ZERO)) throw new Error('trailing zero');
  if (b) {
    // Strip the longest common prefix, padding `a` with zeros as we go —
    // `b` cannot run out first while the prefix still matches.
    let n = 0;
    while ((a[n] ?? ZERO) === b[n]) n++;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }
  const digitA = a ? DIGITS.indexOf(a[0]) : 0;
  const digitB = b !== null ? DIGITS.indexOf(b[0]) : DIGITS.length;
  if (digitB - digitA > 1) return DIGITS[Math.round(0.5 * (digitA + digitB))];
  // Leading digits are consecutive: borrow a place from whichever side
  // still has room.
  if (b && b.length > 1) return b.slice(0, 1);
  return DIGITS[digitA] + midpoint(a.slice(1), null);
}

/**
 * Mint a key ordering strictly after `a` and strictly before `b`; either
 * bound may be null to mean "start of list" / "end of list".
 *
 * Two independent overrides can legitimately mint the same key for
 * different rows. That is a tie, not a conflict — `parseDoc` breaks ties
 * by row id, so every reader lands on the same order.
 */
export function keyBetween(a: string | null, b: string | null): string {
  if (a !== null) validateKey(a);
  if (b !== null) validateKey(b);
  if (a !== null && b !== null && a >= b) throw new Error(`${a} >= ${b}`);

  if (a === null) {
    if (b === null) return `a${ZERO}`;
    const int = integerPart(b);
    const frac = b.slice(int.length);
    if (int === SMALLEST_INT) return int + midpoint('', frac);
    if (int < b) return int;
    const decremented = decrementInteger(int);
    if (decremented === null) throw new Error('sort key space exhausted below');
    return decremented;
  }

  if (b === null) {
    const int = integerPart(a);
    const frac = a.slice(int.length);
    const incremented = incrementInteger(int);
    return incremented === null ? int + midpoint(frac, null) : incremented;
  }

  const intA = integerPart(a);
  const fracA = a.slice(intA.length);
  const intB = integerPart(b);
  if (intA === intB) return intA + midpoint(fracA, b.slice(intB.length));
  const incremented = incrementInteger(intA);
  if (incremented === null) throw new Error('sort key space exhausted above');
  return incremented < b ? incremented : intA + midpoint(fracA, null);
}

/** `n` keys in ascending order, all strictly between `a` and `b`. */
export function keysBetween(
  a: string | null,
  b: string | null,
  n: number,
): string[] {
  if (n <= 0) return [];
  if (n === 1) return [keyBetween(a, b)];
  if (b === null) {
    let key = keyBetween(a, b);
    const keys = [key];
    for (let i = 0; i < n - 1; i++) {
      key = keyBetween(key, b);
      keys.push(key);
    }
    return keys;
  }
  if (a === null) {
    let key = keyBetween(a, b);
    const keys = [key];
    for (let i = 0; i < n - 1; i++) {
      key = keyBetween(a, key);
      keys.push(key);
    }
    return keys.reverse();
  }
  // Split the range so key length grows with log(n), not n.
  const half = Math.floor(n / 2);
  const mid = keyBetween(a, b);
  return [
    ...keysBetween(a, mid, half),
    mid,
    ...keysBetween(mid, b, n - half - 1),
  ];
}
