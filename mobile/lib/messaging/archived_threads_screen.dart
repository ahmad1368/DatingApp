import 'package:flutter/material.dart';

import 'messaging_api.dart';

/// A la carte "Unmatch Protection": browses conversations that were
/// archived (instead of deleted) when a match was unmatched or expired
/// unmessaged, because either side had the protection power-up enabled.
class ArchivedThreadsScreen extends StatefulWidget {
  const ArchivedThreadsScreen({super.key, required this.messagingApi});

  final MessagingApi messagingApi;

  @override
  State<ArchivedThreadsScreen> createState() => _ArchivedThreadsScreenState();
}

class _ArchivedThreadsScreenState extends State<ArchivedThreadsScreen> {
  List<ArchivedThread> _threads = [];
  bool _isLoading = true;
  String? _errorText;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _isLoading = true;
      _errorText = null;
    });
    try {
      final threads = await widget.messagingApi.fetchArchivedThreads();
      setState(() => _threads = threads);
    } on MessagingApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Archived Conversations')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _errorText != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(_errorText!, style: const TextStyle(color: Colors.red)),
                  ),
                )
              : _threads.isEmpty
                  ? const Center(child: Text('No archived conversations.'))
                  : ListView.builder(
                      itemCount: _threads.length,
                      itemBuilder: (context, index) {
                        final thread = _threads[index];
                        return ListTile(
                          title: Text(thread.otherUserName ?? 'Someone new'),
                          subtitle: Text(
                            '${thread.messageCount} message(s) · archived ${thread.dissolvedAt.toLocal()}',
                          ),
                          onTap: () => Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) => ArchivedThreadMessagesScreen(
                                messagingApi: widget.messagingApi,
                                thread: thread,
                              ),
                            ),
                          ),
                        );
                      },
                    ),
    );
  }
}

/// Read-only transcript of one archived thread - there is no active match
/// to send new messages into, so this only ever displays history.
class ArchivedThreadMessagesScreen extends StatefulWidget {
  const ArchivedThreadMessagesScreen({super.key, required this.messagingApi, required this.thread});

  final MessagingApi messagingApi;
  final ArchivedThread thread;

  @override
  State<ArchivedThreadMessagesScreen> createState() => _ArchivedThreadMessagesScreenState();
}

class _ArchivedThreadMessagesScreenState extends State<ArchivedThreadMessagesScreen> {
  List<ArchivedChatMessage> _messages = [];
  bool _isLoading = true;
  String? _errorText;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _isLoading = true;
      _errorText = null;
    });
    try {
      final messages = await widget.messagingApi.fetchArchivedThreadMessages(
        widget.thread.dissolvedMatchId,
      );
      setState(() => _messages = messages);
    } on MessagingApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.thread.otherUserName ?? 'Someone new')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _errorText != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(_errorText!, style: const TextStyle(color: Colors.red)),
                  ),
                )
              : ListView.builder(
                  itemCount: _messages.length,
                  itemBuilder: (context, index) {
                    final message = _messages[index];
                    return ListTile(
                      title: Text(message.content ?? message.mediaUrl ?? '(no content)'),
                      subtitle: Text(message.createdAt.toLocal().toString()),
                    );
                  },
                ),
    );
  }
}
