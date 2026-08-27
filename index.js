/**
 * @format
 */

// CSPRNG polyfill must load before any module that generates crypto material
// (MMKV encryption key). RN/Hermes does not ship WebCrypto.
import 'react-native-get-random-values';
import 'react-native-gesture-handler';
import { enableFreeze, enableScreens } from 'react-native-screens';
import { AppRegistry } from 'react-native';
import './src/services/notifications/notifeeBackground';
// FCM data/background handler — must register before the JS app mounts.
// Silent FCM messages with action=sync_fleet_alerts trigger fleet alert sync
// when the app is backgrounded or killed (no extra native module required).
import './src/services/notifications/pushBackground';

// Freeze inactive tab stacks so background screens stop re-rendering while scrolling.
enableScreens(true);
enableFreeze(true);

import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
