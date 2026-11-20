import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export type LiveState = 'connecting' | 'live' | 'offline';
/** Subscribes to hospital-scoped server events and refreshes the relevant data. Falls back to polling when offline. */
export function useRealtime(enabled: boolean): LiveState {
  const qc = useQueryClient();
  const [state, setState] = useState<LiveState>('connecting');
  const timer = useRef<number>();
  useEffect(() => {
    if (!enabled) return;
    let ws: WebSocket | null = null; let closed = false; let retry = 1000; let pending = new Set<string>();
    const flush = () => { timer.current = undefined; pending.forEach((k) => qc.invalidateQueries({ queryKey: [k] })); pending = new Set(); };
    const queue = (...keys: string[]) => { keys.forEach((k) => pending.add(k)); if (!timer.current) timer.current = window.setTimeout(flush, 800); };
    const connect = () => {
      const wsUrl = import.meta.env.VITE_WS_URL || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
ws = new WebSocket(wsUrl);      ws.onopen = () => { setState('live'); retry = 1000; };
      ws.onmessage = (m) => {
        const e = JSON.parse(m.data) as { type: string };
        if (e.type === 'observation.stored') queue('overview', 'observations', 'dashboard', 'intelligence');
        else if (e.type.startsWith('alert.')) queue('alerts', 'alert', 'response-log', 'overview', 'dashboard', 'notifications', 'activity');
        else if (e.type === 'device.connection') queue('devices', 'overview', 'dashboard', 'activity');
        else if (e.type === 'notification.created') queue('notifications');
        else if (e.type === 'newborn.lifecycle') queue('newborns', 'newborn', 'overview', 'dashboard', 'activity');
      };
      ws.onclose = () => { setState('offline'); if (!closed) setTimeout(connect, (retry = Math.min(retry * 2, 15000))); };
    };
    connect();
    return () => { closed = true; ws?.close(); };
  }, [enabled, qc]);
  return state;
}
