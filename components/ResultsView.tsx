import React, { useState, useMemo } from 'react';
import type { ComparisonResult } from '../types';
import { ResultStatus } from '../types';
import { exportToCsv, exportToExcel } from '../services/exporter';
import { CheckCircleIcon, ExclamationCircleIcon, XCircleIcon, DownloadIcon } from './icons';

interface ResultsViewProps {
  results: ComparisonResult[];
  onToggleAggregate: () => void;
  isAggregated: boolean;
  originalFileName?: string;
  partialFileName?: string;
}

const StatBadge: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => (
  <div className={`p-4 rounded-lg shadow-sm text-center ${color}`}>
    <p className="text-2xl font-bold">{value}</p>
    <p className="text-sm font-medium uppercase">{label}</p>
  </div>
);

const statusConfig = {
    [ResultStatus.ABSENT_IN_ORIGINAL]: { icon: <ExclamationCircleIcon className="w-5 h-5 text-orange-500" />, color: 'bg-orange-100 text-orange-800' },
    [ResultStatus.QUANTITY_EQUAL]: { icon: <CheckCircleIcon className="w-5 h-5 text-green-500" />, color: 'bg-green-100 text-green-800' },
    [ResultStatus.QUANTITY_DIFFERENT]: { icon: <ExclamationCircleIcon className="w-5 h-5 text-yellow-500" />, color: 'bg-yellow-100 text-yellow-800' },
    [ResultStatus.ABSENT]: { icon: <XCircleIcon className="w-5 h-5 text-red-500" />, color: 'bg-red-100 text-red-800' },
    [ResultStatus.INVALID_QUANTITY]: { icon: <ExclamationCircleIcon className="w-5 h-5 text-purple-500" />, color: 'bg-purple-100 text-purple-800' },
};

const ResultsView: React.FC<ResultsViewProps> = ({ results, onToggleAggregate, isAggregated, originalFileName, partialFileName }) => {
  const [filter, setFilter] = useState<ResultStatus | 'ALL'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [descriptionSearchTerm, setDescriptionSearchTerm] = useState('');

  const stats = useMemo(() => {
    return results.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {} as Record<ResultStatus, number>);
  }, [results]);

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

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatBadge label={`Totale Codici`} value={results.length} color="bg-blue-100 text-blue-800" />
        <StatBadge label={ResultStatus.ABSENT_IN_ORIGINAL} value={stats[ResultStatus.ABSENT_IN_ORIGINAL] || 0} color="bg-orange-100 text-orange-800" />
        <StatBadge label={ResultStatus.ABSENT} value={stats[ResultStatus.ABSENT] || 0} color="bg-red-100 text-red-800" />
        <StatBadge label={ResultStatus.QUANTITY_DIFFERENT} value={stats[ResultStatus.QUANTITY_DIFFERENT] || 0} color="bg-yellow-100 text-yellow-800" />
      </div>

      <div className="bg-white p-4 rounded-xl shadow-md border border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                  <div className="flex items-center space-x-2">
                      <span className="font-semibold text-slate-700">Filtra per esito:</span>
                      <div className="flex flex-wrap gap-2">
                          <button onClick={() => setFilter('ALL')} className={`px-3 py-1 text-sm rounded-full ${filter === 'ALL' ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-700'}`}>Tutti</button>
                          {Object.values(ResultStatus)
                            .filter(status => status !== ResultStatus.QUANTITY_EQUAL)
                            .map(status => (
                              (stats[status] > 0) && (
                                  <button key={status} onClick={() => setFilter(status)} className={`px-3 py-1 text-sm rounded-full ${filter === status ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-700'}`}>
                                      {status}
                                  </button>
                              )
                          ))}
                      </div>
                  </div>
                   <div className="flex flex-wrap items-center gap-2">
                        <input
                            type="text"
                            placeholder="Filtra per codice..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full sm:w-auto px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:ring-indigo-500 focus:border-indigo-500"
                        />
                        <input
                            type="text"
                            placeholder="Filtra per descrizione..."
                            value={descriptionSearchTerm}
                            onChange={(e) => setDescriptionSearchTerm(e.target.value)}
                            className="w-full sm:w-auto px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>
              </div>
              <div className="flex items-center space-x-2">
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
              </div>
          </div>
      </div>

      <div className="overflow-x-auto bg-white rounded-xl shadow-md border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Esito</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Codice {sourceFileLabel}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Q. {sourceFileLabel}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Descrizione {sourceFileLabel}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Codice {targetFileLabel}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Q. {targetFileLabel}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">Descrizione {targetFileLabel}</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {filteredResults.map((r, index) => (
              <tr key={`${r.originalCode}-${r.partialCode}-${index}`} className="hover:bg-slate-50">
                <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusConfig[r.status].color}`}>
                        {statusConfig[r.status].icon}
                        <span className="ml-1.5">{r.status}</span>
                    </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">{r.originalCode ?? 'N/A'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">{r.originalQuantity ?? 'N/A'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">{r.originalDescription ?? 'N/A'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">{r.partialCode ?? 'N/A'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">{r.status === ResultStatus.QUANTITY_DIFFERENT ? <span className="font-bold text-yellow-700">{r.partialQuantity}</span> : r.partialQuantity ?? 'N/A'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">{r.partialDescription ?? 'N/A'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ResultsView;