import 'package:flutter/material.dart';

import 'matching_api.dart';

/// Shows an astrological compatibility breakdown with another user: each
/// person's zodiac sign and element (Fire/Earth/Air/Water), the resulting
/// harmony label, and a 0-100 compatibility score - see
/// MatchingService.getCompatibility on the backend for how it's derived.
class AstrologyCompatibilityScreen extends StatefulWidget {
  const AstrologyCompatibilityScreen({
    super.key,
    required this.matchingApi,
    required this.otherUserId,
  });

  final MatchingApi matchingApi;
  final String otherUserId;

  @override
  State<AstrologyCompatibilityScreen> createState() => _AstrologyCompatibilityScreenState();
}

class _AstrologyCompatibilityScreenState extends State<AstrologyCompatibilityScreen> {
  CompatibilityResult? _result;
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
      final result = await widget.matchingApi.getCompatibility(widget.otherUserId);
      setState(() => _result = result);
    } on MatchingApiException catch (e) {
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
      appBar: AppBar(title: const Text('Astrology Compatibility')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _errorText != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(_errorText!, style: const TextStyle(color: Colors.red)),
                  ),
                )
              : _buildBody(_result!),
    );
  }

  Widget _buildBody(CompatibilityResult result) {
    if (result.zodiacSign == null || result.otherZodiacSign == null) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text('Add your birthday to see astrology compatibility.'),
        ),
      );
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
          children: [
            _SignColumn(label: 'You', sign: result.zodiacSign!, element: result.zodiacElement),
            const Icon(Icons.favorite, color: Colors.pink),
            _SignColumn(
              label: 'Them',
              sign: result.otherZodiacSign!,
              element: result.otherZodiacElement,
            ),
          ],
        ),
        const SizedBox(height: 24),
        if (result.zodiacCompatibilityScore != null) ...[
          Text(
            '${result.zodiacCompatibilityScore}% astrological match',
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          LinearProgressIndicator(value: result.zodiacCompatibilityScore! / 100),
          const SizedBox(height: 16),
        ],
        if (result.zodiacHarmony != null)
          Text(
            result.zodiacHarmony!,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 16, color: Colors.grey),
          ),
      ],
    );
  }
}

class _SignColumn extends StatelessWidget {
  const _SignColumn({required this.label, required this.sign, required this.element});

  final String label;
  final String sign;
  final String? element;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(label, style: const TextStyle(color: Colors.grey)),
        const SizedBox(height: 4),
        Text(sign, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
        if (element != null) Text(element!),
      ],
    );
  }
}
