import type { ParsedFile, RowData, Mappings, ComparisonResult, TransformationRule } from '../types';
import { ResultStatus, RuleType } from '../types';

declare var XLSX: any;

export const parseRulesFile = async (file: File): Promise<TransformationRule[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        const jsonData: RowData[] = XLSX.utils.sheet_to_json(worksheet, {
          defval: '',
        });

        const rules: TransformationRule[] = jsonData.map(row => {
          const type = String(row['Tipo'] || '').trim().toUpperCase();
          const codesOrDesc = String(row['Codici da unire'] || '').trim();
          
          if (!type || !codesOrDesc) {
              return null;
          }
          
          if (type === RuleType.MERGE) {
            const sourceCodes = codesOrDesc.split('+').map(c => c.trim()).filter(Boolean);
            const resultCode = String(row['Codice risultante']);
            const resultDescription = String(row['Descrizione risultante']);
            if (!resultCode || sourceCodes.length < 1) return null;
            return { type: RuleType.MERGE, sourceCodes, resultCode, resultDescription };
          } else if (type === RuleType.EXCLUDE) {
            return { type: RuleType.EXCLUDE, value: codesOrDesc };
          }
          return null;
        }).filter((r): r is TransformationRule => r !== null);
        
        resolve(rules);
      } catch (error) {
        console.error("Error parsing rules file:", error);
        reject(new Error("Errore durante la lettura del file delle regole. Assicurarsi che il formato sia corretto."));
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsBinaryString(file);
  });
};


export const parseFile = async (file: File, skipRows: number): Promise<ParsedFile> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // FIX: The sheet_to_json with header: 1 returns an array of arrays, not an array of RowData objects.
        // Changed type from RowData[] to any[][] to correctly reflect the library's output.
        const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          defval: '',
          range: skipRows > 0 ? skipRows : undefined,
        });

        if (jsonData.length === 0) {
          return reject(new Error("Il file è vuoto o non contiene dati leggibili."));
        }

        const headers: string[] = jsonData.length > 0 ? (jsonData[0] as any[]).map(h => String(h ?? '')) : [];
        const bodyData: RowData[] = jsonData.slice(1).map((row: any[]) =>
          headers.reduce((obj, header, index) => {
            obj[header] = row[index];
            return obj;
          }, {} as RowData)
        );

        resolve({
          name: file.name,
          headers,
          data: bodyData,
        });
      } catch (error) {
        console.error("Error parsing file:", error);
        reject(new Error("Errore durante la lettura del file. Assicurarsi che il formato sia corretto."));
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsBinaryString(file);
  });
};

const normalizeQuantity = (value: any): number | null => {
  if (value === null || value === undefined || value === '') return null;
  
  const strValue = String(value)
    .trim()
    .replace(/\./g, '') // Rimuovi separatori migliaia
    .replace(',', '.'); // Sostituisci virgola decimale

  const num = parseFloat(strValue);
  return isNaN(num) ? null : num;
};

export const applyTransformationRules = (
  parsedFile: ParsedFile,
  rules: TransformationRule[],
  codeColumn: string,
  quantityColumn: string,
  descriptionColumn: string | null
): ParsedFile => {
  let data = [...parsedFile.data];
  
  const excludeRules = rules.filter((r): r is Extract<TransformationRule, {type: RuleType.EXCLUDE}> => r.type === RuleType.EXCLUDE);
  const mergeRules = rules.filter((r): r is Extract<TransformationRule, {type: RuleType.MERGE}> => r.type === RuleType.MERGE);

  // 1. Apply EXCLUDE rules
  if (excludeRules.length > 0) {
    const descriptionExclusionKeywords: string[] = [];
    const codeExclusionSet = new Set<string>();

    const descriptionExclusionRegex = /(?:TUTTI\s+LE\s+)?DESCRIZIONI\s+CONTENENTI\s*"([^"]+)"/i;

    for (const rule of excludeRules) {
      const match = rule.value.match(descriptionExclusionRegex);
      if (match && match[1]) {
        descriptionExclusionKeywords.push(match[1].toUpperCase());
      } else {
        rule.value.split('+').forEach(c => codeExclusionSet.add(c.trim()));
      }
    }

    data = data.filter(row => {
      const code = String(row[codeColumn]);
      if (codeExclusionSet.has(code)) {
        return false;
      }
      
      if (descriptionColumn && descriptionExclusionKeywords.length > 0) {
        const description = String(row[descriptionColumn] || '').toUpperCase();
        if (descriptionExclusionKeywords.some(keyword => description.includes(keyword))) {
          return false;
        }
      }
      return true;
    });
  }

  // 2. Apply MERGE rules
  for (const rule of mergeRules) {
      if (!rule.resultCode) continue;
      const sourceCodesSet = new Set(rule.sourceCodes);
      const rowsToMerge: RowData[] = [];
      const remainingRows: RowData[] = [];

      data.forEach(row => {
          if (sourceCodesSet.has(String(row[codeColumn]))) {
              rowsToMerge.push(row);
          } else {
              remainingRows.push(row);
          }
      });
      
      if (rowsToMerge.length > 0) {
          const totalQuantity = rowsToMerge.reduce((sum, row) => {
              const quantity = normalizeQuantity(row[quantityColumn]);
              return sum + (quantity || 0);
          }, 0);

          const newRow: RowData = {};
          parsedFile.headers.forEach(header => {
            if (header === codeColumn) {
              newRow[header] = rule.resultCode;
            } else if (header === quantityColumn) {
              newRow[header] = totalQuantity;
            } else if (descriptionColumn && header === descriptionColumn) {
              newRow[header] = rule.resultDescription || '';
            } else {
              newRow[header] = ''; 
            }
          });

          data = [...remainingRows, newRow];
      }
  }

  return {
    ...parsedFile,
    data,
  };
};


