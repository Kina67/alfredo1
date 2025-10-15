
import { Mapping } from './types';

export const MAPPABLE_FIELDS: { id: keyof Mapping; label: string; required: boolean }[] = [
  { id: 'code', label: 'Codice', required: true },
  { id: 'quantity', label: 'Quantità', required: true },
  { id: 'description', label: 'Descrizione', required: false },
  { id: 'revision', label: 'Revisione', required: false },
  { id: 'category', label: 'Categoria Merceologica', required: false },
];

export const INITIAL_MAPPINGS = {
  original: { code: null, quantity: null, description: null, revision: null, category: null },
  partial: { code: null, quantity: null, description: null, revision: null, category: null },
};
