import 'dart:async';

import 'package:flutter/material.dart';

import 'match_chat_screen.dart';
import 'messaging_api.dart';

/// Lists the current user's active matches with a live countdown to each
/// one's 24-hour first-message deadline. Matches that expire without a
/// first message are dissolved by the backend the next time this list is
/// fetched, so they simply disappear on refresh.
class MatchesScreen extends StatefulWidget {
  const MatchesScreen({super.key, required this.messagingApi, required this.currentUserId});

  final MessagingApi messagingApi;
  final String currentUserId;

  @override
  State<MatchesScreen> createState() => _MatchesScreenState();
}

class _MatchesScreenState extends State<MatchesScreen> {
  List<MatchSummary> _matches = [];
  List<ReconnectableMatch> _reconnectable = [];
  bool _isLoading = true;
  String? _errorText;
  Timer? _ticker;
  DateTime _now = DateTime.now();

  @override
  void initState() {
    super.initState();
    _load();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) {
        setState(() => _now = DateTime.now());
      }
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _isLoading = true;
      _errorText = null;
    });
    try {
      final matches = await widget.messagingApi.fetchMyMatches();
      List<ReconnectableMatch> reconnectable = [];
      try {
        reconnectable = await widget.messagingApi.fetchReconnectableMatches();
      } on MessagingApiException {
        // Non-premium users get a 403 here; reconnecting is optional, so
        // just show no reconnect section rather than an error banner.
      }
      setState(() {
        _matches = matches;
        _reconnectable = reconnectable;
      });
    } on MessagingApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _reconnect(ReconnectableMatch match) async {
    setState(() => _errorText = null);
    try {
      await widget.messagingApi.reconnectMatch(match.dissolvedMatchId);
      setState(() {
        _reconnectable = _reconnectable
            .where((existing) => existing.dissolvedMatchId != match.dissolvedMatchId)
            .toList();
      });
      await _load();
    } on MessagingApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  Future<void> _extendMatch(MatchSummary match) async {
    setState(() => _errorText = null);
    try {
      final status = await widget.messagingApi.extendMatchTimeLimit(match.matchId);
      setState(() {
        _matches = [
          for (final existing in _matches)
            if (existing.matchId == match.matchId)
              MatchSummary(
                matchId: existing.matchId,
                otherUserId: existing.otherUserId,
                otherUserName: existing.otherUserName,
                otherUserPhotoUrl: existing.otherUserPhotoUrl,
                expiresAt: status.expiresAt,
                firstMessageSent: existing.firstMessageSent,
                canExtend: status.canExtend,
                createdAt: existing.createdAt,
              )
            else
              existing,
        ];
      });
    } on MessagingApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  String _countdownLabel(MatchSummary match) {
    if (match.firstMessageSent || match.expiresAt == null) {
      return 'Chat unlocked';
    }
    final remaining = match.expiresAt!.difference(_now);
    if (remaining.isNegative) {
      return 'Expiring…';
    }
    final hours = remaining.inHours;
    final minutes = remaining.inMinutes.remainder(60);
    final seconds = remaining.inSeconds.remainder(60);
    return '${hours}h ${minutes}m ${seconds}s left to say something';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Matches')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                if (_errorText != null)
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text(_errorText!, style: const TextStyle(color: Colors.red)),
                  ),
                if (_reconnectable.isNotEmpty) ...[
                  const Padding(
                    padding: EdgeInsets.fromLTRB(16, 12, 16, 4),
                    child: Text('Reconnect', style: TextStyle(fontWeight: FontWeight.bold)),
                  ),
                  for (final match in _reconnectable)
                    ListTile(
                      title: Text(match.otherUserName ?? 'Someone new'),
                      subtitle: const Text('This match expired without a first message'),
                      trailing: ElevatedButton(
                        onPressed: () => _reconnect(match),
                        child: const Text('Reconnect'),
                      ),
                    ),
                  const Divider(height: 1),
                ],
                Expanded(
                  child: _matches.isEmpty
                      ? const Center(child: Text('No matches yet.'))
                      : ListView.builder(
                          itemCount: _matches.length,
                          itemBuilder: (context, index) {
                            final match = _matches[index];
                            return ListTile(
                              title: Text(match.otherUserName ?? 'Someone new'),
                              subtitle: Text(_countdownLabel(match)),
                              trailing: match.canExtend
                                  ? IconButton(
                                      icon: const Icon(Icons.timer_outlined),
                                      tooltip: 'Extend 24 hours',
                                      onPressed: () => _extendMatch(match),
                                    )
                                  : null,
                              onTap: () => Navigator.of(context).push(
                                MaterialPageRoute(
                                  builder: (_) => MatchChatScreen(
                                    messagingApi: widget.messagingApi,
                                    matchId: match.matchId,
                                    currentUserId: widget.currentUserId,
                                  ),
                                ),
                              ),
                            );
                          },
                        ),
                ),
              ],
            ),
    );
  }
}
