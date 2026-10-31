/* An applicant-tracking-system match score, worked out the way resume scanners
   do it: the job description's keywords found in the resume, the job title,
   the standard sections, and length. The page and the agent (via /api/ats)
   use this same code, so both see the same number. No React here.

   A keyword only counts when the master resume has it too, so adding a skill
   to a tailored resume that the master doesn't back up can't raise the score. */

/* Each entry: the name shown, then the spellings that count as it. Spellings
   are lowercase and matched as whole words; a RegExp is tested case-sensitively
   on the original text (for short words that are also plain English). */
const TERMS = [
  // Languages
  ['Python'], ['Java'], ['Go', 'golang', /\bGo\b(?![- ]to\b)/], ['Rust'], ['C++', 'cpp'], ['C#', 'csharp'],
  ['Ruby'], ['JavaScript', 'js'], ['TypeScript'], ['Kotlin'], ['Scala'], ['SQL'], ['Bash', 'shell scripting'],
  // Backend
  ['FastAPI'], ['Django'], ['Flask'], ['Ruby on Rails', 'rails', 'ror'], ['Node.js', 'nodejs'],
  ['Spring Boot'], ['Express', 'express.js', 'expressjs', /\bExpress\b/], ['GraphQL'], ['gRPC'],
  ['REST APIs', 'restful', 'rest api', 'rest apis', 'restful apis', /\bREST\b/], ['Microservices', 'microservice'],
  ['Distributed systems', 'distributed system'], ['System design'], ['API design'],
  ['Event-driven architecture', 'event-driven', 'event driven'], ['Asynchronous processing', 'async', 'asyncio'],
  // Data and messaging
  ['PostgreSQL', 'postgres', 'postgresql'], ['MySQL'], ['MongoDB', 'mongo'], ['Redis'], ['Elasticsearch', 'opensearch'],
  ['DynamoDB'], ['Cassandra'], ['NoSQL'], ['Kafka', 'apache kafka'], ['RabbitMQ'], ['Sidekiq'], ['Celery'],
  ['Spark', 'pyspark', 'apache spark'], ['Airflow'], ['Snowflake'], ['Databricks'], ['ETL', 'data pipelines', 'data pipeline'],
  // Cloud and delivery
  ['AWS', 'amazon web services'], ['GCP', 'google cloud'], ['Azure'], ['Docker'],
  ['Kubernetes', 'k8s'], ['Terraform'], ['CI/CD', 'ci/cd', 'continuous integration'], ['Git', 'github', 'gitlab'], ['Linux'],
  ['Serverless', 'lambda'], ['Observability', 'monitoring'], ['Unit testing', 'pytest', 'unit tests', 'tdd'],
  // AI
  ['AI', 'artificial intelligence'], ['Machine learning', 'ml'], ['Generative AI', 'genai', 'gen ai', 'generative ai'],
  ['LLMs', 'llm', 'llms', 'large language model', 'large language models'],
  ['RAG', 'retrieval-augmented generation', 'retrieval augmented generation'],
  ['AI agents', 'agentic', 'ai agents', 'ai agent', 'agents', 'multi-agent'], ['LangChain'], ['LangGraph'],
  ['LlamaIndex'], ['Prompt engineering', 'prompting', 'prompt design'], ['Fine-tuning', 'fine tuning', 'finetuning', 'lora'],
  ['Embeddings', 'embedding'], ['Vector databases', 'vector database', 'vector db', 'vector dbs', 'vector store', 'vector search'],
  ['pgvector'], ['ChromaDB', 'chroma'], ['Pinecone'], ['Weaviate'], ['FAISS'], ['Neo4j', 'knowledge graph', 'knowledge graphs'],
  ['OpenAI', 'gpt-4', 'gpt-4o', 'chatgpt'], ['Anthropic', 'claude'], ['Hugging Face', 'huggingface', 'transformers'],
  ['PyTorch'], ['TensorFlow'], ['NLP', 'natural language processing'], ['Evaluation', 'evals', 'llm evaluation'],
  ['MCP', 'model context protocol'], ['Tool calling', 'function calling', 'tool use'],
  // Frontend
  ['React', 'react.js', 'reactjs'], ['Next.js', 'nextjs'], ['HTML'], ['CSS'],
  // Ways of working that FDE and solutions roles screen for
  ['Customer-facing', 'customer facing', 'client-facing', 'client facing'],
  ['Stakeholder management', 'stakeholders', 'stakeholder'], ['Cross-functional', 'cross functional'],
  ['Communication', 'communication skills'], ['Mentoring', 'mentor', 'mentored', 'mentorship'],
  ['Agile', 'scrum'], ['Prototyping', 'prototype', 'prototypes', 'proof of concept', 'poc'],
  ['Production', 'production systems', 'in production'], ['Scalability', 'scalable', 'scale'],
  ['Performance optimization', 'performance tuning', 'latency'], ['Security'],
];

