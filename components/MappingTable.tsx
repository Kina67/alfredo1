import React from 'react';
import type { ParsedFile, Mapping } from '../types';
import { MAPPABLE_FIELDS } from '../constants';

// Define color classes for each mappable field
const fieldColorClasses: Record<keyof Mapping, { th: string; td: string }> = {
  code: { th: 'bg-indigo-100 text-indigo-800', td: 'bg-indigo-50' },
  quantity: { th: 'bg-sky-100 text-sky-800', td: 'bg-sky-50' },
  description: { th: 'bg-teal-100 text-teal-800', td: 'bg-teal-50' },
  revision: { th: 'bg-amber-100 text-amber-800', td: 'bg-amber-50' },
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
    <div className="bg-white p-6 rounded-xl shadow-md border border-slate-200 flex flex-col h-full">
      {/* Card Header */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-xl font-bold text-slate-800">{fileData.name}</h3>
           {showMappingControls && <p className="text-sm text-slate-500">Mappa le colonne per l'analisi.</p>}
        </div>
        <div className="flex items-center space-x-2 flex-shrink-0">
            <label htmlFor={`skip-rows-${fileData.name}`} className="text-sm font-medium text-slate-600">Salta righe:</label>
            <input 
                type="number"
                id={`skip-rows-${fileData.name}`}
                min="0"
                value={skipRows}
                onChange={(e) => onSkipRowsChange(Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="w-20 p-1.5 border border-slate-300 rounded-md text-sm focus:ring-indigo-500 focus:border-indigo-500"
            />
        </div>
      </div>
      
      {/* Mapping Controls */}
      {showMappingControls && (
        <div className="border-t border-slate-200 pt-4 mb-4">
            <h4 className="text-md font-semibold text-slate-700 mb-3">Mappatura Campi</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {MAPPABLE_FIELDS.map(field => (
                <div key={field.id}>
                <label htmlFor={`${fileData.name}-${field.id}`} className="block text-sm font-medium text-slate-700">
                    {field.label} {field.required && <span className="text-red-500">*</span>}
                </label>
                <select
                    id={`${fileData.name}-${field.id}`}
                    value={mapping[field.id] || ''}
                    onChange={(e) => onMappingChange(field.id, e.target.value)}
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-slate-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
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
         <p className="text-sm text-slate-600 mb-2 font-medium">Anteprima Dati</p>
        <table className="min-w-full divide-y divide-slate-200 border border-slate-200 rounded-lg">
          <thead className="bg-slate-50">
            <tr>
              {fileData.headers.map(header => {
                const fieldKey = headerToFieldMap[header] as keyof Mapping | undefined;
                const colorClass = fieldKey && fieldColorClasses[fieldKey] ? fieldColorClasses[fieldKey].th : '';
                return (
                    <th 
                    key={header} 
                    scope="col" 
                    className={`px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider transition-colors duration-200 ${colorClass}`}
                    >
                    {header}
                    </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {previewData.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {fileData.headers.map(header => {
                  const fieldKey = headerToFieldMap[header] as keyof Mapping | undefined;
                  const colorClass = fieldKey && fieldColorClasses[fieldKey] ? fieldColorClasses[fieldKey].td : '';
                  return (
                    <td 
                        key={`${rowIndex}-${header}`} 
                        className={`px-4 py-2 whitespace-nowrap text-sm text-slate-700 transition-colors duration-200 ${colorClass}`}
                    >
                        {String(row[header])}
                    </td>
                  );
                })}
              </tr>
            ))}
             {previewData.length === 0 && (
                <tr>
                    <td colSpan={fileData.headers.length || 1} className="text-center py-4 text-slate-500">
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