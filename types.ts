export enum AppStep {
  UPLOAD,
  MAPPING,
  RESULTS,
}

export enum ResultStatus {
  ABSENT_IN_ORIGINAL = "Cod. Assenti in Distinta Cliente",
  ABSENT = "Cod. Assenti in Distinta Gestionale",
  QUANTITY_DIFFERENT = "Quantità diversa",
  QUANTITY_EQUAL = "Quantità uguale",
  INVALID_QUANTITY = "Quantità non interpretabile",
}

export interface RowData {
  [key: string]: string | number;
}

export interface ParsedFile {
  name: string;
  headers: string[];
  data: RowData[];
}

export interface Mapping {
  code: string | null;
  quantity: string | null;
  description: string | null;
}

export interface Mappings {
  original: Mapping;
  partial: Mapping;
}

export interface ComparisonResult {
  partialCode: string | number | null;
  partialQuantity: string | number | null;
  partialDescription: string | null;
  originalCode: string | number | null;
  originalQuantity: string | number | null;
  originalDescription: string | null;
  status: ResultStatus;
}

export interface MappingProfile {
  name: string;
  mappings: Mappings;
}

export enum RuleType {
  MERGE = 'UNIONE',
  EXCLUDE = 'ESCLUDI',
}

export type TransformationRule =
  | {
      type: RuleType.MERGE;
      sourceCodes: string[];
      resultCode: string;
      resultDescription: string;
    }
  | {
      type: RuleType.EXCLUDE;
      // Il valore grezzo dalla colonna 'Codici da unire' per una regola di esclusione.
      // Può essere un codice, codici separati da '+', o una stringa di filtro per la descrizione.
      value: string;
    };