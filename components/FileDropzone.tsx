
import React, { useCallback, useState } from 'react';
import { UploadIcon, FileIcon } from './icons';

interface FileDropzoneProps {
  onFileSelect: (file: File) => void;
  title: string;
  acceptedTypes: string;
  size?: 'large' | 'compact';
}

const FileDropzone: React.FC<FileDropzoneProps> = ({ onFileSelect, title, acceptedTypes, size = 'large' }) => {
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const handleFileChange = (selectedFile: File | null) => {
    if (selectedFile) {
      setFile(selectedFile);
      onFileSelect(selectedFile);
    }
  };

  const onDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);
    if (event.dataTransfer.files && event.dataTransfer.files[0]) {
      handleFileChange(event.dataTransfer.files[0]);
    }
  }, [onFileSelect]);

  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);
  }, []);

  const onFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      handleFileChange(event.target.files[0]);
    }
  };

  const isCompact = size === 'compact';

  return (
    <div className="w-full">
      <h3 className={`font-semibold text-slate-700 dark:text-slate-300 mb-2 ${isCompact ? 'text-base' : 'text-lg'}`}>{title}</h3>
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={`relative flex flex-col items-center justify-center w-full border-2 border-dashed rounded-lg cursor-pointer transition-colors duration-200
          ${isCompact ? 'h-32' : 'h-48'}
          ${dragOver ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/50' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700'}
          ${file ? 'border-green-500 bg-green-50 dark:bg-green-900/30' : ''}`}
      >
        <input
          type="file"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          onChange={onFileInputChange}
          accept={acceptedTypes}
        />
        {file ? (
          <div className={`text-center text-green-700 dark:text-green-300 ${isCompact ? 'p-2' : ''}`}>
            <FileIcon className={`mx-auto ${isCompact ? 'w-8 h-8' : 'w-12 h-12'}`} />
            <p className={`mt-2 font-semibold ${isCompact ? 'text-sm' : ''}`}>{file.name}</p>
            <p className="text-xs">({(file.size / 1024).toFixed(2)} KB)</p>
          </div>
        ) : (
          <div className={`text-center text-slate-500 dark:text-slate-400 ${isCompact ? 'p-2' : ''}`}>
            <UploadIcon className={`mx-auto ${isCompact ? 'w-8 h-8' : 'w-12 h-12'}`} />
            <p className={`mt-2 font-semibold ${isCompact ? 'text-sm' : ''}`}>Trascina il file qui</p>
            <p className="text-xs">o clicca per selezionare</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default FileDropzone;