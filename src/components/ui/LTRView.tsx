import { StyleSheet, View, type ViewProps } from 'react-native';

export function LTRView({ style, children, ...rest }: ViewProps) {
  return (
    <View style={[styles.ltr, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  ltr: { direction: 'ltr' },
});
