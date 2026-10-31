/**
 * Native iOS entry for the React Native app.
 * Wires Firebase (FCM) + notification center so JS push/Notifee can run.
 * Shows an opaque privacy window on resign-active so app-switcher snapshots
 * never capture authenticated UI (MM-01 / MASVS-PLATFORM-3).
 * Blanks screenshots / screen recordings via a secure UITextField layer
 * (same outcome as Android FLAG_SECURE — Apple provides no public block API).
 */
#import "AppDelegate.h"

#import <Firebase.h>
#import <React/RCTBundleURLProvider.h>
#import <ReactAppDependencyProvider/RCTAppDependencyProvider.h>
#import <UserNotifications/UserNotifications.h>

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  // Must match app.json `name` / AppRegistry.registerComponent — otherwise JS never mounts.
  self.moduleName = @"KarinsFleet";
  self.initialProps = @{};

  // RN 0.77+ New Arch: without this, third-party Fabric components fall back to the
  // legacy interop path and call RCTEventEmitter.receiveEvent(), which is never
  // registered as a callable JS module (redbox / launch freeze on iOS).
  self.dependencyProvider = [RCTAppDependencyProvider new];

  // Configure Firebase before any messaging/token calls from the JS layer.
  [FIRApp configure];

  // Allow foreground notification presentation (Notifee + FCM banners).
  UNUserNotificationCenter *center = [UNUserNotificationCenter currentNotificationCenter];
  center.delegate = self;

  BOOL result = [super application:application didFinishLaunchingWithOptions:launchOptions];

  // Window exists after super — protect on next run-loop tick so the RN root is attached.
  dispatch_async(dispatch_get_main_queue(), ^{
    [self enableScreenshotProtection];
    [self screenCaptureChanged];
  });

  // Cover content while Control Center / QuickTime / AirPlay is capturing the display.
  [[NSNotificationCenter defaultCenter] addObserver:self
                                           selector:@selector(screenCaptureChanged)
                                               name:UIScreenCapturedDidChangeNotification
                                             object:nil];

  return result;
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self bundleURL];
}

- (NSURL *)bundleURL
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

// Show alerts while the app is in the foreground so operators still see fleet events.
- (void)userNotificationCenter:(UNUserNotificationCenter *)center
       willPresentNotification:(UNNotification *)notification
         withCompletionHandler:(void (^)(UNNotificationPresentationOptions options))completionHandler
{
  completionHandler(
    UNNotificationPresentationOptionSound |
    UNNotificationPresentationOptionBadge |
    UNNotificationPresentationOptionBanner |
    UNNotificationPresentationOptionList
  );
}

/**
 * iOS analogue of Android FLAG_SECURE: nest the key window layer under a
 * secureTextEntry UITextField so system screenshots / recordings render black
 * while the live UI stays interactive for the user.
 */
- (void)enableScreenshotProtection
{
  if (self.screenshotProtectionField != nil) {
    return;
  }

  UIWindow *keyWindow = self.window;
  if (keyWindow == nil) {
    // Fallback — RN may expose the window slightly later on some devices.
    for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
      if (![scene isKindOfClass:[UIWindowScene class]]) {
        continue;
      }
      for (UIWindow *candidate in ((UIWindowScene *)scene).windows) {
        if (candidate.isKeyWindow) {
          keyWindow = candidate;
          break;
        }
      }
      if (keyWindow != nil) {
        break;
      }
    }
  }
  if (keyWindow == nil || keyWindow.layer.superlayer == nil) {
    return;
  }

  UITextField *textField = [UITextField new];
  textField.secureTextEntry = YES;
  textField.userInteractionEnabled = NO;
  textField.backgroundColor = UIColor.clearColor;

  CALayer *windowSuperlayer = keyWindow.layer.superlayer;
  [windowSuperlayer addSublayer:textField.layer];

  CALayer *secureLayer = textField.layer.sublayers.firstObject;
  if (secureLayer == nil) {
    [textField.layer removeFromSuperlayer];
    return;
  }

  [keyWindow.layer removeFromSuperlayer];
  [secureLayer addSublayer:keyWindow.layer];
  self.screenshotProtectionField = textField;
}

- (void)showPrivacyOverlay
{
  if (self.privacyWindow == nil) {
    UIWindow *window = [[UIWindow alloc] initWithFrame:UIScreen.mainScreen.bounds];
    // Above app content; below system alerts so Face ID sheets still appear.
    window.windowLevel = UIWindowLevelAlert - 1;
    // Karins navy — matches JS SessionPrivacyGate cover.
    window.backgroundColor = [UIColor colorWithRed:0.0 green:0.122 blue:0.306 alpha:1.0];
    UIViewController *controller = [UIViewController new];
    controller.view.backgroundColor = window.backgroundColor;
    window.rootViewController = controller;
    self.privacyWindow = window;
  }
  self.privacyWindow.hidden = NO;
}

- (void)hidePrivacyOverlay
{
  self.privacyWindow.hidden = YES;
}

/** Extra cover while the display is being recorded / mirrored (in case secure layer misses it). */
- (void)screenCaptureChanged
{
  if (UIScreen.mainScreen.isCaptured) {
    [self showPrivacyOverlay];
    return;
  }
  // Only clear when foreground — resign-active still needs the app-switcher cover.
  if (UIApplication.sharedApplication.applicationState == UIApplicationStateActive) {
    [self hidePrivacyOverlay];
  }
}

- (void)applicationWillResignActive:(UIApplication *)application
{
  // Do not call [super ...] — RCTAppDelegate does not implement these selectors.
  // [super respondsToSelector:] still returns YES (self implements them) and then
  // doesNotRecognizeSelector crashes on become-active (Simulator SIGSEGV).
  [self showPrivacyOverlay];
}

- (void)applicationDidBecomeActive:(UIApplication *)application
{
  // Keep overlay up if screen recording / mirroring is still active.
  if (UIScreen.mainScreen.isCaptured) {
    return;
  }
  // Native cover is snapshot-only; JS SessionPrivacyGate keeps the lock until biometry.
  [self hidePrivacyOverlay];
}

- (void)dealloc
{
  [[NSNotificationCenter defaultCenter] removeObserver:self];
}

@end
