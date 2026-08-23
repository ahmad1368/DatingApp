import 'package:flutter/material.dart';

import 'lifestyle_filters_api.dart';

/// Lets the user restrict their discovery deck to photo-verified profiles
/// only.
class VerifiedOnlyFilterScreen extends StatefulWidget {
  const VerifiedOnlyFilterScreen({super.key, required this.lifestyleFiltersApi});

  final LifestyleFiltersApi lifestyleFiltersApi;

  @override
  State<VerifiedOnlyFilterScreen> createState() => _VerifiedOnlyFilterScreenState();
}

class _VerifiedOnlyFilterScreenState extends State<VerifiedOnlyFilterScreen> {
  LifestyleFilters? _filters;
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
      final filters = await widget.lifestyleFiltersApi.fetchFilters();
      setState(() => _filters = filters);
    } on LifestyleFiltersApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _toggle(bool enabled) async {
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
        filters.copyWith(filterVerifiedOnly: enabled),
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
      appBar: AppBar(title: const Text('Verified Profiles Only')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (_errorText != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Text(_errorText!, style: const TextStyle(color: Colors.red)),
                  ),
                SwitchListTile(
                  title: const Text('Only show photo-verified profiles'),
                  subtitle: const Text('Hides unverified profiles from your card stack.'),
                  value: _filters?.filterVerifiedOnly ?? false,
                  onChanged: _isSaving ? null : _toggle,
                ),
              ],
            ),
    );
  }
}
