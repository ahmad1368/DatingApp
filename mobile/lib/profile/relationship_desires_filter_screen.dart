import 'package:flutter/material.dart';

import 'lifestyle_filters_api.dart';

/// Lets the user filter their discovery deck strictly by relationship
/// intent categories (Marriage, Long-Term Relationship, Casual Dating,
/// etc.) so only mutually-aligned candidates show up in their card stack.
class RelationshipDesiresFilterScreen extends StatefulWidget {
  const RelationshipDesiresFilterScreen({super.key, required this.lifestyleFiltersApi});

  final LifestyleFiltersApi lifestyleFiltersApi;

  @override
  State<RelationshipDesiresFilterScreen> createState() => _RelationshipDesiresFilterScreenState();
}

class _RelationshipDesiresFilterScreenState extends State<RelationshipDesiresFilterScreen> {
  List<String> _options = [];
  LifestyleFilters? _filters;
  Set<String> _selected = {};
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
        widget.lifestyleFiltersApi.fetchRelationshipDesireOptions(),
        widget.lifestyleFiltersApi.fetchFilters(),
      ]);
      final options = results[0] as List<String>;
      final filters = results[1] as LifestyleFilters;
      setState(() {
        _options = options;
        _filters = filters;
        _selected = filters.filterRelationshipDesires.toSet();
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
        filters.copyWith(filterRelationshipDesires: _selected.toList()),
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
      appBar: AppBar(title: const Text('Relationship Intent Filter')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                const Text(
                  'Only show people whose relationship intent matches yours. '
                  'Leave everything unselected to see everyone.',
                ),
                const SizedBox(height: 12),
                if (_errorText != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Text(_errorText!, style: const TextStyle(color: Colors.red)),
                  ),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final desire in _options)
                      FilterChip(
                        label: Text(desire),
                        selected: _selected.contains(desire),
                        onSelected: (selected) => setState(() {
                          if (selected) {
                            _selected.add(desire);
                          } else {
                            _selected.remove(desire);
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
