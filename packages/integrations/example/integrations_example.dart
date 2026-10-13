import 'package:integrations/integrations.dart';

void main() {
  // Scaffold-only smoke: confirm the package resolves and the version
  // constant is reachable. Concrete adapters arrive with story 1.2.
  // ignore: avoid_print -- a scaffold smoke example; there is no logger here.
  print('integrations $integrationsVersion');
}
