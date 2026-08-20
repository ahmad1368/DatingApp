import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BlockingService } from './blocking.service';

const USER_ID = 'user-1';

describe('BlockingService', () => {
  let service: BlockingService;
  let prisma: {
    user: { findMany: jest.Mock };
    blockedContact: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      upsert: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      user: { findMany: jest.fn() },
      blockedContact: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        upsert: jest.fn(),
        delete: jest.fn(),
      },
    };
    service = new BlockingService(prisma as unknown as PrismaService);
  });

  describe('syncContacts', () => {
    it('returns zero counts and does nothing for an empty contact list', async () => {
      const result = await service.syncContacts(USER_ID, ['   ', '']);

      expect(prisma.user.findMany).not.toHaveBeenCalled();
      expect(prisma.blockedContact.upsert).not.toHaveBeenCalled();
      expect(result).toEqual({ totalSubmitted: 0, matchedUsers: 0 });
    });

    it('normalizes, dedupes, and blocks contacts, matching against existing users', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 'user-2', phoneNumber: '+15551234567', email: null },
      ]);

      const result = await service.syncContacts(USER_ID, [
        '+15551234567',
        '+15551234567',
        ' NOTAMATCH@example.com ',
      ]);

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          id: { not: USER_ID },
          OR: [
            { phoneNumber: { in: ['+15551234567', 'notamatch@example.com'] } },
            { email: { in: ['+15551234567', 'notamatch@example.com'] } },
          ],
        },
        select: { id: true, phoneNumber: true, email: true },
      });
      expect(prisma.blockedContact.upsert).toHaveBeenCalledWith({
        where: { userId_contactValue: { userId: USER_ID, contactValue: '+15551234567' } },
        create: { userId: USER_ID, contactValue: '+15551234567', blockedUserId: 'user-2' },
        update: { blockedUserId: 'user-2' },
      });
      expect(prisma.blockedContact.upsert).toHaveBeenCalledWith({
        where: { userId_contactValue: { userId: USER_ID, contactValue: 'notamatch@example.com' } },
        create: { userId: USER_ID, contactValue: 'notamatch@example.com', blockedUserId: null },
        update: { blockedUserId: null },
      });
      expect(result).toEqual({ totalSubmitted: 2, matchedUsers: 1 });
    });
  });

  describe('listBlockedContacts', () => {
    it('hydrates matched blocked users with their profile info', async () => {
      prisma.blockedContact.findMany.mockResolvedValue([
        {
          id: 'block-1',
          contactValue: '+15551234567',
          blockedUserId: 'user-2',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
        {
          id: 'block-2',
          contactValue: 'unmatched@example.com',
          blockedUserId: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);
      prisma.user.findMany.mockResolvedValue([
        { id: 'user-2', name: 'Alex', profilePhotoUrl: 'alex.jpg' },
      ]);

      const result = await service.listBlockedContacts(USER_ID);

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['user-2'] } },
        select: { id: true, name: true, profilePhotoUrl: true },
      });
      expect(result).toEqual([
        {
          id: 'block-1',
          contactValue: '+15551234567',
          blockedUserId: 'user-2',
          blockedUserName: 'Alex',
          blockedUserPhotoUrl: 'alex.jpg',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'block-2',
          contactValue: 'unmatched@example.com',
          blockedUserId: null,
          blockedUserName: null,
          blockedUserPhotoUrl: null,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ]);
    });

    it('skips the user lookup when nothing has matched an account yet', async () => {
      prisma.blockedContact.findMany.mockResolvedValue([
        {
          id: 'block-1',
          contactValue: 'unmatched@example.com',
          blockedUserId: null,
          createdAt: new Date(),
        },
      ]);

      await service.listBlockedContacts(USER_ID);

      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });
  });

  describe('unblockContact', () => {
    it('throws when the blocked contact does not exist', async () => {
      prisma.blockedContact.findUnique.mockResolvedValue(null);

      await expect(service.unblockContact(USER_ID, 'block-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.blockedContact.delete).not.toHaveBeenCalled();
    });

    it("throws when unblocking someone else's blocked contact", async () => {
      prisma.blockedContact.findUnique.mockResolvedValue({ id: 'block-1', userId: 'someone-else' });

      await expect(service.unblockContact(USER_ID, 'block-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.blockedContact.delete).not.toHaveBeenCalled();
    });

    it('deletes the blocked contact', async () => {
      prisma.blockedContact.findUnique.mockResolvedValue({ id: 'block-1', userId: USER_ID });

      await service.unblockContact(USER_ID, 'block-1');

      expect(prisma.blockedContact.delete).toHaveBeenCalledWith({ where: { id: 'block-1' } });
    });
  });
});
