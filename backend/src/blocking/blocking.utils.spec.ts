import { PrismaService } from '../prisma/prisma.service';
import { getBlockedUserIds } from './blocking.utils';

const USER_ID = 'user-1';

describe('getBlockedUserIds', () => {
  let prisma: { blockedContact: { findMany: jest.Mock } };

  beforeEach(() => {
    prisma = { blockedContact: { findMany: jest.fn() } };
  });

  it('merges ids the user blocked with ids of users who blocked them', async () => {
    prisma.blockedContact.findMany
      .mockResolvedValueOnce([{ blockedUserId: 'i-blocked-them' }, { blockedUserId: null }])
      .mockResolvedValueOnce([{ userId: 'they-blocked-me' }]);

    const ids = await getBlockedUserIds(prisma as unknown as PrismaService, USER_ID);

    expect(prisma.blockedContact.findMany).toHaveBeenNthCalledWith(1, {
      where: { userId: USER_ID, blockedUserId: { not: null } },
      select: { blockedUserId: true },
    });
    expect(prisma.blockedContact.findMany).toHaveBeenNthCalledWith(2, {
      where: { blockedUserId: USER_ID },
      select: { userId: true },
    });
    expect(ids.sort()).toEqual(['i-blocked-them', 'they-blocked-me']);
  });

  it('dedupes when the same user appears in both directions', async () => {
    prisma.blockedContact.findMany
      .mockResolvedValueOnce([{ blockedUserId: 'mutual' }])
      .mockResolvedValueOnce([{ userId: 'mutual' }]);

    const ids = await getBlockedUserIds(prisma as unknown as PrismaService, USER_ID);

    expect(ids).toEqual(['mutual']);
  });

  it('returns an empty array when nothing is blocked in either direction', async () => {
    prisma.blockedContact.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const ids = await getBlockedUserIds(prisma as unknown as PrismaService, USER_ID);

    expect(ids).toEqual([]);
  });
});
