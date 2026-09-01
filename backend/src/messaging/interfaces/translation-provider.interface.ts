export const TRANSLATION_PROVIDER = Symbol('TRANSLATION_PROVIDER');

export interface TranslationProvider {
  translate(text: string, targetLanguage: string): Promise<string>;
}
