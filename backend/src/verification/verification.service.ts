import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { FACE_MATCH_PROVIDER, FaceMatchProvider } from './interfaces/face-match-provider.interface';
import {
  DEFAULT_CHALLENGE_TTL_SECONDS,
  DEFAULT_MIN_MATCH_CONFIDENCE,
  SELFIE_GESTURES,
  SelfieGesture,
} from './verification.constants';

export interface RequestChallengeResult {
  challengeId: string;
  gesture: SelfieGesture;
  expiresInSeconds: number;
}

export interface SubmitSelfieResult {
  isVerified: boolean;
  confidence: number;
}

@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Inject(FACE_MATCH_PROVIDER) private readonly faceMatchProvider: FaceMatchProvider,
  ) {}

  private get challengeTtlSeconds(): number {
    return Number(
      this.configService.get('SELFIE_CHALLENGE_TTL_SECONDS') ?? DEFAULT_CHALLENGE_TTL_SECONDS,
    );
  }

  private get minMatchConfidence(): number {
    return Number(
      this.configService.get('SELFIE_MIN_MATCH_CONFIDENCE') ?? DEFAULT_MIN_MATCH_CONFIDENCE,
    );
  }

  async requestChallenge(userId: string): Promise<RequestChallengeResult> {
    const gesture = SELFIE_GESTURES[Math.floor(Math.random() * SELFIE_GESTURES.length)];
    const expiresAt = new Date(Date.now() + this.challengeTtlSeconds * 1000);

    const challenge = await this.prisma.selfieVerificationChallenge.create({
      data: { userId, gesture, expiresAt },
    });

    return {
      challengeId: challenge.id,
      gesture: challenge.gesture as SelfieGesture,
      expiresInSeconds: this.challengeTtlSeconds,
    };
  }

  async submitSelfie(
    userId: string,
    challengeId: string,
    selfieImageBase64: string,
  ): Promise<SubmitSelfieResult> {
    const challenge = await this.prisma.selfieVerificationChallenge.findFirst({
      where: { id: challengeId, userId, consumedAt: null },
    });

    if (!challenge) {
      throw new BadRequestException('No pending verification challenge found. Please request a new one.');
    }

    if (challenge.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Verification challenge has expired. Please request a new one.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    if (!user.profilePhotoUrl) {
      throw new BadRequestException('Set a profile photo before requesting verification.');
    }

    await this.prisma.selfieVerificationChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: new Date() },
    });

    const matchResult = await this.faceMatchProvider.compare(user.profilePhotoUrl, selfieImageBase64);
    const isVerified = matchResult.isMatch && matchResult.confidence >= this.minMatchConfidence;

    if (isVerified) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { isVerified: true, verifiedAt: new Date() },
      });
    }

    return { isVerified, confidence: matchResult.confidence };
  }
}
