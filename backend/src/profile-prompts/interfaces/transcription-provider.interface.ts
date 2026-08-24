export const TRANSCRIPTION_PROVIDER = Symbol('TRANSCRIPTION_PROVIDER');

export interface TranscriptionProvider {
  transcribe(audioUrl: string): Promise<string>;
}
