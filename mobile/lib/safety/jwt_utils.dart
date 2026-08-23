import 'dart:convert';

/// Reads the `sub` (subject/user id) claim out of a JWT's payload, without
/// verifying its signature - this is only ever used for cosmetic,
/// non-security-critical display purposes (see [WatermarkOverlay]). The
/// backend remains the source of truth for authentication.
String? extractUserIdFromToken(String token) {
  try {
    final parts = token.split('.');
    if (parts.length != 3) {
      return null;
    }
    final normalized = base64Url.normalize(parts[1]);
    final payload = jsonDecode(utf8.decode(base64Url.decode(normalized))) as Map<String, dynamic>;
    return payload['sub'] as String?;
  } catch (_) {
    return null;
  }
}
