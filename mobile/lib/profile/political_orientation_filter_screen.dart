import 'package:flutter/material.dart';

import 'lifestyle_filters_api.dart';

/// Lets the user filter their discovery deck by political orientation, so
/// only candidates whose stated ideological alignment works for them show
/// up in their card stack.
class PoliticalOrientationFilterScreen extends StatefulWidget {
  const PoliticalOrientationFilterScreen({super.key, required this.lifestyleFiltersApi});

  final LifestyleFiltersApi lifestyleFiltersApi;

  @override
  State<PoliticalOrientationFilterScreen> createState() => _PoliticalOrientationFilterScreenState();
}

class _PoliticalOrientationFilterScreenState extends State<PoliticalOrientationFilterScreen> {
  List<String> _orientationOptions = [];
  LifestyleFilters? _filters;
  Set<String> _selectedOrientations = {};
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
        widget.lifestyleFiltersApi.fetchPoliticalOrientationOptions(),
        widget.lifestyleFiltersApi.fetchFilters(),
      ]);
      final orientationOptions = results[0] as List<String>;
      final filters = results[1] as LifestyleFilters;
      setState(() {
        _orientationOptions = orientationOptions;
        _filters = filters;
        _selectedOrientations = filters.filterPoliticalOrientations.toSet();
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
        filters.copyWith(filterPoliticalOrientations: _selectedOrientations.toList()),
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
      appBar: AppBar(title: const Text('Political Orientation Filter')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                const Text(
                  'Only show people whose political orientation works for you. '
                  'Leave everything unselected to see everyone.',
                ),
                const SizedBox(height: 12),
                if (_errorText != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Text(_errorText!, style: const TextStyle(color: Colors.red)),
                  ),
                const Text('Political Orientation', style: TextStyle(fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final option in _orientationOptions)
                      FilterChip(
                        label: Text(option),
                        selected: _selectedOrientations.contains(option),
                        onSelected: (selected) => setState(() {
                          if (selected) {
                            _selectedOrientations.add(option);
                          } else {
                            _selectedOrientations.remove(option);
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
