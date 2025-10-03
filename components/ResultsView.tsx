import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import type { ComparisonResult } from '../types';
import { ResultStatus } from '../types';
import { exportToCsv, exportToExcel } from '../services/exporter';
import { CheckCircleIcon, ExclamationCircleIcon, XCircleIcon, DownloadIcon, UploadIcon, FileIcon, EditIcon, ViewColumnsIcon } from './icons';

interface ResultsViewProps {
  results: ComparisonResult[];
  onToggleAggregate: () => void;
  isAggregated: boolean;
  originalFileName?: string;
  partialFileName?: string;
  onApplyRulesFile: (file: File) => void;
  onRemoveRules: () => void;
  rulesFileName?: string | null;
  onEditRules: () => void;
  comparisonOptions: { ignoreQuantity: boolean; ignoreRevision: boolean };
  onComparisonOptionsChange: (options: { ignoreQuantity?: boolean; ignoreRevision?: boolean }) => void;
}

type ColumnKey = 'status' | 'originalCode' | 'originalQuantity' | 'originalDescription' | 'originalRevision' | 'partialCode' | 'partialQuantity' | 'partialDescription' | 'partialRevision';

const INITIAL_COLUMN_VISIBILITY: Record<ColumnKey, boolean> = {
    status: true,
    originalCode: true,
    originalQuantity: true,
    originalDescription: true,
    originalRevision: true,
    partialCode: true,
    partialQuantity: true,
    partialDescription: true,
    partialRevision: true,
};


const StatBadge: React.FC<{ 
    label: string; 
    value: number; 
    color: string; 
    isActive: boolean; 
    onClick: () => void 
}> = ({ label, value, color, isActive, onClick }) => (
  <button 
    onClick={onClick}
    className={`p-4 rounded-lg shadow-sm text-center w-full transition-all duration-200 ${color} ${isActive ? 'ring-4 ring-offset-2 ring-indigo-500 dark:ring-offset-slate-900' : 'hover:scale-105 transform'}`}
  >
    <p className="text-2xl font-bold">{value}</p>
    <p className="text-sm font-medium uppercase">{label}</p>
  </button>
);