/* Broader terms a master resume backs up through something more specific it
   names: pgvector is a vector database, so "vector databases" is a true
   rewording of it. Only implications that hold by definition belong here. */
const IMPLIED = {
  'Vector databases': ['pgvector', 'ChromaDB', 'Pinecone', 'Weaviate', 'FAISS'],
  Embeddings: ['pgvector', 'ChromaDB', 'Pinecone', 'Weaviate', 'FAISS'],
  LLMs: ['LangChain', 'LangGraph', 'LlamaIndex', 'OpenAI', 'Anthropic', 'RAG', 'Fine-tuning'],
  'AI agents': ['LangGraph'],
  'Generative AI': ['LLMs', 'RAG'],
  AI: ['LLMs', 'RAG', 'Generative AI', 'AI agents', 'Machine learning', 'LangChain', 'LangGraph'],
  SQL: ['PostgreSQL', 'MySQL'],
  NoSQL: ['MongoDB', 'DynamoDB', 'Cassandra', 'Redis'],
  'REST APIs': ['FastAPI', 'Django', 'Flask', 'Express', 'Spring Boot'],
  JavaScript: ['TypeScript', 'Node.js', 'React', 'Next.js'],
  'Asynchronous processing': ['Sidekiq', 'Celery', 'RabbitMQ', 'Kafka'],
};

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/* Whole-word match: the neighbours can't be letters, digits, + or #. */
const word = (s) => new RegExp(`(?:^|[^a-z0-9+#])${escape(s)}(?![a-z0-9+#])`, 'g');

const COMPILED = TERMS.map(([name, ...spellings]) => ({
  name,
  spellings: [name.toLowerCase(), ...spellings.filter((x) => typeof x === 'string')],
  tests: [name.toLowerCase(), ...spellings].map((s) =>
    s instanceof RegExp ? { re: new RegExp(s.source, 'g'), raw: true } : { re: word(s), raw: false },
  ),
}));

function count(term, raw, lower) {
  let n = 0;
  for (const { re, raw: onRaw } of term.tests) n += ((onRaw ? raw : lower).match(re) || []).length;
  return n;
}

/** True when `phrase` is exactly one known term (say "Vector databases") that
 *  the master backs up, by name or through something more specific. */
export function backedPhrase(phrase, master) {
  const p = String(phrase || '').toLowerCase().trim();
  const t = COMPILED.find((x) => x.spellings.includes(p));
  return Boolean(t && master && backs(t, String(master)));
}

/** The job description's keywords, each weighted 2 if it's mentioned more than once. */
export function jdKeywords(jd) {
  const raw = String(jd || '');
  const lower = raw.toLowerCase();
  return COMPILED.map((t) => ({ t, n: count(t, raw, lower) }))
    .filter((x) => x.n > 0)
    .map(({ t, n }) => ({ term: t, weight: n > 1 ? 2 : 1 }));
}

const has = (term, text) => count(term, text, text.toLowerCase()) > 0;
const BY_NAME = new Map(COMPILED.map((t) => [t.name, t]));

/** The master backs a keyword if it names it, or something that implies it. */
const backs = (term, master) =>
  has(term, master) || (IMPLIED[term.name] || []).some((n) => has(BY_NAME.get(n), master));

const TITLE_NOISE = new Set(
  'senior sr staff lead principal junior jr i ii iii iv v of the and for in at to a an - – — / , & ( ) | hyderabad bengaluru bangalore india remote hybrid'.split(
    ' ',
  ),
);

function titleWords(role) {
  return String(role || '')
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .map((w) => w.replace(/\.+$/, ''))
    .filter((w) => w && !TITLE_NOISE.has(w));
}

const HEADINGS = {
  summary: /^(summary|profile|professional summary|about( me)?|objective)\s*:?$/im,
  skills: /^(skills|technical skills|core skills|skills & tools|tech stack|technologies)\s*:?$/im,
  experience: /^(experience|work experience|professional experience|employment( history)?|work history)\s*:?$/im,
  education: /^(education|academics|qualifications)\s*:?$/im,
};
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/;
const NUMBER = /\d/;

