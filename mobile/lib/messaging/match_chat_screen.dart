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
      setState(() {
        _messages = [..._messages, message];
        _controller.clear();
        _status = MatchStatus(
          matchId: widget.matchId,
          expiresAt: null,
          isExpired: false,
          firstMessageSent: true,
          canSendFirstMessage: true,
        );
      });
    } on MessagingApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isSending = false);
      }
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
                                child: Text(message.content),
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
}
