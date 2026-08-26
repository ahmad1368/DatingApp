import 'package:flutter/material.dart';

import 'personality_api.dart';

/// The four category "pillars" the personality test scores - kept in sync
/// with the backend's PERSONALITY_CATEGORIES.
const List<String> _compatibilityCategories = [
  'Emotional Values',
  'Core Values',
  'Communication Style',
  'Social Habits',
];

const double _minWeight = 0;
const double _maxWeight = 2;

/// Lets the user weight how much each personality category counts toward
/// their own compatibility percentage with someone else - e.g. turning up
/// Core Values and down Social Habits for someone who cares more about
/// shared values than shared hobbies.
class CompatibilityWeightsScreen extends StatefulWidget {
  const CompatibilityWeightsScreen({super.key, required this.personalityApi});

  final PersonalityApi personalityApi;

  @override
  State<CompatibilityWeightsScreen> createState() => _CompatibilityWeightsScreenState();
}

class _CompatibilityWeightsScreenState extends State<CompatibilityWeightsScreen> {
  Map<String, double> _weights = {for (final category in _compatibilityCategories) category: 1};
  bool _isLoading = true;
  bool _isSaving = false;
  String? _errorText;
  String? _statusText;

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
      final weights = await widget.personalityApi.fetchCategoryWeights();
      setState(() => _weights = weights);
    } on PersonalityApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _save() async {
    setState(() {
      _isSaving = true;
      _errorText = null;
      _statusText = null;
    });
    try {
      final updated = await widget.personalityApi.setCategoryWeights(_weights);
      setState(() {
        _weights = updated;
        _statusText = 'Saved.';
      });
    } on PersonalityApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isSaving = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Compatibility Weighting')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                const Text(
                  'Adjust how much each category counts toward your compatibility '
                  'percentage with other people.',
                ),
                const SizedBox(height: 12),
                if (_errorText != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Text(_errorText!, style: const TextStyle(color: Colors.red)),
                  ),
                if (_statusText != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Text(_statusText!),
                  ),
                for (final category in _compatibilityCategories) _buildSlider(category),
                const SizedBox(height: 16),
                ElevatedButton(
                  onPressed: _isSaving ? null : _save,
                  child: const Text('Save'),
                ),
              ],
            ),
    );
  }

  Widget _buildSlider(String category) {
    final weight = _weights[category] ?? 1;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('$category: ${weight.toStringAsFixed(1)}x'),
          Slider(
            value: weight,
            min: _minWeight,
            max: _maxWeight,
            divisions: 20,
            label: '${weight.toStringAsFixed(1)}x',
            onChanged: (value) => setState(() => _weights = {..._weights, category: value}),
          ),
        ],
      ),
    );
  }
}
