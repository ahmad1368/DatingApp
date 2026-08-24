import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VettingService } from './vetting.service';

const APPLICANT_ID = 'applicant-1';
const REFERRER_ID = 'referrer-1';
const COMMITTEE_ID = 'committee-1';
const APPLICATION_ID = 'application-1';

describe('VettingService', () => {
  let service: VettingService;
  let prisma: {
    application: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock; findMany: jest.Mock };
    referral: { findUnique: jest.Mock; create: jest.Mock };
    user: { findUnique: jest.Mock; update: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      application: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
      referral: { findUnique: jest.fn(), create: jest.fn() },
      user: { findUnique: jest.fn(), update: jest.fn() },
    };
    service = new VettingService(prisma as unknown as PrismaService);
  });

  describe('apply', () => {
    it('rejects a second application from the same user', async () => {
      prisma.application.findUnique.mockResolvedValue({ id: APPLICATION_ID });

      await expect(service.apply(APPLICANT_ID)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.application.create).not.toHaveBeenCalled();
    });

    it('creates a pending application with no social links by default', async () => {
      prisma.application.findUnique.mockResolvedValue(null);
      prisma.application.create.mockResolvedValue({
        id: APPLICATION_ID,
        userId: APPLICANT_ID,
        status: 'PENDING',
        referralCount: 0,
        socialLinks: [],
        decisionReason: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        decidedAt: null,
      });

      const result = await service.apply(APPLICANT_ID);

      expect(prisma.application.create).toHaveBeenCalledWith({
        data: { userId: APPLICANT_ID, socialLinks: [] },
      });
      expect(result.status).toBe('PENDING');
      expect(result.decidedAt).toBeNull();
    });

    it('submits social presence links with the application', async () => {
      const socialLinks = ['https://instagram.com/applicant', 'https://linkedin.com/in/applicant'];
      prisma.application.findUnique.mockResolvedValue(null);
      prisma.application.create.mockResolvedValue({
        id: APPLICATION_ID,
        userId: APPLICANT_ID,
        status: 'PENDING',
        referralCount: 0,
        socialLinks,
        decisionReason: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        decidedAt: null,
      });

      const result = await service.apply(APPLICANT_ID, socialLinks);

      expect(prisma.application.create).toHaveBeenCalledWith({
        data: { userId: APPLICANT_ID, socialLinks },
      });
      expect(result.socialLinks).toEqual(socialLinks);
    });
  });

  describe('getMyApplication', () => {
    it('throws when the user has not applied', async () => {
      prisma.application.findUnique.mockResolvedValue(null);

      await expect(service.getMyApplication(APPLICANT_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('refer', () => {
    it('rejects referring yourself', async () => {
      await expect(service.refer(APPLICANT_ID, APPLICANT_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects a referrer who is not an approved member', async () => {
      prisma.application.findUnique.mockResolvedValueOnce({ status: 'PENDING' });

      await expect(service.refer(REFERRER_ID, APPLICANT_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('throws when the applicant has no application', async () => {
      prisma.application.findUnique
        .mockResolvedValueOnce({ status: 'APPROVED' }) // referrer
        .mockResolvedValueOnce(null); // applicant

      await expect(service.refer(REFERRER_ID, APPLICANT_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects referring an application that is no longer pending', async () => {
      prisma.application.findUnique
        .mockResolvedValueOnce({ status: 'APPROVED' }) // referrer
        .mockResolvedValueOnce({ id: APPLICATION_ID, status: 'REJECTED' }); // applicant

      await expect(service.refer(REFERRER_ID, APPLICANT_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects a duplicate referral from the same member', async () => {
      prisma.application.findUnique
        .mockResolvedValueOnce({ status: 'APPROVED' })
        .mockResolvedValueOnce({ id: APPLICATION_ID, status: 'PENDING' });
      prisma.referral.findUnique.mockResolvedValue({ id: 'referral-1' });

      await expect(service.refer(REFERRER_ID, APPLICANT_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.referral.create).not.toHaveBeenCalled();
    });

    it('records the referral and increments the referral count', async () => {
      prisma.application.findUnique
        .mockResolvedValueOnce({ status: 'APPROVED' })
        .mockResolvedValueOnce({ id: APPLICATION_ID, status: 'PENDING' });
      prisma.referral.findUnique.mockResolvedValue(null);
      prisma.referral.create.mockResolvedValue({ id: 'referral-1' });
      prisma.application.update.mockResolvedValue({
        id: APPLICATION_ID,
        userId: APPLICANT_ID,
        status: 'PENDING',
        referralCount: 1,
        decisionReason: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        decidedAt: null,
      });

      const result = await service.refer(REFERRER_ID, APPLICANT_ID);

      expect(prisma.referral.create).toHaveBeenCalledWith({
        data: { applicationId: APPLICATION_ID, referrerUserId: REFERRER_ID },
      });
      expect(prisma.application.update).toHaveBeenCalledWith({
        where: { id: APPLICATION_ID },
        data: { referralCount: { increment: 1 } },
      });
      expect(result.referralCount).toBe(1);
    });
  });

  describe('redeemReferralCode', () => {
    it('rejects an unknown code', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.redeemReferralCode(APPLICANT_ID, 'DEADBEEF')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.application.findUnique).not.toHaveBeenCalled();
    });

    it('looks up the code owner and records the referral on their behalf', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: REFERRER_ID, referralCode: 'DEADBEEF' });
      prisma.application.findUnique
        .mockResolvedValueOnce({ status: 'APPROVED' }) // referrer's application
        .mockResolvedValueOnce({ id: APPLICATION_ID, status: 'PENDING' }); // applicant's application
      prisma.referral.findUnique.mockResolvedValue(null);
      prisma.referral.create.mockResolvedValue({ id: 'referral-1' });
      prisma.application.update.mockResolvedValue({
        id: APPLICATION_ID,
        userId: APPLICANT_ID,
        status: 'PENDING',
        referralCount: 1,
        socialLinks: [],
        decisionReason: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        decidedAt: null,
      });

      const result = await service.redeemReferralCode(APPLICANT_ID, 'DEADBEEF');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { referralCode: 'DEADBEEF' } });
      expect(prisma.referral.create).toHaveBeenCalledWith({
        data: { applicationId: APPLICATION_ID, referrerUserId: REFERRER_ID },
      });
      expect(result.referralCount).toBe(1);
    });
  });

  describe('getMyReferralCode', () => {
    it('rejects a user without an approved application', async () => {
      prisma.application.findUnique.mockResolvedValue({ status: 'PENDING' });

      await expect(service.getMyReferralCode(REFERRER_ID)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('returns the existing code without generating a new one', async () => {
      prisma.application.findUnique.mockResolvedValue({ status: 'APPROVED' });
      prisma.user.findUnique.mockResolvedValue({ referralCode: 'EXISTING1' });

      const result = await service.getMyReferralCode(REFERRER_ID);

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(result).toEqual({ referralCode: 'EXISTING1' });
    });

    it('generates and persists a code the first time', async () => {
      prisma.application.findUnique.mockResolvedValue({ status: 'APPROVED' });
      prisma.user.findUnique.mockResolvedValue({ referralCode: null });

      const result = await service.getMyReferralCode(REFERRER_ID);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: REFERRER_ID },
        data: { referralCode: expect.any(String) },
      });
      expect(result.referralCode).toHaveLength(8);
    });
  });

  describe('listQueue', () => {
    it('rejects non-committee members', async () => {
      prisma.user.findUnique.mockResolvedValue({ isCommitteeMember: false });

      await expect(service.listQueue(APPLICANT_ID)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns pending applications with their social links, without identifying fields', async () => {
      prisma.user.findUnique.mockResolvedValue({ isCommitteeMember: true });
      prisma.application.findMany.mockResolvedValue([
        {
          id: APPLICATION_ID,
          referralCount: 2,
          socialLinks: ['https://instagram.com/applicant'],
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);

      const queue = await service.listQueue(COMMITTEE_ID);

      expect(prisma.application.findMany).toHaveBeenCalledWith({
        where: { status: 'PENDING' },
        orderBy: [{ referralCount: 'desc' }, { createdAt: 'asc' }],
      });
      expect(queue).toEqual([
        {
          id: APPLICATION_ID,
          referralCount: 2,
          socialLinks: ['https://instagram.com/applicant'],
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ]);
    });
  });

  describe('decide', () => {
    it('rejects non-committee members', async () => {
      prisma.user.findUnique.mockResolvedValue({ isCommitteeMember: false });

      await expect(
        service.decide(APPLICANT_ID, APPLICATION_ID, 'APPROVED'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws when the application does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue({ isCommitteeMember: true });
      prisma.application.findUnique.mockResolvedValue(null);

      await expect(
        service.decide(COMMITTEE_ID, APPLICATION_ID, 'APPROVED'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects deciding an application that is already decided', async () => {
      prisma.user.findUnique.mockResolvedValue({ isCommitteeMember: true });
      prisma.application.findUnique.mockResolvedValue({ status: 'APPROVED', referralCount: 5 });

      await expect(
        service.decide(COMMITTEE_ID, APPLICATION_ID, 'REJECTED'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects approving an application without enough peer referrals', async () => {
      prisma.user.findUnique.mockResolvedValue({ isCommitteeMember: true });
      prisma.application.findUnique.mockResolvedValue({ status: 'PENDING', referralCount: 1 });

      await expect(
        service.decide(COMMITTEE_ID, APPLICATION_ID, 'APPROVED'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.application.update).not.toHaveBeenCalled();
    });

    it('allows rejecting regardless of referral count', async () => {
      prisma.user.findUnique.mockResolvedValue({ isCommitteeMember: true });
      prisma.application.findUnique.mockResolvedValue({ status: 'PENDING', referralCount: 0 });
      prisma.application.update.mockResolvedValue({
        id: APPLICATION_ID,
        userId: APPLICANT_ID,
        status: 'REJECTED',
        referralCount: 0,
        decisionReason: 'Not a fit',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        decidedAt: new Date('2026-01-02T00:00:00.000Z'),
      });

      const result = await service.decide(COMMITTEE_ID, APPLICATION_ID, 'REJECTED', 'Not a fit');

      expect(result.status).toBe('REJECTED');
      expect(result.decisionReason).toBe('Not a fit');
    });

    it('approves once enough peer referrals exist', async () => {
      prisma.user.findUnique.mockResolvedValue({ isCommitteeMember: true });
      prisma.application.findUnique.mockResolvedValue({ status: 'PENDING', referralCount: 2 });
      prisma.application.update.mockResolvedValue({
        id: APPLICATION_ID,
        userId: APPLICANT_ID,
        status: 'APPROVED',
        referralCount: 2,
        decisionReason: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        decidedAt: new Date('2026-01-02T00:00:00.000Z'),
      });

      const result = await service.decide(COMMITTEE_ID, APPLICATION_ID, 'APPROVED');

      expect(prisma.application.update).toHaveBeenCalledWith({
        where: { id: APPLICATION_ID },
        data: {
          status: 'APPROVED',
          decidedByUserId: COMMITTEE_ID,
          decisionReason: null,
          decidedAt: expect.any(Date),
        },
      });
      expect(result.status).toBe('APPROVED');
    });
  });
});
