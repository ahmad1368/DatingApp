import 'dart:async';
import 'dart:ui';

import 'package:flutter/material.dart';

import '../gifting/gifting_api.dart';
import '../profile/voice_player_controller.dart';
import '../profile/voice_recorder_controller.dart';
import '../safety/screen_security_api.dart';
import '../safety/screen_security_channel.dart';
import '../vault/vault_api.dart';
import '../vault/vault_granted_screen.dart';
import 'date_suggestions_api.dart';
import 'messaging_api.dart';
import 'post_match_survey_api.dart';
import 'post_match_survey_screen.dart';
import 'video_reaction_picker_controller.dart';
import 'voice_waveform.dart';

const int _maxVoiceNoteSeconds = 60;

/// Chat screen for a single match. Enforces the women-first rule client
/// side (the backend is the source of truth): until the first message has
/// been sent, only the woman in the match may type, and the match shows a
/// live countdown to its 24-hour expiration.
class MatchChatScreen extends StatefulWidget {
  MatchChatScreen({
    super.key,
    required this.messagingApi,
    required this.matchId,
    required this.currentUserId,
    VoiceRecorderController? recorder,
    VoicePlayerController? player,
    DateSuggestionsApi? dateSuggestionsApi,
    VaultApi? vaultApi,
    ScreenSecurityChannel? screenSecurityChannel,
    ScreenSecurityApi? screenSecurityApi,
    PostMatchSurveyApi? postMatchSurveyApi,
    GiftingApi? giftingApi,
    VideoReactionPickerController? videoReactionPicker,
  })  : recorder = recorder ?? DeviceVoiceRecorderController(),
        player = player ?? DeviceVoicePlayerController(),
        dateSuggestionsApi =
            dateSuggestionsApi ?? DateSuggestionsApi(accessToken: messagingApi.accessToken),
        vaultApi = vaultApi ?? VaultApi(accessToken: messagingApi.accessToken),
        screenSecurityChannel = screenSecurityChannel ?? ScreenSecurityChannel(),
        screenSecurityApi =
            screenSecurityApi ?? ScreenSecurityApi(accessToken: messagingApi.accessToken),
        postMatchSurveyApi =
            postMatchSurveyApi ?? PostMatchSurveyApi(accessToken: messagingApi.accessToken),
        giftingApi = giftingApi ?? GiftingApi(accessToken: messagingApi.accessToken),
        videoReactionPicker = videoReactionPicker ?? DeviceVideoReactionPickerController();

  final MessagingApi messagingApi;
  final String matchId;
  final String currentUserId;
  final VoiceRecorderController recorder;
  final VoicePlayerController player;
  final DateSuggestionsApi dateSuggestionsApi;
  final VaultApi vaultApi;
  final ScreenSecurityChannel screenSecurityChannel;
  final ScreenSecurityApi screenSecurityApi;
  final PostMatchSurveyApi postMatchSurveyApi;
  final GiftingApi giftingApi;
  final VideoReactionPickerController videoReactionPicker;

  @override
  State<MatchChatScreen> createState() => _MatchChatScreenState();
}

class _MatchChatScreenState extends State<MatchChatScreen> {
  final _controller = TextEditingController();
  MatchStatus? _status;
  List<ChatMessage> _messages = [];
  bool _isLoading = true;
  bool _isSending = false;
  bool _readReceiptsEnabled = true;
  bool _autoBlurMediaEnabled = true;
  static const _voiceNoteSpeeds = [1.0, 1.25, 1.5, 2.0];
  final Map<String, double> _voiceNoteSpeedByMessageId = {};
  final Map<String, String> _translatedContentByMessageId = {};
  bool _isRecording = false;
  int _recordedSeconds = 0;
  Timer? _recordTimer;
  String? _errorText;
  IcebreakerPrompt? _suggestedIcebreaker;
  bool _surveyPromptDue = false;

  @override
  void initState() {
    super.initState();
    widget.screenSecurityChannel.onScreenshotDetected = _handleScreenshotDetected;
    widget.screenSecurityChannel.setSecure(true);
    _load();
  }

  @override
  void dispose() {
    widget.screenSecurityChannel.setSecure(false);
    _controller.dispose();
    _recordTimer?.cancel();
    super.dispose();
  }

