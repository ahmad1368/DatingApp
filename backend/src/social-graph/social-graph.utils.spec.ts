import { PrismaService } from '../prisma/prisma.service';
import { getMutualConnectionCounts } from './social-graph.utils';

const USER_ID = 'user-1';

describe('getMutualConnectionCounts', () => {
  let prisma: { socialContact: { findMany: jest.Mock } };

  beforeEach(() => {
    prisma = { socialContact: { findMany: jest.fn() } };
  });

  it('returns an empty map when there are no candidates', async () => {
    const counts = await getMutualConnectionCounts(prisma as unknown as PrismaService, USER_ID, []);

    expect(counts.size).toBe(0);
    expect(prisma.socialContact.findMany).not.toHaveBeenCalled();
  });

  it('returns an empty map when the user has no synced contacts', async () => {
    prisma.socialContact.findMany.mockResolvedValueOnce([]);

    const counts = await getMutualConnectionCounts(prisma as unknown as PrismaService, USER_ID, [
      'candidate-1',
    ]);

    expect(counts.size).toBe(0);
    expect(prisma.socialContact.findMany).toHaveBeenCalledTimes(1);
  });

  it('counts overlapping contacts per candidate', async () => {
    prisma.socialContact.findMany
      .mockResolvedValueOnce([{ contactValue: 'a@example.com' }, { contactValue: 'b@example.com' }])
      .mockResolvedValueOnce([
        { userId: 'candidate-1' },
        { userId: 'candidate-1' },
        { userId: 'candidate-2' },
      ]);

    const counts = await getMutualConnectionCounts(prisma as unknown as PrismaService, USER_ID, [
      'candidate-1',
      'candidate-2',
    ]);

    expect(prisma.socialContact.findMany).toHaveBeenNthCalledWith(2, {
      where: {
        userId: { in: ['candidate-1', 'candidate-2'] },
        contactValue: { in: ['a@example.com', 'b@example.com'] },
      },
      select: { userId: true },
    });
    expect(counts.get('candidate-1')).toBe(2);
    expect(counts.get('candidate-2')).toBe(1);
  });
});
