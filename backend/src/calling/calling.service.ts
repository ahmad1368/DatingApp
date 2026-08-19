import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ACTIVE_CALL_STATUSES } from './calling.constants';

export interface CallSessionView {
  id: string;
  matchId: string;
  callerId: string;
  calleeId: string;
  type: string;
  status: string;
  offerSdp: string;
  answerSdp: string | null;
  createdAt: string;
  endedAt: string | null;
}

export interface IceCandidateView {
  id: string;
  senderId: string;
  candidate: string;
  createdAt: string;
}

interface CallSessionRecord {
  id: string;
  matchId: string;
  callerId: string;
  calleeId: string;
  type: string;
  status: string;
  offerSdp: string;
  answerSdp: string | null;
  createdAt: Date;
  endedAt: Date | null;
}

@Injectable()
export class CallingService {
  constructor(private readonly prisma: PrismaService) {}

  async initiateCall(
    callerId: string,
    calleeId: string,
    type: string,
    offerSdp: string,
  ): Promise<CallSessionView> {
    if (callerId === calleeId) {
      throw new BadRequestException('You cannot call yourself.');
    }

    const [userAId, userBId] = [callerId, calleeId].sort();
    const match = await this.prisma.match.findUnique({
      where: { userAId_userBId: { userAId, userBId } },
    });
    if (!match) {
      throw new NotFoundException('You can only call your matches.');
    }

    const existingActiveCall = await this.prisma.callSession.findFirst({
      where: { matchId: match.id, status: { in: ACTIVE_CALL_STATUSES } },
    });
    if (existingActiveCall) {
      throw new BadRequestException('There is already an active call with this match.');
    }

    const call = await this.prisma.callSession.create({
      data: { matchId: match.id, callerId, calleeId, type, offerSdp },
    });

    return this.toView(call);
  }

  async listIncomingCalls(userId: string): Promise<CallSessionView[]> {
    const calls = await this.prisma.callSession.findMany({
      where: { calleeId: userId, status: 'RINGING' },
      orderBy: { createdAt: 'desc' },
    });

    return calls.map((call) => this.toView(call));
  }

  async getCall(userId: string, callId: string): Promise<CallSessionView> {
    const call = await this.getCallForParticipant(userId, callId);
    return this.toView(call);
  }

  async answerCall(userId: string, callId: string, answerSdp: string): Promise<CallSessionView> {
    const call = await this.getCallForParticipant(userId, callId);

    if (call.calleeId !== userId) {
      throw new ForbiddenException('Only the callee can answer this call.');
    }
    if (call.status !== 'RINGING') {
      throw new BadRequestException('This call is no longer ringing.');
    }

    const updated = await this.prisma.callSession.update({
      where: { id: callId },
      data: { status: 'ACCEPTED', answerSdp },
    });

    return this.toView(updated);
  }

  async declineCall(userId: string, callId: string): Promise<CallSessionView> {
    const call = await this.getCallForParticipant(userId, callId);

    if (call.calleeId !== userId) {
      throw new ForbiddenException('Only the callee can decline this call.');
    }
    if (call.status !== 'RINGING') {
      throw new BadRequestException('This call is no longer ringing.');
    }

    const updated = await this.prisma.callSession.update({
      where: { id: callId },
      data: { status: 'DECLINED', endedAt: new Date() },
    });

    return this.toView(updated);
  }

  async endCall(userId: string, callId: string): Promise<CallSessionView> {
    const call = await this.getCallForParticipant(userId, callId);

    if (call.status === 'RINGING') {
      const updated = await this.prisma.callSession.update({
        where: { id: callId },
        data: { status: 'MISSED', endedAt: new Date() },
      });
      return this.toView(updated);
    }

    if (call.status === 'ACCEPTED') {
      const updated = await this.prisma.callSession.update({
        where: { id: callId },
        data: { status: 'ENDED', endedAt: new Date() },
      });
      return this.toView(updated);
    }

    throw new BadRequestException('This call has already ended.');
  }

  async submitIceCandidate(userId: string, callId: string, candidate: string): Promise<IceCandidateView> {
    const call = await this.getCallForParticipant(userId, callId);

    if (!ACTIVE_CALL_STATUSES.includes(call.status as (typeof ACTIVE_CALL_STATUSES)[number])) {
      throw new BadRequestException('This call is no longer active.');
    }

    const iceCandidate = await this.prisma.callIceCandidate.create({
      data: { callSessionId: callId, senderId: userId, candidate },
    });

    return {
      id: iceCandidate.id,
      senderId: iceCandidate.senderId,
      candidate: iceCandidate.candidate,
      createdAt: iceCandidate.createdAt.toISOString(),
    };
  }

  async listIceCandidatesFromPeer(userId: string, callId: string): Promise<IceCandidateView[]> {
    await this.getCallForParticipant(userId, callId);

    const candidates = await this.prisma.callIceCandidate.findMany({
      where: { callSessionId: callId, senderId: { not: userId } },
      orderBy: { createdAt: 'asc' },
    });

    return candidates.map((candidate) => ({
      id: candidate.id,
      senderId: candidate.senderId,
      candidate: candidate.candidate,
      createdAt: candidate.createdAt.toISOString(),
    }));
  }

  private async getCallForParticipant(userId: string, callId: string): Promise<CallSessionRecord> {
    const call = await this.prisma.callSession.findUnique({ where: { id: callId } });
    if (!call || (call.callerId !== userId && call.calleeId !== userId)) {
      throw new NotFoundException('Call not found.');
    }
    return call;
  }

  private toView(call: CallSessionRecord): CallSessionView {
    return {
      id: call.id,
      matchId: call.matchId,
      callerId: call.callerId,
      calleeId: call.calleeId,
      type: call.type,
      status: call.status,
      offerSdp: call.offerSdp,
      answerSdp: call.answerSdp,
      createdAt: call.createdAt.toISOString(),
      endedAt: call.endedAt ? call.endedAt.toISOString() : null,
    };
  }
}
