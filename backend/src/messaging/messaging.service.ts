import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { IMAGE_MODERATOR, ImageModerator } from './interfaces/image-moderator.interface';
import { TRANSCRIPTION_PROVIDER, TranscriptionProvider } from './interfaces/transcription-provider.interface';
import {
  BACKGROUND_SOUNDS,
  BackgroundSound,
  buildReservationUrl,
  computeExtendedExpiresAt,
  computeFirstMessageExpiresAt,
  daysSince,
  ExpiryMode,
  findBackgroundSound,
  findIcebreakerPrompt,
  findVoiceEffect,
  GHOSTING_PROMPT_THRESHOLD_DAYS,
  GHOSTING_PROTECTION_INACTIVITY_DAYS,
  ICEBREAKER_PROMPTS,
  INACTIVITY_AUTO_ARCHIVE_DAYS,
  IcebreakerPrompt,
  isEphemeralExpired,
  isWoman,
  MAX_POLL_OPTIONS,
  MIN_POLL_OPTIONS,
  POLL_CONTENT_TYPE,
  RESERVATION_CONTENT_TYPE,
  RESERVATION_PROVIDERS,
  ReservationProvider,
  VOICE_EFFECTS,
  VOICE_NOTE_CONTENT_TYPE,
  VoiceEffect,
} from './messaging.constants';

export interface MatchStatus {
  matchId: string;
  expiresAt: string | null;
  isExpired: boolean;
  firstMessageSent: boolean;
  canSendFirstMessage: boolean;
  canExtend: boolean;
  otherUserIsVerified: boolean;
  verificationRequested: boolean;
  verificationRequestedByMe: boolean;
  otherUserSnoozeStatusMessage: string | null;
  otherUserLastActiveAt: string | null;
}

export interface ActivityPingResult {
  lastActiveAt: string;
}

export interface IcebreakerView {
  promptId: string;
  question: string;
  optionA: string;
  optionB: string;
  myOptionIndex: number | null;
  otherOptionIndex: number | null;
}

export interface PollView {
  question: string;
  options: string[];
  myOptionIndex: number | null;
  voteCounts: number[];
  totalVotes: number;
}

export interface ReservationView {
  provider: string;
  query: string;
  url: string;
}

export interface MessageView {
  id: string;
  senderId: string;
  contentType: string;
  content: string | null;
  mediaUrl: string | null;
  isBlurred: boolean;
  moderationFlagged: boolean;
  moderationCategories: string[];
  durationSeconds: number | null;
  voiceEffectId: string | null;
  backgroundSoundId: string | null;
  readAt: string | null;
  transcript: string | null;
  icebreaker: IcebreakerView | null;
  poll: PollView | null;
  reservation: ReservationView | null;
  expiryMode: ExpiryMode | null;
  viewTimerSeconds: number | null;
  isEphemeralExpired: boolean;
  createdAt: string;
}

export interface ReadReceiptsResult {
  readReceiptsEnabled: boolean;
}

export interface MediaBlurPreferenceResult {
  autoBlurIncomingMedia: boolean;
}

export interface MatchNoteView {
  content: string | null;
  updatedAt: string | null;
}

export interface ReconnectableMatchView {
  dissolvedMatchId: string;
  otherUserId: string;
  otherUserName: string | null;
  otherUserPhotoUrl: string | null;
  dissolvedAt: string;
}

export interface ArchivedThreadView {
  dissolvedMatchId: string;
  otherUserId: string;
  otherUserName: string | null;
  otherUserPhotoUrl: string | null;
  dissolvedAt: string;
  messageCount: number;
}

export interface ArchivedMessageView {
  id: string;
  senderId: string;
  contentType: string;
  content: string | null;
  mediaUrl: string | null;
  createdAt: string;
}

export interface MatchSummaryView {
  matchId: string;
  otherUserId: string;
  otherUserName: string | null;
  otherUserPhotoUrl: string | null;
  expiresAt: string | null;
  firstMessageSent: boolean;
  canExtend: boolean;
  createdAt: string;
  needsGhostingPrompt: boolean;
}

export interface InactiveThreadView {
  matchId: string;
  otherUserId: string;
  otherUserName: string | null;
  otherUserPhotoUrl: string | null;
  lastMessageAt: string;
}

interface MatchRecord {
  id: string;
  userAId: string;
  userBId: string;
  createdAt: Date;
  firstMessageExpiresAt: Date;
  firstMessageSentAt: Date | null;
  firstMessageExtendedAt: Date | null;
  verificationRequestedAt: Date | null;
  verificationRequestedById: string | null;
}

interface MatchListRecord extends MatchRecord {
  createdAt: Date;
}

