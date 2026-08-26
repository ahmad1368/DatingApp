import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CouplePairingService } from './couple-pairing.service';

const REQUESTER_ID = 'requester-1';
const PARTNER_ID = 'partner-1';
const OTHER_PARTNER_ID = 'partner-2';
const PAIRING_ID = 'pairing-1';
const LINK_ID = 'link-1';

describe('CouplePairingService', () => {
  let service: CouplePairingService;
  let prisma: {
    user: { findUnique: jest.Mock; findMany: jest.Mock; update: jest.Mock };
    couplePairing: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    partnerLink: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
      couplePairing: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      partnerLink: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
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
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.invite(REQUESTER_ID, PARTNER_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects when the two users are already linked', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: PARTNER_ID });
      prisma.partnerLink.findFirst.mockResolvedValue({
        id: LINK_ID,
        userAId: PARTNER_ID,
        userBId: REQUESTER_ID,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      await expect(service.invite(REQUESTER_ID, PARTNER_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.couplePairing.create).not.toHaveBeenCalled();
    });

    it('rejects a duplicate pending invite between the same two users', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: PARTNER_ID });
      prisma.partnerLink.findFirst.mockResolvedValue(null);
      prisma.couplePairing.findFirst.mockResolvedValue({ id: 'existing-invite' });

      await expect(service.invite(REQUESTER_ID, PARTNER_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.couplePairing.create).not.toHaveBeenCalled();
    });

    it('creates a pending invite even when the requester already has other partners', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: PARTNER_ID });
      prisma.partnerLink.findFirst.mockResolvedValue(null);
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

  describe('listPartners', () => {
    it('maps each link to the other participant, with their display name', async () => {
      prisma.partnerLink.findMany.mockResolvedValue([
        {
          id: LINK_ID,
          userAId: REQUESTER_ID,
          userBId: PARTNER_ID,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
        {
          id: 'link-2',
          userAId: OTHER_PARTNER_ID,
          userBId: REQUESTER_ID,
          createdAt: new Date('2026-01-02T00:00:00.000Z'),
        },
      ]);
      prisma.user.findMany.mockResolvedValue([
        { id: PARTNER_ID, name: 'Alex' },
        { id: OTHER_PARTNER_ID, name: 'Sam' },
      ]);

      const result = await service.listPartners(REQUESTER_ID);

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { id: { in: [PARTNER_ID, OTHER_PARTNER_ID] } },
        select: { id: true, name: true },
      });
      expect(result).toEqual([
        {
          id: LINK_ID,
          partnerId: PARTNER_ID,
          partnerName: 'Alex',
          linkedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'link-2',
          partnerId: OTHER_PARTNER_ID,
          partnerName: 'Sam',
          linkedAt: '2026-01-02T00:00:00.000Z',
        },
      ]);
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

    it('accepting creates a partner link and marks the invite accepted', async () => {
      prisma.couplePairing.findUnique.mockResolvedValue({
        id: PAIRING_ID,
        requesterId: REQUESTER_ID,
        partnerId: PARTNER_ID,
        status: 'PENDING',
      });
      prisma.partnerLink.findFirst.mockResolvedValue(null);
      prisma.partnerLink.create.mockReturnValue('create-op');
      prisma.couplePairing.update.mockReturnValue('update-op');
      prisma.$transaction.mockResolvedValue([
        { id: LINK_ID, userAId: REQUESTER_ID, userBId: PARTNER_ID },
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

      expect(prisma.partnerLink.create).toHaveBeenCalledWith({
        data: { userAId: REQUESTER_ID, userBId: PARTNER_ID },
      });
      expect(prisma.$transaction).toHaveBeenCalledWith(['create-op', 'update-op']);
      expect(result.status).toBe('ACCEPTED');
    });

    it('accepting when already linked only updates the invite status', async () => {
      prisma.couplePairing.findUnique.mockResolvedValue({
        id: PAIRING_ID,
        requesterId: REQUESTER_ID,
        partnerId: PARTNER_ID,
        status: 'PENDING',
      });
      prisma.partnerLink.findFirst.mockResolvedValue({
        id: LINK_ID,
        userAId: REQUESTER_ID,
        userBId: PARTNER_ID,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      prisma.couplePairing.update.mockReturnValue('update-op');
      prisma.$transaction.mockResolvedValue([
        {
          id: PAIRING_ID,
          requesterId: REQUESTER_ID,
          partnerId: PARTNER_ID,
          status: 'ACCEPTED',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          respondedAt: new Date('2026-01-02T00:00:00.000Z'),
        },
      ]);

      await service.respond(PARTNER_ID, PAIRING_ID, true);

      expect(prisma.partnerLink.create).not.toHaveBeenCalled();
      expect(prisma.$transaction).toHaveBeenCalledWith(['update-op']);
    });
  });

  describe('setJointBrowsingMode', () => {
    it('rejects toggling joint browsing when the two users are not linked', async () => {
      prisma.partnerLink.findFirst.mockResolvedValue(null);

      await expect(service.setJointBrowsingMode(REQUESTER_ID, PARTNER_ID, true)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.partnerLink.update).not.toHaveBeenCalled();
    });

    it('enables joint browsing on the existing link', async () => {
      prisma.partnerLink.findFirst.mockResolvedValue({
        id: LINK_ID,
        userAId: REQUESTER_ID,
        userBId: PARTNER_ID,
        jointBrowsingEnabled: false,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      prisma.partnerLink.update.mockResolvedValue({
        id: LINK_ID,
        userAId: REQUESTER_ID,
        userBId: PARTNER_ID,
        jointBrowsingEnabled: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      prisma.user.findUnique.mockResolvedValue({ name: 'Alex' });

      const result = await service.setJointBrowsingMode(REQUESTER_ID, PARTNER_ID, true);

      expect(prisma.partnerLink.update).toHaveBeenCalledWith({
        where: { id: LINK_ID },
        data: { jointBrowsingEnabled: true },
      });
      expect(result).toEqual({
        id: LINK_ID,
        partnerId: PARTNER_ID,
        partnerName: 'Alex',
        linkedAt: '2026-01-01T00:00:00.000Z',
        jointBrowsingEnabled: true,
      });
    });
  });

  describe('getActiveBrowsingPartner', () => {
    it('reports null when the user is browsing solo', async () => {
      prisma.user.findUnique.mockResolvedValue({ activeBrowsingPartnerId: null });

      const result = await service.getActiveBrowsingPartner(REQUESTER_ID);

      expect(result).toEqual({ activeBrowsingPartnerId: null });
    });

    it('reports the currently active browsing partner', async () => {
      prisma.user.findUnique.mockResolvedValue({ activeBrowsingPartnerId: PARTNER_ID });

      const result = await service.getActiveBrowsingPartner(REQUESTER_ID);

      expect(result).toEqual({ activeBrowsingPartnerId: PARTNER_ID });
    });
  });

  describe('setActiveBrowsingPartner', () => {
    it('rejects switching to a partner without joint browsing enabled', async () => {
      prisma.partnerLink.findFirst.mockResolvedValue({
        id: LINK_ID,
        userAId: REQUESTER_ID,
        userBId: PARTNER_ID,
        jointBrowsingEnabled: false,
      });

      await expect(
        service.setActiveBrowsingPartner(REQUESTER_ID, PARTNER_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects switching to a partner who is not linked at all', async () => {
      prisma.partnerLink.findFirst.mockResolvedValue(null);

      await expect(
        service.setActiveBrowsingPartner(REQUESTER_ID, PARTNER_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('switches to joint browsing with a partner who has it enabled', async () => {
      prisma.partnerLink.findFirst.mockResolvedValue({
        id: LINK_ID,
        userAId: REQUESTER_ID,
        userBId: PARTNER_ID,
        jointBrowsingEnabled: true,
      });
      prisma.user.update.mockResolvedValue({ activeBrowsingPartnerId: PARTNER_ID });

      const result = await service.setActiveBrowsingPartner(REQUESTER_ID, PARTNER_ID);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: REQUESTER_ID },
        data: { activeBrowsingPartnerId: PARTNER_ID },
        select: { activeBrowsingPartnerId: true },
      });
      expect(result).toEqual({ activeBrowsingPartnerId: PARTNER_ID });
    });

    it('always allows switching back to solo browsing', async () => {
      prisma.user.update.mockResolvedValue({ activeBrowsingPartnerId: null });

      const result = await service.setActiveBrowsingPartner(REQUESTER_ID, null);

      expect(prisma.partnerLink.findFirst).not.toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: REQUESTER_ID },
        data: { activeBrowsingPartnerId: null },
        select: { activeBrowsingPartnerId: true },
      });
      expect(result).toEqual({ activeBrowsingPartnerId: null });
    });
  });

  describe('unpair', () => {
    it('rejects when the two users are not currently linked', async () => {
      prisma.partnerLink.findFirst.mockResolvedValue(null);

      await expect(service.unpair(REQUESTER_ID, PARTNER_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.partnerLink.delete).not.toHaveBeenCalled();
    });

    it('deletes only the link with the given partner', async () => {
      prisma.partnerLink.findFirst.mockResolvedValue({
        id: LINK_ID,
        userAId: REQUESTER_ID,
        userBId: PARTNER_ID,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.unpair(REQUESTER_ID, PARTNER_ID);

      expect(prisma.partnerLink.delete).toHaveBeenCalledWith({ where: { id: LINK_ID } });
      expect(result).toEqual({ unpaired: true });
    });
  });
});
