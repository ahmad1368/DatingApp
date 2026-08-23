import 'package:flutter/material.dart';

import 'lifestyle_filters_api.dart';

const Map<String, String> _relationshipGoalLabels = {
  'LONG_TERM': 'Long-term relationship',
  'CASUAL': 'Something casual',
  'FRIENDSHIP': 'New friends',
  'NOT_SURE': 'Still figuring it out',
};

/// Lets the user filter their discovery deck strictly by the relationship
/// goals ("match intent") they're looking for - e.g. only show people also
/// after a long-term relationship.
class RelationshipGoalFilterScreen extends StatefulWidget {
  const RelationshipGoalFilterScreen({super.key, required this.lifestyleFiltersApi});

  final LifestyleFiltersApi lifestyleFiltersApi;

  @override
  State<RelationshipGoalFilterScreen> createState() => _RelationshipGoalFilterScreenState();
}

class _RelationshipGoalFilterScreenState extends State<RelationshipGoalFilterScreen> {
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
        widget.lifestyleFiltersApi.fetchRelationshipGoalOptions(),
        widget.lifestyleFiltersApi.fetchFilters(),
      ]);
      final options = results[0] as List<String>;
      final filters = results[1] as LifestyleFilters;
      setState(() {
        _options = options;
        _filters = filters;
        _selected = filters.filterRelationshipGoals.toSet();
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
        filters.copyWith(filterRelationshipGoals: _selected.toList()),
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
      appBar: AppBar(title: const Text('Match Intent Filter')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                const Text(
                  'Only show people looking for the same kind of relationship. '
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
                    for (final goal in _options)
                      FilterChip(
                        label: Text(_relationshipGoalLabels[goal] ?? goal),
                        selected: _selected.contains(goal),
                        onSelected: (selected) => setState(() {
                          if (selected) {
                            _selected.add(goal);
                          } else {
                            _selected.remove(goal);
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
