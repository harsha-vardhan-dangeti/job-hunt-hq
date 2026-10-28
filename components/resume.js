/* Role-specific resumes. The agent writes them (as `resume` on a role) from the
   master resume alone; these helpers decide what needs one, check the result
   against the master, and turn it into plain text. No React here. */

import { CLOSED } from './model';

/** Open roles worth a tailored resume: fit 4+ and still in play. */
export function wantsResume(j) {
  return !CLOSED.has(j.status) && (Number(j.fit) || 0) >= 4;
}

/* A tailoring run takes a few minutes; past this the request has stalled. */
const STALL_MS = 30 * 60 * 1000;

/** 'requested' | 'stalled' | 'none' | 'stale' (master changed since) | 'ready'.
 *  The agent clears resumeRequestedOn when it writes the resume. */
export function resumeState(j, master) {
  if (j.resumeRequestedOn) {
    return Date.now() - Date.parse(j.resumeRequestedOn) > STALL_MS ? 'stalled' : 'requested';
  }
  if (!j.resume) return 'none';
  if (master?.updatedOn && j.resume.basedOn && j.resume.basedOn < master.updatedOn) return 'stale';
  return 'ready';
}

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ');

/** Figures a reader would take as a claim: 40%, 3x, 10k+, 1.2M, 200ms, 30 LPA. */
const NUMBER = /\d[\d,]*(?:\.\d+)?(?:\s?%|x\b|\s?[km]\b\+?|\+|\s?lpa\b|\s?ms\b)?/gi;

function numbersIn(text) {
  return (String(text || '').match(NUMBER) || []).filter((n) => !/^(19|20)\d\d$/.test(n));
}

/** Every number, skill, employer and title in the tailored resume that the
 *  master resume doesn't contain. An empty list means nothing was added. */
export function factCheck(r, masterText) {
  if (!r || !masterText) return [];
  const master = norm(masterText);
  // Compare whole numbers, so "4 years" isn't vouched for by the 4 in "40%".
  const value = (n) => n.replace(/,/g, '').match(/\d+(?:\.\d+)?/)[0];
  const masterNumbers = new Set(numbersIn(masterText).map(value));
  const missing = new Set();

  const has = (s) => master.includes(norm(s));

  for (const g of r.skills || []) for (const s of g.items || []) if (s && !has(s)) missing.add(s);
  for (const x of r.experience || []) {
    if (x.company && !has(x.company)) missing.add(x.company);
    if (x.title && !has(x.title)) missing.add(x.title);
  }
  for (const c of r.certifications || []) if (c && !has(c)) missing.add(c);

  const prose = [
    r.summary,
    ...(r.experience || []).flatMap((x) => x.bullets || []),
    ...(r.projects || []).flatMap((p) => p.bullets || []),
  ].join(' \n ');
  for (const n of numbersIn(prose)) if (!masterNumbers.has(value(n))) missing.add(n.trim());
  return [...missing];
}

/** Plain text, one fact per line, for pasting into an application form. */
export function resumeText(r) {
  if (!r) return '';
  const out = [];
  if (r.name) out.push(r.name);
  if (r.contact) out.push(r.contact);
  if (r.headline) out.push(r.headline);
  const section = (title) => out.push('', title.toUpperCase());
  if (r.summary) {
    section('Summary');
    out.push(r.summary);
  }
  if (r.skills?.length) {
    section('Skills');
    for (const g of r.skills) out.push(`${g.group}: ${(g.items || []).join(', ')}`);
  }
  if (r.experience?.length) {
    section('Experience');
    for (const x of r.experience) {
      out.push(
        [x.title, x.company].filter(Boolean).join(', ') +
          (x.dates ? ` | ${x.dates}` : '') +
          (x.location ? ` | ${x.location}` : ''),
      );
      for (const b of x.bullets || []) out.push(`- ${b}`);
      out.push('');
    }
    out.pop();
  }
  if (r.projects?.length) {
    section('Projects');
    for (const p of r.projects) {
      out.push(p.name);
      for (const b of p.bullets || []) out.push(`- ${b}`);
    }
  }
  if (r.education?.length) {
    section('Education');
    for (const e of r.education) out.push([e.degree, e.school, e.dates].filter(Boolean).join(', '));
  }
  if (r.certifications?.length) {
    section('Certifications');
    for (const c of r.certifications) out.push(c);
  }
  return out.join('\n');
}

export const JD_SOURCE = {
  pasted: 'the job description you pasted',
  posting: 'the job posting',
  indeed: 'the Indeed listing',
  'title-only': 'the role title and notes only (no job description could be read)',
};
