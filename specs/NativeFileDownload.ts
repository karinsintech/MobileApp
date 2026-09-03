/**
 * TurboModule spec for silent Excel/PDF/image saves into public Downloads.
 * Codegen + TurboModuleRegistry are required on RN 0.86 (bridgeless); NativeModules.X is no longer callable.
 */

import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  saveToDownloads(
    base64: string,
    filename: string,
    mimeType: string,
  ): Promise<string>;
}

export default TurboModuleRegistry.get<Spec>('NativeFileDownload');
