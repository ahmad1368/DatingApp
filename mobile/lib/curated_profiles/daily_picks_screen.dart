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
      final picks = await widget.curatedProfilesApi.fetchDailyPicks();
      setState(() => _picks = picks);
    } on CuratedProfilesApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
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
                Expanded(
                  child: _picks.isEmpty
                      ? const Center(child: Text("You're all caught up. Check back at noon!"))
                      : ListView.builder(
                          itemCount: _picks.length,
                          itemBuilder: (context, index) {
                            final profile = _picks[index];
                            return ListTile(
                              title: Text(
                                profile.name != null
                                    ? '${profile.name}${profile.age != null ? ', ${profile.age}' : ''}'
                                    : 'Someone new',
                              ),
                              subtitle: profile.compatibilityPercentage != null
                                  ? Text('${profile.compatibilityPercentage}% compatible')
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
