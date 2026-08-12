import { AppButton, AppScreen, AppText, colors, spacing } from "@sokoni-digital/ui";
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";

export default function RiderSignInScreen() {
  return (
    <AppScreen>
      <View style={styles.content}>
        <View style={styles.copy}>
          <AppText variant="heading1">Welcome back</AppText>
          <AppText color="secondary" variant="bodyLarge">
            Sign in with your verified rider phone number and password.
          </AppText>
        </View>

        <View style={styles.notice}>
          <AppText color="secondary">
            Password sign-in will connect to Supabase Auth in the next rider authentication slice.
          </AppText>
        </View>
      </View>

      <View style={styles.actions}>
        <AppButton
          label="Forgot password?"
          onPress={() => {
            router.push({ pathname: "../(auth)/forgot-password" });
          }}
          variant="secondary"
        />
        <AppButton
          label="Register as a rider"
          onPress={() => {
            router.push("/(auth)/phone");
          }}
        />
        <AppButton
          label="Back"
          onPress={() => {
            router.back();
          }}
          variant="ghost"
        />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    gap: spacing.lg,
  },
  copy: {
    gap: spacing.sm,
  },
  notice: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  actions: {
    gap: spacing.sm,
  },
});
