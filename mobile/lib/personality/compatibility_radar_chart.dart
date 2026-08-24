import 'dart:math' as math;

import 'package:flutter/material.dart';

/// A single axis of the radar/spider chart - one psychological pillar
/// (category) and how compatible the pair is on it (0-100).
class RadarChartAxis {
  RadarChartAxis({required this.label, required this.value});

  final String label;
  final int value;
}

/// Visual radar (spider) chart plotting compatibility across the
/// personality test's category "pillars" (Emotional Values, Core Values,
/// Communication Style, Social Habits - see
/// PersonalityTestService.getCompatibilityBreakdown). No charting package is
/// used elsewhere in this app, so this is a small custom-painted widget
/// rather than a new dependency.
class CompatibilityRadarChart extends StatelessWidget {
  const CompatibilityRadarChart({
    super.key,
    required this.axes,
    this.highlightedIndex,
    this.size = 260,
  });

  final List<RadarChartAxis> axes;
  final int? highlightedIndex;
  final double size;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: CustomPaint(
        painter: _RadarChartPainter(
          axes: axes,
          highlightedIndex: highlightedIndex,
          textColor: Theme.of(context).textTheme.bodySmall?.color ?? Colors.black87,
          highlightColor: Theme.of(context).colorScheme.primary,
        ),
      ),
    );
  }
}

class _RadarChartPainter extends CustomPainter {
  _RadarChartPainter({
    required this.axes,
    required this.highlightedIndex,
    required this.textColor,
    required this.highlightColor,
  });

  final List<RadarChartAxis> axes;
  final int? highlightedIndex;
  final Color textColor;
  final Color highlightColor;

  static const int _rings = 4;

  @override
  void paint(Canvas canvas, Size size) {
    if (axes.isEmpty) {
      return;
    }

    final center = Offset(size.width / 2, size.height / 2);
    final maxRadius = (math.min(size.width, size.height) / 2) - 32;
    final angleStep = (2 * math.pi) / axes.length;

    final gridPaint = Paint()
      ..color = Colors.grey.withValues(alpha: 0.4)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1;

    for (var ring = 1; ring <= _rings; ring++) {
      final ringRadius = maxRadius * (ring / _rings);
      final path = Path();
      for (var i = 0; i < axes.length; i++) {
        final point = _pointOnAxis(center, ringRadius, angleStep, i);
        if (i == 0) {
          path.moveTo(point.dx, point.dy);
        } else {
          path.lineTo(point.dx, point.dy);
        }
      }
      path.close();
      canvas.drawPath(path, gridPaint);
    }

    for (var i = 0; i < axes.length; i++) {
      final outerPoint = _pointOnAxis(center, maxRadius, angleStep, i);
      canvas.drawLine(center, outerPoint, gridPaint);

      final labelPoint = _pointOnAxis(center, maxRadius + 18, angleStep, i);
      final isHighlighted = highlightedIndex == i;
      final textPainter = TextPainter(
        text: TextSpan(
          text: axes[i].label,
          style: TextStyle(
            color: isHighlighted ? highlightColor : textColor,
            fontSize: 11,
            fontWeight: isHighlighted ? FontWeight.bold : FontWeight.normal,
          ),
        ),
        textAlign: TextAlign.center,
        textDirection: TextDirection.ltr,
      )..layout(maxWidth: 80);
      textPainter.paint(canvas, labelPoint - Offset(textPainter.width / 2, textPainter.height / 2));
    }

    final valuePath = Path();
    for (var i = 0; i < axes.length; i++) {
      final value = axes[i].value.clamp(0, 100);
      final point = _pointOnAxis(center, maxRadius * (value / 100), angleStep, i);
      if (i == 0) {
        valuePath.moveTo(point.dx, point.dy);
      } else {
        valuePath.lineTo(point.dx, point.dy);
      }
    }
    valuePath.close();

    final fillPaint = Paint()
      ..color = Colors.indigo.withValues(alpha: 0.25)
      ..style = PaintingStyle.fill;
    final strokePaint = Paint()
      ..color = Colors.indigo
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;
    canvas.drawPath(valuePath, fillPaint);
    canvas.drawPath(valuePath, strokePaint);

    for (var i = 0; i < axes.length; i++) {
      final value = axes[i].value.clamp(0, 100);
      final point = _pointOnAxis(center, maxRadius * (value / 100), angleStep, i);
      canvas.drawCircle(point, highlightedIndex == i ? 5 : 3, Paint()..color = Colors.indigo);
    }
  }

  Offset _pointOnAxis(Offset center, double radius, double angleStep, int index) {
    final angle = -math.pi / 2 + index * angleStep;
    return Offset(center.dx + radius * math.cos(angle), center.dy + radius * math.sin(angle));
  }

  @override
  bool shouldRepaint(covariant _RadarChartPainter oldDelegate) {
    return oldDelegate.axes != axes || oldDelegate.highlightedIndex != highlightedIndex;
  }
}
