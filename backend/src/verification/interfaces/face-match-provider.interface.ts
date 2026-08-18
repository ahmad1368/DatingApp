export const FACE_MATCH_PROVIDER = Symbol('FACE_MATCH_PROVIDER');

export interface FaceMatchResult {
  isMatch: boolean;
  confidence: number;
}

export interface FaceMatchProvider {
  compare(referenceImageUrl: string, selfieImageBase64: string): Promise<FaceMatchResult>;
}
