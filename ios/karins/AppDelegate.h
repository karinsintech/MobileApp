/**
 * App delegate interface — RCTAppDelegate + notification center for push UX.
 * privacyWindow covers the UI during resign-active so the app-switcher
 * snapshot cannot capture wallet / bank content (MM-01).
 */
#import <RCTAppDelegate.h>
#import <UIKit/UIKit.h>
#import <UserNotifications/UNUserNotificationCenter.h>

@interface AppDelegate : RCTAppDelegate <UNUserNotificationCenterDelegate>

@property (nonatomic, strong, nullable) UIWindow *privacyWindow;

@end
