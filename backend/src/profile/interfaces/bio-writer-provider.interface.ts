export const BIO_WRITER_PROVIDER = Symbol('BIO_WRITER_PROVIDER');

export interface BioGenerationContext {
  personalityTraits: string[];
  hobbies: string[];
  humorStyle: string | null;
  /** When set, treat this as a rewrite/polish task instead of writing from scratch. */
  existingBio: string | null;
}

export interface BioSuggestions {
  bios: string[];
}

export interface BioWriterProvider {
  generateBio(context: BioGenerationContext): Promise<BioSuggestions>;
}
