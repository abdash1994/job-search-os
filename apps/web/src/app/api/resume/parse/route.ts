import { NextResponse } from 'next/server';

// POST /api/resume/parse — extract text from uploaded file (PDF, DOCX, MD, TXT)
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large. Max 10 MB.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = file.name.toLowerCase();
    let text = '';

    if (fileName.endsWith('.pdf')) {
      // unpdf works reliably on Vercel serverless (no test fixtures, no canvas dep)
      const { extractText, getDocumentProxy } = await import('unpdf');
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const result = await extractText(pdf, { mergePages: true });
      text = result.text;

    } else if (fileName.endsWith('.docx') || fileName.endsWith('.doc')) {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;

    } else if (
      fileName.endsWith('.txt') ||
      fileName.endsWith('.md') ||
      fileName.endsWith('.rtf') ||
      file.type.startsWith('text/')
    ) {
      text = buffer.toString('utf-8');

    } else {
      return NextResponse.json(
        { error: `Unsupported file type. Supported: PDF, DOCX, DOC, TXT, MD, RTF` },
        { status: 400 }
      );
    }

    text = text.trim();
    if (!text) {
      return NextResponse.json(
        { error: 'No text could be extracted from this file. Try the Paste text tab instead.' },
        { status: 422 }
      );
    }

    return NextResponse.json({ text, chars: text.length });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Resume parse error:', message);
    return NextResponse.json(
      { error: `Could not read file. Try the Paste text tab instead.` },
      { status: 500 }
    );
  }
}