export const compareData = (
  originalData: ParsedFile,
  partialData: ParsedFile,
  mappings: Mappings,
  aggregate: boolean
): ComparisonResult[] => {
  const { original: originalMap, partial: partialMap } = mappings;

  if (!originalMap.code || !originalMap.quantity || !partialMap.code || !partialMap.quantity) {
    throw new Error("Mappatura colonne obbligatorie mancante.");
  }

  // 1. Build a map from the partial data for efficient lookup (always aggregated).
  const partialMapData = new Map<string, { quantity: number; description: string | null; row: RowData }>();
  for (const row of partialData.data) {
    const code = String(row[partialMap.code]);
    const quantity = normalizeQuantity(row[partialMap.quantity]);
    const description = partialMap.description ? String(row[partialMap.description]) : null;

    if (code && quantity !== null) {
      if (partialMapData.has(code)) {
        const existing = partialMapData.get(code)!;
        existing.quantity += quantity;
      } else {
        partialMapData.set(code, { quantity, description, row });
      }
    }
  }
  
  // 2. Aggregate original data if needed.
  const dataToIterate: RowData[] = (() => {
    if (!aggregate) {
      return originalData.data;
    }
    
    const originalAggregatedData = new Map<string, { quantity: number; description: string | null; rows: RowData[] }>();
    for (const row of originalData.data) {
        const code = String(row[originalMap.code]);
        const quantity = normalizeQuantity(row[originalMap.quantity]);
        const description = originalMap.description ? String(row[originalMap.description]) : null;
        
        if(code) {
            if (originalAggregatedData.has(code)) {
                const existing = originalAggregatedData.get(code)!;
                if(quantity !== null) existing.quantity += quantity;
                existing.rows.push(row);
            } else {
                originalAggregatedData.set(code, { quantity: quantity ?? 0, description, rows: [row] });
            }
        }
    }
    return Array.from(originalAggregatedData.entries()).map(([code, data]) => ({
      ...data.rows[0],
      [originalMap.code!]: code, 
      [originalMap.quantity!]: data.quantity,
      ...(originalMap.description && data.description ? { [originalMap.description]: data.description } : {})
    }));
  })();

  // 3. Iterate over original data, compare, and track processed codes.
  const processedOriginalCodes = new Set<string>();
  const resultsFromOriginal = dataToIterate.map((originalRow): ComparisonResult | null => {
    const originalCode = String(originalRow[originalMap.code!]);
    const originalQuantityRaw = originalRow[originalMap.quantity!];
    const originalQuantity = normalizeQuantity(originalQuantityRaw);
    const originalDescription = originalMap.description ? String(originalRow[originalMap.description!]) : null;

    if (!originalCode) return null;

    processedOriginalCodes.add(originalCode);

    if (originalQuantity === null) {
      return {
        originalCode,
        originalQuantity: String(originalQuantityRaw),
        originalDescription,
        partialCode: null,
        partialQuantity: null,
        partialDescription: null,
        status: ResultStatus.INVALID_QUANTITY,
      };
    }

    const partialMatch = partialMapData.get(originalCode);

    if (!partialMatch) {
      return {
        originalCode,
        originalQuantity,
        originalDescription,
        partialCode: null,
        partialQuantity: null,
        partialDescription: null,
        status: ResultStatus.ABSENT,
      };
    }
    
    const { quantity: partialQuantity, description: partialDescription } = partialMatch;
    
    let status: ResultStatus;
    if (aggregate) {
      status = ResultStatus.QUANTITY_EQUAL;
    } else {
      const quantityDiff = Math.abs(originalQuantity - partialQuantity);
      if (quantityDiff < 1e-6) {
        status = ResultStatus.QUANTITY_EQUAL;
      } else {
        status = ResultStatus.QUANTITY_DIFFERENT;
      }
    }

    return {
      originalCode,
      originalQuantity,
      originalDescription,
      partialCode: originalCode,
      partialQuantity,
      partialDescription,
      status,
    };
  }).filter((r): r is ComparisonResult => r !== null);
  
  // 4. Any items in the partial map not found in original are "ABSENT_IN_ORIGINAL".
  const resultsFromPartial: ComparisonResult[] = [];
  for (const [code, data] of partialMapData.entries()) {
    if (!processedOriginalCodes.has(code)) {
      resultsFromPartial.push({
          originalCode: null,
          originalQuantity: null,
          originalDescription: null,
          partialCode: code,
          partialQuantity: data.quantity,
          partialDescription: data.description,
          status: ResultStatus.ABSENT_IN_ORIGINAL,
      });
    }
  }

  // 5. Combine all results.
  return [...resultsFromOriginal, ...resultsFromPartial];
};