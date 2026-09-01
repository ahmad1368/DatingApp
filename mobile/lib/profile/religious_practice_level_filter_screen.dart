import 'package:flutter/material.dart';

import 'lifestyle_filters_api.dart';

/// Lets the user filter their discovery deck by how observant a candidate
/// is (independent of the religion itself), so only candidates whose level
/// of religious/spiritual practice works for them show up in their card
/// stack.
class ReligiousPracticeLevelFilterScreen extends StatefulWidget {
  const ReligiousPracticeLevelFilterScreen({super.key, required this.lifestyleFiltersApi});

  final LifestyleFiltersApi lifestyleFiltersApi;

  @override
  State<ReligiousPracticeLevelFilterScreen> createState() =>
      _ReligiousPracticeLevelFilterScreenState();
}

class _ReligiousPracticeLevelFilterScreenState extends State<ReligiousPracticeLevelFilterScreen> {
  List<String> _levelOptions = [];
  LifestyleFilters? _filters;
  Set<String> _selectedLevels = {};
  bool _isLoading = true;
  bool _isSaving = false;
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
      final results = await Future.wait([
        widget.lifestyleFiltersApi.fetchReligiousPracticeLevelOptions(),
        widget.lifestyleFiltersApi.fetchFilters(),
      ]);
      final levelOptions = results[0] as List<String>;
      final filters = results[1] as LifestyleFilters;
      setState(() {
        _levelOptions = levelOptions;
        _filters = filters;
        _selectedLevels = filters.filterReligiousPracticeLevels.toSet();
      });
    } on LifestyleFiltersApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _save() async {
    final filters = _filters;
    if (filters == null) {
      return;
    }
    setState(() {
      _isSaving = true;
      _errorText = null;
    });
    try {
      final updated = await widget.lifestyleFiltersApi.setFilters(
        filters.copyWith(filterReligiousPracticeLevels: _selectedLevels.toList()),
      );
      setState(() => _filters = updated);
    } on LifestyleFiltersApiException catch (e) {
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
      appBar: AppBar(title: const Text('Religious Practice Filter')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                const Text(
                  'Only show people whose level of religious or spiritual practice works '
                  'for you. Leave everything unselected to see everyone.',
                ),
                const SizedBox(height: 12),
                if (_errorText != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Text(_errorText!, style: const TextStyle(color: Colors.red)),
                  ),
                const Text('Religious Practice Level', style: TextStyle(fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final option in _levelOptions)
                      FilterChip(
                        label: Text(option),
                        selected: _selectedLevels.contains(option),
                        onSelected: (selected) => setState(() {
                          if (selected) {
                            _selectedLevels.add(option);
                          } else {
                            _selectedLevels.remove(option);
                          }
                        }),
                      ),
                  ],
                ),
                const SizedBox(height: 24),
                ElevatedButton(
                  onPressed: _isSaving ? null : _save,
                  child: const Text('Save'),
                ),
              ],
            ),
    );
  }
}