const statusConfig = {
    [ResultStatus.ABSENT_IN_ORIGINAL]: { icon: <ExclamationCircleIcon className="w-5 h-5 text-orange-500" />, color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300' },
    [ResultStatus.QUANTITY_EQUAL]: { icon: <CheckCircleIcon className="w-5 h-5 text-green-500" />, color: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300' },
    [ResultStatus.QUANTITY_DIFFERENT]: { icon: <ExclamationCircleIcon className="w-5 h-5 text-yellow-500" />, color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300' },
    [ResultStatus.REVISION_DIFFERENT]: { icon: <ExclamationCircleIcon className="w-5 h-5 text-blue-500" />, color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300' },
    [ResultStatus.ABSENT]: { icon: <XCircleIcon className="w-5 h-5 text-red-500" />, color: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300' },
    [ResultStatus.INVALID_QUANTITY]: { icon: <ExclamationCircleIcon className="w-5 h-5 text-purple-500" />, color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300' },
};

const ResultsView: React.FC<ResultsViewProps> = ({ results, onToggleAggregate, isAggregated, originalFileName, partialFileName, onApplyRulesFile, onRemoveRules, rulesFileName, onEditRules, comparisonOptions, onComparisonOptionsChange }) => {
  const [filter, setFilter] = useState<ResultStatus | 'ALL'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [descriptionSearchTerm, setDescriptionSearchTerm] = useState('');

  const [columnVisibility, setColumnVisibility] = useState(INITIAL_COLUMN_VISIBILITY);
  const [isColumnWindowVisible, setIsColumnWindowVisible] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  
  // Set initial position more robustly
  const getInitialPosition = () => {
      if (typeof window !== 'undefined') {
          return { x: window.innerWidth - 350, y: 150 };
      }
      return { x: 800, y: 150 };
  };

  const [windowPosition, setWindowPosition] = useState(getInitialPosition);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  const stats = useMemo(() => {
    return results.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {} as Record<ResultStatus, number>);
  }, [results]);
  
  const badgeConfigs: { label: string; status: ResultStatus | 'ALL'; value: number; color: string }[] = [
    { label: isAggregated ? 'TOTALE CODICI' : 'TOTALE RIGHE', status: 'ALL', value: results.length, color: "bg-green-100 text-green-900 dark:bg-green-800/40 dark:text-green-100" },
    { label: ResultStatus.ABSENT_IN_ORIGINAL, status: ResultStatus.ABSENT_IN_ORIGINAL, value: stats[ResultStatus.ABSENT_IN_ORIGINAL] || 0, color: "bg-orange-100 text-orange-900 dark:bg-orange-800/40 dark:text-orange-100" },
    { label: ResultStatus.ABSENT, status: ResultStatus.ABSENT, value: stats[ResultStatus.ABSENT] || 0, color: "bg-red-100 text-red-900 dark:bg-red-800/40 dark:text-red-100" },
    { label: ResultStatus.QUANTITY_DIFFERENT, status: ResultStatus.QUANTITY_DIFFERENT, value: stats[ResultStatus.QUANTITY_DIFFERENT] || 0, color: "bg-yellow-100 text-yellow-900 dark:bg-yellow-800/40 dark:text-yellow-100" },
    { label: ResultStatus.REVISION_DIFFERENT, status: ResultStatus.REVISION_DIFFERENT, value: stats[ResultStatus.REVISION_DIFFERENT] || 0, color: "bg-blue-100 text-blue-900 dark:bg-blue-800/40 dark:text-blue-100" },
  ];

  const filteredResults = useMemo(() => {
    let tempResults = results;
    
    if (filter !== 'ALL') {
      tempResults = tempResults.filter(r => r.status === filter);
    }
    
    if (searchTerm) {
        const lowerCaseSearchTerm = searchTerm.toLowerCase();
        tempResults = tempResults.filter(r =>
            String(r.originalCode ?? '').toLowerCase().includes(lowerCaseSearchTerm) ||
            String(r.partialCode ?? '').toLowerCase().includes(lowerCaseSearchTerm)
        );
    }

    if (descriptionSearchTerm) {
        const lowerCaseDescriptionSearchTerm = descriptionSearchTerm.toLowerCase();
        tempResults = tempResults.filter(r =>
            String(r.originalDescription ?? '').toLowerCase().includes(lowerCaseDescriptionSearchTerm) ||
            String(r.partialDescription ?? '').toLowerCase().includes(lowerCaseDescriptionSearchTerm)
        );
    }
    
    return tempResults;
  }, [results, filter, searchTerm, descriptionSearchTerm]);
  
  const sourceFileLabel = 'Cliente';
  const targetFileLabel = 'Gestionale';

  const COLUMNS: { id: ColumnKey; label: string }[] = [
    { id: 'status', label: 'Esito' },
    { id: 'originalCode', label: `Codice ${sourceFileLabel}` },
    { id: 'originalQuantity', label: `Q. ${sourceFileLabel}` },
    { id: 'originalRevision', label: `Rev. ${sourceFileLabel}` },
    { id: 'originalDescription', label: `Descrizione ${sourceFileLabel}` },
    { id: 'partialCode', label: `Codice ${targetFileLabel}` },
    { id: 'partialQuantity', label: `Q. ${targetFileLabel}` },
    { id: 'partialRevision', label: `Rev. ${targetFileLabel}` },
    { id: 'partialDescription', label: `Descrizione ${targetFileLabel}` },
  ];

  const handleColumnVisibilityChange = (columnId: ColumnKey) => {
    setColumnVisibility(prev => ({
        ...prev,
        [columnId]: !prev[columnId],
    }));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
      setIsDragging(true);
      dragOffsetRef.current = {
          x: e.clientX - windowPosition.x,
          y: e.clientY - windowPosition.y,
      };
      // Prevent text selection while dragging
      e.preventDefault();
  };

  useEffect(() => {
      const handleMouseMove = (e: MouseEvent) => {
          setWindowPosition({
              x: e.clientX - dragOffsetRef.current.x,
              y: e.clientY - dragOffsetRef.current.y,
          });
      };

      const handleMouseUp = () => {
          setIsDragging(false);
      };

      if (isDragging) {
          document.addEventListener('mousemove', handleMouseMove);
          document.addEventListener('mouseup', handleMouseUp);
      }

      return () => {
          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', handleMouseUp);
      };
  }, [isDragging]);

  return (
    <div className="space-y-6">
      {isColumnWindowVisible && (
        <div
            className="fixed bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg shadow-2xl z-50 flex flex-col"
            style={{ top: `${windowPosition.y}px`, left: `${windowPosition.x}px`, width: '280px' }}
        >
            <div
                onMouseDown={handleMouseDown}
                className="flex justify-between items-center p-3 bg-slate-100 dark:bg-slate-700/50 rounded-t-lg cursor-move border-b border-slate-200 dark:border-slate-600"
            >
                <h3 className="font-semibold text-slate-800 dark:text-slate-100">Mostra Colonne</h3>
                <button
                    onClick={() => setIsColumnWindowVisible(false)}
                    className="p-1 rounded-full text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-600"
                    aria-label="Chiudi"
                >
                    <XCircleIcon className="w-5 h-5" />
                </button>
            </div>
            <div className="p-3 space-y-2">
                {COLUMNS.map(col => (
                    <label key={col.id} className="flex items-center w-full px-2 py-1.5 text-sm text-slate-700 dark:text-slate-200 rounded-md hover:bg-slate-100 dark:hover:bg-slate-600 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={columnVisibility[col.id]}
                            onChange={() => handleColumnVisibilityChange(col.id)}
                            className="h-4 w-4 rounded border-gray-300 dark:border-slate-500 text-indigo-600 focus:ring-indigo-500 bg-transparent"
                        />
                        <span className="ml-3">{col.label}</span>
                    </label>
                ))}
            </div>
        </div>
      )}
      
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {badgeConfigs.map(config => (
            <StatBadge
                key={config.label}
                label={config.label}
                value={config.value}
                color={config.color}
                isActive={filter === config.status}
                onClick={() => setFilter(config.status)}
            />
        ))}
      </div>

      <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-md border border-slate-200 dark:border-slate-700">
        {/* Actions and Search */}
        <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Left Side: Action Buttons */}
            <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => setIsColumnWindowVisible(prev => !prev)} className="flex items-center space-x-2 bg-slate-500 text-white px-4 py-2 rounded-md hover:bg-slate-600 transition">
                    <ViewColumnsIcon className="w-5 h-5" />
                    <span>Colonne</span>
                </button>
                <button onClick={onToggleAggregate} className="flex items-center space-x-2 bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 transition">
                    <span>{isAggregated ? 'Mostra Dettaglio Righe' : 'Aggrega per Codice'}</span>
                </button>
                <button onClick={() => exportToExcel(results, stats)} className="flex items-center space-x-2 bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition">
                    <DownloadIcon className="w-5 h-5" />
                    <span>Esporta Excel</span>
                </button>
                <button onClick={() => exportToCsv(filteredResults, 'confronto_bom.csv', ',')} className="flex items-center space-x-2 bg-slate-600 text-white px-4 py-2 rounded-md hover:bg-slate-700 transition">
                    <DownloadIcon className="w-5 h-5" />
                    <span>Esporta CSV</span>
                </button>
                <label htmlFor="rules-file-upload" className="cursor-pointer inline-flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition">
                    <UploadIcon className="w-5 h-5" />
                    <span>{rulesFileName ? 'Sostituisci Regole' : 'Applica Regole'}</span>
                </label>
                <input
                    id="rules-file-upload"
                    type="file"
                    className="hidden"
                    accept=".xls,.xlsx,.xlsm,.csv,.tsv"
                    onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                            onApplyRulesFile(e.target.files[0]);
                            e.target.value = ''; // Reset to allow re-uploading the same file
                        }
                    }}
                />
            </div>

            {/* Right Side: Search Inputs */}
            <div className="flex flex-wrap items-center gap-2">
                <input
                    type="text"
                    placeholder="Filtra per codice..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full sm:w-auto px-3 py-1.5 border border-transparent rounded-md text-sm focus:ring-indigo-500 focus:border-indigo-500 bg-slate-500 text-white placeholder-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:placeholder-slate-400"
                />
                <input
                    type="text"
                    placeholder="Filtra per descrizione..."
                    value={descriptionSearchTerm}
                    onChange={(e) => setDescriptionSearchTerm(e.target.value)}
                    className="w-full sm:w-auto px-3 py-1.5 border border-transparent rounded-md text-sm focus:ring-indigo-500 focus:border-indigo-500 bg-slate-600 text-white placeholder-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:placeholder-slate-400"
                />
            </div>
        </div>
        
          <div className="border-t border-slate-200 dark:border-slate-700 mt-4 pt-3 flex items-center gap-6 text-sm">
            <span className="font-semibold text-slate-700 dark:text-slate-200 shrink-0">Opzioni Confronto:</span>
            <div className="flex items-center gap-x-6 gap-y-2 flex-wrap">
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={comparisonOptions.ignoreQuantity}
                  onChange={(e) => onComparisonOptionsChange({ ignoreQuantity: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 dark:border-slate-500 text-indigo-600 focus:ring-indigo-500 bg-transparent"
                />
                <span className="ml-2 text-slate-700 dark:text-slate-300">Ignora Quantità</span>
              </label>
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={comparisonOptions.ignoreRevision}
                  onChange={(e) => onComparisonOptionsChange({ ignoreRevision: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 dark:border-slate-500 text-indigo-600 focus:ring-indigo-500 bg-transparent"
                />
                <span className="ml-2 text-slate-700 dark:text-slate-300">Ignora Revisioni</span>
              </label>
            </div>
          </div>

          {rulesFileName && (
            <div className="border-t border-slate-200 dark:border-slate-700 mt-4 pt-3 flex items-center justify-between gap-4 text-sm text-slate-600 dark:text-slate-300">
                <div className="flex items-center gap-2">
                    <FileIcon className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                    <span>Regole applicate: <strong>{rulesFileName}</strong></span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                      onClick={onEditRules}
                      className="p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                      aria-label="Modifica regole"
                      title="Modifica regole"
                    >
                      <EditIcon className="w-5 h-5 text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-100" />
                    </button>
                    <button
                      onClick={onRemoveRules}
                      className="p-1 rounded-full hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                      aria-label="Rimuovi regole"
                      title="Rimuovi regole"
                    >
                      <XCircleIcon className="w-5 h-5 text-red-500 hover:text-red-700" />
                    </button>
                </div>
            </div>
          )}
      </div>

      <div className="overflow-x-auto bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
          <thead className="bg-slate-100 dark:bg-slate-700/50">
            <tr>
              {columnVisibility.status && <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 dark:text-slate-300 uppercase">Esito</th>}
              {columnVisibility.originalCode && <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 dark:text-slate-300 uppercase">Codice {sourceFileLabel}</th>}
              {columnVisibility.originalQuantity && <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 dark:text-slate-300 uppercase">Q. {sourceFileLabel}</th>}
              {columnVisibility.originalRevision && <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 dark:text-slate-300 uppercase">Rev. {sourceFileLabel}</th>}
              {columnVisibility.originalDescription && <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 dark:text-slate-300 uppercase">Descrizione {sourceFileLabel}</th>}
              {columnVisibility.partialCode && <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 dark:text-slate-300 uppercase">Codice {targetFileLabel}</th>}
              {columnVisibility.partialQuantity && <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 dark:text-slate-300 uppercase">Q. {targetFileLabel}</th>}
              {columnVisibility.partialRevision && <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 dark:text-slate-300 uppercase">Rev. {targetFileLabel}</th>}
              {columnVisibility.partialDescription && <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 dark:text-slate-300 uppercase">Descrizione {targetFileLabel}</th>}
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
            {filteredResults.map((r, index) => (
              <tr key={`${r.originalCode}-${r.partialCode}-${r.originalRevision}-${index}`} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                {columnVisibility.status && <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusConfig[r.status].color}`}>
                        {statusConfig[r.status].icon}
                        <span className="ml-1.5">{r.status}</span>
                    </span>
                </td>}
                {columnVisibility.originalCode && <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900 dark:text-slate-100">{r.originalCode ?? 'N/A'}</td>}
                {columnVisibility.originalQuantity && <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700 dark:text-slate-300">{r.originalQuantity ?? 'N/A'}</td>}
                {columnVisibility.originalRevision && <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700 dark:text-slate-300">{r.originalRevision ?? 'N/A'}</td>}
                {columnVisibility.originalDescription && <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700 dark:text-slate-300 max-w-xs truncate" title={String(r.originalDescription ?? '')}>{r.originalDescription ?? 'N/A'}</td>}
                {columnVisibility.partialCode && <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700 dark:text-slate-300">{r.partialCode ?? 'N/A'}</td>}
                {columnVisibility.partialQuantity && <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700 dark:text-slate-300">{r.status === ResultStatus.QUANTITY_DIFFERENT ? <span className="font-bold text-yellow-700 dark:text-yellow-400">{r.partialQuantity}</span> : r.partialQuantity ?? 'N/A'}</td>}
                {columnVisibility.partialRevision && <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700 dark:text-slate-300">{r.status === ResultStatus.REVISION_DIFFERENT ? <span className="font-bold text-blue-700 dark:text-blue-400">{r.partialRevision}</span> : r.partialRevision ?? 'N/A'}</td>}
                {columnVisibility.partialDescription && <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700 dark:text-slate-300 max-w-xs truncate" title={String(r.partialDescription ?? '')}>{r.partialDescription ?? 'N/A'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ResultsView;