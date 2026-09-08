import 'package:flutter/material.dart';

import 'auth/auth_api.dart';
import 'auth/phone_entry_screen.dart';
import 'theme/app_theme.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'DatingApp',
      theme: AppTheme.light,
      home: PhoneEntryScreen(
        authApi: AuthApi(),
        onVerified: (result) {
          debugPrint('Signed in as ${result.userId} (${result.phoneNumber})');
        },
      ),
    );
  }
}
