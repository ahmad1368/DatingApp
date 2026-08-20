import 'package:flutter/material.dart';

import 'relationship_profile_api.dart';

const int _maxKinkTagSelections = 8;
const int _maxRelationshipDesireSelections = 5;

/// Lets a user set the explicit "relationship intent" badges shown on
/// their profile: curated desire tags (long-term, casual, marriage, etc.),
/// a relationship structure, kink tags, and one freeform custom badge -
/// each with its own visibility toggle.
class RelationshipProfileScreen extends StatefulWidget {
  const RelationshipProfileScreen({super.key, required this.relationshipProfileApi});

  final RelationshipProfileApi relationshipProfileApi;

  @override
  State<RelationshipProfileScreen> createState() => _RelationshipProfileScreenState();
}

class _RelationshipProfileScreenState extends State<RelationshipProfileScreen> {
  final _customIntentController = TextEditingController();
  final Set<String> _selectedKinkTags = {};
  final Set<String> _selectedDesires = {};

  RelationshipProfileCatalog? _catalog;
  String? _relationshipStructure;
  bool _showRelationshipStructureOnProfile = true;
  bool _showKinkTagsOnProfile = true;
  bool _showRelationshipDesiresOnProfile = true;
  bool _showCustomRelationshipIntentOnProfile = true;
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
    _customIntentController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final results = await Future.wait([
        widget.relationshipProfileApi.fetchCatalog(),
        widget.relationshipProfileApi.fetchRelationshipProfile(),
      ]);
      final catalog = results[0] as RelationshipProfileCatalog;
      final profile = results[1] as RelationshipProfileResult;
      setState(() {
        _catalog = catalog;
        _relationshipStructure = profile.relationshipStructure;
        _showRelationshipStructureOnProfile = profile.showRelationshipStructureOnProfile;
        _selectedKinkTags.addAll(profile.kinkTags);
        _showKinkTagsOnProfile = profile.showKinkTagsOnProfile;
        _selectedDesires.addAll(profile.relationshipDesires);
        _showRelationshipDesiresOnProfile = profile.showRelationshipDesiresOnProfile;
        _customIntentController.text = profile.customRelationshipIntent ?? '';
        _showCustomRelationshipIntentOnProfile = profile.showCustomRelationshipIntentOnProfile;
      });
    } on RelationshipProfileApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  void _toggleKinkTag(String value, bool selected) {
    setState(() {
      if (selected) {
        if (_selectedKinkTags.length < _maxKinkTagSelections) {
          _selectedKinkTags.add(value);
        }
      } else {
        _selectedKinkTags.remove(value);
      }
    });
  }

  void _toggleDesire(String value, bool selected) {
    setState(() {
      if (selected) {
        if (_selectedDesires.length < _maxRelationshipDesireSelections) {
          _selectedDesires.add(value);
        }
      } else {
        _selectedDesires.remove(value);
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
      final customIntent = _customIntentController.text.trim();
      await widget.relationshipProfileApi.setRelationshipProfile(
        relationshipStructure: _relationshipStructure,
        showRelationshipStructureOnProfile: _showRelationshipStructureOnProfile,
        kinkTags: _selectedKinkTags.toList(),
        showKinkTagsOnProfile: _showKinkTagsOnProfile,
        relationshipDesires: _selectedDesires.toList(),
        showRelationshipDesiresOnProfile: _showRelationshipDesiresOnProfile,
        customRelationshipIntent: customIntent.isEmpty ? null : customIntent,
        showCustomRelationshipIntentOnProfile: _showCustomRelationshipIntentOnProfile,
      );
      setState(() => _statusText = 'Saved.');
    } on RelationshipProfileApiException catch (e) {
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
      appBar: AppBar(title: const Text('Relationship intent')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : catalog == null
              ? Center(child: Text(_errorText ?? 'Something went wrong.'))
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    Text('Looking for (up to $_maxRelationshipDesireSelections)'),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (final desire in catalog.relationshipDesires)
                          FilterChip(
                            label: Text(desire),
                            selected: _selectedDesires.contains(desire),
                            onSelected: (selected) => _toggleDesire(desire, selected),
                          ),
                      ],
                    ),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Show these badges on my public profile'),
                      value: _showRelationshipDesiresOnProfile,
                      onChanged: (value) => setState(() => _showRelationshipDesiresOnProfile = value),
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: _customIntentController,
                      decoration: const InputDecoration(labelText: 'Custom badge (optional)'),
                    ),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Show custom badge on my public profile'),
                      value: _showCustomRelationshipIntentOnProfile,
                      onChanged: (value) =>
                          setState(() => _showCustomRelationshipIntentOnProfile = value),
                    ),
                    const Divider(height: 32),
                    const Text('Relationship structure'),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (final structure in catalog.relationshipStructures)
                          ChoiceChip(
                            label: Text(structure),
                            selected: _relationshipStructure == structure,
                            onSelected: (selected) => setState(
                              () => _relationshipStructure = selected ? structure : null,
                            ),
                          ),
                      ],
                    ),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Show structure on my public profile'),
                      value: _showRelationshipStructureOnProfile,
                      onChanged: (value) =>
                          setState(() => _showRelationshipStructureOnProfile = value),
                    ),
                    const Divider(height: 32),
                    Text('Kink tags (up to $_maxKinkTagSelections)'),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (final tag in catalog.kinkTags)
                          FilterChip(
                            label: Text(tag),
                            selected: _selectedKinkTags.contains(tag),
                            onSelected: (selected) => _toggleKinkTag(tag, selected),
                          ),
                      ],
                    ),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Show kink tags on my public profile'),
                      value: _showKinkTagsOnProfile,
                      onChanged: (value) => setState(() => _showKinkTagsOnProfile = value),
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
