/** Admin vocabulary page: library data-common by one entry, nail variations
 * by one title or option. */

export interface CatalogueVocabularyIndex {
  library: {
    shapes: string[];
    lengths: string[];
    colors: string[];
  };
  nail: Array<{ key: string; options: string[] }>;
}

export type CatalogueLibraryPart = 'shape' | 'length' | 'color';