  /// Fires when the OS reports a screenshot was taken while this chat was
  /// open (Android blocks captures outright via `FLAG_SECURE`, so this only
  /// fires on iOS). Reports the violation and, if it tips the account into a
  /// temporary freeze, warns the user and backs out of the chat.
  Future<void> _handleScreenshotDetected() async {
    try {
      final result = await widget.screenSecurityApi.reportViolation('CHAT');
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(result.warning)));
      if (result.frozen) {
        await showDialog<void>(
          context: context,
          barrierDismissible: false,
          builder: (context) => AlertDialog(
            title: const Text('Account temporarily frozen'),
            content: const Text(
              'Your account has been frozen for repeated screen capture violations.',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(context).pop(),
                child: const Text('OK'),
              ),
            ],
          ),
        );
        if (mounted) {
          Navigator.of(context).pop();
        }
      }
    } on ScreenSecurityApiException {
      // Best-effort reporting; don't block the chat if this fails.
    }
  }

  Future<void> _load() async {
    setState(() {
      _isLoading = true;
      _errorText = null;
    });
    try {
      final status = await widget.messagingApi.fetchMatchStatus(widget.matchId);
      final messages = await widget.messagingApi.fetchMessages(widget.matchId);
      setState(() {
        _status = status;
        _messages = messages;
      });
    } on MessagingApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
    unawaited(_pingActivity());
    unawaited(_loadSuggestedIcebreaker());
    unawaited(_checkSurveyPromptDue());
  }

  /// Best-effort discreet check for whether this match has a "how did it
  /// go?" survey prompt due (see PostMatchSurveyApi.fetchDuePrompts).
  /// Failure here shouldn't surface to the user; the badge just won't show.
  Future<void> _checkSurveyPromptDue() async {
    try {
      final prompts = await widget.postMatchSurveyApi.fetchDuePrompts();
      final isDue = prompts.any((prompt) => prompt.matchId == widget.matchId);
      if (mounted) {
        setState(() => _surveyPromptDue = isDue);
      }
    } catch (_) {
      // Ignored - see doc comment above.
    }
  }

  /// Best-effort activity heartbeat - opening a chat counts as being active.
  /// Failure here shouldn't surface to the user; it just means this user's
  /// "last active" won't reflect this visit.
  Future<void> _pingActivity() async {
    try {
      await widget.messagingApi.recordActivity();
    } catch (_) {
      // Ignored - see doc comment above.
    }
  }

  /// Best-effort fetch of the nudge banner suggesting an icebreaker for a
  /// fresh, unplayed match. Failure here shouldn't surface to the user; it
  /// just means the banner won't appear this visit.
  Future<void> _loadSuggestedIcebreaker() async {
    try {
      final suggestion = await widget.messagingApi.fetchSuggestedIcebreaker(widget.matchId);
      if (mounted) {
        setState(() => _suggestedIcebreaker = suggestion);
      }
    } catch (_) {
      // Ignored - see doc comment above.
    }
  }

  static String _formatLastActive(DateTime lastActiveAt) {
    final minutes = DateTime.now().difference(lastActiveAt).inMinutes;
    if (minutes < 1) {
      return 'Active just now';
    }
    if (minutes < 60) {
      return 'Active ${minutes}m ago';
    }
    final hours = minutes ~/ 60;
    if (hours < 24) {
      return 'Active ${hours}h ago';
    }
    return 'Active ${hours ~/ 24}d ago';
  }

  /// Private per-user note about this match (conversation details, date
  /// plans) - only visible to the current user, never shared with the match.
  Future<void> _editNote() async {
    MatchNote note;
    try {
      note = await widget.messagingApi.fetchMatchNote(widget.matchId);
    } on MessagingApiException catch (e) {
      setState(() => _errorText = e.message);
      return;
    }
    if (!mounted) {
      return;
    }

    final controller = TextEditingController(text: note.content ?? '');
    final content = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Private note'),
        content: TextField(
          controller: controller,
          maxLines: 5,
          maxLength: 1000,
          decoration: const InputDecoration(hintText: 'Only you can see this note…'),
          autofocus: true,
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.of(context).pop(controller.text),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    if (content == null) {
      return;
    }

    try {
      await widget.messagingApi.setMatchNote(widget.matchId, content);
    } on MessagingApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  Future<void> _send() async {
    final content = _controller.text.trim();
    if (content.isEmpty || _isSending) {
      return;
    }

    setState(() => _errorText = null);

    try {
      final moderation = await widget.messagingApi.checkMessage(content);
      if (moderation.flagged) {
        final shouldSend = await _confirmFlaggedSend(moderation.categories);
        if (shouldSend != true) {
          return;
        }
      }
    } on MessagingApiException {
      // If the safety check itself fails, don't block the user from sending.
    }

    setState(() => _isSending = true);
    try {
      final message = await widget.messagingApi.sendMessage(
        matchId: widget.matchId,
        content: content,
      );
      _onMessageSent(message);
      _controller.clear();
    } on MessagingApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isSending = false);
      }
    }
  }

  Future<bool?> _confirmFlaggedSend(List<String> categories) {
    return showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Heads up'),
        content: Text(
          'This message may come across as harmful or harassing'
          '${categories.isNotEmpty ? ' (${categories.join(', ')})' : ''}. Send anyway?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Send anyway'),
          ),
        ],
      ),
    );
  }

  Future<void> _reportMessage(ChatMessage message) async {
    final reason = await showDialog<String>(
      context: context,
      builder: (context) => const _ReportMessageDialog(),
    );
    if (reason == null || reason.trim().isEmpty) {
      return;
    }
    try {
      await widget.messagingApi.reportMessage(
        matchId: widget.matchId,
        messageId: message.id,
        reason: reason.trim(),
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Thanks, we'll review this message.")),
        );
      }
    } on MessagingApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  /// Ends the match, this app's stand-in for "blocking" someone from a
  /// flagged message's warning - there's no separate block relationship
  /// anywhere else in this codebase, matches_screen's "Unmatch" does the
  /// same thing. Auto-tagged as "Inappropriate behavior" rather than
  /// prompting for a reason, since this is meant to be a one-tap safety
  /// action off the flagged-message warning.
  Future<void> _blockSender() async {
    try {
      await widget.messagingApi.unmatch(widget.matchId, reason: 'Inappropriate behavior');
      if (mounted) {
        Navigator.of(context).pop();
      }
    } on MessagingApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  Future<void> _sendGif(GifResult gif) async {
    setState(() => _errorText = null);
    try {
      final message = await widget.messagingApi.sendMediaMessage(
        matchId: widget.matchId,
        contentType: 'GIF',
        mediaUrl: gif.url,
      );
      _onMessageSent(message);
    } on MessagingApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  /// Records a short front-camera reaction clip and sends it as its own
  /// message - see VideoReactionPickerController. The picker's own
  /// maxDuration already caps the recording at maxVideoReactionSeconds, and
  /// there's no way to read back the actual clip length from image_picker,
  /// so that cap is reported as the duration.
  Future<void> _recordAndSendVideoReaction() async {
    final path = await widget.videoReactionPicker.recordVideoReaction();
    if (path == null) {
      return;
    }

    setState(() => _errorText = null);
    try {
      final message = await widget.messagingApi.sendMediaMessage(
        matchId: widget.matchId,
        contentType: 'VIDEO_REACTION',
        mediaUrl: path,
        durationSeconds: maxVideoReactionSeconds,
      );
      _onMessageSent(message);
    } on MessagingApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  void _onMessageSent(ChatMessage message) {
    setState(() {
      _messages = [..._messages, message];
      _status = MatchStatus(
        matchId: widget.matchId,
        expiresAt: null,
        isExpired: false,
        firstMessageSent: true,
        canSendFirstMessage: true,
        canExtend: false,
        otherUserIsVerified: _status?.otherUserIsVerified ?? false,
        verificationRequested: _status?.verificationRequested ?? false,
        verificationRequestedByMe: _status?.verificationRequestedByMe ?? false,
        otherUserSnoozeStatusMessage: _status?.otherUserSnoozeStatusMessage,
      );
    });
  }

  Future<void> _revealImage(ChatMessage message) async {
    setState(() => _errorText = null);
    try {
      final revealed = await widget.messagingApi.revealImage(
        matchId: widget.matchId,
        messageId: message.id,
      );
      setState(() {
        _messages = [
          for (final existing in _messages)
            if (existing.id == revealed.id) revealed else existing,
        ];
      });
    } on MessagingApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  Future<void> _viewEphemeralMedia(ChatMessage message) async {
    setState(() => _errorText = null);
    try {
      final revealed = await widget.messagingApi.viewEphemeralMedia(
        matchId: widget.matchId,
        messageId: message.id,
      );
      setState(() {
        _messages = [
          for (final existing in _messages)
            if (existing.id == revealed.id) revealed else existing,
        ];
      });
    } on MessagingApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  Future<void> _toggleReadReceipts() async {
    setState(() => _errorText = null);
    try {
      final enabled = await widget.messagingApi.setReadReceiptsEnabled(!_readReceiptsEnabled);
      setState(() => _readReceiptsEnabled = enabled);
    } on MessagingApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  Future<void> _toggleMediaBlurPreference() async {
    setState(() => _errorText = null);
    try {
      final enabled = await widget.messagingApi.setMediaBlurPreference(!_autoBlurMediaEnabled);
      setState(() => _autoBlurMediaEnabled = enabled);
    } on MessagingApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  Future<void> _showMeetupSuggestions() async {
    MeetupSuggestions? suggestions;
    String? error;
    try {
      suggestions = await widget.dateSuggestionsApi.fetchMeetupSuggestions(widget.matchId);
    } on DateSuggestionsApiException catch (e) {
      error = e.message;
    }

    if (!mounted) {
      return;
    }

    await showModalBottomSheet<void>(
      context: context,
      builder: (context) {
        if (error != null) {
          return Padding(
            padding: const EdgeInsets.all(24),
            child: Text(error, style: const TextStyle(color: Colors.red)),
          );
        }
        var result = suggestions!;
        return StatefulBuilder(
          builder: (context, setSheetState) {
            Future<void> pick(String categoryId) async {
              try {
                await widget.dateSuggestionsApi.pickVenueCategory(widget.matchId, categoryId);
                final refreshed =
                    await widget.dateSuggestionsApi.fetchMeetupSuggestions(widget.matchId);
                setSheetState(() => result = refreshed);
              } on DateSuggestionsApiException {
                // Best-effort: the sheet just keeps showing the prior selection.
              }
            }

            return SafeArea(
              child: ListView(
                shrinkWrap: true,
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                    child: Text(
                      'Meetup spots ~${result.distanceKm.toStringAsFixed(1)} km apart',
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                    ),
                  ),
                  if (result.mutualPickCategoryId != null)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                      child: Text(
                        'You both picked the same spot!',
                        style: TextStyle(color: Theme.of(context).colorScheme.primary),
                      ),
                    ),
                  for (final suggestion in result.suggestions)
                    ListTile(
                      title: Text(suggestion.label),
                      subtitle: Text(suggestion.description),
                      trailing: IconButton(
                        icon: Icon(
                          suggestion.isMyPick ? Icons.favorite : Icons.favorite_border,
                          color: suggestion.isMyPick ? Theme.of(context).colorScheme.primary : null,
                        ),
                        tooltip: 'Pick this spot',
                        onPressed: () => pick(suggestion.id),
                      ),
                    ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  /// Composes and sends an in-chat reservation/ticket card: a deep-link to
  /// OpenTable's or Eventbrite's own search results for whatever the user
  /// typed - see MessagingApi.sendReservation.
  Future<void> _openSendReservationDialog() async {
    String provider = 'OPENTABLE';
    final queryController = TextEditingController();

    final result = await showDialog<Map<String, String>>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('Reserve or buy tickets'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SegmentedButton<String>(
                segments: const [
                  ButtonSegment(value: 'OPENTABLE', label: Text('Restaurant')),
                  ButtonSegment(value: 'EVENTBRITE', label: Text('Event')),
                ],
                selected: {provider},
                onSelectionChanged: (selection) => setDialogState(() => provider = selection.first),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: queryController,
                decoration: InputDecoration(
                  hintText: provider == 'OPENTABLE' ? 'Restaurant name' : 'Event name',
                ),
                autofocus: true,
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
            TextButton(
              onPressed: () => Navigator.of(context).pop({
                'provider': provider,
                'query': queryController.text.trim(),
              }),
              child: const Text('Send'),
            ),
          ],
        ),
      ),
    );

    if (result == null || result['query']!.isEmpty) {
      return;
    }

    setState(() => _errorText = null);
    try {
      final message = await widget.messagingApi.sendReservation(
        matchId: widget.matchId,
        provider: result['provider']!,
        query: result['query']!,
      );
      _onMessageSent(message);
    } on MessagingApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  /// Lets the sender pick a gift from the full catalog and drop it into the
  /// chat as its own message - see MessagingApi.sendGiftMessage.
  /// AI-tailored opening lines for this match (shared interests,
  /// compatibility overlap, and - once she's answered any - her own profile
  /// prompt answers) - see MessagingApi.fetchIcebreakerSuggestions. Only
  /// enabled once the message window is unlocked, since there's nothing to
  /// open yet before that.
  Future<void> _openIcebreakerAssistant() async {
    List<String> suggestions;
    try {
      suggestions = await widget.messagingApi.fetchIcebreakerSuggestions(widget.matchId);
    } on MessagingApiException catch (e) {
      setState(() => _errorText = e.message);
      return;
    }

    if (!mounted) {
      return;
    }

    final selected = await showModalBottomSheet<String>(
      context: context,
      builder: (context) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 16, 16, 8),
              child: Text('Opener suggestions', style: TextStyle(fontWeight: FontWeight.bold)),
            ),
            if (suggestions.isEmpty)
              const Padding(
                padding: EdgeInsets.all(16),
                child: Text('No suggestions available right now.'),
              ),
            for (final suggestion in suggestions)
              ListTile(
                title: Text(suggestion),
                onTap: () => Navigator.of(context).pop(suggestion),
              ),
          ],
        ),
      ),
    );

    if (selected != null) {
      _controller.text = selected;
    }
  }

  /// Short, tappable reply options for her most recent message, to help
  /// keep an already-active conversation flowing - see
  /// MessagingApi.fetchSmartReplies. The mid-conversation counterpart to
  /// [_openIcebreakerAssistant], which only helps start one.
  Future<void> _openSmartReplies() async {
    List<String> suggestions;
    try {
      suggestions = await widget.messagingApi.fetchSmartReplies(widget.matchId);
    } on MessagingApiException catch (e) {
      setState(() => _errorText = e.message);
      return;
    }

    if (!mounted) {
      return;
    }

    final selected = await showModalBottomSheet<String>(
      context: context,
      builder: (context) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 16, 16, 8),
              child: Text('Smart replies', style: TextStyle(fontWeight: FontWeight.bold)),
            ),
            if (suggestions.isEmpty)
              const Padding(
                padding: EdgeInsets.all(16),
                child: Text('No suggestions available right now.'),
              ),
            for (final suggestion in suggestions)
              ListTile(
                title: Text(suggestion),
                onTap: () => Navigator.of(context).pop(suggestion),
              ),
          ],
        ),
      ),
    );

    if (selected != null) {
      _controller.text = selected;
    }
  }

  Future<void> _openSendGiftDialog() async {
    List<VirtualGift> catalog;
    try {
      catalog = await widget.giftingApi.fetchCatalog();
    } on GiftingApiException catch (e) {
      setState(() => _errorText = e.message);
      return;
    }

    if (!mounted) {
      return;
    }

    final selected = await showModalBottomSheet<VirtualGift>(
      context: context,
      builder: (context) => SafeArea(
        child: GridView.count(
          shrinkWrap: true,
          crossAxisCount: 4,
          padding: const EdgeInsets.all(16),
          children: [
            for (final gift in catalog)
              InkWell(
                onTap: () => Navigator.of(context).pop(gift),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(gift.emoji, style: const TextStyle(fontSize: 28)),
                    Text(gift.name, textAlign: TextAlign.center, style: const TextStyle(fontSize: 11)),
                    Text('${gift.tokenCost}', style: const TextStyle(fontSize: 11, color: Colors.grey)),
                  ],
                ),
              ),
          ],
        ),
      ),
    );

    if (selected == null) {
      return;
    }

    setState(() => _errorText = null);
    try {
      final message = await widget.messagingApi.sendGiftMessage(
        matchId: widget.matchId,
        giftId: selected.id,
      );
      _onMessageSent(message);
    } on MessagingApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  Future<void> _startRecording() async {
    setState(() => _errorText = null);

    final hasPermission = await widget.recorder.hasPermission();
    if (!hasPermission) {
      setState(() => _errorText = 'Microphone permission is required to send a voice note.');
      return;
    }

    await widget.recorder.start();
    setState(() {
      _isRecording = true;
      _recordedSeconds = 0;
    });

    _recordTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      setState(() => _recordedSeconds += 1);
      if (_recordedSeconds >= _maxVoiceNoteSeconds) {
        _stopAndSendRecording();
      }
    });
  }

  Future<void> _stopAndSendRecording() async {
    _recordTimer?.cancel();
    final path = await widget.recorder.stop();
    final duration = _recordedSeconds;
    setState(() => _isRecording = false);

    if (path == null || duration < 1) {
      return;
    }

    setState(() => _isSending = true);
    try {
      final message = await widget.messagingApi.sendVoiceNote(
        matchId: widget.matchId,
        mediaUrl: path,
        durationSeconds: duration,
      );
      _onMessageSent(message);
    } on MessagingApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isSending = false);
      }
    }
  }

  Future<void> _playVoiceNote(ChatMessage message) async {
    final path = message.mediaUrl;
    if (path == null) {
      return;
    }
    await widget.player.play(path, speed: _voiceNoteSpeedByMessageId[message.id] ?? 1.0);
  }

  /// Cycles this voice note's playback speed through 1x/1.25x/1.5x/2x,
  /// remembered per message so replaying it uses the last speed picked.
  void _cycleVoiceNoteSpeed(ChatMessage message) {
    final current = _voiceNoteSpeedByMessageId[message.id] ?? 1.0;
    final nextIndex = (_voiceNoteSpeeds.indexOf(current) + 1) % _voiceNoteSpeeds.length;
    setState(() => _voiceNoteSpeedByMessageId[message.id] = _voiceNoteSpeeds[nextIndex]);
  }

  String _voiceNoteSpeedLabel(ChatMessage message) {
    final speed = _voiceNoteSpeedByMessageId[message.id] ?? 1.0;
    return speed == speed.roundToDouble() ? '${speed.toInt()}x' : '${speed}x';
  }

  Future<void> _openGifPicker() async {
    final gif = await showDialog<GifResult>(
      context: context,
      builder: (context) => _GifPickerDialog(messagingApi: widget.messagingApi),
    );
    if (gif != null) {
      await _sendGif(gif);
    }
  }

  Future<void> _openIcebreakerPicker() async {
    setState(() => _errorText = null);
    List<IcebreakerPrompt> prompts;
    try {
      prompts = await widget.messagingApi.fetchIcebreakerPrompts();
    } on MessagingApiException catch (e) {
      setState(() => _errorText = e.message);
      return;
    }
    if (!mounted) {
      return;
    }
    final prompt = await showDialog<IcebreakerPrompt>(
      context: context,
      builder: (context) => _IcebreakerPickerDialog(prompts: prompts),
    );
    if (prompt != null) {
      await _sendIcebreaker(prompt);
    }
  }

  Future<void> _sendIcebreaker(IcebreakerPrompt prompt) async {
    setState(() => _errorText = null);
    try {
      final message = await widget.messagingApi.sendIcebreaker(
        matchId: widget.matchId,
        promptId: prompt.id,
      );
      _onMessageSent(message);
      setState(() => _suggestedIcebreaker = null);
    } on MessagingApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  void _dismissSuggestedIcebreaker() {
    setState(() => _suggestedIcebreaker = null);
  }

  Future<void> _respondToIcebreaker(ChatMessage message, int optionIndex) async {
    setState(() => _errorText = null);
    try {
      final updated = await widget.messagingApi.respondToIcebreaker(
        matchId: widget.matchId,
        messageId: message.id,
        optionIndex: optionIndex,
      );
      setState(() {
        _messages = [
          for (final existing in _messages)
            if (existing.id == updated.id) updated else existing,
        ];
      });
    } on MessagingApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  /// Lets the user pick one of the 3 "Game Night" card types, then either
  /// choose a curated prompt (TRIVIA/TWENTY_ONE_QUESTIONS) or compose a
  /// Two Truths and a Lie round, and sends it.
  Future<void> _openGameNightPicker() async {
    setState(() => _errorText = null);
    final gameType = await showDialog<String>(
      context: context,
      builder: (context) => const _GameNightTypePickerDialog(),
    );
    if (gameType == null || !mounted) {
      return;
    }

    if (gameType == 'TWO_TRUTHS_AND_A_LIE') {
      final round = await showDialog<_TwoTruthsRound>(
        context: context,
        builder: (context) => const _TwoTruthsComposerDialog(),
      );
      if (round != null) {
        await _sendGameCard(gameType, statements: round.statements, lieIndex: round.lieIndex);
      }
      return;
    }

    List<String> questions;
    List<String> ids;
    try {
      if (gameType == 'TRIVIA') {
        final trivia = await widget.messagingApi.fetchTriviaQuestions();
        questions = trivia.map((q) => q.question).toList();
        ids = trivia.map((q) => q.id).toList();
      } else {
        final prompts = await widget.messagingApi.fetchTwentyOneQuestionsPrompts();
        questions = prompts.map((p) => p.question).toList();
        ids = prompts.map((p) => p.id).toList();
      }
    } on MessagingApiException catch (e) {
      setState(() => _errorText = e.message);
      return;
    }
    if (!mounted) {
      return;
    }
    final promptId = await showDialog<String>(
      context: context,
      builder: (context) => _GameCardPromptPickerDialog(
        title: gameType == 'TRIVIA' ? 'Send a trivia card' : 'Send a 21 Questions card',
        questions: questions,
        ids: ids,
      ),
    );
    if (promptId != null) {
      await _sendGameCard(gameType, promptId: promptId);
    }
  }

  Future<void> _sendGameCard(String gameType, {String? promptId, List<String>? statements, int? lieIndex}) async {
    setState(() => _errorText = null);
    try {
      final message = await widget.messagingApi.sendGameCard(
        matchId: widget.matchId,
        gameType: gameType,
        promptId: promptId,
        statements: statements,
        lieIndex: lieIndex,
      );
      _onMessageSent(message);
    } on MessagingApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  Future<void> _respondToGameCard(ChatMessage message, int answerIndex) async {
    setState(() => _errorText = null);
    try {
      final updated = await widget.messagingApi.respondToGameCard(
        matchId: widget.matchId,
        messageId: message.id,
        answerIndex: answerIndex,
      );
      setState(() {
        _messages = [
          for (final existing in _messages)
            if (existing.id == updated.id) updated else existing,
        ];
      });
    } on MessagingApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  Future<void> _unlockReadReceipt(ChatMessage message) async {
    setState(() => _errorText = null);
    try {
      final updated = await widget.messagingApi.unlockReadReceipt(
        matchId: widget.matchId,
        messageId: message.id,
      );
      setState(() {
        _messages = [
          for (final existing in _messages)
            if (existing.id == updated.id) updated else existing,
        ];
      });
    } on MessagingApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  /// Translates a single text message on demand, caching the result inline
  /// under the bubble. Works for either side of the conversation - see
  /// MessagingApi.translateMessage.
  Future<void> _translateMessage(ChatMessage message) async {
    setState(() => _errorText = null);
    try {
      final translated = await widget.messagingApi.translateMessage(
        matchId: widget.matchId,
        messageId: message.id,
      );
      setState(() => _translatedContentByMessageId[message.id] = translated);
    } on MessagingApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  Future<void> _extendMatchTimeLimit() async {
    setState(() => _errorText = null);
    try {
      final status = await widget.messagingApi.extendMatchTimeLimit(widget.matchId);
      setState(() => _status = status);
    } on MessagingApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  Future<void> _requestVerification() async {
    setState(() => _errorText = null);
    try {
      final status = await widget.messagingApi.requestVerification(widget.matchId);
      setState(() => _status = status);
    } on MessagingApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  bool get _canType {
    final status = _status;
    if (status == null) {
      return false;
    }
    return status.firstMessageSent || (status.canSendFirstMessage && !status.isExpired);
  }

  String? get _lockedBanner {
    final status = _status;
    if (status == null) {
      return null;
    }
    if (status.isExpired) {
      return 'This match has expired.';
    }
    if (!status.firstMessageSent && !status.canSendFirstMessage) {
      return "Waiting for her to send the first message.";
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Chat'),
        actions: [
          IconButton(
            icon: const Icon(Icons.auto_awesome_outlined),
            tooltip: 'Opener suggestions',
            onPressed: _canType ? _openIcebreakerAssistant : null,
          ),
          IconButton(
            icon: const Icon(Icons.reply_all_outlined),
            tooltip: 'Smart replies',
            onPressed: _canType ? _openSmartReplies : null,
          ),
          IconButton(
            icon: const Icon(Icons.place_outlined),
            tooltip: 'Suggest a place to meet',
            onPressed: _showMeetupSuggestions,
          ),
          IconButton(
            icon: const Icon(Icons.confirmation_number_outlined),
            tooltip: 'Reserve or buy tickets',
            onPressed: _openSendReservationDialog,
          ),
          IconButton(
            icon: const Icon(Icons.card_giftcard_outlined),
            tooltip: 'Send a gift',
            onPressed: _openSendGiftDialog,
          ),
          IconButton(
            icon: const Icon(Icons.photo_library_outlined),
            tooltip: 'Shared private photos',
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(
                builder: (context) =>
                    VaultGrantedScreen(vaultApi: widget.vaultApi, matchId: widget.matchId),
              ),
            ),
          ),
          IconButton(
            icon: Icon(_readReceiptsEnabled ? Icons.done_all : Icons.done),
            color: _readReceiptsEnabled ? Colors.indigo : null,
            tooltip: _readReceiptsEnabled ? 'Read receipts on' : 'Read receipts off',
            onPressed: _toggleReadReceipts,
          ),
          IconButton(
            icon: Icon(_autoBlurMediaEnabled ? Icons.blur_on : Icons.blur_off),
            color: _autoBlurMediaEnabled ? Colors.indigo : null,
            tooltip: _autoBlurMediaEnabled
                ? 'Auto-blur incoming photos on'
                : 'Auto-blur incoming photos off',
            onPressed: _toggleMediaBlurPreference,
          ),
          IconButton(
            icon: Badge(
              isLabelVisible: _surveyPromptDue,
              smallSize: 8,
              child: const Icon(Icons.rate_review_outlined),
            ),
            tooltip: _surveyPromptDue ? 'How did your date go?' : 'Did you meet up?',
            onPressed: () async {
              await Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (context) => PostMatchSurveyScreen(
                    postMatchSurveyApi: widget.postMatchSurveyApi,
                    matchId: widget.matchId,
                  ),
                ),
              );
              if (mounted) {
                setState(() => _surveyPromptDue = false);
              }
            },
          ),
          IconButton(
            icon: const Icon(Icons.sticky_note_2_outlined),
            tooltip: 'Private note',
            onPressed: _editNote,
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                if (_errorText != null)
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text(_errorText!, style: const TextStyle(color: Colors.red)),
                  ),
                if (_lockedBanner != null)
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text(_lockedBanner!, style: const TextStyle(fontWeight: FontWeight.bold)),
                  ),
                if (_status?.otherUserSnoozeStatusMessage != null)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                    child: Text(
                      "They're currently away: ${_status!.otherUserSnoozeStatusMessage}",
                      style: const TextStyle(fontStyle: FontStyle.italic, color: Colors.indigo),
                    ),
                  ),
                if (_status?.otherUserLastActiveAt != null)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                    child: Text(
                      _formatLastActive(_status!.otherUserLastActiveAt!),
                      style: const TextStyle(fontSize: 12, color: Colors.grey),
                    ),
                  ),
                if (_status?.canExtend ?? false)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: OutlinedButton.icon(
                      onPressed: _extendMatchTimeLimit,
                      icon: const Icon(Icons.timer_outlined),
                      label: const Text('Extend 24 hours'),
                    ),
                  ),
                if (!(_status?.otherUserIsVerified ?? true) &&
                    !(_status?.verificationRequested ?? false))
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                    child: OutlinedButton.icon(
                      onPressed: _requestVerification,
                      icon: const Icon(Icons.verified_outlined),
                      label: const Text('Request photo verification'),
                    ),
                  ),
                if (_status?.verificationRequested ?? false)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                    child: Text(
                      _status!.verificationRequestedByMe
                          ? "You've requested photo verification."
                          : 'They requested photo verification from you.',
                      style: const TextStyle(fontStyle: FontStyle.italic),
                    ),
                  ),
                if (_suggestedIcebreaker != null)
                  Card(
                    margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                    color: Colors.indigo.shade50,
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Row(
                        children: [
                          const Icon(Icons.celebration_outlined, color: Colors.indigo),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text(
                                  'Break the ice',
                                  style: TextStyle(fontWeight: FontWeight.bold),
                                ),
                                Text(_suggestedIcebreaker!.question),
                              ],
                            ),
                          ),
                          TextButton(
                            onPressed: () => _sendIcebreaker(_suggestedIcebreaker!),
                            child: const Text('Send'),
                          ),
                          IconButton(
                            icon: const Icon(Icons.close),
                            tooltip: 'Dismiss',
                            onPressed: _dismissSuggestedIcebreaker,
                          ),
                        ],
                      ),
                    ),
                  ),
                Expanded(
                  child: _messages.isEmpty
                      ? const Center(child: Text('No messages yet.'))
                      : ListView.builder(
                          itemCount: _messages.length,
                          itemBuilder: (context, index) {
                            final message = _messages[index];
                            final isMine = message.senderId == widget.currentUserId;
                            final bubble = Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                              child: Column(
                                crossAxisAlignment:
                                    isMine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
                                children: [
                                  if (!isMine && message.moderationFlagged)
                                    _buildFlaggedMessageWarning(message),
                                  _buildMessageContent(message, isMine),
                                  if (message.contentType == 'TEXT' && message.content != null)
                                    if (_translatedContentByMessageId[message.id] case final translated?)
                                      Padding(
                                        padding: const EdgeInsets.only(top: 2),
                                        child: Text(
                                          translated,
                                          style: const TextStyle(
                                            fontSize: 12,
                                            fontStyle: FontStyle.italic,
                                            color: Colors.grey,
                                          ),
                                        ),
                                      )
                                    else
                                      GestureDetector(
                                        onTap: () => _translateMessage(message),
                                        child: const Text(
                                          'Translate',
                                          style: TextStyle(
                                            fontSize: 11,
                                            color: Colors.indigo,
                                            decoration: TextDecoration.underline,
                                          ),
                                        ),
                                      ),
                                  if (isMine && message.readReceiptLocked)
                                    GestureDetector(
                                      onTap: () => _unlockReadReceipt(message),
                                      child: const Text(
                                        'Unlock read receipt',
                                        style: TextStyle(
                                          fontSize: 11,
                                          color: Colors.indigo,
                                          decoration: TextDecoration.underline,
                                        ),
                                      ),
                                    )
                                  else if (isMine && message.isRead)
                                    const Text(
                                      'Read',
                                      style: TextStyle(fontSize: 11, color: Colors.grey),
                                    ),
                                ],
                              ),
                            );
                            return Align(
                              alignment: isMine ? Alignment.centerRight : Alignment.centerLeft,
                              child: isMine
                                  ? bubble
                                  : GestureDetector(
                                      onLongPress: () => _reportMessage(message),
                                      child: bubble,
                                    ),
                            );
                          },
                        ),
                ),
                if (_canType)
                  Padding(
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      children: [
                        IconButton(
                          icon: const Icon(Icons.gif_box_outlined),
                          tooltip: 'Send a GIF',
                          onPressed: _openGifPicker,
                        ),
                        IconButton(
                          icon: const Icon(Icons.quiz_outlined),
                          tooltip: 'Send an icebreaker',
                          onPressed: _openIcebreakerPicker,
                        ),
                        IconButton(
                          icon: const Icon(Icons.casino_outlined),
                          tooltip: 'Play a game',
                          onPressed: _openGameNightPicker,
                        ),
                        IconButton(
                          icon: const Icon(Icons.videocam_outlined),
                          tooltip: 'Send a video reaction',
                          onPressed: _recordAndSendVideoReaction,
                        ),
                        IconButton(
                          icon: Icon(_isRecording ? Icons.stop_circle : Icons.mic_none),
                          color: _isRecording ? Colors.red : null,
                          tooltip: _isRecording ? 'Stop and send voice note' : 'Record a voice note',
                          onPressed: _isSending
                              ? null
                              : (_isRecording ? _stopAndSendRecording : _startRecording),
                        ),
                        if (_isRecording) Text('$_recordedSeconds s'),
                        Expanded(
                          child: TextField(
                            controller: _controller,
                            decoration: const InputDecoration(hintText: 'Type a message'),
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.send),
                          onPressed: _isSending ? null : _send,
                        ),
                      ],
                    ),
                  ),
              ],
            ),
    );
  }

  /// Shown above a flagged incoming message so the recipient sees the
  /// warning up front, with a quick path to report or block - not just the
  /// pre-existing long-press-to-report gesture.
  Widget _buildFlaggedMessageWarning(ChatMessage message) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.warning_amber, size: 16, color: Colors.red),
          const SizedBox(width: 4),
          const Text(
            'Possibly harmful message',
            style: TextStyle(fontSize: 12, color: Colors.red, fontWeight: FontWeight.bold),
          ),
          TextButton(
            style: TextButton.styleFrom(minimumSize: Size.zero, padding: const EdgeInsets.symmetric(horizontal: 8)),
            onPressed: () => _reportMessage(message),
            child: const Text('Report'),
          ),
          TextButton(
            style: TextButton.styleFrom(minimumSize: Size.zero, padding: const EdgeInsets.symmetric(horizontal: 8)),
            onPressed: _blockSender,
            child: const Text('Block'),
          ),
        ],
      ),
    );
  }

  Widget _buildMessageContent(ChatMessage message, bool isMine) {
    if (message.moderationRemoved) {
      return const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.remove_circle_outline, size: 16, color: Colors.grey),
          SizedBox(width: 4),
          Flexible(
            child: Text(
              'This message was removed for violating our guidelines.',
              style: TextStyle(fontStyle: FontStyle.italic, color: Colors.grey),
            ),
          ),
        ],
      );
    }
    switch (message.contentType) {
      case 'GIF':
        return _networkImage(message.mediaUrl!);
      case 'IMAGE':
        if (message.isEphemeral) {
          return _buildEphemeralPhoto(message, isMine);
        }
        final shouldBlur = message.isBlurred && !isMine;
        final image = _networkImage(message.mediaUrl!);
        if (!shouldBlur) {
          return image;
        }
        return GestureDetector(
          onTap: () => _revealImage(message),
          child: Stack(
            alignment: Alignment.center,
            children: [
              ImageFiltered(
                imageFilter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
                child: image,
              ),
              Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (message.moderationFlagged) ...[
                    const Icon(Icons.warning_amber, color: Colors.white),
                    const Text(
                      'Possibly sensitive content',
                      style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 4),
                  ],
                  const Text(
                    'Tap to reveal',
                    style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                  ),
                ],
              ),
            ],
          ),
        );
      case 'ICEBREAKER':
        return _buildIcebreakerContent(message);
      case 'GAME_CARD':
        return _buildGameCardContent(message);
      case 'VOICE_NOTE':
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                IconButton(
                  icon: const Icon(Icons.play_arrow),
                  onPressed: () => _playVoiceNote(message),
                ),
                Text('${message.durationSeconds ?? 0}s voice note'),
                TextButton(
                  onPressed: () => _cycleVoiceNoteSpeed(message),
                  child: Text(_voiceNoteSpeedLabel(message)),
                ),
              ],
            ),
            Padding(
              padding: const EdgeInsets.only(left: 12, right: 12, bottom: 4),
              child: VoiceWaveform(seed: message.id, onTap: () => _playVoiceNote(message)),
            ),
            if (message.transcript != null)
              Padding(
                padding: const EdgeInsets.only(left: 12, right: 12, bottom: 4),
                child: Text(
                  message.transcript!,
                  style: const TextStyle(fontStyle: FontStyle.italic, color: Colors.grey),
                ),
              ),
          ],
        );
      case 'RESERVATION':
        return _buildReservationContent(message);
      case 'GIFT':
        return _buildGiftContent(message);
      case 'VIDEO_REACTION':
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.videocam),
            const SizedBox(width: 4),
            Text('${message.durationSeconds ?? maxVideoReactionSeconds}s video reaction'),
          ],
        );
      case 'TEXT':
      default:
        return Text(message.content ?? '');
    }
  }

  Widget _buildReservationContent(ChatMessage message) {
    final reservation = message.reservation;
    if (reservation == null) {
      return const Text('Reservation');
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              reservation.provider == 'OPENTABLE' ? Icons.restaurant_outlined : Icons.confirmation_number_outlined,
            ),
            const SizedBox(width: 4),
            Text(
              reservation.provider == 'OPENTABLE' ? 'Table reservation' : 'Event tickets',
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
          ],
        ),
        Text(reservation.query),
        SelectableText(
          reservation.url,
          style: const TextStyle(color: Colors.indigo, decoration: TextDecoration.underline),
        ),
      ],
    );
  }

  Widget _buildGiftContent(ChatMessage message) {
    final gift = message.gift;
    if (gift == null) {
      return const Text('Gift');
    }
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(gift.emoji, style: const TextStyle(fontSize: 28)),
        const SizedBox(width: 8),
        Text(gift.name, style: const TextStyle(fontWeight: FontWeight.bold)),
      ],
    );
  }

  /// An auto-expiring photo: shows the image itself while it's currently
  /// viewable (server only includes mediaUrl in that window - see
  /// MessageView.isEphemeralExpired), otherwise a tap-to-view prompt for
  /// the recipient or a status line for the sender/once it's gone.
  Widget _buildEphemeralPhoto(ChatMessage message, bool isMine) {
    if (message.mediaUrl != null) {
      return _networkImage(message.mediaUrl!);
    }
    if (message.isEphemeralExpired) {
      return const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.no_photography_outlined),
          SizedBox(width: 4),
          Text('Photo expired'),
        ],
      );
    }
    if (isMine) {
      return const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.photo_outlined),
          SizedBox(width: 4),
          Text('Disappearing photo sent'),
        ],
      );
    }
    final label = message.expiryMode == 'VIEW_ONCE'
        ? 'Tap to view once'
        : 'Tap to view (disappears in ${message.viewTimerSeconds}s)';
    return GestureDetector(
      onTap: () => _viewEphemeralMedia(message),
      child: Container(
        width: 160,
        height: 160,
        color: Colors.black87,
        alignment: Alignment.center,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              message.expiryMode == 'VIEW_ONCE' ? Icons.looks_one_outlined : Icons.timer_outlined,
              color: Colors.white,
            ),
            const SizedBox(height: 4),
            Text(
              label,
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildIcebreakerContent(ChatMessage message) {
    final icebreaker = message.icebreaker;
    if (icebreaker == null) {
      return const SizedBox.shrink();
    }

    return Container(
      width: 220,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(icebreaker.question, style: const TextStyle(fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          if (!icebreaker.haveIAnswered) ...[
            OutlinedButton(
              onPressed: () => _respondToIcebreaker(message, 0),
              child: Text(icebreaker.optionA),
            ),
            const SizedBox(height: 4),
            OutlinedButton(
              onPressed: () => _respondToIcebreaker(message, 1),
              child: Text(icebreaker.optionB),
            ),
          ] else ...[
            Text('You: ${icebreaker.myOptionIndex == 0 ? icebreaker.optionA : icebreaker.optionB}'),
            if (icebreaker.haveBothAnswered)
              Text(
                'Them: ${icebreaker.otherOptionIndex == 0 ? icebreaker.optionA : icebreaker.optionB}',
              )
            else
              const Text('Waiting for their answer...', style: TextStyle(color: Colors.grey)),
          ],
        ],
      ),
    );
  }

  Widget _buildGameCardContent(ChatMessage message) {
    final gameCard = message.gameCard;
    if (gameCard == null) {
      return const SizedBox.shrink();
    }

    Widget body;
    if (gameCard.isTwentyOneQuestions) {
      body = const Text('Reply in chat!', style: TextStyle(color: Colors.grey));
    } else if (!gameCard.haveIAnswered) {
      body = Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (var i = 0; i < gameCard.options.length; i++)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: OutlinedButton(
                onPressed: () => _respondToGameCard(message, i),
                child: Text(gameCard.options[i]),
              ),
            ),
        ],
      );
    } else {
      final correct = gameCard.correctOptionIndex;
      body = Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (var i = 0; i < gameCard.options.length; i++)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                gameCard.options[i],
                style: TextStyle(
                  fontWeight: i == gameCard.myAnswerIndex ? FontWeight.bold : FontWeight.normal,
                  color: correct == null
                      ? null
                      : (i == correct ? Colors.green : (i == gameCard.myAnswerIndex ? Colors.red : null)),
                ),
              ),
            ),
          const SizedBox(height: 4),
          Text(
            gameCard.isMyAnswerCorrect == null
                ? 'Waiting to reveal...'
                : (gameCard.isMyAnswerCorrect! ? 'Correct!' : 'Not quite!'),
            style: const TextStyle(fontStyle: FontStyle.italic),
          ),
        ],
      );
    }

    return Container(
      width: 240,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(gameCard.question, style: const TextStyle(fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          body,
        ],
      ),
    );
  }

  Widget _networkImage(String url) {
    return Image.network(
      url,
      width: 160,
      height: 160,
      fit: BoxFit.cover,
      errorBuilder: (context, error, stackTrace) => const SizedBox(
        width: 160,
        height: 160,
        child: Icon(Icons.broken_image_outlined),
      ),
    );
  }
}

