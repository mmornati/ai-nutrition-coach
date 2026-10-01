// F2: recognized BYOK foods carry a validated food group.

import 'package:dio/dio.dart';
import 'package:domain_core/domain_core.dart';
import 'package:integrations/integrations.dart';
import 'package:test/test.dart';

import '_support/fake_http_adapter.dart';

Future<List<RecognizedFood>> _recognize(String modelJson) async {
  final a = FakeHttpAdapter()..jsonBody = chatReply(modelJson);
  final out = await OpenAiCompatibleByokProvider(
    endpointUrl: 'https://api.example.com/v1',
    model: 'm',
    dio: Dio()..httpClientAdapter = a,
  ).recognize(photoBytes: jpegWithExif(), apiKey: 'sk-test-0123456789abcd');
  return (out as ByokRecognized).foods;
}

void main() {
  test('the prompt asks for the closed group enum', () async {
    final a = FakeHttpAdapter()..jsonBody = chatReply('[]');
    await OpenAiCompatibleByokProvider(
      endpointUrl: 'https://api.example.com/v1',
      model: 'm',
      dio: Dio()..httpClientAdapter = a,
    ).recognize(photoBytes: jpegWithExif(), apiKey: 'sk-test-0123456789abcd');
    final body = a.requestBodies.single;
    for (final g in FoodGroup.values) {
      expect(body, contains(g.name));
    }
    expect(body, contains('group'));
  });

  test('a valid model group is used', () async {
    final foods = await _recognize(
      '[{"name":"Salmon","quantityHint":"1 fillet","group":"protein"}]',
    );
    expect(foods.single.databaseFood.foodGroup, FoodGroup.protein);
  });

  test(
    'an invalid or missing group falls back to the catalog classifier',
    () async {
      final foods = await _recognize(
        '[{"name":"Peanut butter","quantityHint":"1 tbsp","group":"spreads"},'
        '{"name":"Brown rice","quantityHint":"1 cup"},'
        '{"name":"Mystery goo","quantityHint":"1 dab","group":42}]',
      );
      expect(foods[0].databaseFood.foodGroup, FoodGroup.protein);
      expect(foods[1].databaseFood.foodGroup, FoodGroup.starch);
      expect(foods[2].databaseFood.foodGroup, FoodGroup.other);
    },
  );

  test('the model group is trusted over the name when valid', () async {
    final foods = await _recognize(
      '[{"name":"Almond milk","quantityHint":"1 cup","group":"other"}]',
    );
    expect(foods.single.databaseFood.foodGroup, FoodGroup.other);
  });
}
