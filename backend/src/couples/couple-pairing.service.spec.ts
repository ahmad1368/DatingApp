import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CouplePairingService } from './couple-pairing.service';

const REQUESTER_ID = 'requester-1';
const PARTNER_ID = 'partner-1';
const PAIRING_ID = 'pairing-1';

describe('CouplePairingService', () => {
  let service: CouplePairingService;
  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock };
    couplePairing: { findFirst: jest.Mock; findUnique: jest.Mock; findMany: jest.Mock; create: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn() },
      couplePairing: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    service = new CouplePairingService(prisma as unknown as PrismaService);
  });

  describe('invite', () => {
    it('rejects pairing with yourself', async () => {
      await expect(service.invite(REQUESTER_ID, REQUESTER_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws when the target user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ partnerUserId: null }).mockResolvedValueOnce(null);

      await expect(service.invite(REQUESTER_ID, PARTNER_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects when the requester is already paired', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ partnerUserId: 'someone-else' })
        .mockResolvedValueOnce({ partnerUserId: null });

      await expect(service.invite(REQUESTER_ID, PARTNER_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects when the target is already paired', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ partnerUserId: null })
        .mockResolvedValueOnce({ partnerUserId: 'someone-else' });

      await expect(service.invite(REQUESTER_ID, PARTNER_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects a duplicate pending invite between the same two users', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ partnerUserId: null })
        .mockResolvedValueOnce({ partnerUserId: null });
      prisma.couplePairing.findFirst.mockResolvedValue({ id: 'existing-invite' });

      await expect(service.invite(REQUESTER_ID, PARTNER_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.couplePairing.create).not.toHaveBeenCalled();
    });

    it('creates a pending invite', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ partnerUserId: null })
        .mockResolvedValueOnce({ partnerUserId: null });
      prisma.couplePairing.findFirst.mockResolvedValue(null);
      prisma.couplePairing.create.mockResolvedValue({
        id: PAIRING_ID,
        requesterId: REQUESTER_ID,
        partnerId: PARTNER_ID,
        status: 'PENDING',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        respondedAt: null,
      });

      const result = await service.invite(REQUESTER_ID, PARTNER_ID);

      expect(prisma.couplePairing.create).toHaveBeenCalledWith({
        data: { requesterId: REQUESTER_ID, partnerId: PARTNER_ID },
      });
      expect(result.status).toBe('PENDING');
    });
  });

  describe('respond', () => {
    it('throws when the invite does not belong to the responding user', async () => {
      prisma.couplePairing.findUnique.mockResolvedValue({
        id: PAIRING_ID,
        partnerId: 'someone-else',
        status: 'PENDING',
      });

      await expect(service.respond(PARTNER_ID, PAIRING_ID, true)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects responding to an invite that was already decided', async () => {
      prisma.couplePairing.findUnique.mockResolvedValue({
        id: PAIRING_ID,
        partnerId: PARTNER_ID,
        status: 'ACCEPTED',
      });

      await expect(service.respond(PARTNER_ID, PAIRING_ID, true)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('declining just updates the invite status', async () => {
      prisma.couplePairing.findUnique.mockResolvedValue({
        id: PAIRING_ID,
        requesterId: REQUESTER_ID,
        partnerId: PARTNER_ID,
        status: 'PENDING',
      });
      prisma.couplePairing.update.mockResolvedValue({
        id: PAIRING_ID,
        requesterId: REQUESTER_ID,
        partnerId: PARTNER_ID,
        status: 'DECLINED',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        respondedAt: new Date('2026-01-02T00:00:00.000Z'),
      });

      const result = await service.respond(PARTNER_ID, PAIRING_ID, false);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(result.status).toBe('DECLINED');
    });

    it('accepting links both users and marks the invite accepted', async () => {
      prisma.couplePairing.findUnique.mockResolvedValue({
        id: PAIRING_ID,
        requesterId: REQUESTER_ID,
        partnerId: PARTNER_ID,
        status: 'PENDING',
      });
      prisma.$transaction.mockResolvedValue([
        {},
        {},
        {
          id: PAIRING_ID,
          requesterId: REQUESTER_ID,
          partnerId: PARTNER_ID,
          status: 'ACCEPTED',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          respondedAt: new Date('2026-01-02T00:00:00.000Z'),
        },
      ]);

      const result = await service.respond(PARTNER_ID, PAIRING_ID, true);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: REQUESTER_ID },
        data: { partnerUserId: PARTNER_ID },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: PARTNER_ID },
        data: { partnerUserId: REQUESTER_ID },
      });
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result.status).toBe('ACCEPTED');
    });
  });

  describe('unpair', () => {
    it('rejects when the user is not currently paired', async () => {
      prisma.user.findUnique.mockResolvedValue({ partnerUserId: null });

      await expect(service.unpair(REQUESTER_ID)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('clears partnerUserId on both sides', async () => {
      prisma.user.findUnique.mockResolvedValue({ partnerUserId: PARTNER_ID });
      prisma.$transaction.mockResolvedValue([{}, {}]);

      const result = await service.unpair(REQUESTER_ID);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: REQUESTER_ID },
        data: { partnerUserId: null },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: PARTNER_ID },
        data: { partnerUserId: null },
      });
      expect(result).toEqual({ unpaired: true });
    });
  });
});
