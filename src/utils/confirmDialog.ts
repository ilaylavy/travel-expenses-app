// Cross-platform confirm dialog. Native uses Alert.alert with two buttons
// (cancel + confirm). Web falls back to window.confirm — react-native-web
// stubs the multi-button form of Alert.alert into a no-op (the destructive
// button's onPress callback never fires), which silently broke every
// "are you sure?" prompt in the app on web before this helper existed.
import { Alert, Platform } from 'react-native';

export interface ConfirmDialogOptions {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  // When true the native variant uses 'destructive' style (red text on iOS).
  // Web ignores this — window.confirm has no styling hook.
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
}

export function showConfirmDialog(opts: ConfirmDialogOptions): void {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return;
    const ok = window.confirm(`${opts.title}\n\n${opts.body}`);
    if (ok) {
      void opts.onConfirm();
    } else {
      opts.onCancel?.();
    }
    return;
  }
  Alert.alert(opts.title, opts.body, [
    {
      text: opts.cancelLabel,
      style: 'cancel',
      onPress: () => {
        opts.onCancel?.();
      },
    },
    {
      text: opts.confirmLabel,
      style: opts.destructive ? 'destructive' : 'default',
      onPress: () => {
        void opts.onConfirm();
      },
    },
  ]);
}
