'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, FileText, X, Loader2, ClipboardPaste, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ResumeUploaderProps {
  onUpload: (text: string) => Promise<void>;
  currentResumeDate?: string | null;
}

type Mode = 'drop' | 'paste';

export function ResumeUploader({ onUpload, currentResumeDate }: ResumeUploaderProps) {
  const [mode, setMode] = useState<Mode>('drop');
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = useCallback(async (text: string) => {
    if (!text.trim()) {
      setError('Resume text is empty. Please paste or upload your resume content.');
      return;
    }
    setError(null);
    setUploading(true);
    setSuccess(false);
    try {
      await onUpload(text.trim());
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }, [onUpload]);

  const processFile = useCallback(async (file: File) => {
    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      setError('PDF files cannot be read directly in the browser. Open your PDF, select all text (Ctrl+A / Cmd+A), copy it, then use the "Paste text" tab to paste it here.');
      return;
    }
    if (!file.name.endsWith('.txt') && !file.type.includes('text')) {
      setError('Only .txt files are supported for direct upload. For PDF, use the Paste text tab.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('File must be smaller than 5 MB.');
      return;
    }
    setError(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => submit((e.target?.result as string) ?? '');
    reader.onerror = () => setError('Failed to read file.');
    reader.readAsText(file, 'utf-8');
  }, [submit]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  return (
    <div className="space-y-3">
      {/* Mode tabs */}
      <div className="flex gap-1 p-1 bg-slate-900 border border-slate-800 rounded-xl w-fit">
        <button
          onClick={() => setMode('drop')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition',
            mode === 'drop'
              ? 'bg-slate-700 text-white'
              : 'text-slate-400 hover:text-white'
          )}
        >
          <Upload className="w-3.5 h-3.5" />
          Upload .txt
        </button>
        <button
          onClick={() => setMode('paste')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition',
            mode === 'paste'
              ? 'bg-slate-700 text-white'
              : 'text-slate-400 hover:text-white'
          )}
        >
          <ClipboardPaste className="w-3.5 h-3.5" />
          Paste text
        </button>
      </div>

      {mode === 'drop' ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => !uploading && inputRef.current?.click()}
          className={cn(
            'relative border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors',
            dragging
              ? 'border-primary-500 bg-primary-500/5'
              : 'border-slate-700 hover:border-slate-600 hover:bg-slate-800/50'
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".txt,text/plain"
            className="sr-only"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); }}
            disabled={uploading}
          />
          {uploading ? (
            <>
              <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
              <p className="text-sm text-slate-300">Uploading {fileName}…</p>
            </>
          ) : success ? (
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
                  {dragging ? 'Drop your .txt file here' : 'Upload .txt file'}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">Plain text only · Max 5 MB</p>
                <p className="text-xs text-slate-500 mt-2">
                  For PDF: open it, Cmd/Ctrl+A, copy, then use <button onClick={(e) => { e.stopPropagation(); setMode('paste'); }} className="text-primary-400 underline">Paste text</button>
                </p>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Open your resume (PDF or Word), select all text (Ctrl+A / Cmd+A), copy it, then paste here…"
            rows={10}
            className="w-full px-3 py-3 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">{pasteText.length.toLocaleString()} characters</span>
            <button
              onClick={() => submit(pasteText)}
              disabled={uploading || !pasteText.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : success ? <CheckCircle className="w-4 h-4" /> : <ClipboardPaste className="w-4 h-4" />}
              {uploading ? 'Saving…' : success ? 'Saved!' : 'Save resume'}
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

      {currentResumeDate && !uploading && (
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <FileText className="w-3.5 h-3.5" />
          Last uploaded: {new Date(currentResumeDate).toLocaleDateString()}
        </div>
      )}
    </div>
  );
}
