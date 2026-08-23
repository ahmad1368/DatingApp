import 'package:flutter/material.dart';

import 'power_ups_api.dart';

/// Lets a user spend coins on one-time power-ups (a profile boost, an
/// extra super like) without needing a subscription.
class PowerUpsScreen extends StatefulWidget {
  const PowerUpsScreen({super.key, required this.powerUpsApi});

  final PowerUpsApi powerUpsApi;

  @override
  State<PowerUpsScreen> createState() => _PowerUpsScreenState();
}

class _PowerUpsScreenState extends State<PowerUpsScreen> {
  List<PowerUp> _catalog = [];
  int? _coinBalance;
  bool _isLoading = true;
  String? _errorText;
  String? _statusText;

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
      final catalog = await widget.powerUpsApi.fetchCatalog();
      setState(() => _catalog = catalog);
    } on PowerUpsApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _purchase(PowerUp powerUp) async {
    setState(() {
      _errorText = null;
      _statusText = null;
    });
    try {
      final newBalance = await widget.powerUpsApi.purchasePowerUp(powerUp.id);
      setState(() {
        _coinBalance = newBalance;
        _statusText = '${powerUp.label} activated!';
      });
    } on PowerUpsApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Power-Ups')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (_coinBalance != null) ...[
                  Text(
                    'Coin balance: $_coinBalance',
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 12),
                ],
                for (final powerUp in _catalog)
                  Card(
                    child: ListTile(
                      title: Text(powerUp.label),
                      subtitle: Text('${powerUp.coinCost} coins'),
                      trailing: ElevatedButton(
                        onPressed: () => _purchase(powerUp),
                        child: const Text('Activate'),
                      ),
                    ),
                  ),
                if (_errorText != null) ...[
                  const SizedBox(height: 8),
                  Text(_errorText!, style: const TextStyle(color: Colors.red)),
                ],
                if (_statusText != null) ...[
                  const SizedBox(height: 8),
                  Text(_statusText!),
                ],
              ],
            ),
    );
  }
}
