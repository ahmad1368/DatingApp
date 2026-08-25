import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getBlockedUserIds } from '../blocking/blocking.utils';
import { computeFirstMessageExpiresAt } from '../messaging/messaging.constants';
import {
  EVENT_DAY_OF_WEEK,
  EVENT_END_HOUR_UTC,
  EVENT_START_HOUR_UTC,
  computeRoundEndsAt,
  isEventLive,
} from './speed-dating.constants';

export type SpeedDatingStatus = 'NONE' | 'WAITING' | 'IN_ROUND' | 'ENDED';

export interface SpeedDatingEventSchedule {
  live: boolean;
  dayOfWeek: number;
  startHourUtc: number;
  endHourUtc: number;
}

export interface SpeedDatingStatusView {
  status: SpeedDatingStatus;
  roundId: string | null;
  endsAt: string | null;
  myDecision: boolean | null;
  otherDecided: boolean;
  matched: boolean;
}

export interface SpeedDatingIceCandidateView {
  id: string;
  senderId: string;
  candidate: string;
  createdAt: string;
}

interface RoundRecord {
  id: string;
  userAId: string;
  userBId: string;
  endsAt: Date;
  offerSdp: string | null;
  answerSdp: string | null;
  userADecision: boolean | null;
  userBDecision: boolean | null;
  matchId: string | null;
}

@Injectable()
export class SpeedDatingService {
  constructor(private readonly prisma: PrismaService) {}

  getEventSchedule(): SpeedDatingEventSchedule {
    return {
      live: isEventLive(new Date()),
      dayOfWeek: EVENT_DAY_OF_WEEK,
      startHourUtc: EVENT_START_HOUR_UTC,
      endHourUtc: EVENT_END_HOUR_UTC,
    };
  }

  /**
   * Joins the live event's matchmaking queue: pairs with the longest-waiting
   * eligible stranger if one exists (mutual blocks excluded, same as blind
   * dating and the main discovery deck), otherwise starts waiting. Only
   * accepted during the scheduled weekly window.
   */
  async joinQueue(userId: string): Promise<SpeedDatingStatusView> {
    const now = new Date();
    if (!isEventLive(now)) {
      throw new BadRequestException('Speed Dating is only open during its scheduled weekly window.');
    }

    const currentRound = await this.findMostRecentRound(userId);
    if (currentRound && !this.isRoundOver(currentRound, now)) {
      throw new BadRequestException('You are already in a speed dating round.');
    }

    const existingQueueEntry = await this.prisma.speedDatingQueueEntry.findUnique({
      where: { userId },
    });
    if (existingQueueEntry) {
      return this.getStatus(userId);
    }

    const blockedIds = await getBlockedUserIds(this.prisma, userId);
    const waitingPartner = await this.prisma.speedDatingQueueEntry.findFirst({
      where: { userId: { notIn: [userId, ...blockedIds] } },
      orderBy: { joinedAt: 'asc' },
    });

    if (!waitingPartner) {
      await this.prisma.speedDatingQueueEntry.create({ data: { userId } });
      return this.getStatus(userId);
    }

    const [userAId, userBId] = [userId, waitingPartner.userId].sort();
    await this.prisma.$transaction([
      this.prisma.speedDatingQueueEntry.delete({ where: { userId: waitingPartner.userId } }),
      this.prisma.speedDatingRound.create({
        data: { userAId, userBId, endsAt: computeRoundEndsAt(now) },
      }),
    ]);

    return this.getStatus(userId);
  }

  async leaveQueue(userId: string): Promise<void> {
    await this.prisma.speedDatingQueueEntry.deleteMany({ where: { userId } });
  }

  async getStatus(userId: string): Promise<SpeedDatingStatusView> {
    const round = await this.findMostRecentRound(userId);
    if (round && !this.isRoundOver(round, new Date())) {
      return this.toStatusView(userId, round, 'IN_ROUND');
    }

    const queueEntry = await this.prisma.speedDatingQueueEntry.findUnique({ where: { userId } });
    if (queueEntry) {
      return this.emptyStatus('WAITING');
    }

    if (round) {
      return this.toStatusView(userId, round, 'ENDED');
    }

    return this.emptyStatus('NONE');
  }

  async submitOffer(userId: string, roundId: string, offerSdp: string): Promise<SpeedDatingStatusView> {
    const round = await this.getOwnedRound(userId, roundId);
    if (this.isRoundOver(round, new Date())) {
      throw new BadRequestException('This round has ended.');
    }

    const updated = await this.prisma.speedDatingRound.update({
      where: { id: roundId },
      data: { offerSdp },
    });

    return this.toStatusView(userId, updated, 'IN_ROUND');
  }

