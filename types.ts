export enum AppStep {
  UPLOAD,
  MAPPING,
  RESULTS,
}

export enum ResultStatus {
  ABSENT_IN_ORIGINAL = "Cod. Assenti in Distinta Cliente",
  ABSENT = "Cod. Assenti in Distinta Gestionale",
  QUANTITY_DIFFERENT = "Quantità diversa",
  REVISION_DIFFERENT = "Revisione diversa",
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
  revision: string | null;
  category: string | null;
}

export interface Mappings {
  original: Mapping;
  partial: Mapping;
}

export interface ComparisonResult {
  partialCode: string | number | null;
  partialQuantity: string | number | null;
  partialDescription: string | null;
  partialRevision: string | null;
  partialCategory: string | null;
  originalCode: string | number | null;
  originalQuantity: string | number | null;
  originalDescription: string | null;
  originalRevision: string | null;
  originalCategory: string | null;
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

export enum ExcludeSubType {
  CODE_EXACT = 'CODE_EXACT',
  CODE_PREFIX = 'CODE_PREFIX',
  DESCRIPTION_CONTAINS = 'DESCRIPTION_CONTAINS',
  DESCRIPTION_PREFIX = 'DESCRIPTION_PREFIX',
  CATEGORY_EXACT = 'CATEGORY_EXACT',
}

export type TransformationRule =
  | {
      type: RuleType.MERGE;
      sourceCodes: string[];
      resultCode: string;
      resultDescription: string;
      enabled?: boolean;
    }
  | {
      type: RuleType.EXCLUDE;
      subType: ExcludeSubType;
      value: string;
      enabled?: boolean;
    };