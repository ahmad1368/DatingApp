import 'package:flutter/material.dart';

import 'lifestyle_filters_api.dart';

/// Lets the user filter their discovery deck by lifestyle habits - smoking,
/// drinking, and exercise/workout frequency - so only compatible candidates
/// show up in their card stack.
class HabitFiltersScreen extends StatefulWidget {
  const HabitFiltersScreen({super.key, required this.lifestyleFiltersApi});

  final LifestyleFiltersApi lifestyleFiltersApi;

  @override
  State<HabitFiltersScreen> createState() => _HabitFiltersScreenState();
}

class _HabitFiltersScreenState extends State<HabitFiltersScreen> {
  List<String> _smokingOptions = [];
  List<String> _drinkingOptions = [];
  List<String> _workoutOptions = [];
  LifestyleFilters? _filters;
  Set<String> _selectedSmoking = {};
  Set<String> _selectedDrinking = {};
  Set<String> _selectedWorkout = {};
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
        widget.lifestyleFiltersApi.fetchSmokingHabitOptions(),
        widget.lifestyleFiltersApi.fetchDrinkingHabitOptions(),
        widget.lifestyleFiltersApi.fetchWorkoutHabitOptions(),
        widget.lifestyleFiltersApi.fetchFilters(),
      ]);
      final smokingOptions = results[0] as List<String>;
      final drinkingOptions = results[1] as List<String>;
      final workoutOptions = results[2] as List<String>;
      final filters = results[3] as LifestyleFilters;
      setState(() {
        _smokingOptions = smokingOptions;
        _drinkingOptions = drinkingOptions;
        _workoutOptions = workoutOptions;
        _filters = filters;
        _selectedSmoking = filters.filterSmokingHabits.toSet();
        _selectedDrinking = filters.filterDrinkingHabits.toSet();
        _selectedWorkout = filters.filterWorkoutHabits.toSet();
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
        filters.copyWith(
          filterSmokingHabits: _selectedSmoking.toList(),
          filterDrinkingHabits: _selectedDrinking.toList(),
          filterWorkoutHabits: _selectedWorkout.toList(),
        ),
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

  Widget _chipGroup({
    required String title,
    required List<String> options,
    required Set<String> selected,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: const TextStyle(fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final option in options)
              FilterChip(
                label: Text(option),
                selected: selected.contains(option),
                onSelected: (isSelected) => setState(() {
                  if (isSelected) {
                    selected.add(option);
                  } else {
                    selected.remove(option);
                  }
                }),
              ),
          ],
        ),
        const SizedBox(height: 24),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Habit Filters')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                const Text(
                  'Only show people whose habits work for you. '
                  'Leave everything unselected to see everyone.',
                ),
                const SizedBox(height: 12),
                if (_errorText != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Text(_errorText!, style: const TextStyle(color: Colors.red)),
                  ),
                _chipGroup(title: 'Smoking', options: _smokingOptions, selected: _selectedSmoking),
                _chipGroup(title: 'Drinking', options: _drinkingOptions, selected: _selectedDrinking),
                _chipGroup(title: 'Exercise', options: _workoutOptions, selected: _selectedWorkout),
                ElevatedButton(
                  onPressed: _isSaving ? null : _save,
                  child: const Text('Save'),
                ),
              ],
            ),
    );
  }
}
