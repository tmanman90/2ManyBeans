import { Capacitor } from '@capacitor/core';

// Haptic feedback helpers — no-op on web, native haptics on iOS
export const haptic = {
  async light() {
    if (!Capacitor.isNativePlatform()) return;
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    await Haptics.impact({ style: ImpactStyle.Light });
  },
  async medium() {
    if (!Capacitor.isNativePlatform()) return;
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    await Haptics.impact({ style: ImpactStyle.Medium });
  },
  async heavy() {
    if (!Capacitor.isNativePlatform()) return;
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    await Haptics.impact({ style: ImpactStyle.Heavy });
  },
  async success() {
    if (!Capacitor.isNativePlatform()) return;
    const { Haptics, NotificationType } = await import('@capacitor/haptics');
    await Haptics.notification({ type: NotificationType.Success });
  },
  async selection() {
    if (!Capacitor.isNativePlatform()) return;
    const { Haptics } = await import('@capacitor/haptics');
    await Haptics.selectionChanged();
  },
};
