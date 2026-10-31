/**
 * App delegate interface — RCTAppDelegate + notification center for push UX.
 * privacyWindow covers the UI during resign-active so the app-switcher
 * snapshot cannot capture wallet / bank content (MM-01).
 * screenshotProtectionField holds the secure UITextField used to blank
 * screenshots / recordings (iOS has no FLAG_SECURE equivalent).
 */
#import <RCTAppDelegate.h>
#import <UIKit/UIKit.h>
#import <UserNotifications/UNUserNotificationCenter.h>

@interface AppDelegate : RCTAppDelegate <UNUserNotificationCenterDelegate>

@property (nonatomic, strong, nullable) UIWindow *privacyWindow;
/** Retained so the secure-layer hierarchy stays alive for the app lifetime. */
@property (nonatomic, strong, nullable) UITextField *screenshotProtectionField;

@end
