import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CommunityGroupsService } from './community-groups.service';
import { COMMUNITY_GROUPS, MAX_COMMUNITY_GROUP_MEMBERSHIPS } from './community-groups.constants';

const USER_ID = 'user-1';

describe('CommunityGroupsService', () => {
  let service: CommunityGroupsService;
  let prisma: { user: { findUnique: jest.Mock; update: jest.Mock } };

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn(), update: jest.fn() } };
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
