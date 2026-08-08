import { defaultGenId } from './id';
import type { GenId, Row } from './types';

const ITEM_RE = /^- \[([ xX])\] ?(.*)$/;

/** Parse markdown into rows. Also serves as the paste handler (spec §8).
    All row ids are minted through `genId` so a host-injected factory
    covers parsed rows too — including the paste path. */
export function parseMarkdown(src: string, genId: GenId = defaultGenId): Row[] {
  const rows: Row[] = [];
  for (const raw of src.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (line.trim() === '') continue; // blank lines are presentational, not rows
    if (line.startsWith('# ')) {
      rows.push({ id: genId(), type: 'header', text: line.slice(2) });
      continue;
    }
    const m = ITEM_RE.exec(line);
    if (m) {
      rows.push({ id: genId(), type: 'item', text: m[2], done: m[1] !== ' ' });
    } else {
      // Any other non-empty line is a plain-text paragraph row.
      rows.push({ id: genId(), type: 'text', text: line });
    }
  }
  return rows;
}

export function serialize(rows: Row[]): string {
  const out: string[] = [];
  rows.forEach((row, i) => {
    if (row.type === 'header') {
      if (i > 0) out.push('');
      out.push(`# ${row.text}`);
    } else if (row.type === 'text') {
      out.push(row.text);
    } else {
      // equal-length ASCII markers so toggling never changes layout (spec §8)
      out.push(`${row.done ? '- [x]' : '- [ ]'} ${row.text}`);
    }
  });
  return out.join('\n');
}
