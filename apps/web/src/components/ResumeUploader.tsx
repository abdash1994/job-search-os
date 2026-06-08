'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, FileText, X, Loader2, ClipboardPaste, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ResumeUploaderProps {
  onUpload: (text: string) => Promise<void>;
  currentResumeDate?: string | null;
}

type Mode = 'upload' | 'paste';

const ACCEPTED = '.pdf,.doc,.docx,.txt,.md,.rtf';
const ACCEPTED_LABEL = 'PDF, Word (.docx), TXT, MD, RTF';

export function ResumeUploader({ onUpload, currentResumeDate }: ResumeUploaderProps) {
  const [mode, setMode] = useState<Mode>('upload');
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<'idle' | 'parsing' | 'saving' | 'done' | 'error'>('idle');
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const saveText = useCallback(async (text: string) => {
    setStatus('saving');
    try {
      await onUpload(text.trim());
      setStatus('done');
      setTimeout(() => setStatus('idle'), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save resume');
      setStatus('error');
    }
  }, [onUpload]);

  const processFile = useCallback(async (file: File) => {
    setError(null);
    setFileName(file.name);
    setStatus('parsing');

    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/resume/parse', { method: 'POST', body: form });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Failed to parse file');
        setStatus('error');
        return;
      }

      await saveText(data.text);
    } catch {
      setError('Could not read the file. Try copy-pasting your resume instead.');
      setStatus('error');
    }
  }, [saveText]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const isLoading = status === 'parsing' || status === 'saving';

  return (
    <div className="space-y-3">
      {/* Mode tabs */}
      <div className="flex gap-1 p-1 bg-slate-900 border border-slate-800 rounded-xl w-fit">
        <button
          onClick={() => { setMode('upload'); setError(null); }}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition',
            mode === 'upload' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
          )}
        >
          <Upload className="w-3.5 h-3.5" />
          Upload file
        </button>
        <button
          onClick={() => { setMode('paste'); setError(null); }}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition',
            mode === 'paste' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
          )}
        >
          <ClipboardPaste className="w-3.5 h-3.5" />
          Paste text
        </button>
      </div>

      {mode === 'upload' ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => !isLoading && inputRef.current?.click()}
          className={cn(
            'relative border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors',
            dragging ? 'border-primary-500 bg-primary-500/5'
                     : 'border-slate-700 hover:border-slate-600 hover:bg-slate-800/50',
            isLoading && 'pointer-events-none opacity-70'
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED}
            className="sr-only"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); }}
            disabled={isLoading}
          />

          {isLoading ? (
            <>
              <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
              <p className="text-sm text-slate-300">
                {status === 'parsing' ? `Extracting text from ${fileName}…` : 'Saving resume…'}
              </p>
            </>
          ) : status === 'done' ? (
            <>
              <CheckCircle className="w-8 h-8 text-success-400" />
              <p className="text-sm text-success-400 font-medium">Resume saved!</p>
            </>
          ) : (
            <>
              <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center">
                <Upload className="w-6 h-6 text-primary-400" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-white">
                  {dragging ? 'Drop your resume here' : 'Upload your resume'}
                </p>
                <p className="text-xs text-slate-400 mt-1">{ACCEPTED_LABEL}</p>
                <p className="text-xs text-slate-500 mt-0.5">Max 10 MB · drag & drop or click</p>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Open your resume, select all (Ctrl+A / Cmd+A), copy, then paste here…"
            rows={10}
            className="w-full px-3 py-3 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">{pasteText.length.toLocaleString()} chars</span>
            <button
              onClick={() => saveText(pasteText)}
              disabled={isLoading || !pasteText.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : status === 'done' ? <CheckCircle className="w-4 h-4" /> : <ClipboardPaste className="w-4 h-4" />}
              {isLoading ? 'Saving…' : status === 'done' ? 'Saved!' : 'Save resume'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-3 bg-danger-500/10 border border-danger-500/20 rounded-lg text-danger-400 text-xs">
          <X className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {currentResumeDate && !isLoading && (
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <FileText className="w-3.5 h-3.5" />
          Last uploaded: {new Date(currentResumeDate).toLocaleDateString()}
        </div>
      )}
    </div>
  );
}
