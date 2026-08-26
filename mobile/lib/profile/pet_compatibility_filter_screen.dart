import 'package:flutter/material.dart';

import 'lifestyle_filters_api.dart';

/// Lets the user filter their discovery deck by pet ownership (Dog, Cat,
/// No Pets, etc.) and pet allergy status, so only pet-compatible candidates
/// show up in their card stack.
class PetCompatibilityFilterScreen extends StatefulWidget {
  const PetCompatibilityFilterScreen({super.key, required this.lifestyleFiltersApi});

  final LifestyleFiltersApi lifestyleFiltersApi;

  @override
  State<PetCompatibilityFilterScreen> createState() => _PetCompatibilityFilterScreenState();
}

class _PetCompatibilityFilterScreenState extends State<PetCompatibilityFilterScreen> {
  List<String> _ownershipOptions = [];
  List<String> _allergyOptions = [];
  LifestyleFilters? _filters;
  Set<String> _selectedOwnership = {};
  Set<String> _selectedAllergyStatus = {};
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
        widget.lifestyleFiltersApi.fetchPetOwnershipOptions(),
        widget.lifestyleFiltersApi.fetchPetAllergyStatusOptions(),
        widget.lifestyleFiltersApi.fetchFilters(),
      ]);
      final ownershipOptions = results[0] as List<String>;
      final allergyOptions = results[1] as List<String>;
      final filters = results[2] as LifestyleFilters;
      setState(() {
        _ownershipOptions = ownershipOptions;
        _allergyOptions = allergyOptions;
        _filters = filters;
        _selectedOwnership = filters.filterPetOwnership.toSet();
        _selectedAllergyStatus = filters.filterPetAllergyStatus.toSet();
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
          filterPetOwnership: _selectedOwnership.toList(),
          filterPetAllergyStatus: _selectedAllergyStatus.toList(),
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Pet Compatibility Filter')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                const Text(
                  'Only show people whose pet situation works for you. '
                  'Leave everything unselected to see everyone.',
                ),
                const SizedBox(height: 12),
                if (_errorText != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Text(_errorText!, style: const TextStyle(color: Colors.red)),
                  ),
                const Text('Pet Ownership', style: TextStyle(fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final option in _ownershipOptions)
                      FilterChip(
                        label: Text(option),
                        selected: _selectedOwnership.contains(option),
                        onSelected: (selected) => setState(() {
                          if (selected) {
                            _selectedOwnership.add(option);
                          } else {
                            _selectedOwnership.remove(option);
                          }
                        }),
                      ),
                  ],
                ),
                const SizedBox(height: 24),
                const Text('Pet Allergies', style: TextStyle(fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final option in _allergyOptions)
                      FilterChip(
                        label: Text(option),
                        selected: _selectedAllergyStatus.contains(option),
                        onSelected: (selected) => setState(() {
                          if (selected) {
                            _selectedAllergyStatus.add(option);
                          } else {
                            _selectedAllergyStatus.remove(option);
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
