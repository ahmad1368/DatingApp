import 'dart:async';
import 'dart:ui';

import 'package:flutter/material.dart';

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
  })  : recorder = recorder ?? DeviceVoiceRecorderController(),
        player = player ?? DeviceVoicePlayerController(),
        dateSuggestionsApi =
            dateSuggestionsApi ?? DateSuggestionsApi(accessToken: messagingApi.accessToken),
        vaultApi = vaultApi ?? VaultApi(accessToken: messagingApi.accessToken),
        screenSecurityChannel = screenSecurityChannel ?? ScreenSecurityChannel(),
        screenSecurityApi =
            screenSecurityApi ?? ScreenSecurityApi(accessToken: messagingApi.accessToken),
        postMatchSurveyApi =
            postMatchSurveyApi ?? PostMatchSurveyApi(accessToken: messagingApi.accessToken);

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
  bool _isRecording = false;
  int _recordedSeconds = 0;
  Timer? _recordTimer;
  String? _errorText;

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

  Future<void> _toggleReadReceipts() async {
    setState(() => _errorText = null);
    try {
      final enabled = await widget.messagingApi.setReadReceiptsEnabled(!_readReceiptsEnabled);
      setState(() => _readReceiptsEnabled = enabled);
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
        final result = suggestions!;
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
              for (final suggestion in result.suggestions)
                ListTile(
                  title: Text(suggestion.label),
                  subtitle: Text(suggestion.description),
                ),
            ],
          ),
        );
      },
    );
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
    await widget.player.play(path);
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
    } on MessagingApiException catch (e) {
      setState(() => _errorText = e.message);
    }
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
            icon: const Icon(Icons.place_outlined),
            tooltip: 'Suggest a place to meet',
            onPressed: _showMeetupSuggestions,
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
            icon: const Icon(Icons.rate_review_outlined),
            tooltip: 'Did you meet up?',
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(
                builder: (context) => PostMatchSurveyScreen(
                  postMatchSurveyApi: widget.postMatchSurveyApi,
                  matchId: widget.matchId,
                ),
              ),
            ),
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
                                  _buildMessageContent(message, isMine),
                                  if (isMine && message.isRead)
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

  Widget _buildMessageContent(ChatMessage message, bool isMine) {
    switch (message.contentType) {
      case 'GIF':
        return _networkImage(message.mediaUrl!);
      case 'IMAGE':
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
      case 'VOICE_NOTE':
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconButton(
              icon: const Icon(Icons.play_arrow),
              onPressed: () => _playVoiceNote(message),
            ),
            Text('${message.durationSeconds ?? 0}s voice note'),
          ],
        );
      case 'TEXT':
      default:
        return Text(message.content ?? '');
    }
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
