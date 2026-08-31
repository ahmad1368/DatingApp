import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SocialGraphService } from './social-graph.service';

const USER_ID = 'user-1';
const OTHER_ID = 'user-2';

describe('SocialGraphService', () => {
  let service: SocialGraphService;
  let prisma: {
    user: { findUnique: jest.Mock; findMany: jest.Mock; update: jest.Mock };
    socialContact: { deleteMany: jest.Mock; createMany: jest.Mock; findMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
      socialContact: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
        findMany: jest.fn(),
      },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };
    service = new SocialGraphService(prisma as unknown as PrismaService);
  });

  describe('syncContacts', () => {
    it('replaces the contact set, normalizing and deduping', async () => {
      const result = await service.syncContacts(USER_ID, [
        '+15551234567',
        '+15551234567',
        ' NOTAMATCH@example.com ',
        '   ',
      ]);

      expect(prisma.socialContact.deleteMany).toHaveBeenCalledWith({ where: { userId: USER_ID } });
      expect(prisma.socialContact.createMany).toHaveBeenCalledWith({
        data: [
          { userId: USER_ID, contactValue: '+15551234567' },
          { userId: USER_ID, contactValue: 'notamatch@example.com' },
        ],
      });
      expect(result).toEqual({ totalSynced: 2 });
    });

    it('only deletes when the normalized contact list is empty', async () => {
      const result = await service.syncContacts(USER_ID, ['   ', '']);

      expect(prisma.socialContact.deleteMany).toHaveBeenCalledWith({ where: { userId: USER_ID } });
      expect(prisma.socialContact.createMany).not.toHaveBeenCalled();
      expect(result).toEqual({ totalSynced: 0 });
    });
  });

  describe('getMutualConnections', () => {
    it('rejects comparing a user with themselves', async () => {
      await expect(service.getMutualConnections(USER_ID, USER_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws when the other user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getMutualConnections(USER_ID, OTHER_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns zero mutual connections when contact sets do not overlap', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: OTHER_ID });
      prisma.socialContact.findMany
        .mockResolvedValueOnce([{ contactValue: 'a@example.com' }])
        .mockResolvedValueOnce([{ contactValue: 'b@example.com' }]);

      const result = await service.getMutualConnections(USER_ID, OTHER_ID);

      expect(result).toEqual({ mutualContactCount: 0, mutualFriends: [] });
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });

    it('counts overlapping contacts and resolves the ones with an account', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: OTHER_ID });
      prisma.socialContact.findMany
        .mockResolvedValueOnce([
          { contactValue: 'shared@example.com' },
          { contactValue: 'unregistered@example.com' },
        ])
        .mockResolvedValueOnce([
          { contactValue: 'shared@example.com' },
          { contactValue: 'unregistered@example.com' },
        ]);
      prisma.user.findMany.mockResolvedValue([
        { id: 'user-3', name: 'Sam', profilePhotoUrl: 'sam.jpg' },
      ]);

      const result = await service.getMutualConnections(USER_ID, OTHER_ID);

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          id: { notIn: [USER_ID, OTHER_ID] },
          OR: [
            { phoneNumber: { in: ['shared@example.com', 'unregistered@example.com'] } },
            { email: { in: ['shared@example.com', 'unregistered@example.com'] } },
          ],
        },
        select: { id: true, name: true, profilePhotoUrl: true },
      });
      expect(result).toEqual({
        mutualContactCount: 2,
        mutualFriends: [{ userId: 'user-3', name: 'Sam', photoUrl: 'sam.jpg' }],
      });
    });
  });

  describe('setHideFromMutualConnections', () => {
    it('enables the privacy toggle', async () => {
      prisma.user.update.mockResolvedValue({ hideFromMutualConnectionsEnabled: true });

      const result = await service.setHideFromMutualConnections(USER_ID, true);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { hideFromMutualConnectionsEnabled: true },
      });
      expect(result).toEqual({ hideFromMutualConnectionsEnabled: true });
    });

    it('disables the privacy toggle', async () => {
      prisma.user.update.mockResolvedValue({ hideFromMutualConnectionsEnabled: false });

      const result = await service.setHideFromMutualConnections(USER_ID, false);

      expect(result).toEqual({ hideFromMutualConnectionsEnabled: false });
    });
  });
});
