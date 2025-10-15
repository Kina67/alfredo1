import type { ParsedFile, RowData, Mappings, ComparisonResult, TransformationRule } from '../types';
import { ResultStatus, RuleType, ExcludeSubType } from '../types';

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
        
        const descriptionExclusionRegex = /(?:TUTTI\s+LE\s+)?DESCRIZIONI\s+CONTENENTI\s*"([^"]+)"/i;
        const descriptionStartsWithRegex = /(?:TUTTI\s+LE\s+)?DESCRIZIONI\s+CHE\s+INIZIA(?:NO)?\s+(?:PER|CON)\s*"([^"]+)"/i;
        const codeStartsWithRegex = /(?:TUTTI\s+I\s+)?CODIC[EI]\s+CHE\s+INIZIA(?:NO)?\s+(?:PER|CON)\s*"([^"]+)"/i;
        const categoryExclusionRegex = /(?:TUTTE\s+LE\s+)?CATEGORIE\s+MERCEOLOGICHE\s+"([^"]+)"/i;

        const rules: TransformationRule[] = jsonData.map((row): TransformationRule | null => {
          const type = String(row['Tipo'] || '').trim().toUpperCase();
          const codesOrValue = String(row['Codici da unire'] || row['Valore'] || '').trim();
          
          if (!type || !codesOrValue) {
              return null;
          }
          
          if (type === RuleType.MERGE) {
            const sourceCodes = codesOrValue.split('+').map(c => c.trim()).filter(Boolean);
            const resultCode = String(row['Codice risultante']);
            const resultDescription = String(row['Descrizione risultante']);
            if (!resultCode || sourceCodes.length < 1) return null;
            return { type: RuleType.MERGE, sourceCodes, resultCode, resultDescription, enabled: true };
          
          } else if (type === RuleType.EXCLUDE) {
              const subTypeStr = String(row['Sotto-tipo'] || '').trim();
              if (subTypeStr && Object.values(ExcludeSubType).includes(subTypeStr as ExcludeSubType)) {
                   return { type: RuleType.EXCLUDE, subType: subTypeStr as ExcludeSubType, value: codesOrValue, enabled: true };
              }

              // Retro-compatibilità: Analizza la stringa per determinare il sotto-tipo
              const descriptionMatch = codesOrValue.match(descriptionExclusionRegex);
              if (descriptionMatch?.[1]) {
                  return { type: RuleType.EXCLUDE, subType: ExcludeSubType.DESCRIPTION_CONTAINS, value: descriptionMatch[1], enabled: true };
              }
              const descriptionPrefixMatch = codesOrValue.match(descriptionStartsWithRegex);
              if (descriptionPrefixMatch?.[1]) {
                  return { type: RuleType.EXCLUDE, subType: ExcludeSubType.DESCRIPTION_PREFIX, value: descriptionPrefixMatch[1], enabled: true };
              }
              const codePrefixMatch = codesOrValue.match(codeStartsWithRegex);
              if (codePrefixMatch?.[1]) {
                  return { type: RuleType.EXCLUDE, subType: ExcludeSubType.CODE_PREFIX, value: codePrefixMatch[1], enabled: true };
              }
              const categoryMatch = codesOrValue.match(categoryExclusionRegex);
              if (categoryMatch?.[1]) {
                   return { type: RuleType.EXCLUDE, subType: ExcludeSubType.CATEGORY_EXACT, value: categoryMatch[1], enabled: true };
              }
              // Default a codici esatti
              return { type: RuleType.EXCLUDE, subType: ExcludeSubType.CODE_EXACT, value: codesOrValue, enabled: true };
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
  descriptionColumn: string | null,
  categoryColumn: string | null
): ParsedFile => {
  let data = [...parsedFile.data];
  
  const activeRules = rules.filter(r => r.enabled !== false);

  const excludeRules = activeRules.filter((r): r is Extract<TransformationRule, {type: RuleType.EXCLUDE}> => r.type === RuleType.EXCLUDE);
  const mergeRules = activeRules.filter((r): r is Extract<TransformationRule, {type: RuleType.MERGE}> => r.type === RuleType.MERGE);

  // 1. Apply EXCLUDE rules
  if (excludeRules.length > 0) {
    data = data.filter(row => {
      for (const rule of excludeRules) {
        switch (rule.subType) {
          case ExcludeSubType.CODE_EXACT: {
            const codeExclusionSet = new Set(rule.value.split('+').map(c => c.trim()));
            if (codeExclusionSet.has(String(row[codeColumn]))) return false;
            break;
          }
          case ExcludeSubType.CODE_PREFIX: {
            if (String(row[codeColumn]).startsWith(rule.value)) return false;
            break;
          }
          case ExcludeSubType.DESCRIPTION_CONTAINS: {
            if (descriptionColumn && String(row[descriptionColumn] || '').toUpperCase().includes(rule.value.toUpperCase())) {
              return false;
            }
            break;
          }
          case ExcludeSubType.DESCRIPTION_PREFIX: {
            if (descriptionColumn && String(row[descriptionColumn] || '').toUpperCase().startsWith(rule.value.toUpperCase())) {
              return false;
            }
            break;
          }
          case ExcludeSubType.CATEGORY_EXACT: {
            if (categoryColumn && String(row[categoryColumn] || '').trim() === rule.value) {
              return false;
            }
            break;
          }
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
          const processedCodes = new Set<string>();
          const totalQuantity = rowsToMerge.reduce((sum, row) => {
            const code = String(row[codeColumn]);
            if (!processedCodes.has(code)) {
              processedCodes.add(code);
              const quantity = normalizeQuantity(row[quantityColumn]);
              return sum + (quantity || 0);
            }
            return sum;
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
  aggregate: boolean,
  options: { ignoreRevision: boolean }
): ComparisonResult[] => {
  const { original: originalMap, partial: partialMap } = mappings;

  if (!originalMap.code || !originalMap.quantity || !partialMap.code || !partialMap.quantity) {
    throw new Error("Mappatura colonne obbligatorie mancante.");
  }

  const getKey = (code: any, revision: any): string => {
    if (options.ignoreRevision) {
      return String(code);
    }
    return `${String(code)}::${String(revision ?? '')}`;
  };

  // 1. Build maps from partial data for efficient lookup.
  const partialMapData = new Map<string, { quantity: number; description: string | null; revision: string | null; category: string | null; }>();
  const partialCodeToRevisions = new Map<string, { revision: string | null; description: string | null; quantity: number; category: string | null; }[]>();

  for (const row of partialData.data) {
    const code = String(row[partialMap.code]);
    const quantity = normalizeQuantity(row[partialMap.quantity]);
    const description = partialMap.description ? String(row[partialMap.description]) : null;
    const revision = partialMap.revision ? String(row[partialMap.revision]) : null;
    const category = partialMap.category ? String(row[partialMap.category]) : null;

    if (code && quantity !== null) {
      // Aggregate by full key (code + revision OR just code)
      const key = getKey(code, revision);
      if (partialMapData.has(key)) {
        const existing = partialMapData.get(key)!;
        existing.quantity += quantity;
      } else {
        partialMapData.set(key, { quantity, description, revision, category });
      }

      // Store all revisions for a given code, aggregated (only needed if we are checking revisions)
      if (!options.ignoreRevision) {
          if (!partialCodeToRevisions.has(code)) {
            partialCodeToRevisions.set(code, []);
          }
          const revisionList = partialCodeToRevisions.get(code)!;
          const existingRevisionEntry = revisionList.find(r => r.revision === revision);
          if (existingRevisionEntry) {
              existingRevisionEntry.quantity += quantity;
          } else {
              revisionList.push({ revision, description, quantity, category });
          }
      }
    }
  }
  
  // 2. Iterate over original data, compare, and generate main results.
  const processedPartialKeysForMainLoop = new Set<string>();
  const resultsFromOriginal: ComparisonResult[] = [];

  if (aggregate) {
    // AGGREGATED PATH: Group original rows, but decide to show aggregated or detailed view based on quantity match.
    const originalAggregatedData = new Map<string, { quantity: number; description: string | null; revision: string | null; category: string | null; rows: RowData[] }>();
    for (const row of originalData.data) {
        const code = String(row[originalMap.code!]);
        const quantity = normalizeQuantity(row[originalMap.quantity!]);
        const description = originalMap.description ? String(row[originalMap.description]) : null;
        const revision = originalMap.revision ? String(row[originalMap.revision!]) : null;
        const category = originalMap.category ? String(row[originalMap.category!]) : null;
        
        if(code) {
            const key = getKey(code, revision);
            if (originalAggregatedData.has(key)) {
                const existing = originalAggregatedData.get(key)!;
                if(quantity !== null) existing.quantity += quantity;
                existing.rows.push(row);
            } else {
                originalAggregatedData.set(key, { quantity: quantity ?? 0, description, revision, category, rows: [row] });
            }
        }
    }

    for (const [key, aggregatedInfo] of originalAggregatedData.entries()) {
        const originalCode = String(aggregatedInfo.rows[0][originalMap.code!]);
        const exactMatch = partialMapData.get(key);

        if (exactMatch) {
            processedPartialKeysForMainLoop.add(key);
            const { quantity: partialQuantity, description: partialDescription, revision: partialRevision, category: partialCategory } = exactMatch;
            const quantityDiff = Math.abs(aggregatedInfo.quantity - partialQuantity);
            const areQuantitiesEqual = quantityDiff < 1e-6;

            if (areQuantitiesEqual) {
                // Quantities match in aggregate, so show one aggregated row.
                resultsFromOriginal.push({
                    originalCode,
                    originalQuantity: aggregatedInfo.quantity,
                    originalDescription: aggregatedInfo.description,
                    originalRevision: aggregatedInfo.revision,
                    originalCategory: aggregatedInfo.category,
                    partialCode: originalCode, 
                    partialQuantity, 
                    partialDescription, 
                    partialRevision, 
                    partialCategory,
                    status: ResultStatus.QUANTITY_EQUAL,
                });
            } else {
                // Quantities differ in aggregate. "Explode" back to individual rows and re-compare each one
                // to get a detailed breakdown, mimicking the non-aggregated view for this specific code.
                aggregatedInfo.rows.forEach(originalRow => {
                    const oCode = String(originalRow[originalMap.code!]);
                    const oQtyRaw = originalRow[originalMap.quantity!];
                    const oQty = normalizeQuantity(oQtyRaw);
                    const oDesc = originalMap.description ? String(originalRow[originalMap.description!]) : null;
                    const oRev = originalMap.revision ? String(originalRow[originalMap.revision!]) : null;
                    const oCat = originalMap.category ? String(originalRow[originalMap.category!]) : null;

                    let status: ResultStatus;
                    if (oQty === null) {
                        status = ResultStatus.INVALID_QUANTITY;
                    } else {
                        // Re-compare this individual row's quantity with the aggregated partial quantity.
                        const individualQuantityDiff = Math.abs(oQty - partialQuantity);
                        status = (individualQuantityDiff < 1e-6)
                            ? ResultStatus.QUANTITY_EQUAL
                            : ResultStatus.QUANTITY_DIFFERENT;
                    }

                    resultsFromOriginal.push({
                        originalCode: oCode, 
                        originalQuantity: oQty === null ? String(oQtyRaw) : oQty, 
                        originalDescription: oDesc, 
                        originalRevision: oRev,
                        originalCategory: oCat,
                        partialCode: originalCode, 
                        partialQuantity, 
                        partialDescription, 
                        partialRevision,
                        partialCategory,
                        status: status,
                    });
                });
            }
        } else {
            const otherRevisions = !options.ignoreRevision ? partialCodeToRevisions.get(originalCode) : undefined;
            if (otherRevisions && otherRevisions.length > 0) {
                const firstOtherRevision = otherRevisions[0];
                resultsFromOriginal.push({
                    originalCode,
                    originalQuantity: aggregatedInfo.quantity,
                    originalDescription: aggregatedInfo.description,
                    originalRevision: aggregatedInfo.revision,
                    originalCategory: aggregatedInfo.category,
                    partialCode: originalCode,
                    partialQuantity: firstOtherRevision.quantity,
                    partialDescription: firstOtherRevision.description,
                    partialRevision: firstOtherRevision.revision,
                    partialCategory: firstOtherRevision.category,
                    status: ResultStatus.REVISION_DIFFERENT,
                });
                otherRevisions.forEach(rev => processedPartialKeysForMainLoop.add(getKey(originalCode, rev.revision)));
            } else {
                 // ABSENT: Group valid rows and show invalid ones separately.
                const validRows = aggregatedInfo.rows.filter(r => normalizeQuantity(r[originalMap.quantity!]) !== null);
                const invalidRows = aggregatedInfo.rows.filter(r => normalizeQuantity(r[originalMap.quantity!]) === null);

                if (validRows.length > 0) {
                    const totalQuantity = validRows.reduce((sum, row) => sum + (normalizeQuantity(row[originalMap.quantity!]) || 0), 0);
                    resultsFromOriginal.push({
                        originalCode,
                        originalQuantity: totalQuantity,
                        originalDescription: aggregatedInfo.description, // Use description from the aggregated group
                        originalRevision: aggregatedInfo.revision,     // Use revision from the aggregated group
                        originalCategory: aggregatedInfo.category,
                        partialCode: null, partialQuantity: null, partialDescription: null, partialRevision: null, partialCategory: null,
                        status: ResultStatus.ABSENT,
                    });
                }
                
                invalidRows.forEach(row => {
                    resultsFromOriginal.push({
                        originalCode: String(row[originalMap.code!]), 
                        originalQuantity: String(row[originalMap.quantity!]), 
                        originalDescription: originalMap.description ? String(row[originalMap.description!]) : null, 
                        originalRevision: originalMap.revision ? String(row[originalMap.revision!]) : null,
                        originalCategory: originalMap.category ? String(row[originalMap.category!]) : null,
                        partialCode: null, partialQuantity: null, partialDescription: null, partialRevision: null, partialCategory: null,
                        status: ResultStatus.INVALID_QUANTITY,
                    });
                });
            }
        }
    }
  } else {
    // NON-AGGREGATED PATH: One result per row, but ABSENT items are grouped.
    const absentItemsAggregator = new Map<string, { quantity: number; firstRow: RowData; }>();

    for (const originalRow of originalData.data) {
        const originalCode = String(originalRow[originalMap.code!]);
        const originalQuantityRaw = originalRow[originalMap.quantity!];
        const originalQuantity = normalizeQuantity(originalQuantityRaw);
        const originalDescription = originalMap.description ? String(originalRow[originalMap.description!]) : null;
        const originalRevision = originalMap.revision ? String(originalRow[originalMap.revision!]) : null;
        const originalCategory = originalMap.category ? String(originalRow[originalMap.category!]) : null;

        if (!originalCode) continue;

        if (originalQuantity === null) {
          resultsFromOriginal.push({
            originalCode, originalQuantity: String(originalQuantityRaw), originalDescription, originalRevision, originalCategory,
            partialCode: null, partialQuantity: null, partialDescription: null, partialRevision: null, partialCategory: null,
            status: ResultStatus.INVALID_QUANTITY,
          });
          continue;
        }
        
        const key = getKey(originalCode, originalRevision);
        const exactMatch = partialMapData.get(key);

        if (exactMatch) {
          processedPartialKeysForMainLoop.add(key);
          const { quantity: partialQuantity, description: partialDescription, revision: partialRevision, category: partialCategory } = exactMatch;
          
          const quantityDiff = Math.abs(originalQuantity - partialQuantity);
          const status = (quantityDiff < 1e-6) ? ResultStatus.QUANTITY_EQUAL : ResultStatus.QUANTITY_DIFFERENT;

          resultsFromOriginal.push({
            originalCode, originalQuantity, originalDescription, originalRevision, originalCategory,
            partialCode: originalCode, partialQuantity, partialDescription, partialRevision, partialCategory,
            status,
          });
        } else {
          const otherRevisions = !options.ignoreRevision ? partialCodeToRevisions.get(originalCode) : undefined;
          
          if (otherRevisions && otherRevisions.length > 0) {
            const firstOtherRevision = otherRevisions[0];
            resultsFromOriginal.push({
              originalCode, originalQuantity, originalDescription, originalRevision, originalCategory,
              partialCode: originalCode,
              partialQuantity: firstOtherRevision.quantity,
              partialDescription: firstOtherRevision.description,
              partialRevision: firstOtherRevision.revision,
              partialCategory: firstOtherRevision.category,
              status: ResultStatus.REVISION_DIFFERENT,
            });

            otherRevisions.forEach(rev => {
                processedPartialKeysForMainLoop.add(getKey(originalCode, rev.revision));
            });

          } else {
            // ABSENT: Add to aggregator instead of pushing directly.
            // Note: originalQuantity is guaranteed to be a number here due to the check at the top of the loop.
            if (absentItemsAggregator.has(key)) {
                const existing = absentItemsAggregator.get(key)!;
                existing.quantity += originalQuantity!;
            } else {
                absentItemsAggregator.set(key, {
                    quantity: originalQuantity!,
                    firstRow: originalRow,
                });
            }
          }
        }
    }
     // After the main loop, add the aggregated absent items to the results
    for (const [key, aggregatedInfo] of absentItemsAggregator.entries()) {
        const { quantity, firstRow } = aggregatedInfo;
        const originalCode = String(firstRow[originalMap.code!]);
        const originalDescription = originalMap.description ? String(firstRow[originalMap.description!]) : null;
        const originalRevision = originalMap.revision ? String(firstRow[originalMap.revision!]) : null;
        const originalCategory = originalMap.category ? String(firstRow[originalMap.category!]) : null;

        resultsFromOriginal.push({
            originalCode,
            originalQuantity: quantity,
            originalDescription,
            originalRevision,
            originalCategory,
            partialCode: null, partialQuantity: null, partialDescription: null, partialRevision: null, partialCategory: null,
            status: ResultStatus.ABSENT,
        });
    }
  }
  
  // 3. Build a definitive set of processed partial keys based on an aggregated view of the original data.
  //    This ensures the "Absent in Original" calculation is always consistent, regardless of display mode.
  const definitiveProcessedPartialKeys = new Set<string>();
  const originalAggregatedForCheck = new Map<string, { code: string; revision: string | null }>();
  for (const row of originalData.data) {
    const code = String(row[originalMap.code!]);
    if (!code) continue;
    const revision = originalMap.revision ? String(row[originalMap.revision!]) : null;
    const key = getKey(code, revision);
    if (!originalAggregatedForCheck.has(key)) {
        originalAggregatedForCheck.set(key, { code, revision });
    }
  }

  for (const [key, data] of originalAggregatedForCheck.entries()) {
      if (partialMapData.has(key)) {
          definitiveProcessedPartialKeys.add(key);
      } else {
          const otherRevisions = !options.ignoreRevision ? partialCodeToRevisions.get(data.code) : undefined;
          if (otherRevisions && otherRevisions.length > 0) {
              otherRevisions.forEach(rev => definitiveProcessedPartialKeys.add(getKey(data.code, rev.revision)));
          }
      }
  }
  
  // 4. Any items in the partial map not processed are "ABSENT_IN_ORIGINAL".
  const resultsFromPartial: ComparisonResult[] = [];
  for (const [key, data] of partialMapData.entries()) {
    if (!definitiveProcessedPartialKeys.has(key)) { // Use the definitive set for this check
      const [code] = key.split('::');
      resultsFromPartial.push({
          originalCode: null, originalQuantity: null, originalDescription: null, originalRevision: null, originalCategory: null,
          partialCode: code,
          partialQuantity: data.quantity,
          partialDescription: data.description,
          partialRevision: data.revision,
          partialCategory: data.category,
          status: ResultStatus.ABSENT_IN_ORIGINAL,
      });
    }
  }

  // 5. Combine all results.
  return [...resultsFromOriginal, ...resultsFromPartial];
};