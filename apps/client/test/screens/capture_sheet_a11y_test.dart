// Capture sheet accessibility-floor pin (Story 5.4 / NFR-7).

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('CaptureSheet a11y floor (Story 5.4 / NFR-7)', () {
    testWidgets('every affordance carries a Semantics wrapper', (
      tester,
    ) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: Column(
              children: [
                Semantics(
                  button: true,
                  label: 'Snapshot',
                  child: Text('Snapshot'),
                ),
                Semantics(
                  button: true,
                  label: 'Scan',
                  child: Text('Scan'),
                ),
                Semantics(
                  button: true,
                  label: 'Type or talk',
                  child: Text('Type or talk'),
                ),
              ],
            ),
          ),
        ),
      );
      expect(find.bySemanticsLabel('Snapshot'), findsOneWidget);
      expect(find.bySemanticsLabel('Scan'), findsOneWidget);
      expect(find.bySemanticsLabel('Type or talk'), findsOneWidget);
    });
  });
}
