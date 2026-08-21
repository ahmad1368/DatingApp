import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CouplePairingView {
  id: string;
  requesterId: string;
  partnerId: string;
  status: string;
  createdAt: string;
  respondedAt: string | null;
}

export interface PartnerLinkView {
  id: string;
  partnerId: string;
  linkedAt: string;
}

interface CouplePairingRecord {
  id: string;
  requesterId: string;
  partnerId: string;
  status: string;
  createdAt: Date;
  respondedAt: Date | null;
}

interface PartnerLinkRecord {
  id: string;
  userAId: string;
  userBId: string;
  createdAt: Date;
}

@Injectable()
export class CouplePairingService {
  constructor(private readonly prisma: PrismaService) {}

  async invite(requesterId: string, partnerUserId: string): Promise<CouplePairingView> {
    if (requesterId === partnerUserId) {
      throw new BadRequestException('You cannot pair with yourself.');
    }

    const partner = await this.prisma.user.findUnique({ where: { id: partnerUserId } });
    if (!partner) {
      throw new NotFoundException('User not found.');
    }

    const existingLink = await this.findLink(requesterId, partnerUserId);
    if (existingLink) {
      throw new BadRequestException('You are already linked with this person.');
    }

    const existingPending = await this.prisma.couplePairing.findFirst({
      where: {
        status: 'PENDING',
        OR: [
          { requesterId, partnerId: partnerUserId },
          { requesterId: partnerUserId, partnerId: requesterId },
        ],
      },
    });
    if (existingPending) {
      throw new BadRequestException('A pairing invite is already pending between you two.');
    }

    const pairing = await this.prisma.couplePairing.create({
      data: { requesterId, partnerId: partnerUserId },
    });

    return this.toView(pairing);
  }

  async listIncoming(userId: string): Promise<CouplePairingView[]> {
    const pairings = await this.prisma.couplePairing.findMany({
      where: { partnerId: userId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });

    return pairings.map((pairing) => this.toView(pairing));
  }

  /**
   * All of a user's currently active partner links. A user may hold more
   * than one concurrently, to support polyamorous relationship structures.
   */
  async listPartners(userId: string): Promise<PartnerLinkView[]> {
    const links = await this.prisma.partnerLink.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      orderBy: { createdAt: 'desc' },
    });

    return links.map((link) => this.toPartnerLinkView(userId, link));
  }

  async respond(userId: string, pairingId: string, accept: boolean): Promise<CouplePairingView> {
    const pairing = await this.prisma.couplePairing.findUnique({ where: { id: pairingId } });
    if (!pairing || pairing.partnerId !== userId) {
      throw new NotFoundException('Pairing invite not found.');
    }
    if (pairing.status !== 'PENDING') {
      throw new BadRequestException('This pairing invite has already been responded to.');
    }

    const now = new Date();

    if (!accept) {
      const declined = await this.prisma.couplePairing.update({
        where: { id: pairingId },
        data: { status: 'DECLINED', respondedAt: now },
      });
      return this.toView(declined);
    }

    const existingLink = await this.findLink(pairing.requesterId, pairing.partnerId);

    const operations = [];
    if (!existingLink) {
      operations.push(
        this.prisma.partnerLink.create({
          data: { userAId: pairing.requesterId, userBId: pairing.partnerId },
        }),
      );
    }
    operations.push(
      this.prisma.couplePairing.update({
        where: { id: pairingId },
        data: { status: 'ACCEPTED', respondedAt: now },
      }),
    );

    const results = await this.prisma.$transaction(operations);
    const acceptedPairing = results[results.length - 1] as CouplePairingRecord;

    return this.toView(acceptedPairing);
  }

  /** Unlinks the caller from one specific partner, leaving any others intact. */
  async unpair(userId: string, partnerId: string): Promise<{ unpaired: boolean }> {
    const link = await this.findLink(userId, partnerId);
    if (!link) {
      throw new BadRequestException('You are not currently linked with this person.');
    }

    await this.prisma.partnerLink.delete({ where: { id: link.id } });

    return { unpaired: true };
  }

  private async findLink(userId: string, otherUserId: string): Promise<PartnerLinkRecord | null> {
    return this.prisma.partnerLink.findFirst({
      where: {
        OR: [
          { userAId: userId, userBId: otherUserId },
          { userAId: otherUserId, userBId: userId },
        ],
      },
    });
  }

  private toView(pairing: CouplePairingRecord): CouplePairingView {
    return {
      id: pairing.id,
      requesterId: pairing.requesterId,
      partnerId: pairing.partnerId,
      status: pairing.status,
      createdAt: pairing.createdAt.toISOString(),
      respondedAt: pairing.respondedAt ? pairing.respondedAt.toISOString() : null,
    };
  }

  private toPartnerLinkView(userId: string, link: PartnerLinkRecord): PartnerLinkView {
    return {
      id: link.id,
      partnerId: link.userAId === userId ? link.userBId : link.userAId,
      linkedAt: link.createdAt.toISOString(),
    };
  }
}
