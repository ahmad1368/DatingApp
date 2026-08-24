import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProfileCompletionService } from './profile-completion.service';

const USER_ID = 'user-1';

function baseUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: USER_ID,
    name: null,
    dateOfBirth: null,
    genderIdentities: [],
    relationshipGoal: null,
    interests: [],
    voiceIntroUrl: null,
    instagramUserId: null,
    spotifyUserId: null,
    profileCompletionRewardGrantedAt: null,
    ...overrides,
  };
}

describe('ProfileCompletionService', () => {
  let service: ProfileCompletionService;
  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock };
    profilePhoto: { count: jest.Mock };
    profilePromptVoiceAnswer: { count: jest.Mock };
    boost: { create: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn() },
      profilePhoto: { count: jest.fn() },
      profilePromptVoiceAnswer: { count: jest.fn() },
      boost: { create: jest.fn() },
      $transaction: jest.fn(async (ops: unknown[]) => ops),
    };
    service = new ProfileCompletionService(prisma as unknown as PrismaService);
  });

  it('throws when the user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.getCompletion(USER_ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('scores an empty profile at 0% with nothing checked off', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser());
    prisma.profilePhoto.count.mockResolvedValue(0);
    prisma.profilePromptVoiceAnswer.count.mockResolvedValue(0);

    const result = await service.getCompletion(USER_ID);

    expect(result.percentage).toBe(0);
    expect(result.checklist.every((item) => !item.completed)).toBe(true);
    expect(result.rewardGranted).toBe(false);
    expect(prisma.boost.create).not.toHaveBeenCalled();
  });

  it('credits interests and photos only once the minimum count is met', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser({ interests: ['hiking', 'jazz'] }));
    prisma.profilePhoto.count.mockResolvedValue(2);
    prisma.profilePromptVoiceAnswer.count.mockResolvedValue(0);

    const result = await service.getCompletion(USER_ID);

    expect(result.checklist.find((i) => i.id === 'interests')?.completed).toBe(false);
    expect(result.checklist.find((i) => i.id === 'photos')?.completed).toBe(false);
  });

  it('grants a one-time boost the first time the profile reaches 100%', async () => {
    prisma.user.findUnique.mockResolvedValue(
      baseUser({
        name: 'Alex',
        dateOfBirth: new Date('1995-01-01'),
        genderIdentities: ['woman'],
        relationshipGoal: 'long-term',
        interests: ['hiking', 'jazz', 'cooking'],
        voiceIntroUrl: 'https://example.com/voice.mp3',
        instagramUserId: 'ig-1',
      }),
    );
    prisma.profilePhoto.count.mockResolvedValue(3);
    prisma.profilePromptVoiceAnswer.count.mockResolvedValue(1);

    const result = await service.getCompletion(USER_ID);

    expect(result.percentage).toBe(100);
    expect(result.rewardGranted).toBe(true);
    expect(prisma.boost.create).toHaveBeenCalledWith({
      data: { userId: USER_ID, expiresAt: expect.any(Date) },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { profileCompletionRewardGrantedAt: expect.any(Date) },
    });
  });

  it('does not grant a second boost once the reward was already claimed', async () => {
    prisma.user.findUnique.mockResolvedValue(
      baseUser({
        name: 'Alex',
        dateOfBirth: new Date('1995-01-01'),
        genderIdentities: ['woman'],
        relationshipGoal: 'long-term',
        interests: ['hiking', 'jazz', 'cooking'],
        voiceIntroUrl: 'https://example.com/voice.mp3',
        instagramUserId: 'ig-1',
        profileCompletionRewardGrantedAt: new Date('2026-01-01'),
      }),
    );
    prisma.profilePhoto.count.mockResolvedValue(3);
    prisma.profilePromptVoiceAnswer.count.mockResolvedValue(1);

    const result = await service.getCompletion(USER_ID);

    expect(result.percentage).toBe(100);
    expect(result.rewardGranted).toBe(false);
    expect(prisma.boost.create).not.toHaveBeenCalled();
  });
});
