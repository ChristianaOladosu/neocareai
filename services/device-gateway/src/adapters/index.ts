import type { DeviceAdapter } from '../normalisation/types.js';
import { simulatorAdapter } from './simulator.adapter.js';
export const adapters: Record<string, DeviceAdapter> = { simulator: simulatorAdapter };