  async submitAnswer(userId: string, roundId: string, answerSdp: string): Promise<SpeedDatingStatusView> {
    const round = await this.getOwnedRound(userId, roundId);
    if (this.isRoundOver(round, new Date())) {
      throw new BadRequestException('This round has ended.');
    }
    if (!round.offerSdp) {
      throw new BadRequestException('Wait for the other participant to send an offer first.');
    }

    const updated = await this.prisma.speedDatingRound.update({
      where: { id: roundId },
      data: { answerSdp },
    });

    return this.toStatusView(userId, updated, 'IN_ROUND');
  }

  async submitIceCandidate(
    userId: string,
    roundId: string,
    candidate: string,
  ): Promise<SpeedDatingIceCandidateView> {
    await this.getOwnedRound(userId, roundId);

    const iceCandidate = await this.prisma.speedDatingIceCandidate.create({
      data: { roundId, senderId: userId, candidate },
    });

    return {
      id: iceCandidate.id,
      senderId: iceCandidate.senderId,
      candidate: iceCandidate.candidate,
      createdAt: iceCandidate.createdAt.toISOString(),
    };
  }

  async listIceCandidatesFromPeer(userId: string, roundId: string): Promise<SpeedDatingIceCandidateView[]> {
    await this.getOwnedRound(userId, roundId);

    const candidates = await this.prisma.speedDatingIceCandidate.findMany({
      where: { roundId, senderId: { not: userId } },
      orderBy: { createdAt: 'asc' },
    });

    return candidates.map((candidate) => ({
      id: candidate.id,
      senderId: candidate.senderId,
      candidate: candidate.candidate,
      createdAt: candidate.createdAt.toISOString(),
    }));
  }

  /**
   * Records this user's end-of-round choice. Once both sides have chosen to
   * match, a real Match is created (same as a mutual swipe) so the pair can
   * carry on in Messaging - a round on its own never exposes the other
   * side's choice before both are in, so nobody can decide risk-free.
   */
  async decideRound(userId: string, roundId: string, wantsMatch: boolean): Promise<SpeedDatingStatusView> {
    const round = await this.getOwnedRound(userId, roundId);
    const isUserA = round.userAId === userId;

    const updated = await this.prisma.speedDatingRound.update({
      where: { id: roundId },
      data: isUserA ? { userADecision: wantsMatch } : { userBDecision: wantsMatch },
    });

    const finalRound =
      updated.userADecision === true && updated.userBDecision === true && !updated.matchId
        ? await this.createMatchForRound(updated)
        : updated;

    return this.toStatusView(
      userId,
      finalRound,
      this.isRoundOver(finalRound, new Date()) ? 'ENDED' : 'IN_ROUND',
    );
  }

  private async createMatchForRound(round: RoundRecord): Promise<RoundRecord> {
    const [userAId, userBId] = [round.userAId, round.userBId].sort();
    const match = await this.prisma.match.create({
      data: { userAId, userBId, firstMessageExpiresAt: computeFirstMessageExpiresAt(new Date()) },
    });

    return this.prisma.speedDatingRound.update({
      where: { id: round.id },
      data: { matchId: match.id },
    });
  }

  private async getOwnedRound(userId: string, roundId: string): Promise<RoundRecord> {
    const round = await this.prisma.speedDatingRound.findUnique({ where: { id: roundId } });
    if (!round || (round.userAId !== userId && round.userBId !== userId)) {
      throw new NotFoundException('Speed dating round not found.');
    }
    return round;
  }

  private async findMostRecentRound(userId: string): Promise<RoundRecord | null> {
    return this.prisma.speedDatingRound.findFirst({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      orderBy: { startedAt: 'desc' },
    });
  }

  private isRoundOver(round: RoundRecord, now: Date): boolean {
    return now > round.endsAt;
  }

  private toStatusView(userId: string, round: RoundRecord, status: SpeedDatingStatus): SpeedDatingStatusView {
    const isUserA = round.userAId === userId;
    const myDecision = isUserA ? round.userADecision : round.userBDecision;
    const otherDecision = isUserA ? round.userBDecision : round.userADecision;

    return {
      status,
      roundId: round.id,
      endsAt: round.endsAt.toISOString(),
      myDecision: myDecision ?? null,
      otherDecided: otherDecision !== null && otherDecision !== undefined,
      matched: round.matchId != null,
    };
  }

  private emptyStatus(status: SpeedDatingStatus): SpeedDatingStatusView {
    return {
      status,
      roundId: null,
      endsAt: null,
      myDecision: null,
      otherDecided: false,
      matched: false,
    };
  }
}
