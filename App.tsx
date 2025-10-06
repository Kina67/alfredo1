import React, { useState, useMemo, useCallback, useRef } from 'react';
import type { ParsedFile, Mappings, Mapping, ComparisonResult, MappingProfile, TransformationRule, RowData } from './types';
import { AppStep } from './types';
import { INITIAL_MAPPINGS, MAPPABLE_FIELDS } from './constants';
import { useLocalStorage } from './hooks/useLocalStorage';
import { compareData, parseFile, parseRulesFile, applyTransformationRules } from './services/fileProcessor';

import FileDropzone from './components/FileDropzone';
import MappingTable from './components/MappingTable';
import ResultsView from './components/ResultsView';
import RuleEditorModal from './components/RuleEditorModal';
import { ArrowRightIcon, ArrowLeftIcon, SunIcon, MoonIcon } from './components/icons';
import UnifiedMappingView from './components/UnifiedMappingView';

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
    
    const revision = findHeader(
        ['rev', 'revisione', 'revision'],
        ['Rev', 'Revisione']
    );

    return {
        code,
        quantity,
        description,
        revision,
    };
};

const getColumnProfile = (data: RowData[], header: string | null) => {
    if (!header) {
        return { numericRatio: 0, avgLength: 0, totalCount: 0 };
    }
    const sample = data.slice(0, 50); // Sample first 50 rows
    let numericCount = 0;
    let totalLength = 0;
    const values = sample.map(row => String(row[header] || '')).filter(Boolean);
    
    if (values.length === 0) {
        return { numericRatio: 0, avgLength: 0, totalCount: 0 };
    }

    for (const value of values) {
        // Checks for integers or decimals (with '.' or ',' separator)
        if (/^\d+([,.]\d+)?$/.test(value)) {
            numericCount++;
        }
        totalLength += value.length;
    }
    
    return {
        numericRatio: numericCount / values.length,
        avgLength: totalLength / values.length,
        totalCount: values.length,
    };
};

