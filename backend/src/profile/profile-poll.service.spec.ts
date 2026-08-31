import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProfilePollService } from './profile-poll.service';

const OWNER_ID = 'owner-1';
const VOTER_ID = 'voter-1';

describe('ProfilePollService', () => {
  let service: ProfilePollService;
  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock };
    profilePollVote: { deleteMany: jest.Mock; findMany: jest.Mock; upsert: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn() },
      profilePollVote: { deleteMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn() },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };
    service = new ProfilePollService(prisma as unknown as PrismaService);
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
  });
});
