import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { FaceMatchProvider } from './interfaces/face-match-provider.interface';
import { SELFIE_GESTURES } from './verification.constants';
import { VerificationService } from './verification.service';

const USER_ID = 'user-1';

describe('VerificationService', () => {
  let service: VerificationService;
  let prisma: {
    selfieVerificationChallenge: { create: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
    user: { findUnique: jest.Mock; update: jest.Mock };
  };
  let faceMatchProvider: FaceMatchProvider;

  beforeEach(() => {
    prisma = {
      selfieVerificationChallenge: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    faceMatchProvider = { compare: jest.fn() };

    const configService = {
      get: (key: string) => {
        const values: Record<string, string> = {
          SELFIE_CHALLENGE_TTL_SECONDS: '120',
          SELFIE_MIN_MATCH_CONFIDENCE: '0.8',
        };
        return values[key];
      },
    } as unknown as ConfigService;

    service = new VerificationService(
      prisma as unknown as PrismaService,
      configService,
      faceMatchProvider,
    );
  });

  describe('requestChallenge', () => {
    it('creates a challenge with a gesture from the allowed list and returns the TTL', async () => {
      prisma.selfieVerificationChallenge.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: 'challenge-1', ...data }),
      );

      const result = await service.requestChallenge(USER_ID);

      expect(prisma.selfieVerificationChallenge.create).toHaveBeenCalledTimes(1);
      expect(SELFIE_GESTURES).toContain(result.gesture);
      expect(result).toEqual({
        challengeId: 'challenge-1',
        gesture: result.gesture,
        expiresInSeconds: 120,
      });
    });
  });

  describe('submitSelfie', () => {
    it('throws when no pending challenge exists', async () => {
      prisma.selfieVerificationChallenge.findFirst.mockResolvedValue(null);

      await expect(service.submitSelfie(USER_ID, 'challenge-1', 'data')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws when the challenge has expired', async () => {
      prisma.selfieVerificationChallenge.findFirst.mockResolvedValue({
        id: 'challenge-1',
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.submitSelfie(USER_ID, 'challenge-1', 'data')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws NotFoundException when the user does not exist', async () => {
      prisma.selfieVerificationChallenge.findFirst.mockResolvedValue({
        id: 'challenge-1',
        expiresAt: new Date(Date.now() + 60_000),
      });
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.submitSelfie(USER_ID, 'challenge-1', 'data')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws when the user has no profile photo set', async () => {
      prisma.selfieVerificationChallenge.findFirst.mockResolvedValue({
        id: 'challenge-1',
        expiresAt: new Date(Date.now() + 60_000),
      });
      prisma.user.findUnique.mockResolvedValue({ id: USER_ID, profilePhotoUrl: null });

      await expect(service.submitSelfie(USER_ID, 'challenge-1', 'data')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('marks the user verified when the face match succeeds above the confidence threshold', async () => {
      prisma.selfieVerificationChallenge.findFirst.mockResolvedValue({
        id: 'challenge-1',
        expiresAt: new Date(Date.now() + 60_000),
      });
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        profilePhotoUrl: 'https://example.com/photo.jpg',
      });
      prisma.selfieVerificationChallenge.update.mockResolvedValue({});
      (faceMatchProvider.compare as jest.Mock).mockResolvedValue({ isMatch: true, confidence: 0.95 });

      const result = await service.submitSelfie(USER_ID, 'challenge-1', 'selfie-data');

      expect(prisma.selfieVerificationChallenge.update).toHaveBeenCalledWith({
        where: { id: 'challenge-1' },
        data: { consumedAt: expect.any(Date) },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { isVerified: true, verifiedAt: expect.any(Date) },
      });
      expect(result).toEqual({ isVerified: true, confidence: 0.95 });
    });

    it('does not verify the user when the confidence is below the threshold', async () => {
      prisma.selfieVerificationChallenge.findFirst.mockResolvedValue({
        id: 'challenge-1',
        expiresAt: new Date(Date.now() + 60_000),
      });
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        profilePhotoUrl: 'https://example.com/photo.jpg',
      });
      prisma.selfieVerificationChallenge.update.mockResolvedValue({});
      (faceMatchProvider.compare as jest.Mock).mockResolvedValue({ isMatch: true, confidence: 0.5 });

      const result = await service.submitSelfie(USER_ID, 'challenge-1', 'selfie-data');

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(result).toEqual({ isVerified: false, confidence: 0.5 });
    });
  });
});
