import 'package:flutter/material.dart';

import 'location_api.dart';

/// "People Nearby": everyone the current user has recently been physically
/// close to, based on location pings, most recently crossed first.
class CrossedPathsScreen extends StatefulWidget {
  const CrossedPathsScreen({super.key, required this.locationApi});

  final LocationApi locationApi;

  @override
  State<CrossedPathsScreen> createState() => _CrossedPathsScreenState();
}

class _CrossedPathsScreenState extends State<CrossedPathsScreen> {
  List<CrossedPath> _crossedPaths = [];
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
      final crossedPaths = await widget.locationApi.fetchCrossedPaths();
      setState(() => _crossedPaths = crossedPaths);
    } on LocationApiException catch (e) {
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
      appBar: AppBar(title: const Text('Crossed Paths')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                if (_errorText != null)
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text(_errorText!, style: const TextStyle(color: Colors.red)),
                  ),
                Expanded(
                  child: _crossedPaths.isEmpty
                      ? const Center(
                          child: Padding(
                            padding: EdgeInsets.all(24),
                            child: Text(
                              'No crossed paths yet. Keep location sharing on and get out '
                              'there - we will let you know who you run into.',
                              textAlign: TextAlign.center,
                            ),
                          ),
                        )
                      : ListView.builder(
                          itemCount: _crossedPaths.length,
                          itemBuilder: (context, index) {
                            final crossedPath = _crossedPaths[index];
                            final timesLabel = crossedPath.crossCount == 1
                                ? 'once'
                                : '${crossedPath.crossCount} times';
                            return ListTile(
                              title: Text(crossedPath.name ?? 'Someone nearby'),
                              subtitle: Text(
                                'Crossed paths $timesLabel · as close as '
                                '${(crossedPath.closestDistanceKm * 1000).round()} m',
                              ),
                            );
                          },
                        ),
                ),
              ],
            ),
    );
  }
}
