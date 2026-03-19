'use client';

import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useStorage } from '@/firebase/provider';
import { compressImage } from '@/lib/compress-image';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

export interface UploadResult {
  path: string;
  url: string;
  name: string;
}

interface FileUploadProps {
  onUploadComplete: (result: UploadResult) => void;
  /** Called with the original File alongside the upload result (useful for AI classification). */
  onFileReady?: (file: File, result: UploadResult) => void;
  onError?: (error: Error) => void;
  storagePath: string;
  accept?: Record<string, string[]>;
  maxSizeMB?: number;
  label?: string;
  sublabel?: string;
  /** Allow multiple files at once. Default: false. */
  multiple?: boolean;
}

const DEFAULT_ACCEPT: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'image/*': ['.jpg', '.jpeg', '.png'],
};

export function FileUpload({
  onUploadComplete,
  onFileReady,
  onError,
  storagePath,
  accept = DEFAULT_ACCEPT,
  maxSizeMB = 5,
  label = 'Clique ou arraste o arquivo aqui',
  sublabel = 'Formatos aceitos: PDF, JPG, PNG (max 5MB)',
  multiple = false,
}: FileUploadProps) {
  const storage = useStorage();
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [currentFileName, setCurrentFileName] = useState<string | null>(null);

  const uploadSingleFile = useCallback(
    (file: File): Promise<void> => {
      return new Promise((resolve, reject) => {
        setCurrentFileName(file.name);
        setUploadProgress(0);

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
            onError?.(error);
            reject(error);
          },
          async () => {
            try {
              const url = await getDownloadURL(uploadTask.snapshot.ref);
              const result: UploadResult = { path: filePath, url, name: file.name };
              setUploadedFiles((prev) => [...prev, file.name]);
              onUploadComplete(result);
              onFileReady?.(file, result);
              resolve();
            } catch (err) {
              const error = err instanceof Error ? err : new Error('Falha ao obter URL do arquivo');
              onError?.(error);
              reject(error);
            }
          }
        );
      });
    },
    [storage, storagePath, onUploadComplete, onFileReady, onError]
  );

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;
      const files = multiple ? acceptedFiles : [acceptedFiles[0]];

      setIsUploading(true);
      setUploadedFiles([]);

      for (const rawFile of files) {
        if (rawFile.size > maxSizeMB * 1024 * 1024) {
          onError?.(new Error(`${rawFile.name} excede o tamanho maximo de ${maxSizeMB}MB`));
          continue;
        }
        try {
          const file = await compressImage(rawFile);
          await uploadSingleFile(file);
        } catch {
          // Error already handled in uploadSingleFile via onError
        }
      }

      setIsUploading(false);
      setUploadProgress(null);
      setCurrentFileName(null);
    },
    [uploadSingleFile, maxSizeMB, onError, multiple]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    maxFiles: multiple ? undefined : 1,
    multiple,
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
            Enviando{currentFileName ? ` ${currentFileName}` : ''}... {uploadProgress}%
          </p>
        </div>
      )}

      {/* Uploaded file names */}
      {uploadedFiles.length > 0 && !isUploading && (
        <div className="space-y-1.5">
          {uploadedFiles.map((name, i) => (
            <div key={i} className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
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
              <span className="text-sm truncate">{name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
