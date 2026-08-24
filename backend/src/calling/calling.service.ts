import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { findIcebreakerPrompt } from '../messaging/messaging.constants';
import {
  CONTENT_MODERATOR,
  ContentModerator,
  ModerationResult,
} from '../messaging/interfaces/content-moderator.interface';
import { SafetyService, UserReportView } from '../safety/safety.service';
import { ACTIVE_CALL_STATUSES, findVirtualBackground } from './calling.constants';

export interface CallSessionView {
  id: string;
  matchId: string;
  callerId: string;
  calleeId: string;
  type: string;
  status: string;
  offerSdp: string;
  answerSdp: string | null;
  virtualBackgroundId: string | null;
  activeIcebreakerPromptId: string | null;
  callerMuted: boolean;
  calleeMuted: boolean;
  callerVideoEnabled: boolean;
  calleeVideoEnabled: boolean;
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
  virtualBackgroundId: string | null;
  activeIcebreakerPromptId: string | null;
  callerMuted: boolean;
  calleeMuted: boolean;
  callerVideoEnabled: boolean;
  calleeVideoEnabled: boolean;
  createdAt: Date;
  endedAt: Date | null;
}

@Injectable()
export class CallingService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CONTENT_MODERATOR) private readonly contentModerator: ContentModerator,
    private readonly safetyService: SafetyService,
  ) {}

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
    await this.getActiveCallForParticipant(userId, callId);

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

  /** "Video Date Mode": lets a participant pick a virtual background for their own feed. */
  async setVirtualBackground(
    userId: string,
    callId: string,
    backgroundId: string,
  ): Promise<CallSessionView> {
    const call = await this.getActiveCallForParticipant(userId, callId);
    if (!findVirtualBackground(backgroundId)) {
      throw new BadRequestException('Unknown virtual background.');
    }

    const updated = await this.prisma.callSession.update({
      where: { id: call.id },
      data: { virtualBackgroundId: backgroundId },
    });

    return this.toView(updated);
  }

  /**
   * "Video Date Mode": either participant can surface (or clear, by
   * omitting promptId) a shared icebreaker question overlay during the
   * call - purely a display prompt, not tied to the in-chat icebreaker
   * response mechanism.
   */
  async setIcebreakerOverlay(
    userId: string,
    callId: string,
    promptId?: string,
  ): Promise<CallSessionView> {
    const call = await this.getActiveCallForParticipant(userId, callId);
    if (promptId != null && !findIcebreakerPrompt(promptId)) {
      throw new BadRequestException('Unknown icebreaker prompt.');
    }

    const updated = await this.prisma.callSession.update({
      where: { id: call.id },
      data: { activeIcebreakerPromptId: promptId ?? null },
    });

    return this.toView(updated);
  }

  /** "Video Date Mode" call controls: mute/unmute and enable/disable your own video feed. */
  async setMediaControls(
    userId: string,
    callId: string,
    controls: { muted?: boolean; videoEnabled?: boolean },
  ): Promise<CallSessionView> {
    const call = await this.getActiveCallForParticipant(userId, callId);
    const isCaller = call.callerId === userId;

    const updated = await this.prisma.callSession.update({
      where: { id: call.id },
      data: {
        ...(controls.muted != null &&
          (isCaller ? { callerMuted: controls.muted } : { calleeMuted: controls.muted })),
        ...(controls.videoEnabled != null &&
          (isCaller
            ? { callerVideoEnabled: controls.videoEnabled }
            : { calleeVideoEnabled: controls.videoEnabled })),
      },
    });

    return this.toView(updated);
  }

  /**
   * Real-time toxicity check for a live call: the client runs its own
   * on-device speech-to-text and submits short transcript snippets here as
   * the call progresses (no server-side audio pipeline exists in this
   * codebase). Only flagged snippets are persisted, as safety evidence -
   * routine conversation isn't recorded.
   */
  async checkTranscript(userId: string, callId: string, transcriptSnippet: string): Promise<ModerationResult> {
    await this.getActiveCallForParticipant(userId, callId);

    const moderation = await this.contentModerator.moderate(transcriptSnippet);

    if (moderation.flagged) {
      await this.prisma.callModerationFlag.create({
        data: {
          callSessionId: callId,
          senderId: userId,
          transcriptSnippet,
          categories: moderation.categories,
        },
      });
    }

    return moderation;
  }

  /** Single-tap report of the other participant, straight from the call screen. */
  async reportCall(
    reporterId: string,
    callId: string,
    reason: string,
    details?: string,
  ): Promise<UserReportView> {
    const call = await this.getCallForParticipant(reporterId, callId);
    const reportedUserId = call.callerId === reporterId ? call.calleeId : call.callerId;

    return this.safetyService.reportUser(reporterId, reportedUserId, reason, details);
  }

  private async getActiveCallForParticipant(
    userId: string,
    callId: string,
  ): Promise<CallSessionRecord> {
    const call = await this.getCallForParticipant(userId, callId);
    if (!ACTIVE_CALL_STATUSES.includes(call.status as (typeof ACTIVE_CALL_STATUSES)[number])) {
      throw new BadRequestException('This call is no longer active.');
    }
    return call;
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
      virtualBackgroundId: call.virtualBackgroundId,
      activeIcebreakerPromptId: call.activeIcebreakerPromptId,
      callerMuted: call.callerMuted,
      calleeMuted: call.calleeMuted,
      callerVideoEnabled: call.callerVideoEnabled,
      calleeVideoEnabled: call.calleeVideoEnabled,
      createdAt: call.createdAt.toISOString(),
      endedAt: call.endedAt ? call.endedAt.toISOString() : null,
    };
  }
}
