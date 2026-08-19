import 'package:flutter/material.dart';

import 'onboarding_api.dart';

const int _stepCount = 3;
const int _minimumAgeYears = 18;

const Map<String, String> _relationshipGoalLabels = {
  'LONG_TERM': 'Long-term relationship',
  'CASUAL': 'Something casual',
  'FRIENDSHIP': 'New friends',
  'NOT_SURE': 'Still figuring it out',
};

const List<String> _interestOptions = [
  'Travel',
  'Music',
  'Fitness',
  'Movies',
  'Cooking',
  'Art',
  'Gaming',
  'Reading',
  'Sports',
  'Photography',
  'Hiking',
  'Dancing',
];

int _calculateAge(DateTime dateOfBirth, DateTime now) {
  var age = now.year - dateOfBirth.year;
  final monthDiff = now.month - dateOfBirth.month;
  if (monthDiff < 0 || (monthDiff == 0 && now.day < dateOfBirth.day)) {
    age -= 1;
  }
  return age;
}

String _formatIsoDate(DateTime date) {
  final year = date.year.toString().padLeft(4, '0');
  final month = date.month.toString().padLeft(2, '0');
  final day = date.day.toString().padLeft(2, '0');
  return '$year-$month-$day';
}

class OnboardingFlowScreen extends StatefulWidget {
  const OnboardingFlowScreen({super.key, required this.onboardingApi, required this.onCompleted});

  final OnboardingApi onboardingApi;
  final ValueChanged<OnboardingResult> onCompleted;

  @override
  State<OnboardingFlowScreen> createState() => _OnboardingFlowScreenState();
}

class _OnboardingFlowScreenState extends State<OnboardingFlowScreen> {
  final PageController _pageController = PageController();
  final TextEditingController _nameController = TextEditingController();
  final Set<String> _selectedInterests = {};

  int _currentStep = 0;
  DateTime? _dateOfBirth;
  String? _relationshipGoal;
  bool _isSubmitting = false;
  String? _errorText;

  @override
  void dispose() {
    _pageController.dispose();
    _nameController.dispose();
    super.dispose();
  }

  bool _canAdvance(int step) {
    switch (step) {
      case 0:
        final dob = _dateOfBirth;
        return dob != null && _calculateAge(dob, DateTime.now()) >= _minimumAgeYears;
      case 1:
        return _relationshipGoal != null;
      case 2:
        return _selectedInterests.isNotEmpty;
      default:
        return false;
    }
  }

  Future<void> _pickDateOfBirth() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime(now.year - _minimumAgeYears, now.month, now.day),
      firstDate: DateTime(now.year - 100),
      lastDate: now,
    );
    if (picked != null) {
      setState(() => _dateOfBirth = picked);
    }
  }

  Future<void> _handleNext() async {
    if (_currentStep < _stepCount - 1) {
      setState(() => _currentStep += 1);
      await _pageController.nextPage(
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeInOut,
      );
      return;
    }
    await _submit();
  }

  void _handleBack() {
    if (_currentStep == 0) {
      return;
    }
    setState(() => _currentStep -= 1);
    _pageController.previousPage(duration: const Duration(milliseconds: 250), curve: Curves.easeInOut);
  }

  Future<void> _submit() async {
    setState(() {
      _isSubmitting = true;
      _errorText = null;
    });
    try {
      final name = _nameController.text.trim();
      final result = await widget.onboardingApi.completeOnboarding(
        name: name.isEmpty ? null : name,
        dateOfBirth: _formatIsoDate(_dateOfBirth!),
        relationshipGoal: _relationshipGoal!,
        interests: _selectedInterests.toList(),
      );
      widget.onCompleted(result);
    } on OnboardingApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isSubmitting = false);
      }
    }
  }

  Widget _buildBasicInfoStep() {
    final dob = _dateOfBirth;
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('Let\'s start with the basics'),
          const SizedBox(height: 16),
          TextField(
            controller: _nameController,
            decoration: const InputDecoration(labelText: 'Name (optional)'),
          ),
          const SizedBox(height: 16),
          OutlinedButton(
            onPressed: _pickDateOfBirth,
            child: Text(dob == null ? 'Select date of birth' : _formatIsoDate(dob)),
          ),
          if (dob != null && _calculateAge(dob, DateTime.now()) < _minimumAgeYears) ...[
            const SizedBox(height: 8),
            Text(
              'You must be at least $_minimumAgeYears years old.',
              style: const TextStyle(color: Colors.red),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildRelationshipGoalStep() {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('What are you looking for?'),
          const SizedBox(height: 16),
          RadioGroup<String>(
            groupValue: _relationshipGoal,
            onChanged: (value) => setState(() => _relationshipGoal = value),
            child: Column(
              children: [
                for (final entry in _relationshipGoalLabels.entries)
                  RadioListTile<String>(
                    title: Text(entry.value),
                    value: entry.key,
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildInterestsStep() {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('Pick a few interests (up to 10)'),
          const SizedBox(height: 16),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final interest in _interestOptions)
                FilterChip(
                  label: Text(interest),
                  selected: _selectedInterests.contains(interest),
                  onSelected: (selected) {
                    setState(() {
                      if (selected) {
                        if (_selectedInterests.length < 10) {
                          _selectedInterests.add(interest);
                        }
                      } else {
                        _selectedInterests.remove(interest);
                      }
                    });
                  },
                ),
            ],
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final canAdvance = _canAdvance(_currentStep);

    return Scaffold(
      appBar: AppBar(title: const Text('Tell us about you')),
      body: Column(
        children: [
          LinearProgressIndicator(value: (_currentStep + 1) / _stepCount),
          Expanded(
            child: PageView(
              controller: _pageController,
              physics: const NeverScrollableScrollPhysics(),
              children: [
                _buildBasicInfoStep(),
                _buildRelationshipGoalStep(),
                _buildInterestsStep(),
              ],
            ),
          ),
          if (_errorText != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Text(_errorText!, style: const TextStyle(color: Colors.red)),
            ),
          Padding(
            padding: const EdgeInsets.all(24),
            child: Row(
              children: [
                if (_currentStep > 0)
                  TextButton(
                    onPressed: _isSubmitting ? null : _handleBack,
                    child: const Text('Back'),
                  ),
                const Spacer(),
                ElevatedButton(
                  onPressed: _isSubmitting || !canAdvance ? null : _handleNext,
                  child: _isSubmitting
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Text(_currentStep == _stepCount - 1 ? 'Finish' : 'Next'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
