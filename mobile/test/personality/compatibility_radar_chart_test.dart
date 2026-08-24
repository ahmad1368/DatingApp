import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:mobile/personality/compatibility_radar_chart.dart';

void main() {
  testWidgets('renders a labeled axis for each category', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: CompatibilityRadarChart(
            axes: [
              RadarChartAxis(label: 'Emotional Values', value: 90),
              RadarChartAxis(label: 'Core Values', value: 60),
              RadarChartAxis(label: 'Communication Style', value: 75),
              RadarChartAxis(label: 'Social Habits', value: 40),
            ],
            highlightedIndex: 1,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byType(CustomPaint), findsWidgets);
  });

  testWidgets('renders without error when there are no axes', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(body: CompatibilityRadarChart(axes: [])),
      ),
    );
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
  });
}
