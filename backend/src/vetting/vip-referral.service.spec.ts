import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MAX_ACTIVE_VIP_REFERRAL_CODES } from './vetting.constants';
import { VipReferralService } from './vip-referral.service';

const OWNER_ID = 'owner-1';
const APPLICANT_ID = 'applicant-1';
const APPLICATION_ID = 'application-1';

describe('VipReferralService', () => {
  let service: VipReferralService;
  let prisma: {
    user: { findUnique: jest.Mock };
    vipReferralCode: { count: jest.Mock; create: jest.Mock; findMany: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    application: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn() },
      vipReferralCode: {
        count: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      application: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    };
    service = new VipReferralService(prisma as unknown as PrismaService);
  });

  describe('generateVipCode', () => {
    it('rejects an unverified user', async () => {
      prisma.user.findUnique.mockResolvedValue({ isVerified: false });

      await expect(service.generateVipCode(OWNER_ID)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.vipReferralCode.create).not.toHaveBeenCalled();
    });

    it('rejects generating beyond the active code limit', async () => {
      prisma.user.findUnique.mockResolvedValue({ isVerified: true });
      prisma.vipReferralCode.count.mockResolvedValue(MAX_ACTIVE_VIP_REFERRAL_CODES);

      await expect(service.generateVipCode(OWNER_ID)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.vipReferralCode.create).not.toHaveBeenCalled();
    });

    it('creates a code for a verified member under the limit', async () => {
      prisma.user.findUnique.mockResolvedValue({ isVerified: true });
      prisma.vipReferralCode.count.mockResolvedValue(0);
      prisma.vipReferralCode.create.mockImplementation(({ data }) =>
        Promise.resolve({ ...data, consumedAt: null, consumedByUserId: null, createdAt: new Date('2026-01-01T00:00:00.000Z') }),
      );

      const result = await service.generateVipCode(OWNER_ID);

      expect(prisma.vipReferralCode.create).toHaveBeenCalledWith({
        data: { ownerId: OWNER_ID, code: expect.any(String) },
      });
      expect(result.consumedAt).toBeNull();
      expect(result.code).toHaveLength(8);
    });
  });

  describe('listMyVipCodes', () => {
    it('maps codes to their public view', async () => {
      prisma.vipReferralCode.findMany.mockResolvedValue([
        {
          code: 'ABCD1234',
          consumedAt: new Date('2026-01-02T00:00:00.000Z'),
          consumedByUserId: APPLICANT_ID,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);

      const result = await service.listMyVipCodes(OWNER_ID);

      expect(result).toEqual([
        {
          code: 'ABCD1234',
          consumedAt: '2026-01-02T00:00:00.000Z',
          consumedByUserId: APPLICANT_ID,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ]);
    });
  });

  describe('redeemVipCode', () => {
    it('throws when the code does not exist', async () => {
      prisma.vipReferralCode.findUnique.mockResolvedValue(null);

      await expect(service.redeemVipCode(APPLICANT_ID, 'BADCODE1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects an already-used code', async () => {
      prisma.vipReferralCode.findUnique.mockResolvedValue({
        id: 'code-1',
        ownerId: OWNER_ID,
        consumedAt: new Date(),
      });

      await expect(service.redeemVipCode(APPLICANT_ID, 'ABCD1234')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects redeeming your own code', async () => {
      prisma.vipReferralCode.findUnique.mockResolvedValue({
        id: 'code-1',
        ownerId: OWNER_ID,
        consumedAt: null,
      });

      await expect(service.redeemVipCode(OWNER_ID, 'ABCD1234')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects when an existing application is no longer pending', async () => {
      prisma.vipReferralCode.findUnique.mockResolvedValue({
        id: 'code-1',
        ownerId: OWNER_ID,
        consumedAt: null,
      });
      prisma.application.findUnique.mockResolvedValue({ id: APPLICATION_ID, status: 'REJECTED' });

      await expect(service.redeemVipCode(APPLICANT_ID, 'ABCD1234')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.vipReferralCode.update).not.toHaveBeenCalled();
    });

    it('creates and instantly approves an application when the applicant has not applied yet', async () => {
      prisma.vipReferralCode.findUnique.mockResolvedValue({
        id: 'code-1',
        ownerId: OWNER_ID,
        consumedAt: null,
      });
      prisma.application.findUnique.mockResolvedValue(null);
      prisma.application.create.mockResolvedValue({
        id: APPLICATION_ID,
        userId: APPLICANT_ID,
        status: 'APPROVED',
        referralCount: 0,
        socialLinks: [],
        decisionReason: 'Approved via VIP referral bypass.',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        decidedAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.redeemVipCode(APPLICANT_ID, 'ABCD1234');

      expect(prisma.vipReferralCode.update).toHaveBeenCalledWith({
        where: { id: 'code-1' },
        data: { consumedAt: expect.any(Date), consumedByUserId: APPLICANT_ID },
      });
      expect(prisma.application.create).toHaveBeenCalledWith({
        data: {
          userId: APPLICANT_ID,
          status: 'APPROVED',
          decidedByUserId: OWNER_ID,
          decisionReason: 'Approved via VIP referral bypass.',
          decidedAt: expect.any(Date),
        },
      });
      expect(result.status).toBe('APPROVED');
    });

    it('approves an existing pending application', async () => {
      prisma.vipReferralCode.findUnique.mockResolvedValue({
        id: 'code-1',
        ownerId: OWNER_ID,
        consumedAt: null,
      });
      prisma.application.findUnique.mockResolvedValue({
        id: APPLICATION_ID,
        userId: APPLICANT_ID,
        status: 'PENDING',
      });
      prisma.application.update.mockResolvedValue({
        id: APPLICATION_ID,
        userId: APPLICANT_ID,
        status: 'APPROVED',
        referralCount: 0,
        socialLinks: [],
        decisionReason: 'Approved via VIP referral bypass.',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        decidedAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.redeemVipCode(APPLICANT_ID, 'ABCD1234');

      expect(prisma.application.update).toHaveBeenCalledWith({
        where: { id: APPLICATION_ID },
        data: {
          status: 'APPROVED',
          decidedByUserId: OWNER_ID,
          decisionReason: 'Approved via VIP referral bypass.',
          decidedAt: expect.any(Date),
        },
      });
      expect(result.status).toBe('APPROVED');
    });
  });
});
