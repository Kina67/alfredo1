
import React, { useState, useMemo, useCallback } from 'react';
import type { ParsedFile, Mappings, Mapping, ComparisonResult, MappingProfile, TransformationRule } from './types';
import { AppStep } from './types';
import { INITIAL_MAPPINGS, MAPPABLE_FIELDS } from './constants';
import { useLocalStorage } from './hooks/useLocalStorage';
import { compareData, parseFile, parseRulesFile, applyTransformationRules } from './services/fileProcessor';

import FileDropzone from './components/FileDropzone';
import MappingTable from './components/MappingTable';
import ResultsView from './components/ResultsView';
import { ArrowRightIcon, ArrowLeftIcon } from './components/icons';

const autoMapColumns = (headers: string[]): Mapping => {
    const findHeader = (keywords: string[], exactKeywords: string[] = []): string | null => {
        const lowerHeaders = headers.map(h => h.toLowerCase().trim());

        // 1. Prioritize exact matches (case-insensitive)
        for (const keyword of exactKeywords) {
            const lowerKeyword = keyword.toLowerCase().trim();
            const exactMatchIndex = lowerHeaders.indexOf(lowerKeyword);
            if (exactMatchIndex !== -1) {
                return headers[exactMatchIndex];
            }
        }
        
        // 2. Then check for keywords inclusion
        for (const keyword of keywords) {
            const lowerKeyword = keyword.toLowerCase().trim();
            const partialMatchIndex = lowerHeaders.findIndex(h => h.includes(lowerKeyword));
            if (partialMatchIndex !== -1) {
                return headers[partialMatchIndex];
            }
        }

        return null;
    };
    
    const code = findHeader(
        ['codice', 'cod.', 'articolo', 'item', 'part'],
        ['Articolo', 'Codice Prodotto', 'Cod. Originale', 'Codice']
    );

    const quantity = findHeader(
        ['quantità', 'qnt', 'qta', 'q.tà', 'qty', 'quantity'],
        ['Q.Tot.DB', 'Qta Distinta Base', 'Quantità']
    );

    const description = findHeader(
        ['descrizione', 'desc.', 'description'],
        ['Descrizione articolo', 'Descrizione']
    );

    return {
        code,
        quantity,
        description,
    };
};


