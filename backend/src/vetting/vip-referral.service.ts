import { randomBytes } from 'crypto';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ApplicationView } from './vetting.service';
import { MAX_ACTIVE_VIP_REFERRAL_CODES, REFERRAL_CODE_LENGTH } from './vetting.constants';

export interface VipReferralCodeView {
  code: string;
  consumedAt: string | null;
  consumedByUserId: string | null;
  createdAt: string;
}

interface ApplicationRecord {
  id: string;
  userId: string;
  status: string;
  referralCount: number;
  socialLinks: string[];
  decisionReason: string | null;
  createdAt: Date;
  decidedAt: Date | null;
}

/**
 * "VIP Referral Access Codes": lets a selfie-verified member (User.
 * isVerified) generate single-use invite codes that let a referred contact
 * bypass the standard Application waitlist/committee-approval queue
 * (VettingService.decide) entirely - unlike the reusable
 * User.referralCode/getMyReferralCode flow, which only counts toward the
 * normal REQUIRED_PEER_REFERRALS threshold and still needs a committee
 * decision.
 */
@Injectable()
export class VipReferralService {
  constructor(private readonly prisma: PrismaService) {}

  async generateVipCode(userId: string): Promise<VipReferralCodeView> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { isVerified: true } });
    if (!user?.isVerified) {
      throw new ForbiddenException('Only verified members can generate a VIP referral code.');
    }

    const activeCount = await this.prisma.vipReferralCode.count({
      where: { ownerId: userId, consumedAt: null },
    });
    if (activeCount >= MAX_ACTIVE_VIP_REFERRAL_CODES) {
      throw new BadRequestException(
        `You can only have ${MAX_ACTIVE_VIP_REFERRAL_CODES} unused VIP referral codes at a time.`,
      );
    }

    const code = this.generateCode();
    const created = await this.prisma.vipReferralCode.create({ data: { ownerId: userId, code } });
    return this.toCodeView(created);
  }

  async listMyVipCodes(userId: string): Promise<VipReferralCodeView[]> {
    const codes = await this.prisma.vipReferralCode.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: 'desc' },
    });
    return codes.map((code) => this.toCodeView(code));
  }

  /**
   * Redeems a VIP code: creates the applicant's Application if they haven't
   * applied yet (or reuses their still-PENDING one) and immediately marks it
   * APPROVED, skipping the peer-referral threshold and committee decision
   * that a normal application requires.
   */
  async redeemVipCode(applicantUserId: string, code: string): Promise<ApplicationView> {
    const vipCode = await this.prisma.vipReferralCode.findUnique({ where: { code } });
    if (!vipCode) {
      throw new NotFoundException('Invalid VIP referral code.');
    }
    if (vipCode.consumedAt) {
      throw new BadRequestException('This VIP referral code has already been used.');
    }
    if (vipCode.ownerId === applicantUserId) {
      throw new BadRequestException('You cannot redeem your own VIP referral code.');
    }

    const existingApplication = await this.prisma.application.findUnique({
      where: { userId: applicantUserId },
    });
    if (existingApplication && existingApplication.status !== 'PENDING') {
      throw new BadRequestException('This application is no longer pending.');
    }

    await this.prisma.vipReferralCode.update({
      where: { id: vipCode.id },
      data: { consumedAt: new Date(), consumedByUserId: applicantUserId },
    });

    const application = existingApplication
      ? await this.prisma.application.update({
          where: { id: existingApplication.id },
          data: {
            status: 'APPROVED',
            decidedByUserId: vipCode.ownerId,
            decisionReason: 'Approved via VIP referral bypass.',
            decidedAt: new Date(),
          },
        })
      : await this.prisma.application.create({
          data: {
            userId: applicantUserId,
            status: 'APPROVED',
            decidedByUserId: vipCode.ownerId,
            decisionReason: 'Approved via VIP referral bypass.',
            decidedAt: new Date(),
          },
        });

    return this.toApplicationView(application);
  }

  private generateCode(): string {
    return randomBytes(REFERRAL_CODE_LENGTH / 2)
      .toString('hex')
      .toUpperCase();
  }

  private toCodeView(code: {
    code: string;
    consumedAt: Date | null;
    consumedByUserId: string | null;
    createdAt: Date;
  }): VipReferralCodeView {
    return {
      code: code.code,
      consumedAt: code.consumedAt ? code.consumedAt.toISOString() : null,
      consumedByUserId: code.consumedByUserId,
      createdAt: code.createdAt.toISOString(),
    };
  }

  private toApplicationView(application: ApplicationRecord): ApplicationView {
    return {
      id: application.id,
      userId: application.userId,
      status: application.status,
      referralCount: application.referralCount,
      socialLinks: application.socialLinks,
      decisionReason: application.decisionReason,
      createdAt: application.createdAt.toISOString(),
      decidedAt: application.decidedAt ? application.decidedAt.toISOString() : null,
    };
  }
}
