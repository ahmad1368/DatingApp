import 'package:flutter/material.dart';

import 'match_chat_screen.dart';
import 'messaging_api.dart';

/// Threads with a real conversation that's gone quiet for 14+ days,
/// auto-moved out of the main matches list to declutter it. Unlike an
/// archived (dissolved) thread, this is still a live match - tapping one
/// opens the normal chat screen, and sending a message there naturally
/// moves it back onto the main list.
class InactiveThreadsScreen extends StatefulWidget {
  const InactiveThreadsScreen({super.key, required this.messagingApi, required this.currentUserId});

  final MessagingApi messagingApi;
  final String currentUserId;

  @override
  State<InactiveThreadsScreen> createState() => _InactiveThreadsScreenState();
}

class _InactiveThreadsScreenState extends State<InactiveThreadsScreen> {
  List<InactiveThread> _threads = [];
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
      final threads = await widget.messagingApi.fetchInactiveThreads();
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
      appBar: AppBar(title: const Text('Inactive Conversations')),
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
                  ? const Center(child: Text('No inactive conversations.'))
                  : ListView.builder(
                      itemCount: _threads.length,
                      itemBuilder: (context, index) {
                        final thread = _threads[index];
                        return ListTile(
                          title: Text(thread.otherUserName ?? 'Someone new'),
                          subtitle: Text('Last message ${thread.lastMessageAt.toLocal()}'),
                          onTap: () => Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) => MatchChatScreen(
                                messagingApi: widget.messagingApi,
                                matchId: thread.matchId,
                                currentUserId: widget.currentUserId,
                              ),
                            ),
                          ),
                        );
                      },
                    ),
    );
  }
}
