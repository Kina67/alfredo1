
import React from 'react';
import type { ParsedFile, Mapping } from '../types';
import { MAPPABLE_FIELDS } from '../constants';

// Define color classes for each mappable field
const fieldColorClasses: Record<keyof Mapping, { th: string; td: string }> = {
  code: { th: 'bg-indigo-200 text-indigo-900 dark:bg-indigo-900/50 dark:text-indigo-200', td: 'bg-indigo-100 dark:bg-indigo-900/30' },
  quantity: { th: 'bg-sky-200 text-sky-900 dark:bg-sky-900/50 dark:text-sky-200', td: 'bg-sky-100 dark:bg-sky-900/30' },
  description: { th: 'bg-teal-200 text-teal-900 dark:bg-teal-900/50 dark:text-teal-200', td: 'bg-teal-100 dark:bg-teal-900/30' },
  revision: { th: 'bg-amber-200 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200', td: 'bg-amber-100 dark:bg-amber-900/30' },
};

interface MappingTableProps {
  fileData: ParsedFile;
  mapping: Mapping;
  onMappingChange: (field: keyof Mapping, value: string) => void;
  skipRows: number;
  onSkipRowsChange: (value: number) => void;
  showMappingControls?: boolean;
}

const MappingTable: React.FC<MappingTableProps> = ({ fileData, mapping, onMappingChange, skipRows, onSkipRowsChange, showMappingControls = true }) => {
  const previewData = fileData.data.slice(0, 5);
  
  // Create a reverse map from header name to field ID for easy color lookup
  const headerToFieldMap = (Object.keys(mapping) as Array<keyof Mapping>).reduce((acc, field) => {
    const header = mapping[field];
    if (header) {
      acc[header] = field;
    }
    return acc;
  }, {} as Record<string, keyof Mapping>);


  return (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 flex flex-col h-full">
      {/* Card Header */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">{fileData.name}</h3>
           {showMappingControls && <p className="text-sm text-slate-500 dark:text-slate-400">Mappa le colonne per l'analisi.</p>}
        </div>
        <div className="flex items-center space-x-2 flex-shrink-0">
            <label htmlFor={`skip-rows-${fileData.name}`} className="text-sm font-medium text-slate-600 dark:text-slate-300">Salta righe:</label>
            <input 
                type="number"
                id={`skip-rows-${fileData.name}`}
                min="0"
                value={skipRows}
                onChange={(e) => onSkipRowsChange(Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="w-20 p-1.5 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:ring-indigo-500 focus:border-indigo-500 bg-slate-200 dark:bg-slate-700 dark:text-slate-200"
            />
        </div>
      </div>
      
      {/* Mapping Controls */}
      {showMappingControls && (
        <div className="border-t border-slate-200 dark:border-slate-700 pt-4 mb-4">
            <h4 className="text-md font-semibold text-slate-700 dark:text-slate-200 mb-3">Mappatura Campi</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {MAPPABLE_FIELDS.map(field => (
                <div key={field.id}>
                <label htmlFor={`${fileData.name}-${field.id}`} className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    {field.label} {field.required && <span className="text-red-500">*</span>}
                </label>
                <select
                    id={`${fileData.name}-${field.id}`}
                    value={mapping[field.id] || ''}
                    onChange={(e) => onMappingChange(field.id, e.target.value)}
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-slate-300 dark:border-slate-600 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md bg-slate-200 dark:bg-slate-700 dark:text-slate-200"
                >
                    <option value="">-- Seleziona colonna --</option>
                    {fileData.headers.map(header => (
                    <option key={header} value={header}>{header}</option>
                    ))}
                </select>
                </div>
            ))}
            </div>
        </div>
      )}


      {/* Preview Table */}
      <div className="overflow-x-auto flex-grow">
         <p className="text-sm text-slate-600 dark:text-slate-300 mb-2 font-medium">Anteprima Dati</p>
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg">
          <thead className="bg-slate-50 dark:bg-slate-700/50">
            <tr>
              {fileData.headers.map(header => {
                const fieldKey = headerToFieldMap[header] as keyof Mapping | undefined;
                const colorClass = fieldKey && fieldColorClasses[fieldKey] ? fieldColorClasses[fieldKey].th : '';
                return (
                    <th 
                    key={header} 
                    scope="col" 
                    className={`px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider transition-colors duration-200 ${colorClass}`}
                    >
                    {header}
                    </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
            {previewData.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {fileData.headers.map(header => {
                  const fieldKey = headerToFieldMap[header] as keyof Mapping | undefined;
                  const colorClass = fieldKey && fieldColorClasses[fieldKey] ? fieldColorClasses[fieldKey].td : '';
                  return (
                    <td 
                        key={`${rowIndex}-${header}`} 
                        className={`px-4 py-2 whitespace-nowrap text-sm text-slate-700 dark:text-slate-300 transition-colors duration-200 ${colorClass}`}
                    >
                        {String(row[header])}
                    </td>
                  );
                })}
              </tr>
            ))}
             {previewData.length === 0 && (
                <tr>
                    <td colSpan={fileData.headers.length || 1} className="text-center py-4 text-slate-500 dark:text-slate-400">
                        Nessun dato da visualizzare in anteprima.
                    </td>
                </tr>
             )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MappingTable;