@Injectable()
export class MessagingService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(IMAGE_MODERATOR) private readonly imageModerator: ImageModerator,
    private readonly notificationsService: NotificationsService,
    @Inject(TRANSCRIPTION_PROVIDER) private readonly transcriptionProvider: TranscriptionProvider,
  ) {}

  async getMatchStatus(userId: string, matchId: string): Promise<MatchStatus> {
    const match = await this.getMatchForUser(userId, matchId);
    return this.toMatchStatus(userId, match);
  }

  /**
   * Heartbeat called while the user is actively using the app, so matches
   * can see roughly how recently they were active - see
   * [toMatchStatus]/GHOSTING_PROTECTION_INACTIVITY_DAYS for when that
   * visibility is automatically withheld from a gone-quiet match.
   */
  async recordActivity(userId: string): Promise<ActivityPingResult> {
    const now = new Date();
    await this.prisma.user.update({ where: { id: userId }, data: { lastActiveAt: now } });
    return { lastActiveAt: now.toISOString() };
  }

  async getMatchNote(userId: string, matchId: string): Promise<MatchNoteView> {
    await this.getMatchForUser(userId, matchId);

    const note = await this.prisma.matchNote.findUnique({
      where: { userId_matchId: { userId, matchId } },
    });

    return {
      content: note?.content ?? null,
      updatedAt: note ? note.updatedAt.toISOString() : null,
    };
  }

  /**
   * A private per-user note about a match (conversation details, date
   * plans) - visible only to whoever wrote it, never shared with the other
   * side. Saving blank content deletes the note instead of keeping an
   * empty row around.
   */
  async setMatchNote(userId: string, matchId: string, content: string): Promise<MatchNoteView> {
    await this.getMatchForUser(userId, matchId);

    const trimmed = content.trim();
    if (trimmed.length === 0) {
      await this.prisma.matchNote.deleteMany({ where: { userId, matchId } });
      return { content: null, updatedAt: null };
    }

    const note = await this.prisma.matchNote.upsert({
      where: { userId_matchId: { userId, matchId } },
      create: { userId, matchId, content: trimmed },
      update: { content: trimmed },
    });

    return { content: note.content, updatedAt: note.updatedAt.toISOString() };
  }

  /**
   * Gives a match one extra MATCH_EXTENSION_HOURS on its first-message
   * window, so a pair that hasn't messaged yet gets more time before the
   * match dissolves. Only usable once per match, before it expires and
   * before either side has actually messaged (once unlocked there's no
   * window left to extend).
   */
  async extendMatchTimeLimit(userId: string, matchId: string): Promise<MatchStatus> {
    const match = await this.getMatchForUser(userId, matchId);

    if (match.firstMessageSentAt != null) {
      throw new BadRequestException('This match is already unlocked; there is nothing to extend.');
    }
    if (this.isExpired(match, new Date())) {
      throw new BadRequestException('This match has already expired and can no longer be extended.');
    }
    if (match.firstMessageExtendedAt != null) {
      throw new BadRequestException('This match has already been extended once.');
    }

    const now = new Date();
    const updated = await this.prisma.match.update({
      where: { id: matchId },
      data: { firstMessageExpiresAt: computeExtendedExpiresAt(now), firstMessageExtendedAt: now },
    });

    return this.toMatchStatus(userId, updated);
  }

  async sendMessage(userId: string, matchId: string, content: string): Promise<MessageView> {
    const { match, firstMessageSent } = await this.assertCanSend(userId, matchId);

    const message = await this.prisma.message.create({
      data: { matchId, senderId: userId, contentType: 'TEXT', content },
    });

    await this.markFirstMessageIfNeeded(matchId, firstMessageSent);
    await this.notifyNewMessage(match, userId, content);

    return this.toMessageView(message, userId);
  }

  /**
   * Sends an image or GIF in-chat, subject to the same match-expiry and
   * women-first-message rules as a text message. Images are blurred by
   * default; the recipient must explicitly reveal them via [revealImage] -
   * unless the recipient has opted out via [setMediaBlurPreference], in
   * which case their incoming images arrive already revealed. Images also
   * run through on-device-style automatic explicit-content detection so
   * the reveal prompt can carry an extra warning - a failure of that check
   * (e.g. the moderation service being unavailable) doesn't block sending,
   * it just leaves the image unflagged.
   *
   * [expiryMode] optionally makes this an auto-expiring attachment: 'TIMER'
   * requires [viewTimerSeconds]; 'VIEW_ONCE' must not have one. Neither
   * starts counting down until the recipient actually opens it via
   * [viewEphemeralMedia] - see isEphemeralExpired.
   */
  async sendMediaMessage(
    userId: string,
    matchId: string,
    contentType: string,
    mediaUrl: string,
    expiryMode?: ExpiryMode,
    viewTimerSeconds?: number,
  ): Promise<MessageView> {
    if (expiryMode === 'TIMER' && viewTimerSeconds == null) {
      throw new BadRequestException('viewTimerSeconds is required when expiryMode is TIMER.');
    }
    if (expiryMode !== 'TIMER' && viewTimerSeconds != null) {
      throw new BadRequestException('viewTimerSeconds can only be set when expiryMode is TIMER.');
    }

    const { match, firstMessageSent } = await this.assertCanSend(userId, matchId);

    const moderation =
      contentType === 'IMAGE' ? await this.moderateImageSafely(mediaUrl) : null;

    const isBlurred = contentType === 'IMAGE' && (await this.recipientWantsAutoBlur(userId, match));

    const message = await this.prisma.message.create({
      data: {
        matchId,
        senderId: userId,
        contentType,
        mediaUrl,
        isBlurred,
        moderationFlagged: moderation?.flagged ?? false,
        moderationCategories: moderation?.categories ?? [],
        expiryMode: expiryMode ?? null,
        viewTimerSeconds: viewTimerSeconds ?? null,
      },
    });

    await this.markFirstMessageIfNeeded(matchId, firstMessageSent);
    await this.notifyNewMessage(match, userId, contentType === 'GIF' ? 'Sent a GIF' : 'Sent a photo');

    return this.toMessageView(message, userId);
  }

  /**
   * Catalog of optional playback-time voice modulation filters and ambient
   * background sounds a sender can attach to a voice note - see
   * VOICE_EFFECTS/BACKGROUND_SOUNDS for why these are metadata tags rather
   * than server-side audio processing.
   */
  getVoiceNoteEffectsCatalog(): { voiceEffects: VoiceEffect[]; backgroundSounds: BackgroundSound[] } {
    return { voiceEffects: VOICE_EFFECTS, backgroundSounds: BACKGROUND_SOUNDS };
  }

  /**
   * Sends a short recorded voice note in-chat, subject to the same
   * match-expiry and women-first-message rules as a text message. The
   * optional voice effect / background sound are just tags for the
   * recipient's client to apply at playback time.
   */
  async sendVoiceNote(
    userId: string,
    matchId: string,
    mediaUrl: string,
    durationSeconds: number,
    voiceEffectId?: string,
    backgroundSoundId?: string,
  ): Promise<MessageView> {
    if (voiceEffectId && !findVoiceEffect(voiceEffectId)) {
      throw new BadRequestException('Unknown voice effect.');
    }
    if (backgroundSoundId && !findBackgroundSound(backgroundSoundId)) {
      throw new BadRequestException('Unknown background sound.');
    }

    const { match, firstMessageSent } = await this.assertCanSend(userId, matchId);
    const transcript = await this.transcribeSafely(mediaUrl);

    const message = await this.prisma.message.create({
      data: {
        matchId,
        senderId: userId,
        contentType: VOICE_NOTE_CONTENT_TYPE,
        mediaUrl,
        durationSeconds,
        voiceEffectId,
        backgroundSoundId,
        transcript,
      },
    });

    await this.markFirstMessageIfNeeded(matchId, firstMessageSent);
    await this.notifyNewMessage(match, userId, 'Sent a voice note');

    return this.toMessageView(message, userId);
  }

  /**
   * Auto-caption for a voice note, read aloud in noise-sensitive settings a
   * recipient might be in - a transcription failure never blocks sending
   * the recording itself, it just leaves the caption null.
   */
  private async transcribeSafely(audioUrl: string): Promise<string | null> {
    try {
      return await this.transcriptionProvider.transcribe(audioUrl);
    } catch {
      return null;
    }
  }

  private async moderateImageSafely(
    mediaUrl: string,
  ): Promise<{ flagged: boolean; categories: string[] } | null> {
    try {
      return await this.imageModerator.moderate(mediaUrl);
    } catch {
      return null;
    }
  }

  private async recipientWantsAutoBlur(senderId: string, match: MatchRecord): Promise<boolean> {
    const recipientId = match.userAId === senderId ? match.userBId : match.userAId;
    const recipient = await this.prisma.user.findUnique({
      where: { id: recipientId },
      select: { autoBlurIncomingMedia: true },
    });
    return recipient?.autoBlurIncomingMedia ?? true;
  }

  async revealImage(userId: string, matchId: string, messageId: string): Promise<MessageView> {
    await this.getMatchForUser(userId, matchId);

    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.matchId !== matchId) {
      throw new NotFoundException('Message not found.');
    }
    if (message.senderId === userId) {
      throw new ForbiddenException('Only the recipient can reveal a blurred photo.');
    }
    if (message.contentType !== 'IMAGE' || !message.isBlurred) {
      return this.toMessageView(message, userId);
    }

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { isBlurred: false },
    });

    return this.toMessageView(updated, userId);
  }

  /**
   * Opens an auto-expiring photo/GIF: the recipient's first call here
   * starts its countdown (immediate for VIEW_ONCE, viewTimerSeconds later
   * for TIMER - see isEphemeralExpired) and is the only response that ever
   * includes the real mediaUrl for a TIMER message past its window or a
   * VIEW_ONCE message at all - every other read (listMessages, a repeat
   * call here) sees mediaUrl as null once expired.
   */
  async viewEphemeralMedia(userId: string, matchId: string, messageId: string): Promise<MessageView> {
    await this.getMatchForUser(userId, matchId);

    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.matchId !== matchId) {
      throw new NotFoundException('Message not found.');
    }
    if (message.senderId === userId) {
      throw new ForbiddenException('Only the recipient can view this message.');
    }
    if (!message.expiryMode) {
      throw new BadRequestException('This message is not an auto-expiring attachment.');
    }
    if (isEphemeralExpired(message, new Date())) {
      throw new BadRequestException('This message has already expired.');
    }

    const updated = message.viewedAt
      ? message
      : await this.prisma.message.update({
          where: { id: messageId },
          data: { viewedAt: new Date() },
        });

    return this.toMessageView(updated, userId, [], [], true);
  }

  /**
   * Listing a conversation doubles as "opening" it: any of the other
   * person's messages that aren't marked read yet get stamped now, unless
   * the current user has turned off read receipts (see
   * [setReadReceiptsEnabled]) - in that case their reads never show up to
   * the sender, mirroring how the toggle behaves elsewhere in the app.
   */
  async listMessages(userId: string, matchId: string): Promise<MessageView[]> {
    await this.getMatchForUser(userId, matchId);

    const messages = await this.prisma.message.findMany({
      where: { matchId },
      orderBy: { createdAt: 'asc' },
    });

    const responsesByMessageId = await this.getIcebreakerResponsesByMessage(
      messages.filter((message) => message.contentType === 'ICEBREAKER').map((message) => message.id),
    );
    const votesByMessageId = await this.getPollVotesByMessage(
      messages.filter((message) => message.contentType === POLL_CONTENT_TYPE).map((message) => message.id),
    );

    const unreadIncomingIds = messages
      .filter((message) => message.senderId !== userId && message.readAt == null)
      .map((message) => message.id);

    let readAt: Date | null = null;
    if (unreadIncomingIds.length > 0) {
      const currentUser = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { readReceiptsEnabled: true },
      });
      if (currentUser?.readReceiptsEnabled) {
        readAt = new Date();
        await this.prisma.message.updateMany({
          where: { id: { in: unreadIncomingIds } },
          data: { readAt },
        });
      }
    }
    const unreadIdSet = new Set(unreadIncomingIds);

    return messages.map((message) =>
      this.toMessageView(
        readAt && unreadIdSet.has(message.id) ? { ...message, readAt } : message,
        userId,
        responsesByMessageId.get(message.id) ?? [],
        votesByMessageId.get(message.id) ?? [],
      ),
    );
  }

  /**
   * In-chat icebreaker: a two-option question card either person can send
   * to spark conversation before meeting. Subject to the same match-expiry
   * and women-first-message rules as any other message.
   */
  async sendIcebreaker(userId: string, matchId: string, promptId: string): Promise<MessageView> {
    const prompt = findIcebreakerPrompt(promptId);
    if (!prompt) {
      throw new BadRequestException('Unknown icebreaker prompt.');
    }

    const { match, firstMessageSent } = await this.assertCanSend(userId, matchId);

    const message = await this.prisma.message.create({
      data: { matchId, senderId: userId, contentType: 'ICEBREAKER', content: promptId },
    });

    await this.markFirstMessageIfNeeded(matchId, firstMessageSent);
    await this.notifyNewMessage(match, userId, 'Sent an icebreaker question');

    return this.toMessageView(message, userId);
  }

  /**
   * Answers an icebreaker card. Each side's pick is stored independently;
   * [toMessageView] only ever reveals it as "myOptionIndex"/"otherOptionIndex"
   * from the current viewer's perspective, not by absolute option.
   */
  async respondToIcebreaker(
    userId: string,
    matchId: string,
    messageId: string,
    optionIndex: number,
  ): Promise<MessageView> {
    await this.getMatchForUser(userId, matchId);

    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.matchId !== matchId || message.contentType !== 'ICEBREAKER') {
      throw new NotFoundException('Icebreaker not found.');
    }

    await this.prisma.icebreakerResponse.upsert({
      where: { messageId_userId: { messageId, userId } },
      create: { messageId, userId, optionIndex },
      update: { optionIndex },
    });

    const responses = await this.prisma.icebreakerResponse.findMany({ where: { messageId } });

    return this.toMessageView(message, userId, responses);
  }

  getIcebreakerPrompts(): IcebreakerPrompt[] {
    return ICEBREAKER_PROMPTS;
  }

  /**
   * Nudges a fresh match toward playing an icebreaker: returns a prompt
   * only while the match is still inside its first-message window (see
   * FIRST_MESSAGE_WINDOW_HOURS) and only until either side has sent one,
   * so the suggestion doesn't linger once the pair is already chatting.
   * The pick is deterministic per match so repeat calls (e.g. re-opening
   * the chat) show the same suggestion rather than a new one each time.
   */
  async getSuggestedIcebreaker(userId: string, matchId: string): Promise<IcebreakerPrompt | null> {
    const match = await this.getMatchForUser(userId, matchId);

    if (new Date() > match.firstMessageExpiresAt) {
      return null;
    }

    const alreadySent = await this.prisma.message.findFirst({
      where: { matchId, contentType: 'ICEBREAKER' },
    });
    if (alreadySent) {
      return null;
    }

    return ICEBREAKER_PROMPTS[this.hashToIndex(matchId, ICEBREAKER_PROMPTS.length)];
  }

  private hashToIndex(value: string, modulus: number): number {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      hash = (hash * 31 + value.charCodeAt(i)) % modulus;
    }
    return hash;
  }

  /**
   * In-chat custom poll: unlike an icebreaker (a fixed two-option question
   * from a curated catalog), the sender writes their own question and
   * options - handy for deciding on a date spot or activity together.
   */
  async sendPoll(userId: string, matchId: string, question: string, options: string[]): Promise<MessageView> {
    if (options.length < MIN_POLL_OPTIONS || options.length > MAX_POLL_OPTIONS) {
      throw new BadRequestException(`A poll needs between ${MIN_POLL_OPTIONS} and ${MAX_POLL_OPTIONS} options.`);
    }

    const { match, firstMessageSent } = await this.assertCanSend(userId, matchId);

    const message = await this.prisma.message.create({
      data: { matchId, senderId: userId, contentType: POLL_CONTENT_TYPE, content: question, pollOptions: options },
    });

    await this.markFirstMessageIfNeeded(matchId, firstMessageSent);
    await this.notifyNewMessage(match, userId, `Sent a poll: ${question}`);

    return this.toMessageView(message, userId);
  }

  /** Casts (or changes) the caller's vote on a poll message. */
  async respondToPoll(userId: string, matchId: string, messageId: string, optionIndex: number): Promise<MessageView> {
    await this.getMatchForUser(userId, matchId);

    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.matchId !== matchId || message.contentType !== POLL_CONTENT_TYPE) {
      throw new NotFoundException('Poll not found.');
    }
    if (optionIndex < 0 || optionIndex >= message.pollOptions.length) {
      throw new BadRequestException('Invalid poll option.');
    }

    await this.prisma.pollVote.upsert({
      where: { messageId_userId: { messageId, userId } },
      create: { messageId, userId, optionIndex },
      update: { optionIndex },
    });

    const votes = await this.prisma.pollVote.findMany({ where: { messageId } });

    return this.toMessageView(message, userId, [], votes);
  }

  /**
   * In-chat reservation/ticket card: builds a deep-link to a third-party
   * platform's search results for whatever the sender typed (see
   * buildReservationUrl) so the recipient can tap through and finish
   * booking on that site - see the doc comment on buildReservationUrl for
   * why this never brokers the actual reservation itself.
   */
  async sendReservation(userId: string, matchId: string, provider: string, query: string): Promise<MessageView> {
    if (!RESERVATION_PROVIDERS.includes(provider as ReservationProvider)) {
      throw new BadRequestException('Unknown reservation provider.');
    }

    const { match, firstMessageSent } = await this.assertCanSend(userId, matchId);
    const url = buildReservationUrl(provider as ReservationProvider, query);

    const message = await this.prisma.message.create({
      data: {
        matchId,
        senderId: userId,
        contentType: RESERVATION_CONTENT_TYPE,
        content: query,
        reservationProvider: provider,
        reservationUrl: url,
      },
    });

    await this.markFirstMessageIfNeeded(matchId, firstMessageSent);
    await this.notifyNewMessage(
      match,
      userId,
      provider === 'OPENTABLE' ? `Sent a reservation link: ${query}` : `Sent an event ticket link: ${query}`,
    );

    return this.toMessageView(message, userId);
  }

  /**
   * Privacy toggle: when disabled, the current user's reads of other
   * people's messages are never stamped, so senders never see their
   * messages as read. Does not affect whether this user can see read
   * receipts on messages they sent while receipts were enabled.
   */
  async setReadReceiptsEnabled(userId: string, enabled: boolean): Promise<ReadReceiptsResult> {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { readReceiptsEnabled: enabled },
    });

    return { readReceiptsEnabled: updated.readReceiptsEnabled };
  }

  async getMediaBlurPreference(userId: string): Promise<MediaBlurPreferenceResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { autoBlurIncomingMedia: true },
    });
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    return { autoBlurIncomingMedia: user.autoBlurIncomingMedia };
  }

  /**
   * Consent toggle: when disabled, images this user receives arrive already
   * revealed instead of blurred-until-tapped (see [sendMediaMessage]). Only
   * controls media sent TO this user - it has no effect on how this user's
   * own outgoing images appear to others.
   */
  async setMediaBlurPreference(userId: string, enabled: boolean): Promise<MediaBlurPreferenceResult> {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { autoBlurIncomingMedia: enabled },
    });

    return { autoBlurIncomingMedia: updated.autoBlurIncomingMedia };
  }

  /**
   * Lists the current user's active matches. Any match whose 24-hour first
   * message window has passed with no message ever sent is dissolved here
   * (the match and the underlying swipes are deleted, so the two users
   * become rediscoverable) rather than merely marked expired. Ongoing
   * threads that have gone quiet for GHOSTING_PROMPT_THRESHOLD_DAYS get a
   * `needsGhostingPrompt` flag for whichever side owes the next reply.
   */
  async listMyMatches(userId: string): Promise<MatchSummaryView[]> {
    const { active } = await this.buildMatchSummaries(userId);
    return active;
  }

  /**
   * Threads that have had a real conversation but have gone silent for
   * INACTIVITY_AUTO_ARCHIVE_DAYS+ - auto-moved out of [listMyMatches] into
   * this separate folder to declutter the main inbox. Nothing is deleted
   * and the match still works normally; sending a new message naturally
   * moves the thread back into listMyMatches next time it's fetched, since
   * its last-message age drops back under the threshold.
   */
  async listInactiveThreads(userId: string): Promise<InactiveThreadView[]> {
    const { inactive } = await this.buildMatchSummaries(userId);
    return inactive;
  }

  private async buildMatchSummaries(
    userId: string,
  ): Promise<{ active: MatchSummaryView[]; inactive: InactiveThreadView[] }> {
    const matches: MatchListRecord[] = await this.prisma.match.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date();
    const alive: MatchListRecord[] = [];

    for (const match of matches) {
      if (this.isExpired(match, now)) {
        await this.dissolveMatch(match);
        continue;
      }
      alive.push(match);
    }

    if (alive.length === 0) {
      return { active: [], inactive: [] };
    }

    const otherUserIds = alive.map((match) => (match.userAId === userId ? match.userBId : match.userAId));
    const [otherUsers, lastMessageByMatchId] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: otherUserIds } },
        select: { id: true, name: true, profilePhotoUrl: true },
      }),
      this.getLastMessageByMatchId(alive.filter((m) => m.firstMessageSentAt != null).map((m) => m.id)),
    ]);
    const otherUserById = new Map(otherUsers.map((user) => [user.id, user]));

    const active: MatchSummaryView[] = [];
    const inactive: InactiveThreadView[] = [];

    for (const match of alive) {
      const otherUserId = match.userAId === userId ? match.userBId : match.userAId;
      const otherUser = otherUserById.get(otherUserId);
      const firstMessageSent = match.firstMessageSentAt != null;
      const lastMessage = lastMessageByMatchId.get(match.id);

      if (
        firstMessageSent &&
        lastMessage != null &&
        daysSince(lastMessage.createdAt, now) >= INACTIVITY_AUTO_ARCHIVE_DAYS
      ) {
        inactive.push({
          matchId: match.id,
          otherUserId,
          otherUserName: otherUser?.name ?? null,
          otherUserPhotoUrl: otherUser?.profilePhotoUrl ?? null,
          lastMessageAt: lastMessage.createdAt.toISOString(),
        });
        continue;
      }

      const needsGhostingPrompt =
        lastMessage != null &&
        lastMessage.senderId !== userId &&
        daysSince(lastMessage.createdAt, now) >= GHOSTING_PROMPT_THRESHOLD_DAYS;

      active.push({
        matchId: match.id,
        otherUserId,
        otherUserName: otherUser?.name ?? null,
        otherUserPhotoUrl: otherUser?.profilePhotoUrl ?? null,
        expiresAt: firstMessageSent ? null : match.firstMessageExpiresAt.toISOString(),
        firstMessageSent,
        canExtend: !firstMessageSent && match.firstMessageExtendedAt == null,
        createdAt: match.createdAt.toISOString(),
        needsGhostingPrompt,
      });
    }

    return { active, inactive };
  }

  /**
   * Joint browsing "shared chat access": lets a partner with
   * PartnerLink.jointBrowsingEnabled see the other side's match list. Read
   * access only - the underlying match still belongs to `partnerId`, so
   * sending/unmatching/etc. still require being a direct match participant.
   */
  async listSharedMatches(userId: string, partnerId: string): Promise<MatchSummaryView[]> {
    await this.assertJointBrowsingEnabled(userId, partnerId);
    return this.listMyMatches(partnerId);
  }

  /**
   * The message-history counterpart to [listSharedMatches]. Unlike
   * [listMessages], this never mutates read receipts - it's a peek into the
   * partner's conversation, not the partner reading their own messages.
   */
  async listSharedMessages(userId: string, partnerId: string, matchId: string): Promise<MessageView[]> {
    await this.assertJointBrowsingEnabled(userId, partnerId);

    const match = await this.prisma.match.findUnique({ where: { id: matchId } });
    if (!match || (match.userAId !== partnerId && match.userBId !== partnerId)) {
      throw new NotFoundException('Match not found.');
    }

    const messages = await this.prisma.message.findMany({
      where: { matchId },
      orderBy: { createdAt: 'asc' },
    });
    const responsesByMessageId = await this.getIcebreakerResponsesByMessage(
      messages.filter((message) => message.contentType === 'ICEBREAKER').map((message) => message.id),
    );
    const votesByMessageId = await this.getPollVotesByMessage(
      messages.filter((message) => message.contentType === POLL_CONTENT_TYPE).map((message) => message.id),
    );

    return messages.map((message) =>
      this.toMessageView(
        message,
        partnerId,
        responsesByMessageId.get(message.id) ?? [],
        votesByMessageId.get(message.id) ?? [],
      ),
    );
  }

  /** Ends an ongoing (already-unlocked) match - the ghosting-prompt's "politely unmatch" option. */
  async unmatch(userId: string, matchId: string): Promise<{ unmatched: boolean }> {
    const match = await this.getMatchForUser(userId, matchId);
    await this.dissolveMatch(match);
    return { unmatched: true };
  }

  /**
   * A la carte "Unmatch Protection": dissolved matches that actually have
   * an archived transcript (see dissolveMatch) - a dissolved match with
   * nothing archived (protection wasn't on, or there was nothing to save)
   * never shows up here.
   */
  async listArchivedThreads(userId: string): Promise<ArchivedThreadView[]> {
    const dissolved = await this.prisma.dissolvedMatch.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      orderBy: { dissolvedAt: 'desc' },
    });
    if (dissolved.length === 0) {
      return [];
    }

    const archivedMessages = await this.prisma.archivedMessage.findMany({
      where: { dissolvedMatchId: { in: dissolved.map((d) => d.id) } },
      select: { dissolvedMatchId: true },
    });
    const countByDissolvedId = new Map<string, number>();
    for (const message of archivedMessages) {
      countByDissolvedId.set(
        message.dissolvedMatchId,
        (countByDissolvedId.get(message.dissolvedMatchId) ?? 0) + 1,
      );
    }

    const archived = dissolved.filter((d) => (countByDissolvedId.get(d.id) ?? 0) > 0);
    if (archived.length === 0) {
      return [];
    }

    const otherUserIds = archived.map((d) => (d.userAId === userId ? d.userBId : d.userAId));
    const otherUsers = await this.prisma.user.findMany({
      where: { id: { in: otherUserIds } },
      select: { id: true, name: true, profilePhotoUrl: true },
    });
    const otherUserById = new Map(otherUsers.map((user) => [user.id, user]));

    return archived.map((d) => {
      const otherUserId = d.userAId === userId ? d.userBId : d.userAId;
      const otherUser = otherUserById.get(otherUserId);
      return {
        dissolvedMatchId: d.id,
        otherUserId,
        otherUserName: otherUser?.name ?? null,
        otherUserPhotoUrl: otherUser?.profilePhotoUrl ?? null,
        dissolvedAt: d.dissolvedAt.toISOString(),
        messageCount: countByDissolvedId.get(d.id) ?? 0,
      };
    });
  }

  async getArchivedThreadMessages(
    userId: string,
    dissolvedMatchId: string,
  ): Promise<ArchivedMessageView[]> {
    const dissolved = await this.prisma.dissolvedMatch.findUnique({ where: { id: dissolvedMatchId } });
    if (!dissolved || (dissolved.userAId !== userId && dissolved.userBId !== userId)) {
      throw new NotFoundException('Archived thread not found.');
    }

    const messages = await this.prisma.archivedMessage.findMany({
      where: { dissolvedMatchId },
      orderBy: { createdAt: 'asc' },
    });

    return messages.map((message) => ({
      id: message.id,
      senderId: message.senderId,
      contentType: message.contentType,
      content: message.content,
      mediaUrl: message.mediaUrl,
      createdAt: message.createdAt.toISOString(),
    }));
  }

  private async getLastMessageByMatchId(
    matchIds: string[],
  ): Promise<Map<string, { senderId: string; createdAt: Date }>> {
    if (matchIds.length === 0) {
      return new Map();
    }

    const messages = await this.prisma.message.findMany({
      where: { matchId: { in: matchIds } },
      orderBy: { createdAt: 'desc' },
      select: { matchId: true, senderId: true, createdAt: true },
    });

    const lastByMatchId = new Map<string, { senderId: string; createdAt: Date }>();
    for (const message of messages) {
      if (!lastByMatchId.has(message.matchId)) {
        lastByMatchId.set(message.matchId, { senderId: message.senderId, createdAt: message.createdAt });
      }
    }
    return lastByMatchId;
  }

  /**
   * A la carte "Unmatch Protection" (see PowerUpsService, User.
   * unmatchProtectionEnabled): if either side of this match has purchased
   * it, the conversation is archived into ArchivedMessage instead of being
   * deleted outright, viewable read-only via listArchivedThreads/
   * getArchivedThreadMessages - otherwise dissolving still deletes
   * everything as before.
   */
  private async dissolveMatch(match: MatchRecord): Promise<void> {
    const participants = await this.prisma.user.findMany({
      where: { id: { in: [match.userAId, match.userBId] } },
      select: { id: true, unmatchProtectionEnabled: true },
    });
    const isProtected = participants.some((user) => user.unmatchProtectionEnabled);

    const dissolved = await this.prisma.dissolvedMatch.create({
      data: { userAId: match.userAId, userBId: match.userBId },
    });

    if (isProtected) {
      const messages = await this.prisma.message.findMany({ where: { matchId: match.id } });
      if (messages.length > 0) {
        await this.prisma.archivedMessage.createMany({
          data: messages.map((message) => ({
            dissolvedMatchId: dissolved.id,
            senderId: message.senderId,
            contentType: message.contentType,
            content: message.content,
            mediaUrl: message.mediaUrl,
            createdAt: message.createdAt,
          })),
        });
      }
    }

    await this.prisma.$transaction([
      this.prisma.message.deleteMany({ where: { matchId: match.id } }),
      this.prisma.swipe.deleteMany({
        where: {
          OR: [
            { swiperId: match.userAId, targetUserId: match.userBId },
            { swiperId: match.userBId, targetUserId: match.userAId },
          ],
        },
      }),
      this.prisma.match.delete({ where: { id: match.id } }),
    ]);
  }

  /**
   * Premium "reconnect": matches that expired unmessaged are dissolved (see
   * [dissolveExpiredMatch]) rather than kept around, so this lists the trace
   * records left behind, most recent first, for a user to explicitly revive.
   */
  async listReconnectableMatches(userId: string): Promise<ReconnectableMatchView[]> {
    const dissolved = await this.prisma.dissolvedMatch.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      orderBy: { dissolvedAt: 'desc' },
    });

    if (dissolved.length === 0) {
      return [];
    }

    const otherUserIds = dissolved.map((d) => (d.userAId === userId ? d.userBId : d.userAId));
    const otherUsers = await this.prisma.user.findMany({
      where: { id: { in: otherUserIds } },
      select: { id: true, name: true, profilePhotoUrl: true },
    });
    const otherUserById = new Map(otherUsers.map((user) => [user.id, user]));

    return dissolved.map((d) => {
      const otherUserId = d.userAId === userId ? d.userBId : d.userAId;
      const otherUser = otherUserById.get(otherUserId);
      return {
        dissolvedMatchId: d.id,
        otherUserId,
        otherUserName: otherUser?.name ?? null,
        otherUserPhotoUrl: otherUser?.profilePhotoUrl ?? null,
        dissolvedAt: d.dissolvedAt.toISOString(),
      };
    });
  }

  /**
   * Premium-only: revives a dissolved match with a fresh first-message
   * window, without either side having to re-swipe and hope for a
   * reciprocal like.
   */
  async reconnectMatch(userId: string, dissolvedMatchId: string): Promise<MatchStatus> {
    const currentUser = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!currentUser) {
      throw new NotFoundException('User not found.');
    }
    if (!currentUser.isPremium) {
      throw new ForbiddenException('Reconnecting an expired match is a premium feature.');
    }

    const dissolved = await this.prisma.dissolvedMatch.findUnique({ where: { id: dissolvedMatchId } });
    if (!dissolved || (dissolved.userAId !== userId && dissolved.userBId !== userId)) {
      throw new NotFoundException('Dissolved match not found.');
    }

    const existingMatch = await this.prisma.match.findUnique({
      where: { userAId_userBId: { userAId: dissolved.userAId, userBId: dissolved.userBId } },
    });
    if (existingMatch) {
      throw new BadRequestException('You already have an active match with this person.');
    }

    const [match] = await this.prisma.$transaction([
      this.prisma.match.create({
        data: {
          userAId: dissolved.userAId,
          userBId: dissolved.userBId,
          firstMessageExpiresAt: computeFirstMessageExpiresAt(new Date()),
        },
      }),
      this.prisma.dissolvedMatch.delete({ where: { id: dissolvedMatchId } }),
    ]);

    return this.toMatchStatus(userId, match);
  }

  /**
   * Asks an unverified match to complete real-time selfie verification
   * before the conversation continues. Purely a flag/notification on top of
   * the existing self-service verification flow (VerificationService) -
   * this doesn't trigger the check itself, just records that it was asked.
   */
  async requestVerification(userId: string, matchId: string): Promise<MatchStatus> {
    const match = await this.getMatchForUser(userId, matchId);
    const otherUserId = match.userAId === userId ? match.userBId : match.userAId;

    const otherUser = await this.prisma.user.findUnique({ where: { id: otherUserId } });
    if (!otherUser) {
      throw new NotFoundException('User not found.');
    }
    if (otherUser.isVerified) {
      throw new BadRequestException('This person is already verified.');
    }
    if (match.verificationRequestedAt != null) {
      throw new BadRequestException('Verification has already been requested for this match.');
    }

    const updated = await this.prisma.match.update({
      where: { id: matchId },
      data: { verificationRequestedAt: new Date(), verificationRequestedById: userId },
    });

    return this.toMatchStatus(userId, updated);
  }

  private async assertCanSend(
    userId: string,
    matchId: string,
  ): Promise<{ match: MatchRecord; firstMessageSent: boolean }> {
    const match = await this.getMatchForUser(userId, matchId);
    const now = new Date();

    if (this.isExpired(match, now)) {
      throw new BadRequestException(
        'This match has expired because no message was sent within 24 hours.',
      );
    }

    const firstMessageSent = match.firstMessageSentAt != null;
    if (!firstMessageSent) {
      const allowed = await this.senderMaySendFirstMessage(userId, match);
      if (!allowed) {
        throw new ForbiddenException('Only she can send the first message for this match.');
      }
    }

    return { match, firstMessageSent };
  }

  private async markFirstMessageIfNeeded(matchId: string, firstMessageSent: boolean): Promise<void> {
    if (firstMessageSent) {
      return;
    }
    await this.prisma.match.update({
      where: { id: matchId },
      data: { firstMessageSentAt: new Date() },
    });
  }

  /** Notifies whichever side of the match didn't just send this message. */
  private async notifyNewMessage(match: MatchRecord, senderId: string, preview: string): Promise<void> {
    const recipientId = match.userAId === senderId ? match.userBId : match.userAId;
    const body = preview.length > 140 ? `${preview.slice(0, 137)}...` : preview;
    await this.notificationsService.notify(recipientId, 'NEW_MESSAGE', 'New message', body, { matchId: match.id });
  }

  private async getMatchForUser(userId: string, matchId: string): Promise<MatchRecord> {
    const match = await this.prisma.match.findUnique({ where: { id: matchId } });

    if (!match || (match.userAId !== userId && match.userBId !== userId)) {
      throw new NotFoundException('Match not found.');
    }

    return match;
  }

  private async assertJointBrowsingEnabled(userId: string, partnerId: string): Promise<void> {
    const link = await this.prisma.partnerLink.findFirst({
      where: {
        jointBrowsingEnabled: true,
        OR: [
          { userAId: userId, userBId: partnerId },
          { userAId: partnerId, userBId: userId },
        ],
      },
    });
    if (!link) {
      throw new ForbiddenException('Joint browsing is not enabled with this partner.');
    }
  }

  private isExpired(match: MatchRecord, now: Date): boolean {
    return match.firstMessageSentAt == null && now > match.firstMessageExpiresAt;
  }

  private async toMatchStatus(userId: string, match: MatchRecord): Promise<MatchStatus> {
    const now = new Date();
    const firstMessageSent = match.firstMessageSentAt != null;
    const expired = this.isExpired(match, now);

    const canSendFirstMessage = firstMessageSent
      ? true
      : expired
        ? false
        : await this.senderMaySendFirstMessage(userId, match);

    const otherUserId = match.userAId === userId ? match.userBId : match.userAId;
    const [otherUser, lastMessage] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: otherUserId },
        select: { isVerified: true, snoozedUntil: true, snoozeStatusMessage: true, lastActiveAt: true },
      }),
      this.prisma.message.findFirst({
        where: { matchId: match.id },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);
    const otherUserSnoozeIsActive =
      otherUser?.snoozedUntil != null && otherUser.snoozedUntil.getTime() > now.getTime();

    const lastConversationActivityAt = lastMessage?.createdAt ?? match.createdAt;
    const ghostingProtectionActive =
      daysSince(lastConversationActivityAt, now) >= GHOSTING_PROTECTION_INACTIVITY_DAYS;

    return {
      matchId: match.id,
      expiresAt: firstMessageSent ? null : match.firstMessageExpiresAt.toISOString(),
      isExpired: expired,
      firstMessageSent,
      canSendFirstMessage,
      canExtend: !firstMessageSent && !expired && match.firstMessageExtendedAt == null,
      otherUserIsVerified: otherUser?.isVerified ?? false,
      verificationRequested: match.verificationRequestedAt != null,
      verificationRequestedByMe: match.verificationRequestedById === userId,
      otherUserSnoozeStatusMessage: otherUserSnoozeIsActive ? otherUser!.snoozeStatusMessage : null,
      otherUserLastActiveAt:
        !ghostingProtectionActive && otherUser?.lastActiveAt ? otherUser.lastActiveAt.toISOString() : null,
    };
  }

  private async senderMaySendFirstMessage(senderId: string, match: MatchRecord): Promise<boolean> {
    const otherId = match.userAId === senderId ? match.userBId : match.userAId;

    const [sender, other] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: senderId }, select: { genderIdentities: true } }),
      this.prisma.user.findUnique({ where: { id: otherId }, select: { genderIdentities: true } }),
    ]);

    if (isWoman(sender?.genderIdentities ?? [])) {
      return true;
    }

    return !isWoman(other?.genderIdentities ?? []);
  }

  private async getIcebreakerResponsesByMessage(
    messageIds: string[],
  ): Promise<Map<string, { userId: string; optionIndex: number }[]>> {
    const responsesByMessageId = new Map<string, { userId: string; optionIndex: number }[]>();
    if (messageIds.length === 0) {
      return responsesByMessageId;
    }

    const responses = await this.prisma.icebreakerResponse.findMany({
      where: { messageId: { in: messageIds } },
    });
    for (const response of responses) {
      const list = responsesByMessageId.get(response.messageId) ?? [];
      list.push({ userId: response.userId, optionIndex: response.optionIndex });
      responsesByMessageId.set(response.messageId, list);
    }
    return responsesByMessageId;
  }

  private async getPollVotesByMessage(
    messageIds: string[],
  ): Promise<Map<string, { userId: string; optionIndex: number }[]>> {
    const votesByMessageId = new Map<string, { userId: string; optionIndex: number }[]>();
    if (messageIds.length === 0) {
      return votesByMessageId;
    }

    const votes = await this.prisma.pollVote.findMany({
      where: { messageId: { in: messageIds } },
    });
    for (const vote of votes) {
      const list = votesByMessageId.get(vote.messageId) ?? [];
      list.push({ userId: vote.userId, optionIndex: vote.optionIndex });
      votesByMessageId.set(vote.messageId, list);
    }
    return votesByMessageId;
  }

  private toMessageView(
    message: {
      id: string;
      senderId: string;
      contentType: string;
      content: string | null;
      mediaUrl: string | null;
      isBlurred: boolean;
      moderationFlagged?: boolean;
      moderationCategories?: string[];
      durationSeconds: number | null;
      voiceEffectId?: string | null;
      backgroundSoundId?: string | null;
      pollOptions?: string[];
      reservationProvider?: string | null;
      reservationUrl?: string | null;
      readAt: Date | null;
      transcript?: string | null;
      expiryMode?: string | null;
      viewTimerSeconds?: number | null;
      viewedAt?: Date | null;
      createdAt: Date;
    },
    userId: string,
    icebreakerResponses: { userId: string; optionIndex: number }[] = [],
    pollVotes: { userId: string; optionIndex: number }[] = [],
    revealMediaUrl = false,
  ): MessageView {
    const expiryMode = (message.expiryMode as ExpiryMode | undefined) ?? null;
    const expired = isEphemeralExpired(
      { expiryMode, viewTimerSeconds: message.viewTimerSeconds ?? null, viewedAt: message.viewedAt ?? null },
      new Date(),
    );
    const hasBeenViewed = message.viewedAt != null;
    const mediaUrl =
      expiryMode && !revealMediaUrl ? (expired || !hasBeenViewed ? null : message.mediaUrl) : message.mediaUrl;

    return {
      id: message.id,
      senderId: message.senderId,
      contentType: message.contentType,
      content: message.content,
      mediaUrl,
      isBlurred: message.isBlurred,
      moderationFlagged: message.moderationFlagged ?? false,
      moderationCategories: message.moderationCategories ?? [],
      durationSeconds: message.durationSeconds,
      voiceEffectId: message.voiceEffectId ?? null,
      backgroundSoundId: message.backgroundSoundId ?? null,
      readAt: message.readAt ? message.readAt.toISOString() : null,
      transcript: message.transcript ?? null,
      expiryMode,
      viewTimerSeconds: message.viewTimerSeconds ?? null,
      isEphemeralExpired: expired,
      icebreaker: this.toIcebreakerView(message.contentType, message.content, userId, icebreakerResponses),
      poll: this.toPollView(message.contentType, message.content, message.pollOptions, userId, pollVotes),
      reservation: this.toReservationView(
        message.contentType,
        message.content,
        message.reservationProvider,
        message.reservationUrl,
      ),
      createdAt: message.createdAt.toISOString(),
    };
  }

  private toReservationView(
    contentType: string,
    query: string | null,
    provider: string | null | undefined,
    url: string | null | undefined,
  ): ReservationView | null {
    if (contentType !== RESERVATION_CONTENT_TYPE || !query || !provider || !url) {
      return null;
    }
    return { provider, query, url };
  }

  private toIcebreakerView(
    contentType: string,
    promptId: string | null,
    userId: string,
    responses: { userId: string; optionIndex: number }[],
  ): IcebreakerView | null {
    if (contentType !== 'ICEBREAKER' || !promptId) {
      return null;
    }
    const prompt = findIcebreakerPrompt(promptId);
    if (!prompt) {
      return null;
    }

    const myResponse = responses.find((response) => response.userId === userId);
    const otherResponse = responses.find((response) => response.userId !== userId);

    return {
      promptId: prompt.id,
      question: prompt.question,
      optionA: prompt.optionA,
      optionB: prompt.optionB,
      myOptionIndex: myResponse?.optionIndex ?? null,
      otherOptionIndex: otherResponse?.optionIndex ?? null,
    };
  }

  private toPollView(
    contentType: string,
    question: string | null,
    options: string[] | undefined,
    userId: string,
    votes: { userId: string; optionIndex: number }[],
  ): PollView | null {
    if (contentType !== POLL_CONTENT_TYPE || !question || !options || options.length === 0) {
      return null;
    }

    const voteCounts = options.map((_, index) => votes.filter((vote) => vote.optionIndex === index).length);
    const myVote = votes.find((vote) => vote.userId === userId);

    return {
      question,
      options,
      myOptionIndex: myVote?.optionIndex ?? null,
      voteCounts,
      totalVotes: votes.length,
    };
  }
}
