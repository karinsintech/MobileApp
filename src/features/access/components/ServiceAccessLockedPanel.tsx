/**
 * Locked-service shell for Vahan / eChallan / Sarathi.
 * Step 1: lock intro (mock order). Step 2: Request Access form screen.
 */

import React, { useEffect, useMemo, useState } from 'react';
import type { ServiceAccessKey } from '../../../types/serviceAccess';
import { getServiceLockCopy } from '../serviceAccessCopy';
import ServiceAccessLockIntro from './ServiceAccessLockIntro';
import ServiceAccessRequestScreen from './ServiceAccessRequestScreen';

type LockStep = 'intro' | 'request';

interface ServiceAccessLockedPanelProps {
  serviceKey: ServiceAccessKey;
  serviceLabel?: string;
  initialName?: string;
  initialMobile?: string;
  initialEmail?: string;
  /** Profile Request Access opens the form directly; menu entry still starts on intro. */
  initialStep?: LockStep;
}

export default function ServiceAccessLockedPanel({
  serviceKey,
  serviceLabel,
  initialName = '',
  initialMobile = '',
  initialEmail = '',
  initialStep = 'intro',
}: ServiceAccessLockedPanelProps) {
  const [step, setStep] = useState<LockStep>(initialStep);

  // Profile may re-navigate with openRequestForm while this panel is still mounted.
  useEffect(() => {
    setStep(initialStep);
  }, [initialStep]);

  const copy = useMemo(() => {
    const base = getServiceLockCopy(serviceKey);
    if (serviceLabel?.trim()) {
      return { ...base, serviceLabel: serviceLabel.trim() };
    }
    return base;
  }, [serviceKey, serviceLabel]);

  if (step === 'request') {
    return (
      <ServiceAccessRequestScreen
        copy={copy}
        initialName={initialName}
        initialMobile={initialMobile}
        initialEmail={initialEmail}
        onBack={() => setStep('intro')}
      />
    );
  }

  return (
    <ServiceAccessLockIntro
      copy={copy}
      onRequestAccess={() => setStep('request')}
    />
  );
}
