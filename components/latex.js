/* A tailored resume as a LaTeX file, for editing in Overleaf. It uses only
   packages every TeX install has, so it compiles with pdflatex as is. */

const SPECIAL = {
  '\\': '\\textbackslash{}',
  '&': '\\&',
  '%': '\\%',
  $: '\\$',
  '#': '\\#',
  _: '\\_',
  '{': '\\{',
  '}': '\\}',
  '~': '\\textasciitilde{}',
  '^': '\\textasciicircum{}',
};

/** Escapes LaTeX's special characters, and swaps the Unicode punctuation the
 *  agent writes for TeX's own, since pdflatex can't print every character. */
export function tex(s) {
  return String(s ?? '')
    .replace(/[\\&%$#_{}~^]/g, (c) => SPECIAL[c])
    .replace(/[–]/g, '--')
    .replace(/[—]/g, '---')
    .replace(/[‘’]/g, "'")
    .replace(/[“]/g, '``')
    .replace(/[”]/g, "''")
    .replace(/…/g, '\\ldots{}')
    .replace(/[•·]/g, '\\textbullet{}')
    .replace(/₹\s?/g, 'Rs.~')
    .replace(/\|/g, '\\textbar{}')
    .replace(/[<>]/g, (c) => (c === '<' ? '\\textless{}' : '\\textgreater{}'));
}

const PREAMBLE = String.raw`\documentclass[10pt]{article}
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage{lmodern}
\usepackage[margin=0.6in]{geometry}
\usepackage{enumitem}
\usepackage{titlesec}
\usepackage[hidelinks]{hyperref}

\pagestyle{empty}
\setlength{\parindent}{0pt}
\setlist[itemize]{leftmargin=1.2em, itemsep=1pt, topsep=2pt, parsep=0pt}
\titleformat{\section}{\large\bfseries}{}{0pt}{}[\titlerule]
\titlespacing*{\section}{0pt}{10pt}{5pt}

% One line per job: what on the left, where and when on the right.
\newcommand{\entry}[2]{\textbf{#1}\hfill #2\par}
`;

function bullets(list) {
  const items = (list || []).filter(Boolean);
  if (!items.length) return [];
  return ['\\begin{itemize}', ...items.map((b) => `  \\item ${tex(b)}`), '\\end{itemize}'];
}

/** The whole .tex file, section for section as the Resumes page shows it. */
export function resumeLatex(r) {
  const out = [PREAMBLE, '\\begin{document}', ''];
  out.push('\\begin{center}');
  if (r.name) out.push(`  {\\LARGE\\bfseries ${tex(r.name)}}\\\\[3pt]`);
  if (r.contact) out.push(`  ${tex(r.contact)}\\\\[2pt]`);
  if (r.headline) out.push(`  \\textit{${tex(r.headline)}}`);
  out.push('\\end{center}', '');

  if (r.summary) out.push('\\section*{Summary}', tex(r.summary), '');

  if (r.skills?.length) {
    out.push('\\section*{Skills}', '\\begin{itemize}');
    for (const g of r.skills) out.push(`  \\item \\textbf{${tex(g.group)}:} ${tex((g.items || []).join(', '))}`);
    out.push('\\end{itemize}', '');
  }

  if (r.experience?.length) {
    out.push('\\section*{Experience}');
    for (const x of r.experience) {
      const what = [x.title, x.company].filter(Boolean).map(tex).join(', ');
      const where = [x.location, x.dates].filter(Boolean).map(tex).join(' \\textbar{} ');
      out.push(`\\entry{${what}}{${where}}`, ...bullets(x.bullets), '\\medskip', '');
    }
  }

  if (r.projects?.length) {
    out.push('\\section*{Projects}');
    for (const p of r.projects) out.push(`\\entry{${tex(p.name)}}{}`, ...bullets(p.bullets), '\\medskip', '');
  }

  if (r.education?.length) {
    out.push('\\section*{Education}');
    for (const e of r.education) {
      out.push(`\\entry{${[e.degree, e.school].filter(Boolean).map(tex).join(', ')}}{${tex(e.dates)}}`);
    }
    out.push('');
  }

  if (r.certifications?.length) out.push('\\section*{Certifications}', ...bullets(r.certifications), '');

  out.push('\\end{document}', '');
  return out.join('\n');
}

/** Sends the resume to Overleaf, which opens it as a new project in the
 *  signed-in account (or asks the viewer to sign in first). Overleaf has no
 *  way to update an existing project, so each click makes a fresh one. */
export function openInOverleaf(r, name) {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = 'https://www.overleaf.com/docs';
  form.target = '_blank';
  const field = (k, v) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = k;
    input.value = v;
    form.appendChild(input);
  };
  field('encoded_snip', encodeURIComponent(resumeLatex(r)));
  field('snip_name', name);
  field('engine', 'pdflatex');
  document.body.appendChild(form);
  form.submit();
  form.remove();
}