class _GifPickerDialog extends StatefulWidget {
  const _GifPickerDialog({required this.messagingApi});

  final MessagingApi messagingApi;

  @override
  State<_GifPickerDialog> createState() => _GifPickerDialogState();
}

class _GifPickerDialogState extends State<_GifPickerDialog> {
  final _queryController = TextEditingController();
  List<GifResult> _results = [];
  bool _isSearching = false;
  String? _errorText;

  @override
  void dispose() {
    _queryController.dispose();
    super.dispose();
  }

  Future<void> _search() async {
    final query = _queryController.text.trim();
    if (query.isEmpty) {
      return;
    }
    setState(() {
      _isSearching = true;
      _errorText = null;
    });
    try {
      final results = await widget.messagingApi.searchGifs(query);
      setState(() => _results = results);
    } on MessagingApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isSearching = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Send a GIF'),
      content: SizedBox(
        width: double.maxFinite,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _queryController,
                    decoration: const InputDecoration(hintText: 'Search GIFs'),
                    onSubmitted: (_) => _search(),
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.search),
                  onPressed: _isSearching ? null : _search,
                ),
              ],
            ),
            if (_errorText != null)
              Text(_errorText!, style: const TextStyle(color: Colors.red)),
            if (_isSearching) const Padding(
              padding: EdgeInsets.all(16),
              child: CircularProgressIndicator(),
            ),
            if (!_isSearching && _results.isNotEmpty)
              SizedBox(
                height: 200,
                child: GridView.builder(
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 3),
                  itemCount: _results.length,
                  itemBuilder: (context, index) {
                    final gif = _results[index];
                    return GestureDetector(
                      onTap: () => Navigator.of(context).pop(gif),
                      child: Image.network(
                        gif.previewUrl,
                        fit: BoxFit.cover,
                        errorBuilder: (context, error, stackTrace) =>
                            const Icon(Icons.broken_image_outlined),
                      ),
                    );
                  },
                ),
              ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
      ],
    );
  }
}

