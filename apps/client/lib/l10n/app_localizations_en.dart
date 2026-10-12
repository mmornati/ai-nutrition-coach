// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appName => 'OpenPlate';

  @override
  String get devStoreBanner =>
      'DEV — not encrypted. Data lives in memory only.';

  @override
  String get typeItManually => 'Type it manually';

  @override
  String get retake => 'Retake';

  @override
  String get logAction => 'Log';

  @override
  String get logging => 'Logging…';

  @override
  String get logCustomFood => 'Log custom food';

  @override
  String get cameraDeniedTitle => 'Camera denied — type it instead';

  @override
  String get cameraDeniedBody =>
      'You can still log a plate from the manual entry screen.';

  @override
  String get searchUnavailable => 'Search isn\'t available right now.';

  @override
  String get closestMatches => 'Closest matches';

  @override
  String get customFoodName => 'Custom food name';

  @override
  String get typeNameFirst => 'Type a name first';

  @override
  String get pickQuantity => 'Pick a quantity';

  @override
  String get pickFoodFirst => 'Pick a food first';

  @override
  String get close => 'close';

  @override
  String get sure => 'sure';

  @override
  String get askLater => 'ask later';

  @override
  String get logFailureMobileOnly => 'Mobile-only in v1.';

  @override
  String get logFailureHistoryCannotOpen =>
      'History can\'t open on this device.';

  @override
  String get logFailureGeneric => 'Could not log plate.';

  @override
  String get historyCannotLoad => 'History can\'t load right now.';

  @override
  String get dayToday => 'Today';

  @override
  String get dayYesterday => 'Yesterday';

  @override
  String get logAnotherPlate => 'Log another plate';

  @override
  String get logAnotherPlateLink => '+ log another plate';

  @override
  String get slotBreakfast => 'Breakfast';

  @override
  String get slotLunch => 'Lunch';

  @override
  String get slotDinner => 'Dinner';

  @override
  String get slotLate => 'Late / other';

  @override
  String plateRowSemantics(
    String slot,
    String dish,
    String more,
    String quantity,
  ) {
    return '$slot, $dish$more, $quantity';
  }

  @override
  String openDentSemantics(String slot) {
    return '$slot is open. An open, quiet place.';
  }

  @override
  String get openDentWhisper => 'An open, quiet place.';

  @override
  String get openCaptureSheet => 'Open capture sheet';

  @override
  String lastDays(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Last $count days',
      one: 'Last day',
    );
    return '$_temp0';
  }

  @override
  String get weekStripFootnote => 'no streaks · no countdowns · no guilt';

  @override
  String dayBalanced(String weekday) {
    return '$weekday, balanced';
  }

  @override
  String dayQuiet(String weekday) {
    return '$weekday, quiet';
  }

  @override
  String statusSemantics(String status) {
    return 'Status: $status';
  }

  @override
  String get foodGroupVegFruit => 'Veg & Fruit';

  @override
  String get foodGroupProtein => 'Protein';

  @override
  String get foodGroupStarch => 'Starch';

  @override
  String get foodGroupDairy => 'Dairy';

  @override
  String get foodGroupOther => 'Other';

  @override
  String balanceArcSemantics(String summary) {
    return 'Balance arc — $summary';
  }

  @override
  String balanceArcSummary(int filled, int total, String groups) {
    return '$filled of $total filled: $groups';
  }

  @override
  String balanceArcCount(int filled, int total) {
    return '$filled of $total';
  }

  @override
  String coachQuestionSemantics(String question) {
    return 'Coach question: $question';
  }

  @override
  String openPlateHintSemantics(String question) {
    return 'Open plate hint: $question';
  }

  @override
  String coachDepthSemantics(String question) {
    return 'Coach depth follow-up: $question';
  }

  @override
  String get coachDepthNothingToAdd => 'Nothing to add.';

  @override
  String get scanBarcode => 'Scan a barcode';

  @override
  String get typeOrTalk => 'Type or talk';

  @override
  String get snapshotSemantics => 'Snapshot — photograph a plate';

  @override
  String get snapshot => 'Snapshot';

  @override
  String get snapshotSubtitle => 'photo of your plate';

  @override
  String get resolvingReading => 'reading…';

  @override
  String get barcodeNotFoundTitle => 'Not found';

  @override
  String get barcodeNotFoundBody =>
      'This barcode isn\'t in the catalog yet. Type it manually?';

  @override
  String get scanAgain => 'Scan again';

  @override
  String get barcodeCheckingCamera => 'Checking camera permission…';

  @override
  String get barcodeMoveCloser => 'Move closer or steady';

  @override
  String barcodeLookingUp(String code) {
    return 'Looking up $code…';
  }

  @override
  String get barcodeAimHint => 'Aim at a packaged barcode to log it.';

  @override
  String get barcodeUnsupportedBrowserTitle =>
      'Scanning isn\'t available in this browser — type it instead';

  @override
  String get cameraUnavailableTitle => 'Camera unavailable — type it instead';

  @override
  String get barcodeUnsupportedBrowserBody =>
      'This browser can\'t read barcodes on your device, and OpenPlate never sends camera images elsewhere. Manual entry still works.';

  @override
  String get cameraStartFailedBody =>
      'We couldn\'t start the camera. Manual entry still works.';

  @override
  String get barcodeNotFoundTypeIt => 'Not found — type it manually';

  @override
  String get snapPlateTitle => 'Snap a plate';

  @override
  String get photoAimHint => 'Aim at your plate, then tap the shutter.';

  @override
  String get photoReading => 'Reading your plate…';

  @override
  String get photoNoFoodsMatched => 'No foods matched — pick one below.';

  @override
  String photoFoundFoods(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Found $count foods on this plate.',
      one: 'Found 1 food on this plate.',
    );
    return '$_temp0';
  }

  @override
  String get photoNothingOnPlate => 'Nothing on this plate — pick one below.';

  @override
  String get photoSearchUnavailablePick =>
      'Search isn\'t available right now. Pick a closest match below.';

  @override
  String get addFoodTitle => 'Add a food';

  @override
  String get foodSearch => 'Food search';

  @override
  String get voiceUnavailableSnack =>
      'Voice not available in v1 — type instead';

  @override
  String get voiceUnavailableSemantics =>
      'Voice not available in v1 — tap to see quiet copy';

  @override
  String get manualTypeHint =>
      'Type a food name. We will rank the matches for you.';

  @override
  String get manualCustomHint => 'Type the food name to add it manually.';

  @override
  String matchSemantics(String name, String group, int presets) {
    return '$name, $group, $presets presets';
  }

  @override
  String get recognizedNothingMatched => 'Nothing matched';

  @override
  String get recognizedPickOrType =>
      'Pick a closest match or type the food manually.';

  @override
  String recognizedLooksLike(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Looks like $count foods',
      one: 'Looks like 1 food',
    );
    return '$_temp0';
  }

  @override
  String get recognizedTapToConfirm =>
      'Tap one to confirm, or pick another match.';

  @override
  String get recognizedNothingOnPlate => 'Nothing on this plate';

  @override
  String get recognizedPickOrTypeFallback =>
      'You can still pick a closest match or type it manually.';

  @override
  String recognizedSemantics(
    String name,
    String group,
    String quantity,
    String confidence,
  ) {
    return '$name, $group, $quantity, confidence $confidence';
  }

  @override
  String recognizedDetail(String group, String quantity, String percent) {
    return '$group  · $quantity  · $percent%';
  }

  @override
  String get aboutTitle => 'About';

  @override
  String get aboutOpenSource => 'yours to run · open source';

  @override
  String get aboutLicences => 'Open-source licences';

  @override
  String get updateReadyMessage =>
      'A new version is ready. Reloading locks your data, so you will enter your passphrase again.';

  @override
  String get updateReloadAction => 'Reload';

  @override
  String get updateLaterAction => 'Later';

  @override
  String get yourDataStorageProtected =>
      'Storage: protected from automatic clean-up.';

  @override
  String get yourDataStorageNotProtected =>
      'Storage: the browser may clear this data if space runs low — export regularly.';

  @override
  String yourDataLastExport(DateTime date) {
    final intl.DateFormat dateDateFormat = intl.DateFormat.yMMMd(localeName);
    final String dateString = dateDateFormat.format(date);

    return 'Last export: $dateString';
  }

  @override
  String get yourDataNeverExported => 'Last export: never';

  @override
  String get exportReminderStale =>
      'It has been a while since your last export. A copy keeps your history safe if this device or browser ever loses it.';

  @override
  String get exportReminderNever =>
      'You have not exported yet. A copy keeps your history safe if this device or browser ever loses it.';

  @override
  String get exportReminderDismiss => 'Not now';

  @override
  String get installTitle => 'Install on your phone';

  @override
  String get installIntro =>
      'OpenPlate runs in your browser. Installing it adds an icon to your home screen and lets it open without a connection once it has loaded.';

  @override
  String get installAlready => 'OpenPlate is already installed on this device.';

  @override
  String get installButton => 'Install';

  @override
  String get installIosTitle => 'iPhone or iPad';

  @override
  String get installIosSteps =>
      'Open this page in Safari. Tap the Share button, choose “Add to Home Screen”, then tap “Add”.';

  @override
  String get installAndroidTitle => 'Android';

  @override
  String get installAndroidSteps =>
      'In Chrome, open the menu (⋮) and choose “Install app” (or “Add to Home screen”). Your browser may also offer an Install button below.';

  @override
  String get installDesktopTitle => 'Computer';

  @override
  String get installDesktopSteps =>
      'In Chrome or Edge, use the install icon at the right of the address bar, or open the browser menu and choose “Install OpenPlate”. Other browsers can simply keep using it in a tab.';

  @override
  String get installChangesTitle => 'What installing changes';

  @override
  String get installChangesOffline =>
      'It opens without a connection once it has loaded once, and shows a calm line when a new version is ready.';

  @override
  String get installChangesIcon =>
      'It gets its own icon and opens without the browser bars.';

  @override
  String get installChangesStorage =>
      'On iPhone, Safari may clear a website’s data if you have not visited it for a while; an app added to the Home Screen is not subject to that. The installed app keeps its own separate data, so install it before you start logging.';

  @override
  String get installBackupNote =>
      'Your data lives only on this device, so export a copy from Your data now and then.';

  @override
  String get settingsInstallRow => 'Install on your phone';

  @override
  String get settingsInstallRowSubtitle => 'offline · own icon';

  @override
  String get aboutNoticeTitle => 'About this app';

  @override
  String get aboutNoticeAdults => 'OpenPlate is designed for adults.';

  @override
  String get aboutNoticeAi =>
      'Photo recognition is off by default. If you turn it on, a photo is sent to a service you choose, and only after you say yes.';

  @override
  String get aboutNoticeLocal =>
      'Your plates stay on this device, encrypted. There are no accounts and no analytics.';

  @override
  String get aboutNoticeOk => 'Got it';

  @override
  String get privacyLinkLabel => 'What this app stores and sends';

  @override
  String get privacyTitle => 'What this app stores and sends';

  @override
  String get privacyIntro =>
      'A plain list. Nothing here is hidden, and nothing about you is collected.';

  @override
  String get privacyStoredHeading => 'Stored on this device, encrypted';

  @override
  String get privacyStoredBody =>
      'Your plates and the foods in them, the coach notes shown with them, your choices (such as your AI settings and these notices) and, if you add one, your AI key. All of it is encrypted on this device. On a phone the key stays in the system keystore; on the web it is made from your passphrase and kept only while the app is unlocked.';

  @override
  String get privacyLeavesHeading => 'What leaves this device, and when';

  @override
  String get privacyLeavesBarcode =>
      'Scanning a barcode: the barcode number is looked up on Open Food Facts, a public database with no account. Only the barcode is sent. Open Food Facts also sees the internet details any website sees: your internet address, your device or browser type and, on the web, the address of this site (the browser adds it as the Origin header). You can turn this off below.';

  @override
  String get privacyLeavesPhoto =>
      'Recognising a photo: only if you turned on your own AI and say yes. The photo (shrunk, with its location and camera details removed), a fixed instruction and the model name go to the service you chose. That service also sees your internet address and your device or browser type, and may keep requests under its own policy.';

  @override
  String get privacyLeavesAndroid =>
      'On Android, barcode scanning uses Google ML Kit inside the app, which may report usage statistics to Google. We have not verified this yet.';

  @override
  String get privacyServerHeading =>
      'What the server you got this app from sees';

  @override
  String get privacyServerBody =>
      'If you opened OpenPlate in a browser: nothing about you or your plates. The server only hands out the app’s files. Like any web server it may keep a short access log of page addresses and times, with client addresses shortened; in the standard self-host setup that log is off.';

  @override
  String get privacyNeverHeading => 'Never collected';

  @override
  String get privacyNeverBody =>
      'No analytics, no tracking, no crash reports, no advertising and no accounts. Nothing is sent about how you use the app.';

  @override
  String get privacyDeleteHeading => 'Deleting your data';

  @override
  String get privacyDeleteBody =>
      'To remove one plate, press and hold it on the Day Board and choose Remove. To remove everything, use Erase all local data in Settings, Your data. Exports you saved or shared elsewhere are copies outside the app: delete them yourself.';

  @override
  String get privacyExportHeading => 'Exporting';

  @override
  String get privacyExportBody =>
      'Settings, Your data, Export saves your plates as a CSV or JSON file. Exports are plain, unencrypted text files: keep them somewhere you trust.';

  @override
  String get privacySharedHeading => 'Shared devices';

  @override
  String get privacySharedBody =>
      'Everyone who can open OpenPlate on this device, or in this browser profile, sees the same history. For separate histories use a separate device or, on the web, a separate browser profile, each with its own passphrase.';

  @override
  String get privacyOffToggle => 'Look up barcodes on Open Food Facts';

  @override
  String get privacyOffToggleOn => 'On: a scanned barcode is looked up online.';

  @override
  String get privacyOffToggleOff =>
      'Off: only the offline catalog is used, and an unknown barcode opens manual entry.';

  @override
  String get privacyOffToggleUnasked =>
      'You will be asked the first time you scan a barcode.';

  @override
  String get offNoticeTitle => 'Barcode lookups';

  @override
  String get offNoticeBody =>
      'Barcodes you scan are looked up on Open Food Facts (public, no account). Only the barcode is sent.';

  @override
  String get offNoticeOk => 'OK';

  @override
  String get offNoticeOffline => 'Don’t look up online';

  @override
  String get plateRemoveAction => 'Remove this plate';

  @override
  String get plateRemoveHint => 'Press and hold to remove this plate';

  @override
  String get plateRemoveTitle => 'Remove this plate?';

  @override
  String plateRemoveBody(String dish) {
    return '$dish will be removed from your history on this device, along with its coach note. This can’t be undone.';
  }

  @override
  String get plateRemoveKeep => 'Keep it';

  @override
  String get plateRemoveConfirm => 'Remove';

  @override
  String get plateRemoved => 'Plate removed.';

  @override
  String get plateRemoveFailed => 'Couldn’t remove it. Try again.';

  @override
  String get settingsPrivacyRow => 'Privacy';

  @override
  String get settingsPrivacyRowSubtitle => 'what is stored · what is sent';

  @override
  String get privacySaveFailed =>
      'Couldn’t save that. Unlock the app and try again.';

  @override
  String get offNoticeAlso =>
      'Open Food Facts also sees your internet address and your app type, as any website does.';

  @override
  String get offNoticeAlsoWeb =>
      'Open Food Facts also sees your internet address, your browser type and the address of this site (your browser adds it), as any website does.';
}
