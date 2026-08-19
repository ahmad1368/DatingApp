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

interface CouplePairingRecord {
  id: string;
  requesterId: string;
  partnerId: string;
  status: string;
  createdAt: Date;
  respondedAt: Date | null;
}

@Injectable()
export class CouplePairingService {
  constructor(private readonly prisma: PrismaService) {}

  async invite(requesterId: string, partnerUserId: string): Promise<CouplePairingView> {
    if (requesterId === partnerUserId) {
      throw new BadRequestException('You cannot pair with yourself.');
    }

    const [requester, partner] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: requesterId } }),
      this.prisma.user.findUnique({ where: { id: partnerUserId } }),
    ]);

    if (!partner) {
      throw new NotFoundException('User not found.');
    }
    if (requester?.partnerUserId) {
      throw new BadRequestException('You are already paired with someone.');
    }
    if (partner.partnerUserId) {
      throw new BadRequestException('This user is already paired with someone.');
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

    const [, , acceptedPairing] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: pairing.requesterId },
        data: { partnerUserId: pairing.partnerId },
      }),
      this.prisma.user.update({
        where: { id: pairing.partnerId },
        data: { partnerUserId: pairing.requesterId },
      }),
      this.prisma.couplePairing.update({
        where: { id: pairingId },
        data: { status: 'ACCEPTED', respondedAt: now },
      }),
    ]);

    return this.toView(acceptedPairing as CouplePairingRecord);
  }

  async unpair(userId: string): Promise<{ unpaired: boolean }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.partnerUserId) {
      throw new BadRequestException('You are not currently paired.');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { partnerUserId: null } }),
      this.prisma.user.update({ where: { id: user.partnerUserId }, data: { partnerUserId: null } }),
    ]);

    return { unpaired: true };
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
}
