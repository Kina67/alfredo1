import type { ComparisonResult, ResultStatus } from '../types';
import { ResultStatus as EResultStatus } from '../types';

declare var XLSX: any;

const getExportHeaders = () => {
    const sourcePrefix = 'Cliente';
    const targetPrefix = 'Gestionale';
    return {
        sourceCode: `Codice_${sourcePrefix}`,
        sourceQty: `Q_${sourcePrefix}`,
        sourceDesc: `Descrizione_${sourcePrefix}`,
        targetCode: `Codice_${targetPrefix}_Corrispondente`,
        targetQty: `Q_${targetPrefix}`,
        targetDesc: `Descrizione_${targetPrefix}`,
        status: 'Esito',
    };
};

const formatResultsForExport = (results: ComparisonResult[]) => {
  const h = getExportHeaders();
  return results.map(r => ({
    [h.sourceCode]: r.originalCode,
    [h.sourceQty]: r.originalQuantity,
    [h.sourceDesc]: r.originalDescription,
    [h.targetCode]: r.partialCode,
    [h.targetQty]: r.partialQuantity,
    [h.targetDesc]: r.partialDescription,
    [h.status]: r.status,
  }));
};

export const exportToExcel = (
  results: ComparisonResult[],
  stats: Record<ResultStatus, number>,
  filename: string = 'confronto_bom.xlsx'
) => {
  const sourceFileLabel = 'Cliente';

  // 1. Dati per il foglio di Riepilogo
  const summaryData = [
    { Statistica: `Totale Codici`, Valore: results.length },
    ...Object.entries(stats).map(([status, value]) => ({ Statistica: status, Valore: value })),
  ];

  // 2. Dati filtrati per gli altri fogli
  const absentInOriginalResults = results.filter(r => r.status === EResultStatus.ABSENT_IN_ORIGINAL);
  const absentResults = results.filter(r => r.status === EResultStatus.ABSENT);
  const diffResults = results.filter(r => r.status === EResultStatus.QUANTITY_DIFFERENT);
  
  // 3. Formattazione dei dati per l'export
  const formattedTotal = formatResultsForExport(results);
  const formattedAbsentInOriginal = formatResultsForExport(absentInOriginalResults);
  const formattedAbsent = formatResultsForExport(absentResults);
  const formattedDiff = formatResultsForExport(diffResults);

  // 4. Creazione dei fogli di lavoro
  const riepilogoWS = XLSX.utils.json_to_sheet(summaryData);
  const totalWS = XLSX.utils.json_to_sheet(formattedTotal);
  const absentInOriginalWS = XLSX.utils.json_to_sheet(formattedAbsentInOriginal);
  const absentWS = XLSX.utils.json_to_sheet(formattedAbsent);
  const diffWS = XLSX.utils.json_to_sheet(formattedDiff);

  // 5. Creazione del workbook e aggiunta dei fogli
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, riepilogoWS, 'Riepilogo');
  XLSX.utils.book_append_sheet(workbook, totalWS, `Totale Risultati`);
  XLSX.utils.book_append_sheet(workbook, absentInOriginalWS, EResultStatus.ABSENT_IN_ORIGINAL);
  XLSX.utils.book_append_sheet(workbook, absentWS, EResultStatus.ABSENT);
  XLSX.utils.book_append_sheet(workbook, diffWS, EResultStatus.QUANTITY_DIFFERENT);

  // 6. Scrittura del file
  XLSX.writeFile(workbook, filename);
};


export const exportToCsv = (results: ComparisonResult[], filename: string = 'confronto_bom.csv', separator: ',' | '\t' = ',') => {
  const formattedResults = formatResultsForExport(results);
  if (formattedResults.length === 0) return;

  const headers = Object.keys(formattedResults[0]);
  const csvContent = [
    headers.join(separator),
    ...formattedResults.map(row =>
      headers.map(header => {
        let cell = (row as any)[header];
        if (cell === null || cell === undefined) {
          cell = '';
        }
        let cellString = String(cell);
        if (cellString.includes(separator) || cellString.includes('"') || cellString.includes('\n')) {
          cellString = `"${cellString.replace(/"/g, '""')}"`;
        }
        return cellString;
      }).join(separator)
    )
  ].join('\n');

  const blob = new Blob([csvContent], { type: separator === ',' ? 'text/csv;charset=utf-8;' : 'text/tab-separated-values;charset=utf-8;' });
  const link = document.createElement('a');
  if (link.href) {
    URL.revokeObjectURL(link.href);
  }
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};