
import React, { useState, useEffect } from 'react';
import type { TransformationRule } from '../types';
import { RuleType } from '../types';
import { XCircleIcon } from './icons';

interface RuleEditorModalProps {
  isOpen: boolean;
  rules: TransformationRule[];
  onClose: () => void;
  onSave: (updatedRules: TransformationRule[]) => void;
}

const RuleEditorModal: React.FC<RuleEditorModalProps> = ({ isOpen, rules, onClose, onSave }) => {
  const [editableRules, setEditableRules] = useState<TransformationRule[]>([]);

  useEffect(() => {
    if (isOpen) {
        // Deep copy to prevent modifying the original state directly
        setEditableRules(JSON.parse(JSON.stringify(rules)));
    }
  }, [rules, isOpen]);

  if (!isOpen) return null;

  const handleRuleChange = (index: number, updatedRule: TransformationRule) => {
    setEditableRules(currentRules => {
        const newRules = [...currentRules];
        newRules[index] = updatedRule;
        return newRules;
    });
  };

  const handleRemoveRule = (index: number) => {
    setEditableRules(currentRules => currentRules.filter((_, i) => i !== index));
  };

  const handleAddRule = (type: RuleType) => {
    let newRule: TransformationRule;
    if (type === RuleType.MERGE) {
      newRule = { type: RuleType.MERGE, sourceCodes: [], resultCode: '', resultDescription: '' };
    } else {
      newRule = { type: RuleType.EXCLUDE, value: '' };
    }
    setEditableRules(currentRules => [...currentRules, newRule]);
  };

  const handleSaveChanges = () => {
    const cleanedRules = editableRules.filter(rule => {
        if (rule.type === RuleType.MERGE) {
            return rule.resultCode.trim() !== '' && rule.sourceCodes.length > 0 && rule.sourceCodes.every(c => c.trim() !== '');
        }
        if (rule.type === RuleType.EXCLUDE) {
            return rule.value.trim() !== '';
        }
        return false;
    });
    onSave(cleanedRules);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <header className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Editor Regole di Trasformazione</h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
            <XCircleIcon className="w-8 h-8 text-slate-500 dark:text-slate-400" />
          </button>
        </header>

        <main className="p-6 overflow-y-auto space-y-6">
          {editableRules.map((rule, index) => (
            <div key={index} className="bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg p-4 relative">
              <button
                onClick={() => handleRemoveRule(index)}
                className="absolute top-2 right-2 p-1 rounded-full hover:bg-red-100 text-red-500"
                title="Rimuovi regola"
              >
                <XCircleIcon className="w-5 h-5" />
              </button>
              {rule.type === RuleType.MERGE ? (
                <div className="space-y-3">
                  <span className="font-semibold text-indigo-700 bg-indigo-100 dark:bg-indigo-900/50 dark:text-indigo-300 px-2 py-1 rounded-md text-sm">{RuleType.MERGE}</span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">Codici da unire (separati da +)</label>
                      <input
                        type="text"
                        value={rule.sourceCodes.join(' + ')}
                        onChange={(e) => handleRuleChange(index, { ...rule, sourceCodes: e.target.value.split('+').map(c => c.trim()) })}
                        className="mt-1 block w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm bg-slate-200 dark:bg-slate-700 dark:text-slate-200"
                        placeholder="Es: 12345 + 67890"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">Codice risultante</label>
                      <input
                        type="text"
                        value={rule.resultCode}
                        onChange={(e) => handleRuleChange(index, { ...rule, resultCode: e.target.value })}
                        className="mt-1 block w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm bg-slate-200 dark:bg-slate-700 dark:text-slate-200"
                      />
                    </div>
                  </div>
                   <div>
                      <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">Descrizione risultante</label>
                      <input
                        type="text"
                        value={rule.resultDescription}
                        onChange={(e) => handleRuleChange(index, { ...rule, resultDescription: e.target.value })}
                        className="mt-1 block w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm bg-slate-200 dark:bg-slate-700 dark:text-slate-200"
                      />
                    </div>
                </div>
              ) : (
                <div className="space-y-3">
                   <span className="font-semibold text-orange-700 bg-orange-100 dark:bg-orange-900/50 dark:text-orange-300 px-2 py-1 rounded-md text-sm">{RuleType.EXCLUDE}</span>
                   <div>
                        <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">Valore da escludere</label>
                        <input
                            type="text"
                            value={rule.value}
                            onChange={(e) => handleRuleChange(index, { ...rule, value: e.target.value })}
                            className="mt-1 block w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm bg-slate-200 dark:bg-slate-700 dark:text-slate-200"
                            placeholder='Es: TUTTI LE DESCRIZIONI CONTENENTI "SUPPORTO" oppure 98765'
                        />
                   </div>
                </div>
              )}
            </div>
          ))}
          <div className="flex items-center gap-4 border-t border-slate-200 dark:border-slate-700 pt-4">
            <button onClick={() => handleAddRule(RuleType.MERGE)} className="px-4 py-2 bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 font-semibold rounded-md hover:bg-indigo-200 dark:hover:bg-indigo-900 transition text-sm">Aggiungi Regola UNIONE</button>
            <button onClick={() => handleAddRule(RuleType.EXCLUDE)} className="px-4 py-2 bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300 font-semibold rounded-md hover:bg-orange-200 dark:hover:bg-orange-900 transition text-sm">Aggiungi Regola ESCLUDI</button>
          </div>
        </main>

        <footer className="p-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-4">
          <button onClick={onClose} className="px-6 py-2 bg-slate-200 text-slate-800 font-semibold rounded-lg hover:bg-slate-300 dark:bg-slate-600 dark:text-slate-200 dark:hover:bg-slate-500 transition">Annulla</button>
          <button onClick={handleSaveChanges} className="px-6 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition">Applica Modifiche</button>
        </footer>
      </div>
    </div>
  );
};

export default RuleEditorModal;