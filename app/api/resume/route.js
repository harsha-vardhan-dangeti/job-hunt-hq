import { extractText, getDocumentProxy } from 'unpdf';
import { getResume, putResume, hasDb } from '../../../lib/db';
import { canRead, canWrite, unauthorized } from '../../../lib/auth';

export const dynamic = 'force-dynamic';

/* Vercel caps a request body at 4.5 MB; a resume PDF is far smaller. */
const MAX_BYTES = 4 * 1024 * 1024;

const noDb = () =>
  Response.json(
    { error: 'No database configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY to enable writes.' },
    { status: 409 }
  );

/** Plain text from a PDF, one line per line on the page. NFKC turns the
 *  ligatures LaTeX and Word embed (ﬁ, ﬂ) back into letters, so keyword
 *  matching and the fact check see "profile", not "pro ﬁle". */
async function pdfText(bytes) {
  const pdf = await getDocumentProxy(bytes);
  const { totalPages, text } = await extractText(pdf, { mergePages: true });
  const clean = text
    .normalize('NFKC')
    .replace(/\u0000/g, '')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { text: clean, pages: totalPages };
}

/** The master resume. The agent reads it before tailoring a resume to a role. */
export async function GET(request) {
  if (!(await canRead(request))) return unauthorized();
  try {
    return Response.json({ resume: await getResume() });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}

/** Replace the master resume from an uploaded PDF. Body: multipart form with `file`. */
export async function POST(request) {
  if (!(await canWrite(request))) return unauthorized();
  if (!hasDb) return noDb();
  try {
    const form = await request.formData().catch(() => null);
    const file = form?.get('file');
    if (!file || typeof file === 'string') {
      return Response.json({ error: 'Choose a PDF to upload.' }, { status: 400 });
    }
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name || '')) {
      return Response.json({ error: "That file isn't a PDF. Save your resume as a PDF and upload that." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return Response.json({ error: 'That PDF is over 4 MB. Export it again without images and try once more.' }, { status: 400 });
    }

    let parsed;
    try {
      parsed = await pdfText(new Uint8Array(await file.arrayBuffer()));
    } catch {
      return Response.json({ error: "That PDF couldn't be read. Export it again from Word, Google Docs or Overleaf." }, { status: 400 });
    }
    // A scanned resume is a picture of text, with nothing to read.
    if (parsed.text.split(/\s+/).filter(Boolean).length < 50) {
      return Response.json(
        { error: 'No text found in that PDF; it looks like a scan. Export it from Word, Google Docs or Overleaf instead.' },
        { status: 400 }
      );
    }

    const resume = await putResume(parsed.text, { fileName: file.name || 'resume.pdf', pages: parsed.pages });
    return Response.json({ resume });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}

/** Replace the master resume with text. Body: {text}. */
export async function PUT(request) {
  if (!(await canWrite(request))) return unauthorized();
  if (!hasDb) return noDb();
  try {
    const body = await request.json();
    if (typeof body?.text !== 'string') {
      return Response.json({ error: 'Send {"text": "..."}.' }, { status: 400 });
    }
    return Response.json({ resume: await putResume(body.text) });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}
