import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { FACE_MATCH_PROVIDER, FaceMatchProvider } from './interfaces/face-match-provider.interface';
import {
  DEFAULT_CHALLENGE_TTL_SECONDS,
  DEFAULT_MIN_MATCH_CONFIDENCE,
  DEFAULT_REVERIFICATION_INTERVAL_DAYS,
  ReverificationReason,
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

export interface VerificationStatusResult {
  isVerified: boolean;
  verifiedAt: string | null;
  reverificationDue: boolean;
  reverificationReason: ReverificationReason | null;
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

  private get reverificationIntervalDays(): number {
    return Number(
      this.configService.get('REVERIFICATION_INTERVAL_DAYS') ?? DEFAULT_REVERIFICATION_INTERVAL_DAYS,
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
        data: { isVerified: true, verifiedAt: new Date(), verifiedPhotoUrl: user.profilePhotoUrl },
      });
    }

    return { isVerified, confidence: matchResult.confidence };
  }

  /**
   * Whether this user needs to redo selfie verification: either their
   * profile photo has changed since the photo their last successful
   * verification was matched against (the "major profile photo change"
   * trigger, guarding against a takeover/impersonation swapping in a
   * different face), or enough time has simply passed since that
   * verification (the periodic re-check). Unverified users are never due -
   * there's nothing to re-check yet.
   */
  async getVerificationStatus(userId: string): Promise<VerificationStatusResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isVerified: true, verifiedAt: true, profilePhotoUrl: true, verifiedPhotoUrl: true },
    });
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    if (!user.isVerified) {
      return { isVerified: false, verifiedAt: null, reverificationDue: false, reverificationReason: null };
    }

    let reverificationReason: ReverificationReason | null = null;
    if (user.profilePhotoUrl !== user.verifiedPhotoUrl) {
      reverificationReason = 'PHOTO_CHANGED';
    } else if (user.verifiedAt) {
      const dueAt = new Date(user.verifiedAt);
      dueAt.setUTCDate(dueAt.getUTCDate() + this.reverificationIntervalDays);
      if (dueAt.getTime() <= Date.now()) {
        reverificationReason = 'PERIODIC';
      }
    }

    return {
      isVerified: true,
      verifiedAt: user.verifiedAt?.toISOString() ?? null,
      reverificationDue: reverificationReason !== null,
      reverificationReason,
    };
  }
}
