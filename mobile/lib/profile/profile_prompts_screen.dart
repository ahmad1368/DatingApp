import 'package:flutter/material.dart';

import 'profile_prompts_api.dart';

const int _minPrompts = 3;
const int _maxPrompts = 5;

class ProfilePromptsScreen extends StatefulWidget {
  const ProfilePromptsScreen({super.key, required this.profilePromptsApi, this.onSaved});

  final ProfilePromptsApi profilePromptsApi;
  final ValueChanged<List<ProfilePromptEntry>>? onSaved;

  @override
  State<ProfilePromptsScreen> createState() => _ProfilePromptsScreenState();
}

class _ProfilePromptsScreenState extends State<ProfilePromptsScreen> {
  List<String> _catalog = [];
  final Set<String> _selectedQuestions = {};
  final Map<String, TextEditingController> _answerControllers = {};
  bool _isLoadingCatalog = true;
  bool _isSaving = false;
  String? _errorText;
  String? _statusText;

  @override
  void initState() {
    super.initState();
    _loadCatalog();
  }

  @override
  void dispose() {
    for (final controller in _answerControllers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _loadCatalog() async {
    try {
      final catalog = await widget.profilePromptsApi.fetchCatalog();
      setState(() {
        _catalog = catalog;
        for (final question in catalog) {
          _answerControllers[question] = TextEditingController();
        }
      });
    } on ProfilePromptsApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isLoadingCatalog = false);
      }
    }
  }

  void _toggleQuestion(String question, bool selected) {
    setState(() {
      if (selected) {
        if (_selectedQuestions.length < _maxPrompts) {
          _selectedQuestions.add(question);
        }
      } else {
        _selectedQuestions.remove(question);
      }
    });
  }

  bool get _canSave {
    if (_selectedQuestions.length < _minPrompts || _selectedQuestions.length > _maxPrompts) {
      return false;
    }
    return _selectedQuestions.every(
      (question) => (_answerControllers[question]?.text.trim().isNotEmpty ?? false),
    );
  }

  Future<void> _save() async {
    setState(() {
      _isSaving = true;
      _errorText = null;
      _statusText = null;
    });
    try {
      final prompts = _catalog
          .where(_selectedQuestions.contains)
          .map(
            (question) => ProfilePromptEntry(
              question: question,
              answer: _answerControllers[question]!.text.trim(),
            ),
          )
          .toList();
      final saved = await widget.profilePromptsApi.savePrompts(prompts);
      setState(() => _statusText = 'Profile prompts saved.');
      widget.onSaved?.call(saved);
    } on ProfilePromptsApiException catch (e) {
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
      appBar: AppBar(title: const Text('Profile prompts')),
      body: _isLoadingCatalog
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Text('Pick $_minPrompts-$_maxPrompts prompts and answer them (${_selectedQuestions.length}/$_maxPrompts selected)'),
                const SizedBox(height: 16),
                for (final question in _catalog) ...[
                  CheckboxListTile(
                    title: Text(question),
                    value: _selectedQuestions.contains(question),
                    onChanged: (value) => _toggleQuestion(question, value ?? false),
                  ),
                  if (_selectedQuestions.contains(question))
                    Padding(
                      padding: const EdgeInsets.only(left: 16, right: 16, bottom: 12),
                      child: TextField(
                        controller: _answerControllers[question],
                        decoration: const InputDecoration(labelText: 'Your answer'),
                        maxLength: 300,
                        onChanged: (_) => setState(() {}),
                      ),
                    ),
                ],
                if (_errorText != null) ...[
                  Text(_errorText!, style: const TextStyle(color: Colors.red)),
                  const SizedBox(height: 8),
                ],
                if (_statusText != null) ...[
                  Text(_statusText!),
                  const SizedBox(height: 8),
                ],
                ElevatedButton(
                  onPressed: _isSaving || !_canSave ? null : _save,
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
