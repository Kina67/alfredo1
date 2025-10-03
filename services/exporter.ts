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
  // 1. Dati per il foglio di Riepilogo
  const summaryData = [
    { Statistica: `Totale Codici`, Valore: results.length },
    ...Object.entries(stats).map(([status, value]) => ({ Statistica: status, Valore: value })),
  ];
  const riepilogoWS = XLSX.utils.json_to_sheet(summaryData);

  // 2. Dati per il foglio con tutti i risultati
  const formattedTotal = formatResultsForExport(results);
  const totalWS = XLSX.utils.json_to_sheet(formattedTotal);

  // 3. Creazione del workbook e aggiunta dei fogli principali
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, riepilogoWS, 'Riepilogo');
  XLSX.utils.book_append_sheet(workbook, totalWS, 'Totale Risultati');

  // 4. Dati e fogli per le singole categorie, aggiunti solo se non vuoti
  const categorySheets = [
    {
      status: EResultStatus.ABSENT_IN_ORIGINAL,
      sheetName: 'Assenti_Cliente',
    },
    {
      status: EResultStatus.ABSENT,
      sheetName: 'Assenti_Gestionale',
    },
    {
      status: EResultStatus.QUANTITY_DIFFERENT,
      sheetName: 'Qta_Diverse',
    },
  ];

  for (const { status, sheetName } of categorySheets) {
    const filteredData = results.filter(r => r.status === status);
    if (filteredData.length > 0) {
      const formattedData = formatResultsForExport(filteredData);
      const worksheet = XLSX.utils.json_to_sheet(formattedData);
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    }
  }

  // 5. Scrittura del file
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