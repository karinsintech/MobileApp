/**
 * Optional deep link when app is opened via web return URL (same path as /status redirect).
 * Localhost is Metro/dev only — a release http://localhost prefix would claim an
 * unverified cleartext host (MASVS-PLATFORM-3).
 */

import type { LinkingOptions } from '@react-navigation/native';
import type { MainTabParamList } from './types';
import { IS_DEV } from '../config/env';

export const linking: LinkingOptions<MainTabParamList> = {
  prefixes: [
    'https://fleet.karins.in',
    'https://testfleet.karins.in',
    ...(IS_DEV ? ['http://localhost:3000'] : []),
  ],
  config: {
    screens: {
      More: {
        screens: {
          RechargeStatus: 'transaction/recharge',
        },
      },
    },
  },
};
