import 'dart:convert';

import 'package:http/http.dart' as http;

class ProfileCompletionApiException implements Exception {
  ProfileCompletionApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

class CompletionChecklistItem {
  CompletionChecklistItem({
    required this.id,
    required this.label,
    required this.weight,
    required this.completed,
  });

  final String id;
  final String label;
  final int weight;
  final bool completed;
}

class ProfileCompletion {
  ProfileCompletion({
    required this.percentage,
    required this.checklist,
    required this.rewardGranted,
  });

  final int percentage;
  final List<CompletionChecklistItem> checklist;
  final bool rewardGranted;
}

/// Talks to the backend's profile completion meter endpoint. Reaching 100%
/// awards a one-time visibility boost server-side (see
/// ProfileCompletionService.getCompletion), reported back via
/// [ProfileCompletion.rewardGranted] so the UI can celebrate it once.
class ProfileCompletionApi {
  ProfileCompletionApi({required this.accessToken, http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? 'http://10.0.2.2:3000';

  final String accessToken;
  final http.Client _client;
  final String _baseUrl;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $accessToken',
      };

  Future<ProfileCompletion> fetchCompletion() async {
    final response = await _client.get(Uri.parse('$_baseUrl/profile-completion'), headers: _headers);

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw ProfileCompletionApiException(_errorMessage(body, response.statusCode));
    }

    final checklist = (body['checklist'] as List).cast<Map<String, dynamic>>().map((json) {
      return CompletionChecklistItem(
        id: json['id'] as String,
        label: json['label'] as String,
        weight: json['weight'] as int,
        completed: json['completed'] as bool,
      );
    }).toList();

    return ProfileCompletion(
      percentage: body['percentage'] as int,
      checklist: checklist,
      rewardGranted: body['rewardGranted'] as bool,
    );
  }

  Map<String, dynamic> _decode(http.Response response) {
    if (response.body.isEmpty) {
      return const {};
    }
    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  String _errorMessage(Map<String, dynamic> body, int statusCode) {
    final message = body['message'];
    if (message is String) {
      return message;
    }
    if (message is List && message.isNotEmpty) {
      return message.first.toString();
    }
    return 'Request failed with status $statusCode';
  }
}
