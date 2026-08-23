import 'package:flutter/material.dart';

import 'topic_quiz_api.dart';

/// Lets the user record a stance (agree/neutral/disagree) on a set of
/// political, cultural, and lifestyle topics, so it can later be compared
/// side by side against a match's answers - see TopicAlignmentScreen.
class TopicQuizScreen extends StatefulWidget {
  const TopicQuizScreen({super.key, required this.topicQuizApi});

  final TopicQuizApi topicQuizApi;

  @override
  State<TopicQuizScreen> createState() => _TopicQuizScreenState();
}

class _TopicQuizScreenState extends State<TopicQuizScreen> {
  List<TopicQuizQuestion> _questions = [];
  final Map<String, String> _stances = {};
  bool _isLoading = true;
  bool _isSubmitting = false;
  String? _errorText;
  bool _submitted = false;

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
      final questions = await widget.topicQuizApi.fetchQuestions();
      setState(() => _questions = questions);
    } on TopicQuizApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _submit() async {
    if (_stances.length != _questions.length) {
      setState(() => _errorText = 'Please answer every topic before submitting.');
      return;
    }
    setState(() {
      _isSubmitting = true;
      _errorText = null;
    });
    try {
      await widget.topicQuizApi.submitQuiz(_stances.entries.toList());
      setState(() => _submitted = true);
    } on TopicQuizApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isSubmitting = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Topic Quiz')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _submitted
              ? const Center(child: Text('Thanks! Your answers are saved.'))
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    if (_errorText != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 16),
                        child: Text(_errorText!, style: const TextStyle(color: Colors.red)),
                      ),
                    for (final question in _questions) _buildQuestion(question),
                    const SizedBox(height: 16),
                    ElevatedButton(
                      onPressed: _isSubmitting ? null : _submit,
                      child: const Text('Submit'),
                    ),
                  ],
                ),
    );
  }

  Widget _buildQuestion(TopicQuizQuestion question) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(question.category, style: const TextStyle(fontSize: 12, color: Colors.grey)),
          Text(question.statement, style: const TextStyle(fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: [
              for (final stance in const ['AGREE', 'NEUTRAL', 'DISAGREE'])
                ChoiceChip(
                  label: Text(_stanceLabel(stance)),
                  selected: _stances[question.id] == stance,
                  onSelected: (_) => setState(() => _stances[question.id] = stance),
                ),
            ],
          ),
        ],
      ),
    );
  }

  String _stanceLabel(String stance) {
    switch (stance) {
      case 'AGREE':
        return 'Agree';
      case 'DISAGREE':
        return 'Disagree';
      case 'NEUTRAL':
      default:
        return 'Neutral';
    }
  }
}