/* 10 to 13 digits in one run, so a date range like "2019 - 2022" isn't taken for a phone number. */
const hasPhone = (s) =>
  (s.match(/\+?\d[\d\s().-]{8,16}\d/g) || []).some((m) => {
    const d = m.replace(/\D/g, '').length;
    return d >= 10 && d <= 13;
  });

const words = (s) => String(s || '').split(/\s+/).filter(Boolean).length;

/** Bullet lines: "- ", "• ", "* " or "– " at the start of a line. */
function bulletsIn(text) {
  return String(text)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^[-•*–]\s+/.test(l))
    .map((l) => l.replace(/^[-•*–]\s+/, ''));
}

/** Score `text` (a resume as plain text) for a job. `master` is the master
 *  resume text; a keyword only counts if it's there too. Returns null when
 *  there's no job description to score against. */
export function atsScore({ text, jd, role, master }) {
  const kws = jdKeywords(jd);
  if (!kws.length || !String(text || '').trim()) return null;
  const body = String(text);
  const backing = master == null ? body : String(master);

  // 1. Keywords, 60 points, split by weight.
  const total = kws.reduce((s, k) => s + k.weight, 0);
  const points = (k) => Math.round((60 * k.weight * 10) / total) / 10;
  const matched = [];
  const missing = [];
  const unbacked = [];
  for (const k of kws) {
    const inResume = has(k.term, body);
    const inMaster = backs(k.term, backing);
    if (inResume && inMaster) matched.push(k);
    else if (inResume) unbacked.push({ term: k.term.name, points: points(k) });
    else missing.push({ term: k.term.name, points: points(k), inMaster });
  }
  const kwGot = (60 * matched.reduce((s, k) => s + k.weight, 0)) / total;

  // 2. The job title's words, 10 points.
  const tw = titleWords(role);
  const lowerBody = body.toLowerCase();
  const lowerMaster = backing.toLowerCase();
  const titleHit = tw.filter((w) => word(w).test(lowerBody) && word(w).test(lowerMaster));
  const titleGot = tw.length ? (10 * titleHit.length) / tw.length : 10;

  // 3. Sections a parser looks for, 20 points.
  const checks = [
    { label: 'Email and phone number', ok: EMAIL.test(body) && hasPhone(body), max: 5 },
    { label: 'Summary section', ok: HEADINGS.summary.test(body), max: 3 },
    { label: 'Skills section', ok: HEADINGS.skills.test(body), max: 4 },
    { label: 'Experience section with dates', ok: HEADINGS.experience.test(body) && /\b(19|20)\d\d\b/.test(body), max: 4 },
    { label: 'Education section', ok: HEADINGS.education.test(body), max: 4 },
  ];

  // 4. Length and bullets, 10 points.
  const n = words(body);
  const bullets = bulletsIn(body);
  const quantified = bullets.filter((b) => NUMBER.test(b)).length;
  const avg = bullets.length ? bullets.reduce((s, b) => s + words(b), 0) / bullets.length : 0;
  checks.push(
    {
      label: `One page: 450–800 words (this is ${n})`,
      ok: n >= 450 && n <= 800,
      max: 5,
      part: n >= 350 && n <= 950 ? 3 : 0,
    },
    {
      label: `A third of bullets have a number (${quantified} of ${bullets.length})`,
      ok: bullets.length > 0 && quantified / bullets.length >= 1 / 3,
      max: 3,
      part: quantified ? 1 : 0,
    },
    { label: 'Bullets of 8–35 words', ok: avg >= 8 && avg <= 35, max: 2 },
  );
  const checkGot = checks.reduce((s, c) => s + (c.ok ? c.max : c.part || 0), 0);

  const score = Math.round(kwGot + titleGot + checkGot);
  return {
    score,
    parts: [
      { label: 'Keywords from the job description', got: Math.round(kwGot), max: 60 },
      { label: 'Job title words', got: Math.round(titleGot), max: 10 },
      { label: 'Sections and layout', got: checks.slice(0, 5).reduce((s, c) => s + (c.ok ? c.max : 0), 0), max: 20 },
      { label: 'Length and bullets', got: checks.slice(5).reduce((s, c) => s + (c.ok ? c.max : c.part || 0), 0), max: 10 },
    ],
    matched: matched.map((k) => k.term.name),
    missing: missing.sort((a, b) => b.points - a.points),
    unbacked,
    title: { words: tw, missing: tw.filter((w) => !titleHit.includes(w)) },
    checks,
  };
}

/** The score the page aims for, and the agent tailors towards. */
export const ATS_TARGET = 90;
