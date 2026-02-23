'use client';

import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useStorage } from '@/firebase/provider';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface UploadResult {
  path: string;
  url: string;
  name: string;
}

interface FileUploadProps {
  onUploadComplete: (result: UploadResult) => void;
  onError?: (error: Error) => void;
  storagePath: string;
  accept?: Record<string, string[]>;
  maxSizeMB?: number;
  label?: string;
  sublabel?: string;
}

const DEFAULT_ACCEPT: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'image/*': ['.jpg', '.jpeg', '.png'],
};

export function FileUpload({
  onUploadComplete,
  onError,
  storagePath,
  accept = DEFAULT_ACCEPT,
  maxSizeMB = 5,
  label = 'Clique ou arraste o arquivo aqui',
  sublabel = 'Formatos aceitos: PDF, JPG, PNG (max 5MB)',
}: FileUploadProps) {
  const storage = useStorage();
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleUpload = useCallback(
    (file: File) => {
      setIsUploading(true);
      setUploadProgress(0);
      setUploadedFileName(null);

      const timestamp = Date.now();
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `${storagePath}/${timestamp}_${sanitizedName}`;
      const storageRef = ref(storage, filePath);
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = Math.round(
            (snapshot.bytesTransferred / snapshot.totalBytes) * 100
          );
          setUploadProgress(progress);
        },
        (error) => {
          setIsUploading(false);
          setUploadProgress(null);
          onError?.(error);
        },
        async () => {
          try {
            const url = await getDownloadURL(uploadTask.snapshot.ref);
            setUploadedFileName(file.name);
            setIsUploading(false);
            setUploadProgress(null);
            onUploadComplete({ path: filePath, url, name: file.name });
          } catch (err) {
            setIsUploading(false);
            setUploadProgress(null);
            onError?.(
              err instanceof Error ? err : new Error('Falha ao obter URL do arquivo')
            );
          }
        }
      );
    },
    [storage, storagePath, onUploadComplete, onError]
  );

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;
      const file = acceptedFiles[0];

      if (file.size > maxSizeMB * 1024 * 1024) {
        onError?.(
          new Error(`Arquivo excede o tamanho maximo de ${maxSizeMB}MB`)
        );
        return;
      }

      handleUpload(file);
    },
    [handleUpload, maxSizeMB, onError]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    maxFiles: 1,
    disabled: isUploading,
  });

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        className={cn(
          'flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors',
          isDragActive
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50',
          isUploading && 'pointer-events-none opacity-60',
          'cursor-pointer'
        )}
      >
        <input {...getInputProps()} />
        <svg
          className="mx-auto mb-3 h-10 w-10 text-muted-foreground"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
          />
        </svg>
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-1 text-xs text-muted-foreground">{sublabel}</p>
      </div>

      {/* Upload progress */}
      {isUploading && uploadProgress !== null && (
        <div className="space-y-1.5">
          <Progress value={uploadProgress} className="h-2" />
          <p className="text-xs text-muted-foreground text-center">
            Enviando... {uploadProgress}%
          </p>
        </div>
      )}

      {/* Uploaded file name */}
      {uploadedFileName && !isUploading && (
        <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
          <svg
            className="h-4 w-4 text-green-600 flex-shrink-0"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4.5 12.75l6 6 9-13.5"
            />
          </svg>
          <span className="text-sm truncate">{uploadedFileName}</span>
        </div>
      )}
    </div>
  );
}
