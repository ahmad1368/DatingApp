import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MatchingService } from '../matching/matching.service';
import { AiCoachProvider } from './interfaces/ai-coach-provider.interface';
import { RelationshipCoachService } from './relationship-coach.service';

const USER_ID = 'user-1';
const OTHER_USER_ID = 'user-2';
const MATCH_ID = 'match-1';

describe('RelationshipCoachService', () => {
  let service: RelationshipCoachService;
  let prisma: {
    user: { findUnique: jest.Mock };
    match: { findMany: jest.Mock; findUnique: jest.Mock };
    profilePromptVoiceAnswer: { findMany: jest.Mock };
    message: { findFirst: jest.Mock };
  };
  let matchingService: { getCompatibility: jest.Mock };
  let coachProvider: { generateSuggestions: jest.Mock; generateSmartReplies: jest.Mock };

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn() },
      match: { findMany: jest.fn(), findUnique: jest.fn() },
      profilePromptVoiceAnswer: { findMany: jest.fn().mockResolvedValue([]) },
      message: { findFirst: jest.fn() },
    };
    matchingService = {
      getCompatibility: jest.fn().mockResolvedValue({
        percentage: null,
        sharedQuestionCount: 0,
        zodiacSign: null,
        otherZodiacSign: null,
        zodiacHarmony: null,
      }),
    };
    coachProvider = { generateSuggestions: jest.fn(), generateSmartReplies: jest.fn() };
    service = new RelationshipCoachService(
      prisma as unknown as PrismaService,
      matchingService as unknown as MatchingService,
      coachProvider as unknown as AiCoachProvider,
    );
  });

  it('throws when the user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.getTips(USER_ID)).rejects.toBeInstanceOf(NotFoundException);
    expect(coachProvider.generateSuggestions).not.toHaveBeenCalled();
  });

  it('summarizes engagement history and profile gaps for the provider', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: USER_ID,
      profilePhotoUrl: null,
      interests: [],
      voiceIntroUrl: null,
      videoSnippetUrl: 'https://example.com/clip.mp4',
      kinkTags: ['switch'],
      loveLanguages: [],
    });
    prisma.match.findMany.mockResolvedValue([
      {
        id: 'match-a',
        userAId: USER_ID,
        userBId: OTHER_USER_ID,
        messages: [
          { senderId: USER_ID },
          { senderId: OTHER_USER_ID },
          { senderId: OTHER_USER_ID },
        ],
      },
      { id: 'match-b', userAId: OTHER_USER_ID, userBId: USER_ID, messages: [] },
    ]);
    coachProvider.generateSuggestions.mockResolvedValue({
      conversationOpeners: ['Ask about their trip'],
      dateIdeas: ['Coffee walk'],
      profileTips: ['Add a profile photo'],
    });

    const result = await service.getTips(USER_ID);

    expect(coachProvider.generateSuggestions).toHaveBeenCalledWith({
      totalMatches: 2,
      staleMatchesCount: 1,
      messagesSent: 1,
      messagesReceived: 2,
      missingProfileFields: ['profile photo', 'interests', 'voice intro', 'love languages'],
      sharedInterestsWithMatch: [],
      sharedQuestionCount: 0,
      compatibilityPercentage: null,
      matchProfilePromptAnswers: [],
    });
    expect(matchingService.getCompatibility).not.toHaveBeenCalled();
    expect(result).toEqual({
      conversationOpeners: ['Ask about their trip'],
      dateIdeas: ['Coffee walk'],
      profileTips: ['Add a profile photo'],
    });
  });

  it('throws when the given match does not belong to the user', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: USER_ID,
      profilePhotoUrl: 'photo.jpg',
      interests: ['hiking'],
      voiceIntroUrl: 'intro.mp3',
      videoSnippetUrl: 'clip.mp4',
      kinkTags: [],
      loveLanguages: [],
    });
    prisma.match.findMany.mockResolvedValue([]);
    prisma.match.findUnique.mockResolvedValue(null);

    await expect(service.getTips(USER_ID, MATCH_ID)).rejects.toBeInstanceOf(NotFoundException);
    expect(coachProvider.generateSuggestions).not.toHaveBeenCalled();
  });

  it('includes shared interests with the specified match', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: USER_ID,
      profilePhotoUrl: 'photo.jpg',
      interests: ['hiking', 'jazz', 'cooking'],
      voiceIntroUrl: 'intro.mp3',
      videoSnippetUrl: 'clip.mp4',
      kinkTags: ['switch'],
      loveLanguages: ['words'],
    });
    prisma.match.findMany.mockResolvedValue([]);
    prisma.match.findUnique.mockResolvedValue({
      id: MATCH_ID,
      userAId: USER_ID,
      userBId: OTHER_USER_ID,
    });
    prisma.user.findUnique
      .mockResolvedValueOnce({
        id: USER_ID,
        profilePhotoUrl: 'photo.jpg',
        interests: ['hiking', 'jazz', 'cooking'],
        voiceIntroUrl: 'intro.mp3',
        videoSnippetUrl: 'clip.mp4',
        kinkTags: ['switch'],
        loveLanguages: ['words'],
      })
      .mockResolvedValueOnce({ id: OTHER_USER_ID, interests: ['jazz', 'cycling'] });
    coachProvider.generateSuggestions.mockResolvedValue({
      conversationOpeners: [],
      dateIdeas: [],
      profileTips: [],
    });

    await service.getTips(USER_ID, MATCH_ID);

    expect(coachProvider.generateSuggestions).toHaveBeenCalledWith(
      expect.objectContaining({ sharedInterestsWithMatch: ['jazz'] }),
    );
  });

  it('includes compatibility questionnaire overlap with the specified match', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: USER_ID,
      profilePhotoUrl: 'photo.jpg',
      interests: [],
      voiceIntroUrl: 'intro.mp3',
      videoSnippetUrl: 'clip.mp4',
      kinkTags: [],
      loveLanguages: [],
    });
    prisma.match.findMany.mockResolvedValue([]);
    prisma.match.findUnique.mockResolvedValue({ id: MATCH_ID, userAId: USER_ID, userBId: OTHER_USER_ID });
    matchingService.getCompatibility.mockResolvedValue({
      percentage: 82,
      sharedQuestionCount: 5,
      zodiacSign: null,
      otherZodiacSign: null,
      zodiacHarmony: null,
    });
    coachProvider.generateSuggestions.mockResolvedValue({
      conversationOpeners: [],
      dateIdeas: [],
      profileTips: [],
    });

    await service.getTips(USER_ID, MATCH_ID);

    expect(matchingService.getCompatibility).toHaveBeenCalledWith(USER_ID, OTHER_USER_ID);
    expect(coachProvider.generateSuggestions).toHaveBeenCalledWith(
      expect.objectContaining({ sharedQuestionCount: 5, compatibilityPercentage: 82 }),
    );
  });

  it("includes the match's transcribed profile prompt answers", async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: USER_ID,
      profilePhotoUrl: 'photo.jpg',
      interests: [],
      voiceIntroUrl: 'intro.mp3',
      videoSnippetUrl: 'clip.mp4',
      kinkTags: [],
      loveLanguages: [],
    });
    prisma.match.findMany.mockResolvedValue([]);
    prisma.match.findUnique.mockResolvedValue({ id: MATCH_ID, userAId: USER_ID, userBId: OTHER_USER_ID });
    prisma.profilePromptVoiceAnswer.findMany.mockResolvedValue([
      { promptId: 'perfect-first-date', transcript: 'A coffee walk and good conversation.' },
      { promptId: 'unpopular-opinion', transcript: null },
      { promptId: 'not-a-real-prompt', transcript: 'Should be dropped.' },
    ]);
    coachProvider.generateSuggestions.mockResolvedValue({
      conversationOpeners: [],
      dateIdeas: [],
      profileTips: [],
    });

    await service.getTips(USER_ID, MATCH_ID);

    expect(prisma.profilePromptVoiceAnswer.findMany).toHaveBeenCalledWith({
      where: { userId: OTHER_USER_ID },
    });
    expect(coachProvider.generateSuggestions).toHaveBeenCalledWith(
      expect.objectContaining({
        matchProfilePromptAnswers: [
          {
            question: 'My idea of a perfect first date is...',
            answer: 'A coffee walk and good conversation.',
          },
        ],
      }),
    );
  });

  describe('getIcebreakerSuggestions', () => {
    it('returns just the conversation openers for the match', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: USER_ID,
        profilePhotoUrl: 'photo.jpg',
        interests: [],
        voiceIntroUrl: 'intro.mp3',
        videoSnippetUrl: 'clip.mp4',
        kinkTags: [],
        loveLanguages: [],
      });
      prisma.match.findMany.mockResolvedValue([]);
      prisma.match.findUnique.mockResolvedValue({ id: MATCH_ID, userAId: USER_ID, userBId: OTHER_USER_ID });
      coachProvider.generateSuggestions.mockResolvedValue({
        conversationOpeners: ['Ask about their trip'],
        dateIdeas: ['Coffee walk'],
        profileTips: ['Add a profile photo'],
      });

      const result = await service.getIcebreakerSuggestions(USER_ID, MATCH_ID);

      expect(result).toEqual(['Ask about their trip']);
    });
  });

  describe('getSmartReplies', () => {
    it('throws when the match does not belong to the user', async () => {
      prisma.match.findUnique.mockResolvedValue({
        id: MATCH_ID,
        userAId: OTHER_USER_ID,
        userBId: 'user-3',
      });

      await expect(service.getSmartReplies(USER_ID, MATCH_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns nothing when there are no messages yet', async () => {
      prisma.match.findUnique.mockResolvedValue({ id: MATCH_ID, userAId: USER_ID, userBId: OTHER_USER_ID });
      prisma.message.findFirst.mockResolvedValue(null);

      const result = await service.getSmartReplies(USER_ID, MATCH_ID);

      expect(result).toEqual([]);
      expect(coachProvider.generateSmartReplies).not.toHaveBeenCalled();
    });

    it('returns nothing when the caller sent the most recent message', async () => {
      prisma.match.findUnique.mockResolvedValue({ id: MATCH_ID, userAId: USER_ID, userBId: OTHER_USER_ID });
      prisma.message.findFirst.mockResolvedValue({
        senderId: USER_ID,
        content: 'how are you?',
      });

      const result = await service.getSmartReplies(USER_ID, MATCH_ID);

      expect(result).toEqual([]);
      expect(coachProvider.generateSmartReplies).not.toHaveBeenCalled();
    });

    it('returns nothing when the most recent message has no text content', async () => {
      prisma.match.findUnique.mockResolvedValue({ id: MATCH_ID, userAId: USER_ID, userBId: OTHER_USER_ID });
      prisma.message.findFirst.mockResolvedValue({
        senderId: OTHER_USER_ID,
        content: null,
      });

      const result = await service.getSmartReplies(USER_ID, MATCH_ID);

      expect(result).toEqual([]);
      expect(coachProvider.generateSmartReplies).not.toHaveBeenCalled();
    });

    it("generates replies based on the other side's most recent message", async () => {
      prisma.match.findUnique.mockResolvedValue({ id: MATCH_ID, userAId: USER_ID, userBId: OTHER_USER_ID });
      prisma.message.findFirst.mockResolvedValue({
        senderId: OTHER_USER_ID,
        content: 'How was your weekend?',
      });
      coachProvider.generateSmartReplies.mockResolvedValue(['It was great!', 'Pretty quiet', 'Tell you later']);

      const result = await service.getSmartReplies(USER_ID, MATCH_ID);

      expect(prisma.message.findFirst).toHaveBeenCalledWith({
        where: { matchId: MATCH_ID },
        orderBy: { createdAt: 'desc' },
      });
      expect(coachProvider.generateSmartReplies).toHaveBeenCalledWith('How was your weekend?');
      expect(result).toEqual(['It was great!', 'Pretty quiet', 'Tell you later']);
    });
  });
});
