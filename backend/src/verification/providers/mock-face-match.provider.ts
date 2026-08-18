import { Injectable, Logger } from '@nestjs/common';
import { FaceMatchProvider, FaceMatchResult } from '../interfaces/face-match-provider.interface';

@Injectable()
export class MockFaceMatchProvider implements FaceMatchProvider {
  private readonly logger = new Logger(MockFaceMatchProvider.name);

  async compare(referenceImageUrl: string, selfieImageBase64: string): Promise<FaceMatchResult> {
    this.logger.log(
      `Comparing selfie (${selfieImageBase64.length} bytes base64) against reference photo ${referenceImageUrl}`,
    );
    return { isMatch: true, confidence: 1 };
  }
}
