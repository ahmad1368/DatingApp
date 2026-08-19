import 'package:flutter/material.dart';

import 'gender_identity_api.dart';

const int _maxSelections = 3;

class GenderIdentityScreen extends StatefulWidget {
  const GenderIdentityScreen({super.key, required this.genderIdentityApi});

  final GenderIdentityApi genderIdentityApi;

  @override
  State<GenderIdentityScreen> createState() => _GenderIdentityScreenState();
}

class _GenderIdentityScreenState extends State<GenderIdentityScreen> {
  final TextEditingController _customGenderController = TextEditingController();
  final TextEditingController _customOrientationController = TextEditingController();
  final Set<String> _selectedGenders = {};
  final Set<String> _selectedOrientations = {};

  GenderIdentityCatalog? _catalog;
  bool _showGenderOnProfile = true;
  bool _showOrientationOnProfile = true;
  bool _isLoading = true;
  bool _isSaving = false;
  String? _errorText;
  String? _statusText;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _customGenderController.dispose();
    _customOrientationController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final catalog = await widget.genderIdentityApi.fetchCatalog();
      setState(() => _catalog = catalog);
    } on GenderIdentityApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  void _toggleGender(String value, bool selected) {
    setState(() {
      if (selected) {
        if (_selectedGenders.length < _maxSelections) {
          _selectedGenders.add(value);
        }
      } else {
        _selectedGenders.remove(value);
      }
    });
  }

  void _toggleOrientation(String value, bool selected) {
    setState(() {
      if (selected) {
        if (_selectedOrientations.length < _maxSelections) {
          _selectedOrientations.add(value);
        }
      } else {
        _selectedOrientations.remove(value);
      }
    });
  }

  Future<void> _save() async {
    setState(() {
      _isSaving = true;
      _errorText = null;
      _statusText = null;
    });
    try {
      final customGender = _customGenderController.text.trim();
      final customOrientation = _customOrientationController.text.trim();
      await widget.genderIdentityApi.setGenderIdentity(
        genderIdentities: _selectedGenders.toList(),
        customGenderDescription: customGender.isEmpty ? null : customGender,
        showGenderOnProfile: _showGenderOnProfile,
        orientations: _selectedOrientations.toList(),
        customOrientationDescription: customOrientation.isEmpty ? null : customOrientation,
        showOrientationOnProfile: _showOrientationOnProfile,
      );
      setState(() => _statusText = 'Saved.');
    } on GenderIdentityApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isSaving = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final catalog = _catalog;

    return Scaffold(
      appBar: AppBar(title: const Text('Gender & orientation')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : catalog == null
              ? Center(child: Text(_errorText ?? 'Something went wrong.'))
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    Text('Gender identity (up to $_maxSelections)'),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (final identity in catalog.genderIdentities)
                          FilterChip(
                            label: Text(identity),
                            selected: _selectedGenders.contains(identity),
                            onSelected: (selected) => _toggleGender(identity, selected),
                          ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _customGenderController,
                      decoration: const InputDecoration(labelText: 'Describe it your way (optional)'),
                    ),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Show gender identity on my public profile'),
                      value: _showGenderOnProfile,
                      onChanged: (value) => setState(() => _showGenderOnProfile = value),
                    ),
                    const Divider(height: 32),
                    Text('Sexual orientation (up to $_maxSelections)'),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (final orientation in catalog.orientations)
                          FilterChip(
                            label: Text(orientation),
                            selected: _selectedOrientations.contains(orientation),
                            onSelected: (selected) => _toggleOrientation(orientation, selected),
                          ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _customOrientationController,
                      decoration: const InputDecoration(labelText: 'Describe it your way (optional)'),
                    ),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Show orientation on my public profile'),
                      value: _showOrientationOnProfile,
                      onChanged: (value) => setState(() => _showOrientationOnProfile = value),
                    ),
                    const SizedBox(height: 16),
                    if (_errorText != null) ...[
                      Text(_errorText!, style: const TextStyle(color: Colors.red)),
                      const SizedBox(height: 8),
                    ],
                    if (_statusText != null) ...[
                      Text(_statusText!),
                      const SizedBox(height: 8),
                    ],
                    ElevatedButton(
                      onPressed: _isSaving ? null : _save,
                      child: _isSaving
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Text('Save'),
                    ),
                  ],
                ),
    );
  }
}
