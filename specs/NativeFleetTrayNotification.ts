/**
 * TurboModule spec for Android multi-line tray alerts (no BigText expand chevron).
 * Codegen + TurboModuleRegistry are required on RN 0.86 bridgeless.
 */

import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  display(
    id: string,
    title: string,
    body: string,
    channelId: string,
    data: { [key: string]: string } | null,
  ): Promise<boolean>;
  cancel(id: string): Promise<boolean>;
  consumeOpenNotificationsIntent(): Promise<boolean>;
}

export default TurboModuleRegistry.get<Spec>('NativeFleetTrayNotification');