class _IcebreakerPickerDialog extends StatelessWidget {
  const _IcebreakerPickerDialog({required this.prompts});

  final List<IcebreakerPrompt> prompts;

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Send an icebreaker'),
      content: SizedBox(
        width: double.maxFinite,
        child: prompts.isEmpty
            ? const Text('No icebreakers available right now.')
            : ListView.builder(
                shrinkWrap: true,
                itemCount: prompts.length,
                itemBuilder: (context, index) {
                  final prompt = prompts[index];
                  return ListTile(
                    title: Text(prompt.question),
                    subtitle: Text('${prompt.optionA} or ${prompt.optionB}'),
                    onTap: () => Navigator.of(context).pop(prompt),
                  );
                },
              ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
      ],
    );
  }
}

class _GameNightTypePickerDialog extends StatelessWidget {
  const _GameNightTypePickerDialog();

  @override
  Widget build(BuildContext context) {
    return SimpleDialog(
      title: const Text('Play a game'),
      children: [
        SimpleDialogOption(
          onPressed: () => Navigator.of(context).pop('TRIVIA'),
          child: const Text('Trivia'),
        ),
        SimpleDialogOption(
          onPressed: () => Navigator.of(context).pop('TWENTY_ONE_QUESTIONS'),
          child: const Text('21 Questions'),
        ),
        SimpleDialogOption(
          onPressed: () => Navigator.of(context).pop('TWO_TRUTHS_AND_A_LIE'),
          child: const Text('Two Truths and a Lie'),
        ),
      ],
    );
  }
}

