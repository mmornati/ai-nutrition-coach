import type { DatabaseFood } from '../entities/database-food';
import type { CatalogResult } from '../results/catalog';

export interface FoodCatalog {
  /**
   * `locale` asks for the names and the ranking in a language other than the app's (a recipe pasted
   * in French while the app is in English); an adapter that has no such notion ignores it.
   */
  search(
    query: string,
    options?: { readonly limit?: number; readonly locale?: 'en' | 'fr' },
  ): Promise<CatalogResult>;
  lookupBySourceRef(sourceRef: string): Promise<DatabaseFood | null>;
  /** An adapter without barcode support answers with a typed `catalogFailure`, never a throw. */
  lookupByBarcode(code: string): Promise<CatalogResult>;
}
