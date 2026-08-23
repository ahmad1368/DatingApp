import 'package:flutter/material.dart';

import 'topic_quiz_api.dart';

/// Side-by-side agree/disagree indicators for shared topic-quiz answers
/// with another user, grouped by category.
class TopicAlignmentScreen extends StatefulWidget {
  const TopicAlignmentScreen({super.key, required this.topicQuizApi, required this.otherUserId});

  final TopicQuizApi topicQuizApi;
  final String otherUserId;

  @override
  State<TopicAlignmentScreen> createState() => _TopicAlignmentScreenState();
}

class _TopicAlignmentScreenState extends State<TopicAlignmentScreen> {
  TopicAlignmentResult? _alignment;
  bool _isLoading = true;
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
      final alignment = await widget.topicQuizApi.fetchAlignment(widget.otherUserId);
      setState(() => _alignment = alignment);
    } on TopicQuizApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Topic Alignment')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _errorText != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(_errorText!, style: const TextStyle(color: Colors.red)),
                  ),
                )
              : _buildBody(_alignment!),
    );
  }

  Widget _buildBody(TopicAlignmentResult alignment) {
    if (alignment.alignmentPercentage == null) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text('Take the topic quiz to see your alignment.'),
        ),
      );
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(
          'Overall alignment: ${alignment.alignmentPercentage}%',
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 16),
        for (final item in alignment.items) _buildItemRow(item),
      ],
    );
  }

  Widget _buildItemRow(TopicAlignmentItem item) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(item.category, style: const TextStyle(fontSize: 12, color: Colors.grey)),
            Text(item.statement, style: const TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Row(
              children: [
                Icon(_agreementIcon(item.agreement), color: _agreementColor(item.agreement)),
                const SizedBox(width: 8),
                Expanded(child: Text('You: ${item.myStance} · Them: ${item.theirStance}')),
              ],
            ),
          ],
        ),
      ),
    );
  }

  IconData _agreementIcon(String agreement) {
    switch (agreement) {
      case 'AGREE':
        return Icons.check_circle;
      case 'DISAGREE':
        return Icons.cancel;
      case 'PARTIAL':
      default:
        return Icons.remove_circle_outline;
    }
  }

  Color _agreementColor(String agreement) {
    switch (agreement) {
      case 'AGREE':
        return Colors.green;
      case 'DISAGREE':
        return Colors.red;
      case 'PARTIAL':
      default:
        return Colors.amber;
    }
  }
}
