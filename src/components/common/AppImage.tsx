/**
 * App-wide image component — Glide-backed on Android (via FastImage).
 *
 * Play Console flags React Native's default Image / Fresco path for manual
 * network download + BitmapFactory decode. Routing remote (and data-URI)
 * images through Glide gives automatic downsampling, disk/memory cache, and
 * safer decode sizing for Android 15+ devices.
 */
import React from 'react';
import {
  Image as RNImage,
  type ImageRequireSource,
  type StyleProp,
  type ImageStyle as RNImageStyle,
} from 'react-native';
import FastImage, {
  type FastImageProps,
  type ImageStyle as FastImageStyle,
  type Priority,
  type ResizeMode,
  type Source,
} from '@d11/react-native-fast-image';

type AppImageSource =
  | ImageRequireSource
  | {
      uri: string;
      headers?: Record<string, string>;
      priority?: Priority;
      cache?: 'immutable' | 'web' | 'cacheOnly';
    };

export interface AppImageProps extends Omit<FastImageProps, 'source' | 'style' | 'resizeMode'> {
  source: AppImageSource;
  style?: StyleProp<RNImageStyle | FastImageStyle>;
  resizeMode?: ResizeMode | 'contain' | 'cover' | 'stretch' | 'center';
  /**
   * Force the RN Image fallback (e.g. exotic local assets). Prefer the default
   * Glide path for anything loaded from a URI.
   */
  useRnFallback?: boolean;
}

function isRemoteOrDataUri(source: AppImageSource): source is Source & { uri: string } {
  return typeof source === 'object' && source !== null && 'uri' in source && typeof source.uri === 'string';
}

export function AppImage({
  source,
  style,
  resizeMode = 'cover',
  useRnFallback = false,
  ...rest
}: AppImageProps) {
  // Bundled require() assets stay on RN Image — Glide's strength is URI loads.
  // Large Sarathi face photos are data:image base64; FastImage/Glide often fails
  // on those, so keep data URIs on RN Image as well.
  const isDataUri = isRemoteOrDataUri(source) && source.uri.startsWith('data:');
  if (useRnFallback || isDataUri || !isRemoteOrDataUri(source)) {
    return (
      <RNImage
        source={source as ImageRequireSource | { uri: string }}
        style={style as StyleProp<RNImageStyle>}
        resizeMode={resizeMode}
      />
    );
  }

  return (
    <FastImage
      {...rest}
      style={style as StyleProp<FastImageStyle>}
      resizeMode={resizeMode as ResizeMode}
      source={{
        uri: source.uri,
        headers: source.headers,
        // Remote photos (DL / module art) benefit from disk cache across sessions.
        priority: source.priority ?? FastImage.priority.normal,
        cache: source.cache ?? FastImage.cacheControl.immutable,
      }}
    />
  );
}

AppImage.resizeMode = FastImage.resizeMode;
AppImage.priority = FastImage.priority;
AppImage.cacheControl = FastImage.cacheControl;

export default AppImage;
