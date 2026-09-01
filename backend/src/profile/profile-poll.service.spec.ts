import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ProfilePollService } from './profile-poll.service';

const OWNER_ID = 'owner-1';
const VOTER_ID = 'voter-1';

describe('ProfilePollService', () => {
  let service: ProfilePollService;
  let prisma: {
    user: { findUnique: jest.Mock; findMany: jest.Mock; update: jest.Mock };
    profilePollVote: {
      deleteMany: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      upsert: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let notificationsService: { notify: jest.Mock };

  beforeEach(() => {
    notificationsService = { notify: jest.fn() };
    prisma = {
      user: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
      profilePollVote: {
        deleteMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
      },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };
    service = new ProfilePollService(
      prisma as unknown as PrismaService,
      notificationsService as unknown as NotificationsService,
    );
  });

  describe('setPoll', () => {
    it('rejects fewer than the minimum number of options', async () => {
      await expect(service.setPoll(OWNER_ID, 'Best first date?', ['Coffee'])).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects more than the maximum number of options', async () => {
      await expect(
        service.setPoll(OWNER_ID, 'Best first date?', ['A', 'B', 'C', 'D', 'E', 'F', 'G']),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('clears existing votes and saves the new question/options', async () => {
      const result = await service.setPoll(OWNER_ID, 'Best first date?', ['Coffee', 'Hiking']);

      expect(prisma.profilePollVote.deleteMany).toHaveBeenCalledWith({ where: { pollOwnerId: OWNER_ID } });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: OWNER_ID },
        data: { profilePollQuestion: 'Best first date?', profilePollOptions: ['Coffee', 'Hiking'] },
      });
      expect(result).toEqual({
        question: 'Best first date?',
        options: ['Coffee', 'Hiking'],
        myOptionIndex: null,
        voteCounts: [0, 0],
        totalVotes: 0,
      });
    });
  });

  describe('clearPoll', () => {
    it('deletes votes and clears the question/options', async () => {
      const result = await service.clearPoll(OWNER_ID);

      expect(prisma.profilePollVote.deleteMany).toHaveBeenCalledWith({ where: { pollOwnerId: OWNER_ID } });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: OWNER_ID },
        data: { profilePollQuestion: null, profilePollOptions: [] },
      });
      expect(result).toEqual({ cleared: true });
    });
  });

  describe('getPoll', () => {
    it('throws when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getPoll(VOTER_ID, OWNER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the tally and the viewer own vote', async () => {
      prisma.user.findUnique.mockResolvedValue({
        profilePollQuestion: 'Best first date?',
        profilePollOptions: ['Coffee', 'Hiking'],
      });
      prisma.profilePollVote.findMany.mockResolvedValue([
        { voterId: VOTER_ID, optionIndex: 1 },
        { voterId: 'other-voter', optionIndex: 0 },
      ]);

      const result = await service.getPoll(VOTER_ID, OWNER_ID);

      expect(result).toEqual({
        question: 'Best first date?',
        options: ['Coffee', 'Hiking'],
        myOptionIndex: 1,
        voteCounts: [1, 1],
        totalVotes: 2,
      });
    });
  });

  describe('vote', () => {
    it('rejects voting on your own poll', async () => {
      await expect(service.vote(OWNER_ID, OWNER_ID, 0)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.profilePollVote.upsert).not.toHaveBeenCalled();
    });

    it('throws when the target has no active poll', async () => {
      prisma.user.findUnique.mockResolvedValue({ profilePollQuestion: null, profilePollOptions: [] });

      await expect(service.vote(VOTER_ID, OWNER_ID, 0)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects an option index outside the poll', async () => {
      prisma.user.findUnique.mockResolvedValue({
        profilePollQuestion: 'Best first date?',
        profilePollOptions: ['Coffee', 'Hiking'],
      });

      await expect(service.vote(VOTER_ID, OWNER_ID, 2)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.profilePollVote.upsert).not.toHaveBeenCalled();
    });

    it('upserts the vote and returns the tally from the voter perspective', async () => {
      prisma.user.findUnique.mockResolvedValue({
        profilePollQuestion: 'Best first date?',
        profilePollOptions: ['Coffee', 'Hiking'],
      });
      prisma.profilePollVote.findMany.mockResolvedValue([{ voterId: VOTER_ID, optionIndex: 1 }]);

      const result = await service.vote(VOTER_ID, OWNER_ID, 1);

      expect(prisma.profilePollVote.upsert).toHaveBeenCalledWith({
        where: { pollOwnerId_voterId: { pollOwnerId: OWNER_ID, voterId: VOTER_ID } },
        create: { pollOwnerId: OWNER_ID, voterId: VOTER_ID, optionIndex: 1 },
        update: { optionIndex: 1 },
      });
      expect(result.myOptionIndex).toBe(1);
      expect(result.voteCounts).toEqual([0, 1]);
      expect(result.totalVotes).toBe(1);
    });

    it('notifies the owner on a genuinely new vote', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({
          profilePollQuestion: 'Best first date?',
          profilePollOptions: ['Coffee', 'Hiking'],
        })
        .mockResolvedValueOnce({ name: 'Jordan' });
      prisma.profilePollVote.findUnique.mockResolvedValue(null);

      await service.vote(VOTER_ID, OWNER_ID, 1);

      expect(notificationsService.notify).toHaveBeenCalledWith(
        OWNER_ID,
        'PROFILE_ACTIVITY',
        'New poll vote',
        'Jordan voted on your poll!',
        { voterId: VOTER_ID },
      );
    });

    it('does not notify again when the voter just changes their existing pick', async () => {
      prisma.user.findUnique.mockResolvedValue({
        profilePollQuestion: 'Best first date?',
        profilePollOptions: ['Coffee', 'Hiking'],
      });
      prisma.profilePollVote.findUnique.mockResolvedValue({
        pollOwnerId: OWNER_ID,
        voterId: VOTER_ID,
        optionIndex: 0,
      });

      await service.vote(VOTER_ID, OWNER_ID, 1);

      expect(notificationsService.notify).not.toHaveBeenCalled();
    });
  });

  describe('listVoters', () => {
    it('returns an empty list when nobody has voted', async () => {
      const result = await service.listVoters(OWNER_ID);

      expect(result).toEqual([]);
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });

    it('hydrates each voter with their name/photo and picked option', async () => {
      prisma.profilePollVote.findMany.mockResolvedValue([
        {
          voterId: VOTER_ID,
          optionIndex: 1,
          createdAt: new Date('2026-01-02T00:00:00.000Z'),
        },
      ]);
      prisma.user.findMany.mockResolvedValue([
        { id: VOTER_ID, name: 'Jordan', profilePhotoUrl: 'jordan.jpg' },
      ]);

      const result = await service.listVoters(OWNER_ID);

      expect(prisma.profilePollVote.findMany).toHaveBeenCalledWith({
        where: { pollOwnerId: OWNER_ID },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual([
        {
          voterId: VOTER_ID,
          voterName: 'Jordan',
          voterPhotoUrl: 'jordan.jpg',
          optionIndex: 1,
          votedAt: '2026-01-02T00:00:00.000Z',
        },
      ]);
    });
  });
});
