import 'dart:async';

import 'package:flutter/material.dart';

import '../discovery/discovery_api.dart';
import 'curated_profiles_api.dart';

/// Shows today's limited batch of highly compatible profiles ("bagels").
/// Unlike the main swipe deck, this is a small, quality-over-quantity list
/// that refreshes once per day.
class DailyPicksScreen extends StatefulWidget {
  const DailyPicksScreen({super.key, required this.curatedProfilesApi, required this.discoveryApi});

  final CuratedProfilesApi curatedProfilesApi;
  final DiscoveryApi discoveryApi;

  @override
  State<DailyPicksScreen> createState() => _DailyPicksScreenState();
}

class _DailyPicksScreenState extends State<DailyPicksScreen> {
  List<CuratedProfile> _picks = [];
  DateTime? _nextRefreshAt;
  Duration? _timeUntilRefresh;
  Timer? _countdownTimer;
  bool _isLoading = true;
  String? _errorText;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _countdownTimer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _isLoading = true;
      _errorText = null;
    });
    try {
      final results = await Future.wait([
        widget.curatedProfilesApi.fetchDailyPicks(),
        widget.curatedProfilesApi.fetchNextRefreshAt(),
      ]);
      setState(() {
        _picks = results[0] as List<CuratedProfile>;
        _nextRefreshAt = results[1] as DateTime;
      });
      _startCountdown();
    } on CuratedProfilesApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  void _startCountdown() {
    _countdownTimer?.cancel();
    _updateTimeUntilRefresh();
    _countdownTimer = Timer.periodic(const Duration(seconds: 1), (_) => _updateTimeUntilRefresh());
  }

  void _updateTimeUntilRefresh() {
    final nextRefreshAt = _nextRefreshAt;
    if (nextRefreshAt == null || !mounted) {
      return;
    }
    final remaining = nextRefreshAt.difference(DateTime.now());
    setState(() => _timeUntilRefresh = remaining.isNegative ? Duration.zero : remaining);
  }

  String _formatCountdown(Duration duration) {
    final hours = duration.inHours.toString().padLeft(2, '0');
    final minutes = (duration.inMinutes % 60).toString().padLeft(2, '0');
    final seconds = (duration.inSeconds % 60).toString().padLeft(2, '0');
    return '$hours:$minutes:$seconds';
  }

  Future<void> _handleSwipe(CuratedProfile profile, String action) async {
    setState(() => _picks = _picks.where((p) => p.id != profile.id).toList());
    try {
      await widget.discoveryApi.recordSwipe(targetUserId: profile.id, action: action);
    } on DiscoveryApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Today's Picks")),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                if (_errorText != null)
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text(_errorText!, style: const TextStyle(color: Colors.red)),
                  ),
                if (_timeUntilRefresh != null)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    child: Column(
                      children: [
                        const Text('Next picks in', style: TextStyle(color: Colors.grey)),
                        Text(
                          _formatCountdown(_timeUntilRefresh!),
                          style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
                        ),
                      ],
                    ),
                  ),
                Expanded(
                  child: _picks.isEmpty
                      ? const Center(child: Text("You're all caught up for today."))
                      : ListView.builder(
                          itemCount: _picks.length,
                          itemBuilder: (context, index) {
                            final profile = _picks[index];
                            return ListTile(
                              leading: profile.isTopPick
                                  ? const Icon(Icons.star, color: Colors.amber)
                                  : profile.isStandout
                                      ? const Icon(Icons.local_fire_department, color: Colors.deepOrange)
                                      : null,
                              title: Text(
                                profile.name != null
                                    ? '${profile.name}${profile.age != null ? ', ${profile.age}' : ''}'
                                    : 'Someone new',
                              ),
                              subtitle: profile.compatibilityPercentage != null
                                  ? Text(
                                      [
                                        '${profile.compatibilityPercentage}% compatible',
                                        if (profile.isTopPick) 'Top Pick',
                                        if (profile.isStandout) 'Standout',
                                      ].join(' · '),
                                    )
                                  : null,
                              trailing: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  IconButton(
                                    icon: const Icon(Icons.close, color: Colors.red),
                                    onPressed: () => _handleSwipe(profile, 'PASS'),
                                  ),
                                  IconButton(
                                    icon: const Icon(Icons.favorite, color: Colors.green),
                                    onPressed: () => _handleSwipe(profile, 'LIKE'),
                                  ),
                                ],
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
