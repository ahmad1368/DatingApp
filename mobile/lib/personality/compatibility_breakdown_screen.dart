import 'package:flutter/material.dart';

import 'personality_api.dart';

/// Side-by-side breakdown of personality compatibility with another user,
/// grouped by category (emotional values, core values, communication style,
/// social habits) so it reads like a comparison graph rather than a single
/// aggregate percentage.
class CompatibilityBreakdownScreen extends StatefulWidget {
  const CompatibilityBreakdownScreen({
    super.key,
    required this.personalityApi,
    required this.otherUserId,
  });

  final PersonalityApi personalityApi;
  final String otherUserId;

  @override
  State<CompatibilityBreakdownScreen> createState() => _CompatibilityBreakdownScreenState();
}

class _CompatibilityBreakdownScreenState extends State<CompatibilityBreakdownScreen> {
  CompatibilityBreakdown? _breakdown;
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
      final breakdown = await widget.personalityApi.fetchCompatibilityBreakdown(
        widget.otherUserId,
      );
      setState(() => _breakdown = breakdown);
    } on PersonalityApiException catch (e) {
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
      appBar: AppBar(title: const Text('Compatibility Breakdown')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _errorText != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(_errorText!, style: const TextStyle(color: Colors.red)),
                  ),
                )
              : _buildBody(_breakdown!),
    );
  }

  Widget _buildBody(CompatibilityBreakdown breakdown) {
    if (breakdown.percentage == null) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text('Take the personality test to see a compatibility breakdown.'),
        ),
      );
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(
          'Overall compatibility: ${breakdown.percentage}%',
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 16),
        for (final category in breakdown.categories) ...[
          Text(
            '${category.category} · ${category.averageSimilarity}% match',
            style: const TextStyle(fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          for (final dimension in category.dimensions) _buildDimensionRow(dimension),
          const SizedBox(height: 16),
        ],
      ],
    );
  }

  Widget _buildDimensionRow(DimensionComparison dimension) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(dimension.dimension),
          const SizedBox(height: 4),
          Row(
            children: [
              const SizedBox(width: 40, child: Text('You', style: TextStyle(fontSize: 12))),
              Expanded(
                child: LinearProgressIndicator(
                  value: dimension.myScore / 100,
                  color: Colors.indigo,
                ),
              ),
              const SizedBox(width: 8),
              Text('${dimension.myScore}'),
            ],
          ),
          Row(
            children: [
              const SizedBox(width: 40, child: Text('Them', style: TextStyle(fontSize: 12))),
              Expanded(
                child: LinearProgressIndicator(
                  value: dimension.theirScore / 100,
                  color: Colors.pink,
                ),
              ),
              const SizedBox(width: 8),
              Text('${dimension.theirScore}'),
            ],
          ),
        ],
      ),
    );
  }
}
