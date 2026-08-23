import 'package:flutter/material.dart';

import '../community_groups/community_groups_api.dart';
import 'lifestyle_filters_api.dart';

/// Lets the user filter their discovery deck to only show people who share
/// at least one of the selected community groups (passion niches).
class CommunityGroupFilterScreen extends StatefulWidget {
  const CommunityGroupFilterScreen({
    super.key,
    required this.communityGroupsApi,
    required this.lifestyleFiltersApi,
  });

  final CommunityGroupsApi communityGroupsApi;
  final LifestyleFiltersApi lifestyleFiltersApi;

  @override
  State<CommunityGroupFilterScreen> createState() => _CommunityGroupFilterScreenState();
}

class _CommunityGroupFilterScreenState extends State<CommunityGroupFilterScreen> {
  List<CommunityGroup> _groups = [];
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
        widget.communityGroupsApi.fetchGroups(),
        widget.lifestyleFiltersApi.fetchFilters(),
      ]);
      final groups = results[0] as List<CommunityGroup>;
      final filters = results[1] as LifestyleFilters;
      setState(() {
        _groups = groups;
        _filters = filters;
        _selected = filters.filterCommunityGroups.toSet();
      });
    } on Exception catch (e) {
      setState(() => _errorText = e.toString());
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
        filters.copyWith(filterCommunityGroups: _selected.toList()),
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
      appBar: AppBar(title: const Text('Filter by Community Group')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                const Text(
                  'Only show people who share at least one of the community groups you pick '
                  'below. Leave everything unselected to see everyone.',
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
                    for (final group in _groups)
                      FilterChip(
                        label: Text(group.name),
                        selected: _selected.contains(group.id),
                        onSelected: (selected) => setState(() {
                          if (selected) {
                            _selected.add(group.id);
                          } else {
                            _selected.remove(group.id);
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
