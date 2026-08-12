/**
 * Hook for screens that need a live unread notification count badge.
 * Listens to local inbox events; does not poll/re-fetch the dashboard on its own
 * (that was re-posting tray alerts and refreshing the notifications menu forever).
 */

import { useCallback, useEffect, useState } from 'react';
import { getUnreadNotificationCount } from '../../../services/notifications/notificationCenter';
import { notificationEvents } from '../../../services/notifications/notificationEvents';

export function useUnreadNotificationCount(): number {
  const [count, setCount] = useState(() => getUnreadNotificationCount());

  const reloadLocal = useCallback(() => {
    setCount(getUnreadNotificationCount());
  }, []);

  useEffect(() => {
    reloadLocal();
    return notificationEvents.subscribe(reloadLocal);
  }, [reloadLocal]);

  return count;
}
