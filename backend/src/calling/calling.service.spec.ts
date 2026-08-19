import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CallingService } from './calling.service';

const CALLER_ID = 'caller-1';
const CALLEE_ID = 'callee-1';
const OUTSIDER_ID = 'outsider-1';
const MATCH_ID = 'match-1';
const CALL_ID = 'call-1';

describe('CallingService', () => {
  let service: CallingService;
  let prisma: {
    match: { findUnique: jest.Mock };
    callSession: { findFirst: jest.Mock; findUnique: jest.Mock; findMany: jest.Mock; create: jest.Mock; update: jest.Mock };
    callIceCandidate: { create: jest.Mock; findMany: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      match: { findUnique: jest.fn() },
      callSession: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      callIceCandidate: { create: jest.fn(), findMany: jest.fn() },
    };
    service = new CallingService(prisma as unknown as PrismaService);
  });

  function mockCall(overrides: Partial<{
    callerId: string;
    calleeId: string;
    status: string;
  }> = {}) {
    const call = {
      id: CALL_ID,
      matchId: MATCH_ID,
      callerId: CALLER_ID,
      calleeId: CALLEE_ID,
      type: 'AUDIO',
      status: 'RINGING',
      offerSdp: 'offer',
      answerSdp: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      endedAt: null,
      ...overrides,
    };
    prisma.callSession.findUnique.mockResolvedValue(call);
    return call;
  }

  describe('initiateCall', () => {
    it('rejects calling yourself', async () => {
      await expect(
        service.initiateCall(CALLER_ID, CALLER_ID, 'AUDIO', 'offer'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws when the two users are not matched', async () => {
      prisma.match.findUnique.mockResolvedValue(null);

      await expect(
        service.initiateCall(CALLER_ID, CALLEE_ID, 'AUDIO', 'offer'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects starting a call when one is already active for the match', async () => {
      prisma.match.findUnique.mockResolvedValue({ id: MATCH_ID });
      prisma.callSession.findFirst.mockResolvedValue({ id: 'existing-call' });

      await expect(
        service.initiateCall(CALLER_ID, CALLEE_ID, 'AUDIO', 'offer'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.callSession.create).not.toHaveBeenCalled();
    });

    it('creates a ringing call session', async () => {
      prisma.match.findUnique.mockResolvedValue({ id: MATCH_ID });
      prisma.callSession.findFirst.mockResolvedValue(null);
      prisma.callSession.create.mockResolvedValue({
        id: CALL_ID,
        matchId: MATCH_ID,
        callerId: CALLER_ID,
        calleeId: CALLEE_ID,
        type: 'VIDEO',
        status: 'RINGING',
        offerSdp: 'offer-sdp',
        answerSdp: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        endedAt: null,
      });

      const result = await service.initiateCall(CALLER_ID, CALLEE_ID, 'VIDEO', 'offer-sdp');

      expect(prisma.callSession.create).toHaveBeenCalledWith({
        data: { matchId: MATCH_ID, callerId: CALLER_ID, calleeId: CALLEE_ID, type: 'VIDEO', offerSdp: 'offer-sdp' },
      });
      expect(result.status).toBe('RINGING');
    });
  });

  describe('getCall', () => {
    it('throws when the requester is not a participant', async () => {
      mockCall();

      await expect(service.getCall(OUTSIDER_ID, CALL_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('answerCall', () => {
    it('rejects when the caller tries to answer their own call', async () => {
      mockCall();

      await expect(service.answerCall(CALLER_ID, CALL_ID, 'answer')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('rejects answering a call that is no longer ringing', async () => {
      mockCall({ status: 'ACCEPTED' });

      await expect(service.answerCall(CALLEE_ID, CALL_ID, 'answer')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('accepts the call and stores the answer SDP', async () => {
      mockCall();
      prisma.callSession.update.mockResolvedValue({
        id: CALL_ID,
        matchId: MATCH_ID,
        callerId: CALLER_ID,
        calleeId: CALLEE_ID,
        type: 'AUDIO',
        status: 'ACCEPTED',
        offerSdp: 'offer',
        answerSdp: 'answer-sdp',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        endedAt: null,
      });

      const result = await service.answerCall(CALLEE_ID, CALL_ID, 'answer-sdp');

      expect(prisma.callSession.update).toHaveBeenCalledWith({
        where: { id: CALL_ID },
        data: { status: 'ACCEPTED', answerSdp: 'answer-sdp' },
      });
      expect(result.status).toBe('ACCEPTED');
    });
  });

  describe('declineCall', () => {
    it('rejects when the caller tries to decline their own call', async () => {
      mockCall();

      await expect(service.declineCall(CALLER_ID, CALL_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('declines a ringing call', async () => {
      mockCall();
      prisma.callSession.update.mockResolvedValue({
        id: CALL_ID,
        matchId: MATCH_ID,
        callerId: CALLER_ID,
        calleeId: CALLEE_ID,
        type: 'AUDIO',
        status: 'DECLINED',
        offerSdp: 'offer',
        answerSdp: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        endedAt: new Date('2026-01-01T00:01:00.000Z'),
      });

      const result = await service.declineCall(CALLEE_ID, CALL_ID);

      expect(result.status).toBe('DECLINED');
      expect(result.endedAt).not.toBeNull();
    });
  });

  describe('endCall', () => {
    it('marks a still-ringing call as missed', async () => {
      mockCall({ status: 'RINGING' });
      prisma.callSession.update.mockResolvedValue({
        id: CALL_ID,
        matchId: MATCH_ID,
        callerId: CALLER_ID,
        calleeId: CALLEE_ID,
        type: 'AUDIO',
        status: 'MISSED',
        offerSdp: 'offer',
        answerSdp: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        endedAt: new Date('2026-01-01T00:01:00.000Z'),
      });

      const result = await service.endCall(CALLER_ID, CALL_ID);

      expect(prisma.callSession.update).toHaveBeenCalledWith({
        where: { id: CALL_ID },
        data: { status: 'MISSED', endedAt: expect.any(Date) },
      });
      expect(result.status).toBe('MISSED');
    });

    it('marks an accepted call as ended', async () => {
      mockCall({ status: 'ACCEPTED' });
      prisma.callSession.update.mockResolvedValue({
        id: CALL_ID,
        matchId: MATCH_ID,
        callerId: CALLER_ID,
        calleeId: CALLEE_ID,
        type: 'AUDIO',
        status: 'ENDED',
        offerSdp: 'offer',
        answerSdp: 'answer',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        endedAt: new Date('2026-01-01T00:01:00.000Z'),
      });

      const result = await service.endCall(CALLEE_ID, CALL_ID);

      expect(result.status).toBe('ENDED');
    });

    it('rejects ending an already-ended call', async () => {
      mockCall({ status: 'DECLINED' });

      await expect(service.endCall(CALLER_ID, CALL_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('submitIceCandidate', () => {
    it('throws when the requester is not a participant', async () => {
      mockCall();

      await expect(
        service.submitIceCandidate(OUTSIDER_ID, CALL_ID, 'candidate'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects submitting a candidate once the call has ended', async () => {
      mockCall({ status: 'ENDED' });

      await expect(
        service.submitIceCandidate(CALLER_ID, CALL_ID, 'candidate'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.callIceCandidate.create).not.toHaveBeenCalled();
    });

    it('records an ICE candidate for an active call', async () => {
      mockCall({ status: 'ACCEPTED' });
      prisma.callIceCandidate.create.mockResolvedValue({
        id: 'candidate-1',
        senderId: CALLER_ID,
        candidate: 'candidate-payload',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.submitIceCandidate(CALLER_ID, CALL_ID, 'candidate-payload');

      expect(prisma.callIceCandidate.create).toHaveBeenCalledWith({
        data: { callSessionId: CALL_ID, senderId: CALLER_ID, candidate: 'candidate-payload' },
      });
      expect(result.candidate).toBe('candidate-payload');
    });
  });

  describe('listIceCandidatesFromPeer', () => {
    it('throws when the requester is not a participant', async () => {
      mockCall();

      await expect(
        service.listIceCandidatesFromPeer(OUTSIDER_ID, CALL_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns only candidates sent by the other party', async () => {
      mockCall();
      prisma.callIceCandidate.findMany.mockResolvedValue([
        { id: 'c1', senderId: CALLEE_ID, candidate: 'from-callee', createdAt: new Date('2026-01-01T00:00:00.000Z') },
      ]);

      const result = await service.listIceCandidatesFromPeer(CALLER_ID, CALL_ID);

      expect(prisma.callIceCandidate.findMany).toHaveBeenCalledWith({
        where: { callSessionId: CALL_ID, senderId: { not: CALLER_ID } },
        orderBy: { createdAt: 'asc' },
      });
      expect(result).toEqual([
        { id: 'c1', senderId: CALLEE_ID, candidate: 'from-callee', createdAt: '2026-01-01T00:00:00.000Z' },
      ]);
    });
  });
});
