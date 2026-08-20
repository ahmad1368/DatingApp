import 'dart:async';

import 'package:flutter/material.dart';

import 'blind_dating_api.dart';

/// Blind dating / speed chat: pairs the user with a random stranger for a
/// timed text chat where neither side's name or photo is shown until both
/// agree to reveal.
class BlindDatingScreen extends StatefulWidget {
  const BlindDatingScreen({super.key, required this.blindDatingApi, required this.currentUserId});

  final BlindDatingApi blindDatingApi;
  final String currentUserId;

  @override
  State<BlindDatingScreen> createState() => _BlindDatingScreenState();
}

class _BlindDatingScreenState extends State<BlindDatingScreen> {
  final _controller = TextEditingController();
  BlindDateStatus? _status;
  List<BlindDateMessage> _messages = [];
  bool _isLoading = true;
  bool _isSending = false;
  String? _errorText;
  Timer? _poller;

  @override
  void initState() {
    super.initState();
    _load();
    _poller = Timer.periodic(const Duration(seconds: 3), (_) => _poll());
  }

  @override
  void dispose() {
    _poller?.cancel();
    _controller.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _isLoading = true;
      _errorText = null;
    });
    try {
      final status = await widget.blindDatingApi.fetchStatus();
      setState(() => _status = status);
      if (status.isActive && status.sessionId != null) {
        await _loadMessages(status.sessionId!);
      }
    } on BlindDatingApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _poll() async {
    if (!mounted) {
      return;
    }
    try {
      final status = await widget.blindDatingApi.fetchStatus();
      if (!mounted) {
        return;
      }
      setState(() => _status = status);
      if (status.isActive && status.sessionId != null) {
        await _loadMessages(status.sessionId!);
      }
    } catch (_) {
      // Non-critical: a missed poll just tries again on the next tick.
    }
  }

  Future<void> _loadMessages(String sessionId) async {
    try {
      final messages = await widget.blindDatingApi.fetchMessages(sessionId);
      if (mounted) {
        setState(() => _messages = messages);
      }
    } on BlindDatingApiException catch (e) {
      if (mounted) {
        setState(() => _errorText = e.message);
      }
    }
  }

  Future<void> _joinQueue() async {
    setState(() => _errorText = null);
    try {
      final status = await widget.blindDatingApi.joinQueue();
      setState(() => _status = status);
    } on BlindDatingApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  Future<void> _leaveQueue() async {
    setState(() => _errorText = null);
    try {
      await widget.blindDatingApi.leaveQueue();
      await _load();
    } on BlindDatingApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  Future<void> _send() async {
    final content = _controller.text.trim();
    final sessionId = _status?.sessionId;
    if (content.isEmpty || sessionId == null || _isSending) {
      return;
    }

    setState(() => _isSending = true);
    try {
      final message = await widget.blindDatingApi.sendMessage(sessionId: sessionId, content: content);
      setState(() => _messages = [..._messages, message]);
      _controller.clear();
    } on BlindDatingApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isSending = false);
      }
    }
  }

  Future<void> _requestReveal() async {
    final sessionId = _status?.sessionId;
    if (sessionId == null) {
      return;
    }
    setState(() => _errorText = null);
    try {
      final status = await widget.blindDatingApi.requestReveal(sessionId);
      setState(() => _status = status);
    } on BlindDatingApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final status = _status;

    return Scaffold(
      appBar: AppBar(title: const Text('Blind Dating')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                if (_errorText != null)
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text(_errorText!, style: const TextStyle(color: Colors.red)),
                  ),
                Expanded(child: _buildBody(status)),
              ],
            ),
    );
  }

  Widget _buildBody(BlindDateStatus? status) {
    if (status == null || status.status == 'NONE' || status.isEnded) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (status?.isEnded ?? false) const Text('That session has ended.'),
            const SizedBox(height: 12),
            ElevatedButton(
              onPressed: _joinQueue,
              child: const Text('Start blind dating'),
            ),
          ],
        ),
      );
    }

    if (status.isWaiting) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const CircularProgressIndicator(),
            const SizedBox(height: 16),
            const Text('Waiting for a match…'),
            const SizedBox(height: 16),
            TextButton(onPressed: _leaveQueue, child: const Text('Cancel')),
          ],
        ),
      );
    }

    return Column(
      children: [
        if (status.isRevealed && status.otherProfile != null)
          Padding(
            padding: const EdgeInsets.all(16),
            child: Text(
              "It's ${status.otherProfile!.name ?? 'them'}!",
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
          )
        else if (status.myRevealRequested)
          const Padding(
            padding: EdgeInsets.all(16),
            child: Text('Waiting for the other person to agree to reveal…'),
          ),
        Expanded(
          child: _messages.isEmpty
              ? const Center(child: Text('Say hi to your anonymous match!'))
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
        Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              if (!status.isRevealed)
                IconButton(
                  icon: const Icon(Icons.face_retouching_natural),
                  tooltip: 'Reveal profiles',
                  onPressed: status.myRevealRequested ? null : _requestReveal,
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
    );
  }
}
