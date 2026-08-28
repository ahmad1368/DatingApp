import 'package:flutter/material.dart';

import 'personality_api.dart';

/// A multi-page diagnostic compatibility report: one page per section
/// (communication strengths, conflict resolution style, emotional
/// compatibility), each showing a score, a plain-language insight, and the
/// underlying dimension-by-dimension comparison - see
/// PersonalityTestService.getCompatibilityReport on the backend.
class CompatibilityReportScreen extends StatefulWidget {
  const CompatibilityReportScreen({
    super.key,
    required this.personalityApi,
    required this.otherUserId,
  });

  final PersonalityApi personalityApi;
  final String otherUserId;

  @override
  State<CompatibilityReportScreen> createState() => _CompatibilityReportScreenState();
}

class _CompatibilityReportScreenState extends State<CompatibilityReportScreen> {
  final _pageController = PageController();

  CompatibilityReport? _report;
  int _pageIndex = 0;
  bool _isLoading = true;
  String? _errorText;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _isLoading = true;
      _errorText = null;
    });
    try {
      final report = await widget.personalityApi.fetchCompatibilityReport(widget.otherUserId);
      setState(() => _report = report);
    } on PersonalityApiException catch (e) {
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
      appBar: AppBar(title: const Text('Compatibility Report')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _errorText != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(_errorText!, style: const TextStyle(color: Colors.red)),
                  ),
                )
              : _buildBody(_report!),
    );
  }

  Widget _buildBody(CompatibilityReport report) {
    final sections = report.sections;
    if (sections.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text('Not enough shared data yet to build a report.'),
        ),
      );
    }

    return Column(
      children: [
        if (report.percentage != null)
          Padding(
            padding: const EdgeInsets.all(16),
            child: Text(
              'Overall compatibility: ${report.percentage}%',
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
            ),
          ),
        Expanded(
          child: PageView.builder(
            controller: _pageController,
            itemCount: sections.length,
            onPageChanged: (index) => setState(() => _pageIndex = index),
            itemBuilder: (context, index) => _buildSectionPage(sections[index]),
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              for (var i = 0; i < sections.length; i++)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: CircleAvatar(
                    radius: 4,
                    backgroundColor: i == _pageIndex ? Colors.indigo : Colors.grey.shade300,
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildSectionPage(CompatibilityReportSection section) {
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        Text(section.title, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        Text('${section.score}% match', style: const TextStyle(fontSize: 18, color: Colors.indigo)),
        const SizedBox(height: 12),
        Text(section.insight, style: const TextStyle(fontSize: 16)),
        const SizedBox(height: 24),
        for (final dimension in section.dimensions) _buildDimensionRow(dimension),
      ],
    );
  }

  Widget _buildDimensionRow(DimensionComparison dimension) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(dimension.dimension),
          const SizedBox(height: 4),
          Row(
            children: [
              const SizedBox(width: 40, child: Text('You', style: TextStyle(fontSize: 12))),
              Expanded(
                child: LinearProgressIndicator(value: dimension.myScore / 100, color: Colors.indigo),
              ),
              const SizedBox(width: 8),
              Text('${dimension.myScore}'),
            ],
          ),
          Row(
            children: [
              const SizedBox(width: 40, child: Text('Them', style: TextStyle(fontSize: 12))),
              Expanded(
                child: LinearProgressIndicator(value: dimension.theirScore / 100, color: Colors.pink),
              ),
              const SizedBox(width: 8),
              Text('${dimension.theirScore}'),
            ],
          ),
        ],
      ),
    );
  }
}
