import 'dart:ui';

import 'package:flutter/material.dart';

import 'messaging_api.dart';

/// Chat screen for a single match. Enforces the women-first rule client
/// side (the backend is the source of truth): until the first message has
/// been sent, only the woman in the match may type, and the match shows a
/// live countdown to its 24-hour expiration.
class MatchChatScreen extends StatefulWidget {
  const MatchChatScreen({
    super.key,
    required this.messagingApi,
    required this.matchId,
    required this.currentUserId,
  });

  final MessagingApi messagingApi;
  final String matchId;
  final String currentUserId;

  @override
  State<MatchChatScreen> createState() => _MatchChatScreenState();
}

class _MatchChatScreenState extends State<MatchChatScreen> {
  final _controller = TextEditingController();
  MatchStatus? _status;
  List<ChatMessage> _messages = [];
  bool _isLoading = true;
  bool _isSending = false;
  String? _errorText;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
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

  Future<void> _send() async {
    final content = _controller.text.trim();
    if (content.isEmpty || _isSending) {
      return;
    }

    setState(() {
      _isSending = true;
      _errorText = null;
    });
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

  Future<void> _openGifPicker() async {
    final gif = await showDialog<GifResult>(
      context: context,
      builder: (context) => _GifPickerDialog(messagingApi: widget.messagingApi),
    );
    if (gif != null) {
      await _sendGif(gif);
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
      appBar: AppBar(title: const Text('Chat')),
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
                Expanded(
                  child: _messages.isEmpty
                      ? const Center(child: Text('No messages yet.'))
                      : ListView.builder(
                          itemCount: _messages.length,
                          itemBuilder: (context, index) {
                            final message = _messages[index];
                            final isMine = message.senderId == widget.currentUserId;
                            return Align(
                              alignment: isMine ? Alignment.centerRight : Alignment.centerLeft,
                              child: Padding(
                                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                                child: _buildMessageContent(message, isMine),
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
              const Text(
                'Tap to reveal',
                style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
              ),
            ],
          ),
        );
      case 'TEXT':
      default:
        return Text(message.content ?? '');
    }
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
