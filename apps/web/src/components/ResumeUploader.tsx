'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, FileText, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ResumeUploaderProps {
  onUpload: (text: string) => Promise<void>;
  currentResumeDate?: string | null;
}

export function ResumeUploader({ onUpload, currentResumeDate }: ResumeUploaderProps) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    if (!file.type.includes('pdf') && !file.name.endsWith('.txt')) {
      setError('Only PDF and .txt files are supported.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('File must be smaller than 5 MB.');
      return;
    }

    setError(null);
    setFileName(file.name);
    setUploading(true);

    try {
      let text: string;

      if (file.name.endsWith('.txt')) {
        text = await readTextFile(file);
      } else {
        // For PDF: read as text (basic extraction via FileReader)
        // In production you'd use pdf.js; here we read raw text content
        text = await readTextFile(file);
        if (!text.trim()) {
          setError('Could not extract text from PDF. Try saving as .txt first.');
          setUploading(false);
          return;
        }
      }

      await onUpload(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }, [onUpload]);

  const readTextFile = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve((e.target?.result as string) ?? '');
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file, 'utf-8');
    });

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  return (
    <div className="space-y-3">
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
          accept=".pdf,.txt"
          className="sr-only"
          onChange={handleInputChange}
          disabled={uploading}
        />

        {uploading ? (
          <>
            <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
            <p className="text-sm text-slate-300">Uploading {fileName}…</p>
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
              <p className="text-xs text-slate-400 mt-0.5">PDF or TXT · Max 5 MB</p>
            </div>
          </>
        )}
      </div>

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
