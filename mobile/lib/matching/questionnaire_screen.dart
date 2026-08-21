import 'package:flutter/material.dart';

import 'matching_api.dart';

const Map<String, String> _importanceLabels = {
  'IRRELEVANT': 'Irrelevant',
  'A_LITTLE_IMPORTANT': 'A little important',
  'SOMEWHAT_IMPORTANT': 'Somewhat important',
  'VERY_IMPORTANT': 'Very important',
  'MANDATORY': 'Mandatory (dealbreaker)',
};

/// Walks the user through the compatibility questionnaire one question at a
/// time: pick your own answer, pick which of the other options you'd still
/// accept from a match, and weight how much this question matters -
/// `MANDATORY` acts as a hard dealbreaker in the compatibility calculation.
class QuestionnaireScreen extends StatefulWidget {
  const QuestionnaireScreen({super.key, required this.matchingApi});

  final MatchingApi matchingApi;

  @override
  State<QuestionnaireScreen> createState() => _QuestionnaireScreenState();
}

class _QuestionnaireScreenState extends State<QuestionnaireScreen> {
  List<QuestionnaireQuestion> _questions = [];
  int _index = 0;
  String? _selectedAnswer;
  final Set<String> _acceptableAnswers = {};
  String _importance = 'SOMEWHAT_IMPORTANT';
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
      final questions = await widget.matchingApi.fetchQuestions();
      setState(() => _questions = questions);
    } on MatchingApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  QuestionnaireQuestion? get _current =>
      _index < _questions.length ? _questions[_index] : null;

  Future<void> _saveAndNext() async {
    final question = _current;
    if (question == null || _selectedAnswer == null) {
      return;
    }

    setState(() {
      _isSaving = true;
      _errorText = null;
    });
    try {
      await widget.matchingApi.submitAnswer(
        questionId: question.id,
        answer: _selectedAnswer!,
        acceptableAnswers: _acceptableAnswers.toList(),
        importance: _importance,
      );
      setState(() {
        _index += 1;
        _selectedAnswer = null;
        _acceptableAnswers.clear();
        _importance = 'SOMEWHAT_IMPORTANT';
      });
    } on MatchingApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isSaving = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final question = _current;

    return Scaffold(
      appBar: AppBar(title: const Text('Compatibility Questionnaire')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (_errorText != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Text(_errorText!, style: const TextStyle(color: Colors.red)),
                    ),
                  Expanded(
                    child: question == null
                        ? const Center(child: Text("You're all caught up!"))
                        : ListView(
                            children: [
                              Text(
                                'Question ${_index + 1} of ${_questions.length}',
                                style: TextStyle(color: Theme.of(context).colorScheme.outline),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                question.text,
                                style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                              ),
                              const SizedBox(height: 16),
                              const Text('Your answer', style: TextStyle(fontWeight: FontWeight.bold)),
                              RadioGroup<String>(
                                groupValue: _selectedAnswer,
                                onChanged: (value) => setState(() => _selectedAnswer = value),
                                child: Column(
                                  children: [
                                    for (final option in question.options)
                                      RadioListTile<String>(title: Text(option), value: option),
                                  ],
                                ),
                              ),
                              const SizedBox(height: 16),
                              const Text(
                                "What would you still accept from a match?",
                                style: TextStyle(fontWeight: FontWeight.bold),
                              ),
                              Wrap(
                                spacing: 8,
                                runSpacing: 8,
                                children: [
                                  for (final option in question.options)
                                    FilterChip(
                                      label: Text(option),
                                      selected: _acceptableAnswers.contains(option),
                                      onSelected: (selected) => setState(() {
                                        if (selected) {
                                          _acceptableAnswers.add(option);
                                        } else {
                                          _acceptableAnswers.remove(option);
                                        }
                                      }),
                                    ),
                                ],
                              ),
                              const SizedBox(height: 16),
                              const Text('How important is this?', style: TextStyle(fontWeight: FontWeight.bold)),
                              DropdownButton<String>(
                                value: _importance,
                                isExpanded: true,
                                items: [
                                  for (final level in answerImportanceLevels)
                                    DropdownMenuItem(value: level, child: Text(_importanceLabels[level]!)),
                                ],
                                onChanged: (value) {
                                  if (value != null) {
                                    setState(() => _importance = value);
                                  }
                                },
                              ),
                              const SizedBox(height: 24),
                              ElevatedButton(
                                onPressed: _selectedAnswer == null || _isSaving ? null : _saveAndNext,
                                child: Text(_index == _questions.length - 1 ? 'Finish' : 'Save & Next'),
                              ),
                            ],
                          ),
                  ),
                ],
              ),
            ),
    );
  }
}
