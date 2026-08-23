import 'package:flutter/material.dart';

import 'post_match_survey_api.dart';

const _qualityOptions = ['GREAT', 'GOOD', 'OK', 'POOR'];
const _qualityLabels = {
  'GREAT': 'Great',
  'GOOD': 'Good',
  'OK': 'It was OK',
  'POOR': 'Not great',
};

/// A private, per-match survey asking whether the pair actually met up in
/// real life and, if so, how it went - never shown to the other person.
class PostMatchSurveyScreen extends StatefulWidget {
  const PostMatchSurveyScreen({
    super.key,
    required this.postMatchSurveyApi,
    required this.matchId,
  });

  final PostMatchSurveyApi postMatchSurveyApi;
  final String matchId;

  @override
  State<PostMatchSurveyScreen> createState() => _PostMatchSurveyScreenState();
}

class _PostMatchSurveyScreenState extends State<PostMatchSurveyScreen> {
  bool? _metInPerson;
  String? _matchQuality;
  bool _isLoading = true;
  bool _isSaving = false;
  String? _errorText;
  String? _statusText;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final survey = await widget.postMatchSurveyApi.fetchMySurvey(widget.matchId);
      if (survey != null) {
        setState(() {
          _metInPerson = survey.metInPerson;
          _matchQuality = survey.matchQuality;
        });
      }
    } on PostMatchSurveyApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _save() async {
    final metInPerson = _metInPerson;
    if (metInPerson == null) {
      return;
    }
    setState(() {
      _isSaving = true;
      _errorText = null;
      _statusText = null;
    });
    try {
      await widget.postMatchSurveyApi.submitSurvey(
        matchId: widget.matchId,
        metInPerson: metInPerson,
        matchQuality: metInPerson ? _matchQuality : null,
      );
      setState(() => _statusText = 'Thanks for the feedback!');
    } on PostMatchSurveyApiException catch (e) {
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
      appBar: AppBar(title: const Text('Did you meet up?')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                const Text(
                  "This is private - your match will never see your answers.",
                  style: TextStyle(fontStyle: FontStyle.italic),
                ),
                const SizedBox(height: 16),
                const Text('Did you meet up in real life?', style: TextStyle(fontWeight: FontWeight.bold)),
                RadioListTile<bool>(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Yes'),
                  value: true,
                  groupValue: _metInPerson,
                  onChanged: (value) => setState(() => _metInPerson = value),
                ),
                RadioListTile<bool>(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('No'),
                  value: false,
                  groupValue: _metInPerson,
                  onChanged: (value) => setState(() {
                    _metInPerson = value;
                    _matchQuality = null;
                  }),
                ),
                if (_metInPerson == true) ...[
                  const SizedBox(height: 16),
                  const Text('How was it?', style: TextStyle(fontWeight: FontWeight.bold)),
                  for (final option in _qualityOptions)
                    RadioListTile<String>(
                      contentPadding: EdgeInsets.zero,
                      title: Text(_qualityLabels[option]!),
                      value: option,
                      groupValue: _matchQuality,
                      onChanged: (value) => setState(() => _matchQuality = value),
                    ),
                ],
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
                  onPressed: _isSaving || _metInPerson == null || (_metInPerson == true && _matchQuality == null)
                      ? null
                      : _save,
                  child: _isSaving
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Submit'),
                ),
              ],
            ),
    );
  }
}
