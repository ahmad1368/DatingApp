import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CommunityGroupsService } from './community-groups.service';
import { COMMUNITY_GROUPS, MAX_COMMUNITY_GROUP_MEMBERSHIPS } from './community-groups.constants';

const USER_ID = 'user-1';

describe('CommunityGroupsService', () => {
  let service: CommunityGroupsService;
  let prisma: {
    user: { findUnique: jest.Mock; findMany: jest.Mock; update: jest.Mock };
    blockedContact: { findMany: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
      blockedContact: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new CommunityGroupsService(prisma as unknown as PrismaService);
  });

  describe('getGroups', () => {
    it('exposes the full catalog', () => {
      expect(service.getGroups()).toEqual(COMMUNITY_GROUPS);
    });
  });

  describe('getMyGroups', () => {
    it('returns an empty list when the user has none', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.getMyGroups(USER_ID);

      expect(result).toEqual([]);
    });

    it('returns the stored group ids', async () => {
      prisma.user.findUnique.mockResolvedValue({ communityGroupIds: ['book-lovers'] });

      const result = await service.getMyGroups(USER_ID);

      expect(result).toEqual(['book-lovers']);
    });
  });

  describe('joinGroup', () => {
    it('rejects an unknown group id', async () => {
      await expect(service.joinGroup(USER_ID, 'not-a-real-group')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('throws when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.joinGroup(USER_ID, 'book-lovers')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns the existing list unchanged if already a member', async () => {
      prisma.user.findUnique.mockResolvedValue({ communityGroupIds: ['book-lovers'] });

      const result = await service.joinGroup(USER_ID, 'book-lovers');

      expect(result).toEqual(['book-lovers']);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects joining beyond the max membership count', async () => {
      const atLimit = COMMUNITY_GROUPS.slice(0, MAX_COMMUNITY_GROUP_MEMBERSHIPS).map((g) => g.id);
      prisma.user.findUnique.mockResolvedValue({ communityGroupIds: atLimit });

      await expect(
        service.joinGroup(USER_ID, COMMUNITY_GROUPS[MAX_COMMUNITY_GROUP_MEMBERSHIPS].id),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('adds the group and persists the updated list', async () => {
      prisma.user.findUnique.mockResolvedValue({ communityGroupIds: ['book-lovers'] });
      prisma.user.update.mockResolvedValue({ communityGroupIds: ['book-lovers', 'foodies'] });

      const result = await service.joinGroup(USER_ID, 'foodies');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { communityGroupIds: ['book-lovers', 'foodies'] },
        select: { communityGroupIds: true },
      });
      expect(result).toEqual(['book-lovers', 'foodies']);
    });
  });

  describe('getGroupMembers', () => {
    it('rejects an unknown group id', async () => {
      await expect(service.getGroupMembers(USER_ID, 'not-a-real-group')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });

    it('excludes the current user and blocked users, and returns basic profile info', async () => {
      prisma.blockedContact.findMany
        .mockResolvedValueOnce([{ blockedUserId: 'blocked-1' }])
        .mockResolvedValueOnce([]);
      prisma.user.findMany.mockResolvedValue([
        { id: 'member-1', name: 'Alex', dateOfBirth: null, profilePhotoUrl: 'alex.jpg' },
      ]);

      const result = await service.getGroupMembers(USER_ID, 'book-lovers');

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          id: { notIn: [USER_ID, 'blocked-1'] },
          communityGroupIds: { has: 'book-lovers' },
          onboardingCompletedAt: { not: null },
          OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: expect.any(Date) } }],
        },
        take: 50,
      });
      expect(result).toEqual([
        { id: 'member-1', name: 'Alex', age: null, profilePhotoUrl: 'alex.jpg' },
      ]);
    });

    it('computes age from dateOfBirth when present', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 'member-1', name: 'Alex', dateOfBirth: new Date('2000-01-01'), profilePhotoUrl: null },
      ]);

      const result = await service.getGroupMembers(USER_ID, 'book-lovers');

      expect(result[0].age).toBeGreaterThan(0);
    });
  });

  describe('leaveGroup', () => {
    it('throws when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.leaveGroup(USER_ID, 'book-lovers')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('removes the group and persists the updated list', async () => {
      prisma.user.findUnique.mockResolvedValue({ communityGroupIds: ['book-lovers', 'foodies'] });
      prisma.user.update.mockResolvedValue({ communityGroupIds: ['foodies'] });

      const result = await service.leaveGroup(USER_ID, 'book-lovers');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { communityGroupIds: ['foodies'] },
        select: { communityGroupIds: true },
      });
      expect(result).toEqual(['foodies']);
    });
  });
});
