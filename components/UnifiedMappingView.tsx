import React from 'react';
import type { Mappings, Mapping } from '../types';
import { MAPPABLE_FIELDS } from '../constants';
import { ArrowRightIcon } from './icons';

interface UnifiedMappingViewProps {
  mappings: Mappings;
  originalHeaders: string[];
  partialHeaders: string[];
  onMappingChange: (fileType: 'original' | 'partial', field: keyof Mapping, value: string) => void;
}

const UnifiedMappingView: React.FC<UnifiedMappingViewProps> = ({
  mappings,
  originalHeaders,
  partialHeaders,
  onMappingChange,
}) => {
  return (
    <div className="bg-white p-6 rounded-xl shadow-md border border-slate-200">
      <div className="grid grid-cols-[max-content_1fr_max-content_1fr] items-center gap-x-6 gap-y-4">
        {/* Headers */}
        <div className="font-semibold text-slate-800 text-left">Mappatura Campi</div>
        <div className="font-semibold text-slate-800 text-left">Distinta Cliente</div>
        <div></div> {/* Spacer for arrow */}
        <div className="font-semibold text-slate-800 text-left">Distinta Gestionale</div>
        
        {/* Divider */}
        <div className="col-span-4 border-b border-slate-200 my-2"></div>

        {/* Mapping Rows */}
        {MAPPABLE_FIELDS.map(field => (
          <React.Fragment key={field.id}>
            <div className="font-medium text-slate-700 pr-4 text-left flex items-center h-full">
              <span>
                {field.label}
                {!field.required && <span className="text-slate-500 font-normal ml-1">(opzionale)</span>}
                {field.required && <span className="text-red-500 ml-1">*</span>}
              </span>
            </div>
            
            {/* Original File Dropdown */}
            <select
              value={mappings.original[field.id] || ''}
              onChange={(e) => onMappingChange('original', field.id, e.target.value)}
              className="block w-full pl-3 pr-10 py-2 text-base border-slate-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
            >
              <option value="">Seleziona colonna...</option>
              {originalHeaders.map(header => (
                <option key={header} value={header}>{header}</option>
              ))}
            </select>
            
            {/* Arrow */}
            <div className="flex justify-center">
              <ArrowRightIcon className="w-5 h-5 text-slate-400" />
            </div>

            {/* Partial File Dropdown */}
            <select
              value={mappings.partial[field.id] || ''}
              onChange={(e) => onMappingChange('partial', field.id, e.target.value)}
              className="block w-full pl-3 pr-10 py-2 text-base border-slate-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
            >
              <option value="">Seleziona colonna...</option>
              {partialHeaders.map(header => (
                <option key={header} value={header}>{header}</option>
              ))}
            </select>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

export default UnifiedMappingView;