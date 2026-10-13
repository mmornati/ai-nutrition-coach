import type { DatabaseFood } from '../entities/database-food';
import type { CatalogResult } from '../results/catalog';

export interface FoodCatalog {
  search(query: string, options?: { readonly limit?: number }): Promise<CatalogResult>;
  lookupBySourceRef(sourceRef: string): Promise<DatabaseFood | null>;
  /** An adapter without barcode support answers with a typed `catalogFailure`, never a throw. */
  lookupByBarcode(code: string): Promise<CatalogResult>;
}
