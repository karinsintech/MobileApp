/**
 * Native iOS entry for the React Native app.
 * Wires Firebase (FCM) + notification center so JS push/Notifee can run.
 * Shows an opaque privacy window on resign-active so app-switcher snapshots
 * never capture authenticated UI (MM-01 / MASVS-PLATFORM-3).
 */
#import "AppDelegate.h"

#import <Firebase.h>
#import <React/RCTBundleURLProvider.h>
#import <UserNotifications/UserNotifications.h>

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  // Must match app.json `name` / AppRegistry.registerComponent — otherwise JS never mounts.
  self.moduleName = @"KarinsFleet";
  self.initialProps = @{};

  // Configure Firebase before any messaging/token calls from the JS layer.
  [FIRApp configure];

  // Allow foreground notification presentation (Notifee + FCM banners).
  UNUserNotificationCenter *center = [UNUserNotificationCenter currentNotificationCenter];
  center.delegate = self;

  return [super application:application didFinishLaunchingWithOptions:launchOptions];
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

- (void)applicationWillResignActive:(UIApplication *)application
{
  [self showPrivacyOverlay];
  if ([super respondsToSelector:@selector(applicationWillResignActive:)]) {
    [super applicationWillResignActive:application];
  }
}

- (void)applicationDidBecomeActive:(UIApplication *)application
{
  // Native cover is snapshot-only; JS SessionPrivacyGate keeps the lock until biometry.
  [self hidePrivacyOverlay];
  if ([super respondsToSelector:@selector(applicationDidBecomeActive:)]) {
    [super applicationDidBecomeActive:application];
  }
}

@end