const App: React.FC = () => {
  const [step, setStep] = useState<AppStep>(AppStep.UPLOAD);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [partialFile, setPartialFile] = useState<File | null>(null);
  const [rulesFile, setRulesFile] = useState<File | null>(null);
  const [originalData, setOriginalData] = useState<ParsedFile | null>(null);
  const [partialData, setPartialData] = useState<ParsedFile | null>(null);
  const [rules, setRules] = useState<TransformationRule[] | null>(null);
  
  const [skipRowsOriginal, setSkipRowsOriginal] = useState(0);
  const [skipRowsPartial, setSkipRowsPartial] = useState(0);
  const [aggregateCodes, setAggregateCodes] = useState(false);

  const [mappings, setMappings] = useState<Mappings>(INITIAL_MAPPINGS);
  const [results, setResults] = useState<ComparisonResult[] | null>(null);

  const [profiles, setProfiles] = useLocalStorage<MappingProfile[]>('mapping-profiles', []);
  const [profileName, setProfileName] = useState('');

  const handleFileProcessing = useCallback(async () => {
    if (!originalFile || !partialFile) return;
    setIsLoading(true);
    setError(null);
    try {
      const [originalParsed, partialParsed] = await Promise.all([
        parseFile(originalFile, skipRowsOriginal),
        parseFile(partialFile, skipRowsPartial),
      ]);
      setOriginalData(originalParsed);
      setPartialData(partialParsed);

      // Automap columns
      const autoOriginalMapping = autoMapColumns(originalParsed.headers);
      const autoPartialMapping = autoMapColumns(partialParsed.headers);
      setMappings({
          original: autoOriginalMapping,
          partial: autoPartialMapping
      });


      if (rulesFile) {
        const parsedRules = await parseRulesFile(rulesFile);
        setRules(parsedRules);
      } else {
        setRules(null);
      }

      setStep(AppStep.MAPPING);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep(AppStep.UPLOAD);
    } finally {
      setIsLoading(false);
    }
  }, [originalFile, partialFile, rulesFile, skipRowsOriginal, skipRowsPartial]);

  const handleMappingChange = (fileType: 'original' | 'partial', field: keyof Mapping, value: string) => {
    setMappings(prev => ({
      ...prev,
      [fileType]: { ...prev[fileType], [field]: value || null },
    }));
  };

  const isMappingComplete = useMemo(() => {
    const required = MAPPABLE_FIELDS.filter(f => f.required).map(f => f.id);
    return required.every(f => mappings.original[f]) && required.every(f => mappings.partial[f]);
  }, [mappings]);

  const runComparison = useCallback((aggregate: boolean) => {
     if (!isMappingComplete || !originalData || !partialData) {
      setError("Per favore, mappa tutte le colonne obbligatorie (*) prima di procedere.");
      return;
    }
    setError(null);
    setIsLoading(true);
    setTimeout(() => { // Simulate async for better UX
        try {
            let processedOriginalData = originalData;
            let processedPartialData = partialData;

            if (rules && rules.length > 0) {
                processedOriginalData = applyTransformationRules(
                    originalData,
                    rules,
                    mappings.original.code!,
                    mappings.original.quantity!,
                    mappings.original.description
                );
                processedPartialData = applyTransformationRules(
                    partialData,
                    rules,
                    mappings.partial.code!,
                    mappings.partial.quantity!,
                    mappings.partial.description
                );
            }

            const comparisonResults = compareData(processedOriginalData, processedPartialData, mappings, aggregate);
            
            setResults(comparisonResults);
            setAggregateCodes(aggregate);
            setStep(AppStep.RESULTS);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsLoading(false);
        }
    }, 50);
  }, [isMappingComplete, originalData, partialData, mappings, rules]);

  const handleCompare = () => runComparison(aggregateCodes);
  const handleToggleAggregation = () => runComparison(!aggregateCodes);
  
  const handleReset = () => {
    setStep(AppStep.UPLOAD);
    setOriginalFile(null);
    setPartialFile(null);
    setOriginalData(null);
    setPartialData(null);
    setMappings(INITIAL_MAPPINGS);
    setResults(null);
    setError(null);
    setSkipRowsOriginal(0);
    setSkipRowsPartial(0);
    setAggregateCodes(false);
    setRulesFile(null);
    setRules(null);
  };
  
  const handleBackToUpload = () => {
    setStep(AppStep.UPLOAD);
    setOriginalData(null);
    setPartialData(null);
    setRules(null);
    setMappings(INITIAL_MAPPINGS);
    setError(null);
  };

  const saveProfile = () => {
    if (!profileName.trim()) {
        alert("Per favore, inserisci un nome per il profilo.");
        return;
    }
    if (profiles.some(p => p.name === profileName.trim())) {
        if(!confirm("Un profilo con questo nome esiste già. Vuoi sovrascriverlo?")){
            return;
        }
    }

    setProfiles(prev => {
        const otherProfiles = prev.filter(p => p.name !== profileName.trim());
        return [...otherProfiles, { name: profileName.trim(), mappings }];
    });
    alert(`Profilo "${profileName.trim()}" salvato.`);
  };

  const loadProfile = (name: string) => {
    const profile = profiles.find(p => p.name === name);
    if (profile) {
        setMappings(profile.mappings);
    }
  };

  const renderContent = () => {
    switch (step) {
      case AppStep.UPLOAD:
        return (
          <div className="bg-white p-8 rounded-xl shadow-lg border border-slate-200">
            <div className="grid md:grid-cols-2 gap-8 items-start">
              <FileDropzone title="1. Carica Distinta Cliente (BOM Completa)" onFileSelect={setOriginalFile} acceptedTypes=".xls,.xlsx,.xlsm,.csv,.tsv" />
              <FileDropzone title="2. Carica Distinta Gestionale (Sottoinsieme)" onFileSelect={setPartialFile} acceptedTypes=".xls,.xlsx,.xlsm,.csv,.tsv" />
            </div>
            <div className="mt-8">
                <FileDropzone title="3. Carica File Regole di Trasformazione (Opzionale)" onFileSelect={setRulesFile} acceptedTypes=".xls,.xlsx,.xlsm,.csv,.tsv" />
            </div>
            {originalFile && partialFile && (
              <div className="mt-8 text-center">
                <button
                  onClick={handleFileProcessing}
                  disabled={isLoading}
                  className="inline-flex items-center justify-center px-8 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 disabled:bg-indigo-300 transition-colors duration-200"
                >
                  {isLoading ? 'Caricamento...' : 'Procedi alla Mappatura'}
                  {!isLoading && <ArrowRightIcon className="w-5 h-5 ml-2" />}
                </button>
              </div>
            )}
          </div>
        );
      case AppStep.MAPPING:
        if (!originalData || !partialData) return null;
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <MappingTable fileData={originalData} mapping={mappings.original} onMappingChange={(f, v) => handleMappingChange('original', f, v)} skipRows={skipRowsOriginal} onSkipRowsChange={setSkipRowsOriginal}/>
                <MappingTable fileData={partialData} mapping={mappings.partial} onMappingChange={(f, v) => handleMappingChange('partial', f, v)} skipRows={skipRowsPartial} onSkipRowsChange={setSkipRowsPartial} />
            </div>
            <div className="bg-white p-6 rounded-xl shadow-md border border-slate-200">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                    {/* Left side: Options & Profiles */}
                    <div className="space-y-4 w-full md:w-auto flex-grow">
                    <h3 className="text-lg font-semibold text-slate-800">Opzioni & Profili</h3>
                    <div className="relative flex items-center">
                        <input
                            type="checkbox"
                            id="aggregate"
                            checked={aggregateCodes}
                            onChange={(e) => setAggregateCodes(e.target.checked)}
                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <label htmlFor="aggregate" className="ml-3 block text-sm font-medium text-gray-700">
                            Aggrega quantità per codici duplicati nel file Cliente
                        </label>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <select onChange={(e) => loadProfile(e.target.value)} defaultValue="" className="p-2 border border-slate-300 rounded-md text-sm sm:flex-grow-0 flex-grow">
                            <option value="" disabled>Carica un profilo</option>
                            {profiles.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                        </select>
                        <input type="text" placeholder="Nome nuovo profilo..." value={profileName} onChange={e => setProfileName(e.target.value)} className="p-2 border border-slate-300 rounded-md text-sm sm:flex-grow-0 flex-grow" />
                        <button onClick={saveProfile} className="px-4 py-2 bg-slate-600 text-white font-semibold rounded-md hover:bg-slate-700 transition text-sm">Salva Profilo</button>
                    </div>
                    </div>
                    {/* Right side: Action Buttons */}
                    <div className="flex-shrink-0 w-full md:w-auto flex items-center justify-end flex-wrap gap-4">
                        <button
                          onClick={handleBackToUpload}
                          className="inline-flex items-center justify-center px-6 py-2 bg-slate-200 text-slate-800 font-semibold rounded-lg hover:bg-slate-300 transition-colors duration-200"
                        >
                            <ArrowLeftIcon className="w-5 h-5 mr-2" />
                            <span>Torna al Caricamento</span>
                        </button>
                        <button
                        onClick={handleCompare}
                        disabled={!isMappingComplete || isLoading}
                        className="inline-flex items-center justify-center px-10 py-4 border border-transparent text-base font-medium rounded-lg shadow-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                        >
                        {isLoading ? 'Confronto in corso...' : 'Esegui Confronto'}
                        {!isLoading && <ArrowRightIcon className="w-5 h-5 ml-3" />}
                        </button>
                    </div>
                </div>
            </div>
          </div>
        );
      case AppStep.RESULTS:
        if (!results) return null;
        return (
            <div>
                 <ResultsView 
                    results={results} 
                    onToggleAggregate={handleToggleAggregation}
                    isAggregated={aggregateCodes}
                    originalFileName={originalFile?.name}
                    partialFileName={partialFile?.name}
                 />
                 <div className="mt-8 text-center">
                    <button onClick={handleReset} className="px-6 py-2 bg-slate-600 text-white font-semibold rounded-lg hover:bg-slate-700 transition">
                        Inizia una nuova analisi
                    </button>
                 </div>
            </div>
        )
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 font-sans">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8">
            <h1 className="text-3xl font-bold leading-tight text-slate-900">
            Confronto Distinte Base (BOM)
            </h1>
        </div>
      </header>
      <main className="py-10">
        <div className="max-w-7xl mx-auto sm:px-6 lg:px-8">
            {error && (
                <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6 rounded-md" role="alert">
                    <p className="font-bold">Errore</p>
                    <p>{error}</p>
                </div>
            )}
            {renderContent()}
        </div>
      </main>
    </div>
  );
};

export default App;