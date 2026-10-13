/**
 * Stack-screen wrapper for enrollment gates — same IDs as web ServiceFeatureGate
 * (echallan / vahan / sarathi). Compose after privilege guards so Role Management
 * and service enrollment both apply on deep links.
 */

import React from 'react';
import ServiceFeatureGate from '../features/access/components/ServiceFeatureGate';
import type { ServiceAccessKey } from '../types/serviceAccess';

export function createServiceAccessScreen(
  Screen: React.ComponentType<any>,
  serviceKey: ServiceAccessKey,
  serviceLabel?: string,
) {
  function ServiceAccessGuardedScreen(props: any) {
    // Profile "Request Access" navigates here with openRequestForm to skip the intro.
    const openRequestForm = Boolean(props?.route?.params?.openRequestForm);
    return (
      <ServiceFeatureGate
        serviceKey={serviceKey}
        serviceLabel={serviceLabel}
        initialLockStep={openRequestForm ? 'request' : 'intro'}
      >
        <Screen {...props} />
      </ServiceFeatureGate>
    );
  }

  const screenName = Screen.displayName || Screen.name || 'Screen';
  ServiceAccessGuardedScreen.displayName = `ServiceAccessGate(${serviceKey},${screenName})`;
  return ServiceAccessGuardedScreen;
}
