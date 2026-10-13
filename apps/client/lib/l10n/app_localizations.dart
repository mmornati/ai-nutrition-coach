import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_en.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
    : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[Locale('en')];

  /// The app name, shown in the OS task switcher.
  ///
  /// In en, this message translates to:
  /// **'AI Nutrition Coach'**
  String get appName;

  /// Warning banner shown only in the dev in-memory web build.
  ///
  /// In en, this message translates to:
  /// **'DEV — not encrypted. Data lives in memory only.'**
  String get devStoreBanner;

  /// No description provided for @typeItManually.
  ///
  /// In en, this message translates to:
  /// **'Type it manually'**
  String get typeItManually;

  /// No description provided for @retake.
  ///
  /// In en, this message translates to:
  /// **'Retake'**
  String get retake;

  /// No description provided for @logAction.
  ///
  /// In en, this message translates to:
  /// **'Log'**
  String get logAction;

  /// No description provided for @logging.
  ///
  /// In en, this message translates to:
  /// **'Logging…'**
  String get logging;

  /// No description provided for @logCustomFood.
  ///
  /// In en, this message translates to:
  /// **'Log custom food'**
  String get logCustomFood;

  /// No description provided for @cameraDeniedTitle.
  ///
  /// In en, this message translates to:
  /// **'Camera denied — type it instead'**
  String get cameraDeniedTitle;

  /// No description provided for @cameraDeniedBody.
  ///
  /// In en, this message translates to:
  /// **'You can still log a plate from the manual entry screen.'**
  String get cameraDeniedBody;

  /// No description provided for @searchUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Search isn\'t available right now.'**
  String get searchUnavailable;

  /// No description provided for @closestMatches.
  ///
  /// In en, this message translates to:
  /// **'Closest matches'**
  String get closestMatches;

  /// No description provided for @customFoodName.
  ///
  /// In en, this message translates to:
  /// **'Custom food name'**
  String get customFoodName;

  /// No description provided for @typeNameFirst.
  ///
  /// In en, this message translates to:
  /// **'Type a name first'**
  String get typeNameFirst;

  /// No description provided for @pickQuantity.
  ///
  /// In en, this message translates to:
  /// **'Pick a quantity'**
  String get pickQuantity;

  /// No description provided for @pickFoodFirst.
  ///
  /// In en, this message translates to:
  /// **'Pick a food first'**
  String get pickFoodFirst;

  /// No description provided for @close.
  ///
  /// In en, this message translates to:
  /// **'close'**
  String get close;

  /// No description provided for @sure.
  ///
  /// In en, this message translates to:
  /// **'sure'**
  String get sure;

  /// No description provided for @askLater.
  ///
  /// In en, this message translates to:
  /// **'ask later'**
  String get askLater;

  /// No description provided for @logFailureMobileOnly.
  ///
  /// In en, this message translates to:
  /// **'Mobile-only in v1.'**
  String get logFailureMobileOnly;

  /// No description provided for @logFailureHistoryCannotOpen.
  ///
  /// In en, this message translates to:
  /// **'History can\'t open on this device.'**
  String get logFailureHistoryCannotOpen;

  /// No description provided for @logFailureGeneric.
  ///
  /// In en, this message translates to:
  /// **'Could not log plate.'**
  String get logFailureGeneric;

  /// No description provided for @historyCannotLoad.
  ///
  /// In en, this message translates to:
  /// **'History can\'t load right now.'**
  String get historyCannotLoad;

  /// No description provided for @dayToday.
  ///
  /// In en, this message translates to:
  /// **'Today'**
  String get dayToday;

  /// No description provided for @dayYesterday.
  ///
  /// In en, this message translates to:
  /// **'Yesterday'**
  String get dayYesterday;

  /// Screen-reader label of the quick-repeat link.
  ///
  /// In en, this message translates to:
  /// **'Log another plate'**
  String get logAnotherPlate;

  /// No description provided for @logAnotherPlateLink.
  ///
  /// In en, this message translates to:
  /// **'+ log another plate'**
  String get logAnotherPlateLink;

  /// No description provided for @slotBreakfast.
  ///
  /// In en, this message translates to:
  /// **'Breakfast'**
  String get slotBreakfast;

  /// No description provided for @slotLunch.
  ///
  /// In en, this message translates to:
  /// **'Lunch'**
  String get slotLunch;

  /// No description provided for @slotDinner.
  ///
  /// In en, this message translates to:
  /// **'Dinner'**
  String get slotDinner;

  /// No description provided for @slotLate.
  ///
  /// In en, this message translates to:
  /// **'Late / other'**
  String get slotLate;

  /// Screen-reader label of one plate row.
  ///
  /// In en, this message translates to:
  /// **'{slot}, {dish}{more}, {quantity}'**
  String plateRowSemantics(
    String slot,
    String dish,
    String more,
    String quantity,
  );

  /// No description provided for @openDentSemantics.
  ///
  /// In en, this message translates to:
  /// **'{slot} is open. An open, quiet place.'**
  String openDentSemantics(String slot);

  /// No description provided for @openDentWhisper.
  ///
  /// In en, this message translates to:
  /// **'An open, quiet place.'**
  String get openDentWhisper;

  /// No description provided for @openCaptureSheet.
  ///
  /// In en, this message translates to:
  /// **'Open capture sheet'**
  String get openCaptureSheet;

  /// No description provided for @lastDays.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{Last day} other{Last {count} days}}'**
  String lastDays(int count);

  /// No description provided for @weekStripFootnote.
  ///
  /// In en, this message translates to:
  /// **'no streaks · no countdowns · no guilt'**
  String get weekStripFootnote;

  /// No description provided for @dayBalanced.
  ///
  /// In en, this message translates to:
  /// **'{weekday}, balanced'**
  String dayBalanced(String weekday);

  /// No description provided for @dayQuiet.
  ///
  /// In en, this message translates to:
  /// **'{weekday}, quiet'**
  String dayQuiet(String weekday);

  /// No description provided for @statusSemantics.
  ///
  /// In en, this message translates to:
  /// **'Status: {status}'**
  String statusSemantics(String status);

  /// No description provided for @foodGroupVegFruit.
  ///
  /// In en, this message translates to:
  /// **'Veg & Fruit'**
  String get foodGroupVegFruit;

  /// No description provided for @foodGroupProtein.
  ///
  /// In en, this message translates to:
  /// **'Protein'**
  String get foodGroupProtein;

  /// No description provided for @foodGroupStarch.
  ///
  /// In en, this message translates to:
  /// **'Starch'**
  String get foodGroupStarch;

  /// No description provided for @foodGroupDairy.
  ///
  /// In en, this message translates to:
  /// **'Dairy'**
  String get foodGroupDairy;

  /// No description provided for @foodGroupOther.
  ///
  /// In en, this message translates to:
  /// **'Other'**
  String get foodGroupOther;

  /// No description provided for @balanceArcSemantics.
  ///
  /// In en, this message translates to:
  /// **'Balance arc — {summary}'**
  String balanceArcSemantics(String summary);

  /// No description provided for @balanceArcSummary.
  ///
  /// In en, this message translates to:
  /// **'{filled} of {total} filled: {groups}'**
  String balanceArcSummary(int filled, int total, String groups);

  /// No description provided for @balanceArcCount.
  ///
  /// In en, this message translates to:
  /// **'{filled} of {total}'**
  String balanceArcCount(int filled, int total);

  /// No description provided for @coachQuestionSemantics.
  ///
  /// In en, this message translates to:
  /// **'Coach question: {question}'**
  String coachQuestionSemantics(String question);

  /// No description provided for @openPlateHintSemantics.
  ///
  /// In en, this message translates to:
  /// **'Open plate hint: {question}'**
  String openPlateHintSemantics(String question);

  /// No description provided for @coachDepthSemantics.
  ///
  /// In en, this message translates to:
  /// **'Coach depth follow-up: {question}'**
  String coachDepthSemantics(String question);

  /// No description provided for @coachDepthNothingToAdd.
  ///
  /// In en, this message translates to:
  /// **'Nothing to add.'**
  String get coachDepthNothingToAdd;

  /// No description provided for @scanBarcode.
  ///
  /// In en, this message translates to:
  /// **'Scan a barcode'**
  String get scanBarcode;

  /// No description provided for @typeOrTalk.
  ///
  /// In en, this message translates to:
  /// **'Type or talk'**
  String get typeOrTalk;

  /// No description provided for @snapshotSemantics.
  ///
  /// In en, this message translates to:
  /// **'Snapshot — photograph a plate'**
  String get snapshotSemantics;

  /// No description provided for @snapshot.
  ///
  /// In en, this message translates to:
  /// **'Snapshot'**
  String get snapshot;

  /// No description provided for @snapshotSubtitle.
  ///
  /// In en, this message translates to:
  /// **'photo of your plate'**
  String get snapshotSubtitle;

  /// No description provided for @resolvingReading.
  ///
  /// In en, this message translates to:
  /// **'reading…'**
  String get resolvingReading;

  /// No description provided for @barcodeNotFoundTitle.
  ///
  /// In en, this message translates to:
  /// **'Not found'**
  String get barcodeNotFoundTitle;

  /// No description provided for @barcodeNotFoundBody.
  ///
  /// In en, this message translates to:
  /// **'This barcode isn\'t in the catalog yet. Type it manually?'**
  String get barcodeNotFoundBody;

  /// No description provided for @scanAgain.
  ///
  /// In en, this message translates to:
  /// **'Scan again'**
  String get scanAgain;

  /// No description provided for @barcodeCheckingCamera.
  ///
  /// In en, this message translates to:
  /// **'Checking camera permission…'**
  String get barcodeCheckingCamera;

  /// No description provided for @barcodeMoveCloser.
  ///
  /// In en, this message translates to:
  /// **'Move closer or steady'**
  String get barcodeMoveCloser;

  /// No description provided for @barcodeLookingUp.
  ///
  /// In en, this message translates to:
  /// **'Looking up {code}…'**
  String barcodeLookingUp(String code);

  /// No description provided for @barcodeAimHint.
  ///
  /// In en, this message translates to:
  /// **'Aim at a packaged barcode to log it.'**
  String get barcodeAimHint;

  /// No description provided for @barcodeUnsupportedBrowserTitle.
  ///
  /// In en, this message translates to:
  /// **'Scanning isn\'t available in this browser — type it instead'**
  String get barcodeUnsupportedBrowserTitle;

  /// No description provided for @cameraUnavailableTitle.
  ///
  /// In en, this message translates to:
  /// **'Camera unavailable — type it instead'**
  String get cameraUnavailableTitle;

  /// No description provided for @barcodeUnsupportedBrowserBody.
  ///
  /// In en, this message translates to:
  /// **'This browser can\'t read barcodes on your device, and AI Nutrition Coach never sends camera images elsewhere. Manual entry still works.'**
  String get barcodeUnsupportedBrowserBody;

  /// No description provided for @cameraStartFailedBody.
  ///
  /// In en, this message translates to:
  /// **'We couldn\'t start the camera. Manual entry still works.'**
  String get cameraStartFailedBody;

  /// No description provided for @barcodeNotFoundTypeIt.
  ///
  /// In en, this message translates to:
  /// **'Not found — type it manually'**
  String get barcodeNotFoundTypeIt;

  /// No description provided for @snapPlateTitle.
  ///
  /// In en, this message translates to:
  /// **'Snap a plate'**
  String get snapPlateTitle;

  /// No description provided for @photoAimHint.
  ///
  /// In en, this message translates to:
  /// **'Aim at your plate, then tap the shutter.'**
  String get photoAimHint;

  /// No description provided for @photoReading.
  ///
  /// In en, this message translates to:
  /// **'Reading your plate…'**
  String get photoReading;

  /// No description provided for @photoNoFoodsMatched.
  ///
  /// In en, this message translates to:
  /// **'No foods matched — pick one below.'**
  String get photoNoFoodsMatched;

  /// No description provided for @photoFoundFoods.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{Found 1 food on this plate.} other{Found {count} foods on this plate.}}'**
  String photoFoundFoods(int count);

  /// No description provided for @photoNothingOnPlate.
  ///
  /// In en, this message translates to:
  /// **'Nothing on this plate — pick one below.'**
  String get photoNothingOnPlate;

  /// No description provided for @photoSearchUnavailablePick.
  ///
  /// In en, this message translates to:
  /// **'Search isn\'t available right now. Pick a closest match below.'**
  String get photoSearchUnavailablePick;

  /// No description provided for @addFoodTitle.
  ///
  /// In en, this message translates to:
  /// **'Add a food'**
  String get addFoodTitle;

  /// No description provided for @foodSearch.
  ///
  /// In en, this message translates to:
  /// **'Food search'**
  String get foodSearch;

  /// No description provided for @voiceUnavailableSnack.
  ///
  /// In en, this message translates to:
  /// **'Voice not available in v1 — type instead'**
  String get voiceUnavailableSnack;

  /// No description provided for @voiceUnavailableSemantics.
  ///
  /// In en, this message translates to:
  /// **'Voice not available in v1 — tap to see quiet copy'**
  String get voiceUnavailableSemantics;

  /// No description provided for @manualTypeHint.
  ///
  /// In en, this message translates to:
  /// **'Type a food name. We will rank the matches for you.'**
  String get manualTypeHint;

  /// No description provided for @manualCustomHint.
  ///
  /// In en, this message translates to:
  /// **'Type the food name to add it manually.'**
  String get manualCustomHint;

  /// No description provided for @matchSemantics.
  ///
  /// In en, this message translates to:
  /// **'{name}, {group}, {presets} presets'**
  String matchSemantics(String name, String group, int presets);

  /// No description provided for @recognizedNothingMatched.
  ///
  /// In en, this message translates to:
  /// **'Nothing matched'**
  String get recognizedNothingMatched;

  /// No description provided for @recognizedPickOrType.
  ///
  /// In en, this message translates to:
  /// **'Pick a closest match or type the food manually.'**
  String get recognizedPickOrType;

  /// No description provided for @recognizedLooksLike.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{Looks like 1 food} other{Looks like {count} foods}}'**
  String recognizedLooksLike(int count);

  /// No description provided for @recognizedTapToConfirm.
  ///
  /// In en, this message translates to:
  /// **'Tap one to confirm, or pick another match.'**
  String get recognizedTapToConfirm;

  /// No description provided for @recognizedNothingOnPlate.
  ///
  /// In en, this message translates to:
  /// **'Nothing on this plate'**
  String get recognizedNothingOnPlate;

  /// No description provided for @recognizedPickOrTypeFallback.
  ///
  /// In en, this message translates to:
  /// **'You can still pick a closest match or type it manually.'**
  String get recognizedPickOrTypeFallback;

  /// No description provided for @recognizedSemantics.
  ///
  /// In en, this message translates to:
  /// **'{name}, {group}, {quantity}, confidence {confidence}'**
  String recognizedSemantics(
    String name,
    String group,
    String quantity,
    String confidence,
  );

  /// No description provided for @recognizedDetail.
  ///
  /// In en, this message translates to:
  /// **'{group}  · {quantity}  · {percent}%'**
  String recognizedDetail(String group, String quantity, String percent);

  /// No description provided for @aboutTitle.
  ///
  /// In en, this message translates to:
  /// **'About'**
  String get aboutTitle;

  /// No description provided for @aboutOpenSource.
  ///
  /// In en, this message translates to:
  /// **'yours to run · open source'**
  String get aboutOpenSource;

  /// No description provided for @aboutLicences.
  ///
  /// In en, this message translates to:
  /// **'Open-source licences'**
  String get aboutLicences;

  /// Calm, dismissible line shown when a new version of the web app has been installed in the background.
  ///
  /// In en, this message translates to:
  /// **'A new version is ready. Reloading locks your data, so you will enter your passphrase again.'**
  String get updateReadyMessage;

  /// Button that activates the new version and reloads the page.
  ///
  /// In en, this message translates to:
  /// **'Reload'**
  String get updateReloadAction;

  /// Dismisses the new-version line until the next visit.
  ///
  /// In en, this message translates to:
  /// **'Later'**
  String get updateLaterAction;

  /// Your data screen, web only: the browser promised to keep this data.
  ///
  /// In en, this message translates to:
  /// **'Storage: protected from automatic clean-up.'**
  String get yourDataStorageProtected;

  /// Your data screen, web only: the browser has not promised to keep this data.
  ///
  /// In en, this message translates to:
  /// **'Storage: the browser may clear this data if space runs low — export regularly.'**
  String get yourDataStorageNotProtected;

  /// Your data screen: when the user last exported.
  ///
  /// In en, this message translates to:
  /// **'Last export: {date}'**
  String yourDataLastExport(DateTime date);

  /// Your data screen: nothing has been exported yet.
  ///
  /// In en, this message translates to:
  /// **'Last export: never'**
  String get yourDataNeverExported;

  /// One quiet line on Your data; dismissible; never a badge or a modal.
  ///
  /// In en, this message translates to:
  /// **'It has been a while since your last export. A copy keeps your history safe if this device or browser ever loses it.'**
  String get exportReminderStale;

  /// One quiet line on Your data when there is data but no export yet.
  ///
  /// In en, this message translates to:
  /// **'You have not exported yet. A copy keeps your history safe if this device or browser ever loses it.'**
  String get exportReminderNever;

  /// Dismisses the export suggestion for a while.
  ///
  /// In en, this message translates to:
  /// **'Not now'**
  String get exportReminderDismiss;

  /// Title of the install help screen.
  ///
  /// In en, this message translates to:
  /// **'Install on your phone'**
  String get installTitle;

  /// Install help intro.
  ///
  /// In en, this message translates to:
  /// **'AI Nutrition Coach runs in your browser. Installing it adds an icon to your home screen and lets it open without a connection once it has loaded.'**
  String get installIntro;

  /// Shown instead of instructions when running as an installed app.
  ///
  /// In en, this message translates to:
  /// **'AI Nutrition Coach is already installed on this device.'**
  String get installAlready;

  /// Chromium only: opens the browser install dialog.
  ///
  /// In en, this message translates to:
  /// **'Install'**
  String get installButton;

  /// Install help heading.
  ///
  /// In en, this message translates to:
  /// **'iPhone or iPad'**
  String get installIosTitle;

  /// Install help steps for iOS.
  ///
  /// In en, this message translates to:
  /// **'Open this page in Safari. Tap the Share button, choose “Add to Home Screen”, then tap “Add”.'**
  String get installIosSteps;

  /// Install help heading.
  ///
  /// In en, this message translates to:
  /// **'Android'**
  String get installAndroidTitle;

  /// Install help steps for Android.
  ///
  /// In en, this message translates to:
  /// **'In Chrome, open the menu (⋮) and choose “Install app” (or “Add to Home screen”). Your browser may also offer an Install button below.'**
  String get installAndroidSteps;

  /// Install help heading.
  ///
  /// In en, this message translates to:
  /// **'Computer'**
  String get installDesktopTitle;

  /// Install help steps for desktop browsers.
  ///
  /// In en, this message translates to:
  /// **'In Chrome or Edge, use the install icon at the right of the address bar, or open the browser menu and choose “Install AI Nutrition Coach”. Other browsers can simply keep using it in a tab.'**
  String get installDesktopSteps;

  /// Install help heading.
  ///
  /// In en, this message translates to:
  /// **'What installing changes'**
  String get installChangesTitle;

  /// Install help bullet.
  ///
  /// In en, this message translates to:
  /// **'It opens without a connection once it has loaded once, and shows a calm line when a new version is ready.'**
  String get installChangesOffline;

  /// Install help bullet.
  ///
  /// In en, this message translates to:
  /// **'It gets its own icon and opens without the browser bars.'**
  String get installChangesIcon;

  /// Install help bullet about Safari storage.
  ///
  /// In en, this message translates to:
  /// **'On iPhone, Safari may clear a website’s data if you have not visited it for a while; an app added to the Home Screen is not subject to that. The installed app keeps its own separate data, so install it before you start logging.'**
  String get installChangesStorage;

  /// Install help closing line.
  ///
  /// In en, this message translates to:
  /// **'Your data lives only on this device, so export a copy from Your data now and then.'**
  String get installBackupNote;

  /// Settings row title.
  ///
  /// In en, this message translates to:
  /// **'Install on your phone'**
  String get settingsInstallRow;

  /// Settings row subtitle.
  ///
  /// In en, this message translates to:
  /// **'offline · own icon'**
  String get settingsInstallRowSubtitle;

  /// One-time first-run notice heading.
  ///
  /// In en, this message translates to:
  /// **'About this app'**
  String get aboutNoticeTitle;

  /// First-run notice line 1.
  ///
  /// In en, this message translates to:
  /// **'AI Nutrition Coach is designed for adults.'**
  String get aboutNoticeAdults;

  /// First-run notice line 2.
  ///
  /// In en, this message translates to:
  /// **'Photo recognition is off by default. If you turn it on, a photo is sent to a service you choose, and only after you say yes.'**
  String get aboutNoticeAi;

  /// First-run notice line 3.
  ///
  /// In en, this message translates to:
  /// **'Your plates stay on this device, encrypted. There are no accounts and no analytics.'**
  String get aboutNoticeLocal;

  /// Dismiss button of the first-run notice.
  ///
  /// In en, this message translates to:
  /// **'Got it'**
  String get aboutNoticeOk;

  /// Link text to the in-app privacy page (first-run notice, barcode notice, consent dialog, Your AI).
  ///
  /// In en, this message translates to:
  /// **'What this app stores and sends'**
  String get privacyLinkLabel;

  /// Privacy page title.
  ///
  /// In en, this message translates to:
  /// **'What this app stores and sends'**
  String get privacyTitle;

  /// Privacy page intro.
  ///
  /// In en, this message translates to:
  /// **'A plain list. Nothing here is hidden, and nothing about you is collected.'**
  String get privacyIntro;

  /// Privacy page section heading.
  ///
  /// In en, this message translates to:
  /// **'Stored on this device, encrypted'**
  String get privacyStoredHeading;

  /// Privacy page: what is stored.
  ///
  /// In en, this message translates to:
  /// **'Your plates and the foods in them, the coach notes shown with them, your choices (such as your AI settings and these notices) and, if you add one, your AI key. All of it is encrypted on this device. On a phone the key stays in the system keystore; on the web it is made from your passphrase and kept only while the app is unlocked.'**
  String get privacyStoredBody;

  /// Privacy page section heading.
  ///
  /// In en, this message translates to:
  /// **'What leaves this device, and when'**
  String get privacyLeavesHeading;

  /// Privacy page: barcode lookups.
  ///
  /// In en, this message translates to:
  /// **'Scanning a barcode: the barcode number is looked up on Open Food Facts, a public database with no account. Only the barcode is sent. Open Food Facts also sees the internet details any website sees: your internet address, your device or browser type and, on the web, the address of this site (the browser adds it as the Origin header). You can turn this off below.'**
  String get privacyLeavesBarcode;

  /// Privacy page: AI photo upload.
  ///
  /// In en, this message translates to:
  /// **'Recognising a photo: only if you turned on your own AI and say yes. The photo (shrunk, with its location and camera details removed), a fixed instruction and the model name go to the service you chose. That service also sees your internet address and your device or browser type, and may keep requests under its own policy.'**
  String get privacyLeavesPhoto;

  /// Privacy page: ML Kit note (PV4, unverified).
  ///
  /// In en, this message translates to:
  /// **'On Android, barcode scanning uses Google ML Kit inside the app, which may report usage statistics to Google. We have not verified this yet.'**
  String get privacyLeavesAndroid;

  /// Privacy page section heading.
  ///
  /// In en, this message translates to:
  /// **'What the server you got this app from sees'**
  String get privacyServerHeading;

  /// Privacy page: server.
  ///
  /// In en, this message translates to:
  /// **'If you opened AI Nutrition Coach in a browser: nothing about you or your plates. The server only hands out the app’s files. Like any web server it may keep a short access log of page addresses and times, with client addresses shortened; in the standard self-host setup that log is off.'**
  String get privacyServerBody;

  /// Privacy page section heading.
  ///
  /// In en, this message translates to:
  /// **'Never collected'**
  String get privacyNeverHeading;

  /// Privacy page: never collected.
  ///
  /// In en, this message translates to:
  /// **'No analytics, no tracking, no crash reports, no advertising and no accounts. Nothing is sent about how you use the app.'**
  String get privacyNeverBody;

  /// Privacy page section heading.
  ///
  /// In en, this message translates to:
  /// **'Deleting your data'**
  String get privacyDeleteHeading;

  /// Privacy page: deleting.
  ///
  /// In en, this message translates to:
  /// **'To remove one plate, press and hold it on the Day Board and choose Remove. To remove everything, use Erase all local data in Settings, Your data. Exports you saved or shared elsewhere are copies outside the app: delete them yourself.'**
  String get privacyDeleteBody;

  /// Privacy page section heading.
  ///
  /// In en, this message translates to:
  /// **'Exporting'**
  String get privacyExportHeading;

  /// Privacy page: exporting.
  ///
  /// In en, this message translates to:
  /// **'Settings, Your data, Export saves your plates as a CSV or JSON file. Exports are plain, unencrypted text files: keep them somewhere you trust.'**
  String get privacyExportBody;

  /// Privacy page section heading.
  ///
  /// In en, this message translates to:
  /// **'Shared devices'**
  String get privacySharedHeading;

  /// Privacy page: shared devices (PV6).
  ///
  /// In en, this message translates to:
  /// **'Everyone who can open AI Nutrition Coach on this device, or in this browser profile, sees the same history. For separate histories use a separate device or, on the web, a separate browser profile, each with its own passphrase.'**
  String get privacySharedBody;

  /// Privacy page switch label.
  ///
  /// In en, this message translates to:
  /// **'Look up barcodes on Open Food Facts'**
  String get privacyOffToggle;

  /// Privacy page switch state.
  ///
  /// In en, this message translates to:
  /// **'On: a scanned barcode is looked up online.'**
  String get privacyOffToggleOn;

  /// Privacy page switch state.
  ///
  /// In en, this message translates to:
  /// **'Off: only the offline catalog is used, and an unknown barcode opens manual entry.'**
  String get privacyOffToggleOff;

  /// Privacy page switch state before the notice was answered.
  ///
  /// In en, this message translates to:
  /// **'You will be asked the first time you scan a barcode.'**
  String get privacyOffToggleUnasked;

  /// Open Food Facts notice title.
  ///
  /// In en, this message translates to:
  /// **'Barcode lookups'**
  String get offNoticeTitle;

  /// Open Food Facts notice body.
  ///
  /// In en, this message translates to:
  /// **'Barcodes you scan are looked up on Open Food Facts (public, no account). Only the barcode is sent.'**
  String get offNoticeBody;

  /// Open Food Facts notice: allow.
  ///
  /// In en, this message translates to:
  /// **'OK'**
  String get offNoticeOk;

  /// Open Food Facts notice: offline catalog only.
  ///
  /// In en, this message translates to:
  /// **'Don’t look up online'**
  String get offNoticeOffline;

  /// Semantics action and menu label that removes a plate.
  ///
  /// In en, this message translates to:
  /// **'Remove this plate'**
  String get plateRemoveAction;

  /// Semantics long-press hint of a plate row.
  ///
  /// In en, this message translates to:
  /// **'Press and hold to remove this plate'**
  String get plateRemoveHint;

  /// Confirm dialog title.
  ///
  /// In en, this message translates to:
  /// **'Remove this plate?'**
  String get plateRemoveTitle;

  /// Confirm dialog body; dish is the plate's food summary.
  ///
  /// In en, this message translates to:
  /// **'{dish} will be removed from your history on this device, along with its coach note. This can’t be undone.'**
  String plateRemoveBody(String dish);

  /// Confirm dialog dismiss.
  ///
  /// In en, this message translates to:
  /// **'Keep it'**
  String get plateRemoveKeep;

  /// Confirm dialog action.
  ///
  /// In en, this message translates to:
  /// **'Remove'**
  String get plateRemoveConfirm;

  /// Snackbar after a plate was removed.
  ///
  /// In en, this message translates to:
  /// **'Plate removed.'**
  String get plateRemoved;

  /// Snackbar when the removal failed.
  ///
  /// In en, this message translates to:
  /// **'Couldn’t remove it. Try again.'**
  String get plateRemoveFailed;

  /// Settings row title.
  ///
  /// In en, this message translates to:
  /// **'Privacy'**
  String get settingsPrivacyRow;

  /// Settings row subtitle.
  ///
  /// In en, this message translates to:
  /// **'what is stored · what is sent'**
  String get settingsPrivacyRowSubtitle;

  /// Privacy page: the switch change could not be stored.
  ///
  /// In en, this message translates to:
  /// **'Couldn’t save that. Unlock the app and try again.'**
  String get privacySaveFailed;

  /// Open Food Facts notice, second paragraph (mobile).
  ///
  /// In en, this message translates to:
  /// **'Open Food Facts also sees your internet address and your app type, as any website does.'**
  String get offNoticeAlso;

  /// Open Food Facts notice, second paragraph (web).
  ///
  /// In en, this message translates to:
  /// **'Open Food Facts also sees your internet address, your browser type and the address of this site (your browser adds it), as any website does.'**
  String get offNoticeAlsoWeb;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['en'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'en':
      return AppLocalizationsEn();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