const smartAutoMap = (originalFile: ParsedFile, partialFile: ParsedFile): Mappings => {
    // Step 1: Initial keyword-based mapping for both files
    const originalMapping = autoMapColumns(originalFile.headers);
    const partialMapping = autoMapColumns(partialFile.headers);

    if (!originalMapping.code) {
        return { original: originalMapping, partial: partialMapping };
    }

    // Step 2: Profile the identified 'code' column from the original file
    const refProfile = getColumnProfile(originalFile.data, originalMapping.code);

    if (refProfile.totalCount === 0) {
        return { original: originalMapping, partial: partialMapping };
    }

    // Step 3: Score all columns in the partial file against the reference profile
    let bestCandidate: string | null = null;
    let highestScore = -1;

    for (const candidateHeader of partialFile.headers) {
        const candidateProfile = getColumnProfile(partialFile.data, candidateHeader);
        if (candidateProfile.totalCount === 0) continue;

        let score = 0;

        // Content score: How similar are the data types? (Highly weighted)
        const numericSimilarity = 1 - Math.abs(refProfile.numericRatio - candidateProfile.numericRatio);
        score += numericSimilarity * 10;

        // Length score: How similar are the average lengths?
        if (refProfile.avgLength > 0 && candidateProfile.avgLength > 0) {
          const lengthSimilarity = 1 - (Math.abs(refProfile.avgLength - candidateProfile.avgLength) / Math.max(refProfile.avgLength, candidateProfile.avgLength));
          score += lengthSimilarity * 2;
        }

        // Header score: Give a bonus if the header was the original keyword-based choice
        if (candidateHeader === partialMapping.code) {
            score += 5;
        }

        if (score > highestScore) {
            highestScore = score;
            bestCandidate = candidateHeader;
        }
    }
    
    // Step 4: Update the partial mapping with the best candidate found
    if (bestCandidate) {
        partialMapping.code = bestCandidate;
    }

    return { original: originalMapping, partial: partialMapping };
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
  const [rulesFileDisplayName, setRulesFileDisplayName] = useState<string | null>(null);
  const [isRuleEditorOpen, setIsRuleEditorOpen] = useState(false);
  
  const [skipRowsOriginal, setSkipRowsOriginal] = useState(0);
  const [skipRowsPartial, setSkipRowsPartial] = useState(0);
  const [aggregateCodes, setAggregateCodes] = useState(false);
  const [comparisonOptions, setComparisonOptions] = useState({
    ignoreRevision: true,
    ignoreRules: false,
  });

  const [mappings, setMappings] = useState<Mappings>(INITIAL_MAPPINGS);
  const [results, setResults] = useState<ComparisonResult[] | null>(null);

  const [profiles, setProfiles] = useLocalStorage<MappingProfile[]>('mapping-profiles', []);
  const [profileName, setProfileName] = useState('');

  const [theme, setTheme] = useLocalStorage<'light' | 'dark'>('theme', 'light');

  const originalFileRef = useRef<HTMLInputElement>(null);
  const partialFileRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove(theme === 'light' ? 'dark' : 'light');
    root.classList.add(theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
  };

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

      const { original: autoOriginalMapping, partial: autoPartialMapping } = smartAutoMap(originalParsed, partialParsed);
      setMappings({
          original: autoOriginalMapping,
          partial: autoPartialMapping
      });

      if (rulesFile) {
        const parsedRules = await parseRulesFile(rulesFile);
        setRules(parsedRules);
        setRulesFileDisplayName(rulesFile.name);
      } else {
        setRules(null);
        setRulesFileDisplayName(null);
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

  const performComparison = (
    currentOriginalData: ParsedFile, 
    currentPartialData: ParsedFile,
    currentMappings: Mappings,
    currentRules: TransformationRule[] | null,
    aggregate: boolean,
    options: { ignoreRevision: boolean, ignoreRules: boolean }
  ): ComparisonResult[] => {
      let processedOriginalData = currentOriginalData;
      let processedPartialData = currentPartialData;

      if (currentRules && currentRules.length > 0 && !options.ignoreRules) {
          processedOriginalData = applyTransformationRules(
              currentOriginalData,
              currentRules,
              currentMappings.original.code!,
              currentMappings.original.quantity!,
              currentMappings.original.description
          );
          processedPartialData = applyTransformationRules(
              currentPartialData,
              currentRules,
              currentMappings.partial.code!,
              currentMappings.partial.quantity!,
              currentMappings.partial.description
          );
      }

      return compareData(processedOriginalData, processedPartialData, currentMappings, aggregate, options);
  };

  const runComparison = useCallback((aggregate: boolean) => {
     if (!isMappingComplete || !originalData || !partialData) {
      setError("Per favore, mappa tutte le colonne obbligatorie (*) prima di procedere.");
      return;
    }
    setError(null);
    setIsLoading(true);
    setTimeout(() => { // Simulate async for better UX
        try {
            const comparisonResults = performComparison(originalData, partialData, mappings, rules, aggregate, comparisonOptions);
            setResults(comparisonResults);
            setAggregateCodes(aggregate);
            setStep(AppStep.RESULTS);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsLoading(false);
        }
    }, 50);
  }, [isMappingComplete, originalData, partialData, mappings, rules, comparisonOptions]);

  const handleComparisonOptionsChange = (newOption: { ignoreRevision?: boolean; ignoreRules?: boolean }) => {
    const updatedOptions = { ...comparisonOptions, ...newOption };
    setComparisonOptions(updatedOptions);

    if (!originalData || !partialData || !results) return;

    setIsLoading(true);
    setError(null);
    setTimeout(() => {
      try {
        const comparisonResults = performComparison(originalData, partialData, mappings, rules, aggregateCodes, updatedOptions);
        setResults(comparisonResults);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsLoading(false);
      }
    }, 50);
  };

  const handleApplyRulesFile = useCallback(async (file: File) => {
    if (!originalData || !partialData || !isMappingComplete) return;
    
    setIsLoading(true);
    setError(null);
    try {
        const parsedRules = await parseRulesFile(file);
        setRules(parsedRules);
        setRulesFile(file);
        setRulesFileDisplayName(file.name);

        const comparisonResults = performComparison(originalData, partialData, mappings, parsedRules, aggregateCodes, comparisonOptions);
        setResults(comparisonResults);
    } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
    } finally {
        setIsLoading(false);
    }
  }, [originalData, partialData, mappings, aggregateCodes, isMappingComplete, comparisonOptions]);

  const handleSaveRules = useCallback((updatedRules: TransformationRule[]) => {
    if (!originalData || !partialData) return;
    
    setIsLoading(true);
    setError(null);
    
    setRules(updatedRules);
    setRulesFileDisplayName(prev => {
        if (!prev) return "Regole personalizzate";
        if (prev.includes('(modificato)')) return prev;
        const baseName = prev.split('.').slice(0, -1).join('.');
        return `${baseName || prev} (modificato)`;
    });

    try {
        const comparisonResults = performComparison(originalData, partialData, mappings, updatedRules, aggregateCodes, comparisonOptions);
        setResults(comparisonResults);
    } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
    } finally {
        setIsLoading(false);
        setIsRuleEditorOpen(false);
    }
  }, [originalData, partialData, mappings, aggregateCodes, comparisonOptions]);

  const handleRemoveRules = useCallback(() => {
    if (!originalData || !partialData) return;
    
    setIsLoading(true);
    setError(null);
    setRules(null);
    setRulesFile(null);
    setRulesFileDisplayName(null);

    try {
        const comparisonResults = performComparison(originalData, partialData, mappings, null, aggregateCodes, comparisonOptions);
        setResults(comparisonResults);
    } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
    } finally {
        setIsLoading(false);
    }
  }, [originalData, partialData, mappings, aggregateCodes, comparisonOptions]);

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
    setRulesFileDisplayName(null);
  };
  
  const handleBackToUpload = () => {
    setStep(AppStep.UPLOAD);
    setOriginalData(null);
    setPartialData(null);
    setRules(null);
    setMappings(INITIAL_MAPPINGS);
    setError(null);
  };

  const handleOriginalFilenameClick = () => {
    originalFileRef.current?.click();
  };

  const handlePartialFilenameClick = () => {
    partialFileRef.current?.click();
  };

  const handleReplaceFile = async (
    type: 'original' | 'partial',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const newFile = e.target.files?.[0];
    if (!newFile) return;

    setIsLoading(true);
    setError(null);

    try {
      const newParsedData = await parseFile(newFile, type === 'original' ? skipRowsOriginal : skipRowsPartial);
      const newMapping = autoMapColumns(newParsedData.headers);
      
      // All async operations successful, now update state
      setResults(null);
      if (type === 'original') {
        setOriginalFile(newFile);
        setOriginalData(newParsedData);
        setMappings(prev => ({ ...prev, original: newMapping }));
      } else { // partial
        setPartialFile(newFile);
        setPartialData(newParsedData);
        setMappings(prev => ({ ...prev, partial: newMapping }));
      }
      setStep(AppStep.MAPPING);

    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      // Don't change any state if parsing fails, just show the error.
    } finally {
      setIsLoading(false);
      if (e.target) e.target.value = '';
    }
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
          <div className="bg-white dark:bg-slate-800 p-8 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700">
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
            <UnifiedMappingView
                mappings={mappings}
                originalHeaders={originalData.headers}
                partialHeaders={partialData.headers}
                onMappingChange={handleMappingChange}
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <MappingTable fileData={originalData} mapping={mappings.original} onMappingChange={(f, v) => handleMappingChange('original', f, v)} skipRows={skipRowsOriginal} onSkipRowsChange={setSkipRowsOriginal} showMappingControls={false} />
                <MappingTable fileData={partialData} mapping={mappings.partial} onMappingChange={(f, v) => handleMappingChange('partial', f, v)} skipRows={skipRowsPartial} onSkipRowsChange={setSkipRowsPartial} showMappingControls={false} />
            </div>
            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-md border border-slate-200 dark:border-slate-700">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                    {/* Left side: Options & Profiles */}
                    <div className="space-y-4 w-full md:w-auto flex-grow">
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Opzioni & Profili</h3>
                    <div className="relative flex items-center">
                        <input
                            type="checkbox"
                            id="aggregate"
                            checked={aggregateCodes}
                            onChange={(e) => setAggregateCodes(e.target.checked)}
                            className="h-4 w-4 rounded border-gray-300 dark:border-slate-500 text-indigo-600 focus:ring-indigo-500 bg-transparent"
                        />
                        <label htmlFor="aggregate" className="ml-3 block text-sm font-medium text-gray-700 dark:text-slate-300">
                            Aggrega quantità per codici duplicati nel file Cliente
                        </label>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <select onChange={(e) => loadProfile(e.target.value)} defaultValue="" className="p-2 border border-slate-400 dark:border-slate-500 rounded-md text-sm sm:flex-grow-0 flex-grow bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-200">
                            <option value="" disabled>Carica un profilo</option>
                            {profiles.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                        </select>
                        <input type="text" placeholder="Nome nuovo profilo..." value={profileName} onChange={e => setProfileName(e.target.value)} className="p-2 border border-slate-400 dark:border-slate-500 rounded-md text-sm sm:flex-grow-0 flex-grow bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-200 placeholder:text-slate-500 dark:placeholder:text-slate-400" />
                        <button onClick={saveProfile} className="px-4 py-2 bg-slate-600 text-white font-semibold rounded-md hover:bg-slate-700 transition text-sm">Salva Profilo</button>
                    </div>
                    </div>
                    {/* Right side: Action Buttons */}
                    <div className="flex-shrink-0 w-full md:w-auto flex items-center justify-end flex-wrap gap-4">
                        <button
                          onClick={handleBackToUpload}
                          className="inline-flex items-center justify-center px-6 py-2 bg-slate-200 text-slate-800 dark:bg-slate-600 dark:text-slate-200 font-semibold rounded-lg hover:bg-slate-300 dark:hover:bg-slate-500 transition-colors duration-200"
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
                    onApplyRulesFile={handleApplyRulesFile}
                    onRemoveRules={handleRemoveRules}
                    rulesFileName={rulesFileDisplayName}
                    onEditRules={() => setIsRuleEditorOpen(true)}
                    comparisonOptions={comparisonOptions}
                    onComparisonOptionsChange={handleComparisonOptionsChange}
                 />
                 {rules !== null && (
                    <RuleEditorModal
                        isOpen={isRuleEditorOpen}
                        rules={rules}
                        onClose={() => setIsRuleEditorOpen(false)}
                        onSave={handleSaveRules}
                    />
                 )}
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
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 font-sans transition-colors duration-300">
      <input
        type="file"
        ref={originalFileRef}
        onChange={(e) => handleReplaceFile('original', e)}
        className="hidden"
        accept=".xls,.xlsx,.xlsm,.csv,.tsv"
      />
      <input
        type="file"
        ref={partialFileRef}
        onChange={(e) => handleReplaceFile('partial', e)}
        className="hidden"
        accept=".xls,.xlsx,.xlsm,.csv,.tsv"
      />
      <header className="bg-white dark:bg-slate-800/50 dark:backdrop-blur-sm shadow-sm sticky top-0 z-40 transition-colors duration-300">
        <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8 flex justify-between items-center gap-4">
            <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold leading-tight text-slate-900 dark:text-slate-100 truncate">
                Confronto Distinte Base (BOM)
                </h1>
                {originalFile && partialFile && step !== AppStep.UPLOAD && (
                    <div className="text-sm text-slate-500 dark:text-slate-400 truncate flex items-center gap-2 flex-wrap">
                        <button
                          onClick={handleOriginalFilenameClick}
                          className="hover:underline focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded px-1 py-0.5"
                          title={`Sostituisci: ${originalFile.name}`}
                        >
                            <span className="font-medium text-slate-600 dark:text-slate-300">Cliente:</span> {originalFile.name}
                        </button>
                        <span className="text-slate-400 dark:text-slate-500">vs</span>
                        <button
                          onClick={handlePartialFilenameClick}
                          className="hover:underline focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded px-1 py-0.5"
                          title={`Sostituisci: ${partialFile.name}`}
                        >
                            <span className="font-medium text-slate-600 dark:text-slate-300">Gestionale:</span> {partialFile.name}
                        </button>
                    </div>
                )}
            </div>
            <button
              onClick={toggleTheme}
              className="p-2 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-slate-800 transition-colors"
              aria-label="Toggle dark mode"
            >
              {theme === 'light' ? <MoonIcon className="w-6 h-6" /> : <SunIcon className="w-6 h-6" />}
            </button>
        </div>
      </header>
      <main className="py-10">
        <div className="max-w-7xl mx-auto sm:px-6 lg:px-8">
            {error && (
                <div className="bg-red-100 dark:bg-red-900/30 border-l-4 border-red-500 text-red-700 dark:text-red-300 p-4 mb-6 rounded-md" role="alert">
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