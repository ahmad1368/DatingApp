import 'package:flutter/material.dart';

import 'match_analytics_api.dart';

/// "Post-Match Conversion Analytics Dashboard": shows the signed-in user how
/// often their likes turn into matches, and how quickly they tend to send
/// the first message once matched.
class MatchInsightsScreen extends StatefulWidget {
  const MatchInsightsScreen({super.key, required this.matchAnalyticsApi});

  final MatchAnalyticsApi matchAnalyticsApi;

  @override
  State<MatchInsightsScreen> createState() => _MatchInsightsScreenState();
}

class _MatchInsightsScreenState extends State<MatchInsightsScreen> {
  MatchInsights? _insights;
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
      final insights = await widget.matchAnalyticsApi.fetchMatchInsights();
      setState(() => _insights = insights);
    } on MatchAnalyticsApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  String _formatRate(double? rate) {
    if (rate == null) {
      return 'Not enough data yet';
    }
    return '${(rate * 100).round()}%';
  }

  String _formatDuration(double? seconds) {
    if (seconds == null) {
      return 'Not enough data yet';
    }
    final minutes = seconds / 60;
    if (minutes < 60) {
      return '${minutes.round()} min';
    }
    return '${(minutes / 60).round()} hr';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Match Insights')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  if (_errorText != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Text(_errorText!, style: const TextStyle(color: Colors.red)),
                    ),
                  if (_insights != null) ..._buildStats(_insights!),
                ],
              ),
            ),
    );
  }

  List<Widget> _buildStats(MatchInsights insights) {
    return [
      ListTile(
        title: const Text('Likes sent'),
        trailing: Text('${insights.totalLikesSent}'),
      ),
      ListTile(
        title: const Text('Matches'),
        trailing: Text('${insights.totalMatches}'),
      ),
      ListTile(
        title: const Text('Like acceptance rate'),
        subtitle: const Text('Share of your likes that turned into a match'),
        trailing: Text(_formatRate(insights.likeAcceptanceRate)),
      ),
      ListTile(
        title: const Text('Average time to first message'),
        subtitle: const Text('How quickly you tend to message after matching'),
        trailing: Text(_formatDuration(insights.averageMessageInitiationSeconds)),
      ),
    ];
  }
}