class _GameCardPromptPickerDialog extends StatelessWidget {
  const _GameCardPromptPickerDialog({required this.title, required this.questions, required this.ids});

  final String title;
  final List<String> questions;
  final List<String> ids;

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(title),
      content: SizedBox(
        width: double.maxFinite,
        child: questions.isEmpty
            ? const Text('No cards available right now.')
            : ListView.builder(
                shrinkWrap: true,
                itemCount: questions.length,
                itemBuilder: (context, index) {
                  return ListTile(
                    title: Text(questions[index]),
                    onTap: () => Navigator.of(context).pop(ids[index]),
                  );
                },
              ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
      ],
    );
  }
}

class _TwoTruthsRound {
  _TwoTruthsRound({required this.statements, required this.lieIndex});

  final List<String> statements;
  final int lieIndex;
}

class _TwoTruthsComposerDialog extends StatefulWidget {
  const _TwoTruthsComposerDialog();

  @override
  State<_TwoTruthsComposerDialog> createState() => _TwoTruthsComposerDialogState();
}

class _TwoTruthsComposerDialogState extends State<_TwoTruthsComposerDialog> {
  final _controllers = [TextEditingController(), TextEditingController(), TextEditingController()];
  int _lieIndex = 0;

  @override
  void dispose() {
    for (final controller in _controllers) {
      controller.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Two Truths and a Lie'),
      content: SizedBox(
        width: double.maxFinite,
        child: RadioGroup<int>(
          groupValue: _lieIndex,
          onChanged: (value) => setState(() => _lieIndex = value!),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (var i = 0; i < 3; i++)
                Row(
                  children: [
                    Radio<int>(value: i),
                    Expanded(
                      child: TextField(
                        controller: _controllers[i],
                        decoration: InputDecoration(hintText: 'Statement ${i + 1}'),
                      ),
                    ),
                  ],
                ),
              const Text(
                'Select the radio button next to your lie.',
                style: TextStyle(fontSize: 12, color: Colors.grey),
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        TextButton(
          onPressed: () {
            final statements = _controllers.map((c) => c.text.trim()).toList();
            if (statements.any((s) => s.isEmpty)) {
              return;
            }
            Navigator.of(context).pop(_TwoTruthsRound(statements: statements, lieIndex: _lieIndex));
          },
          child: const Text('Send'),
        ),
      ],
    );
  }
}

class _ReportMessageDialog extends StatefulWidget {
  const _ReportMessageDialog();

  @override
  State<_ReportMessageDialog> createState() => _ReportMessageDialogState();
}

class _ReportMessageDialogState extends State<_ReportMessageDialog> {
  final _reasonController = TextEditingController();

  @override
  void dispose() {
    _reasonController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Report this message'),
      content: TextField(
        controller: _reasonController,
        decoration: const InputDecoration(hintText: 'Why are you reporting this?'),
        autofocus: true,
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        TextButton(
          onPressed: () => Navigator.of(context).pop(_reasonController.text),
          child: const Text('Report'),
        ),
      ],
    );
  }
}
