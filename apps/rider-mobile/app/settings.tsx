import {
  AppButton,
  AppScreen,
  AppText,
  AppTopBar,
  SettingsRow,
  SettingsSection,
  colors,
  spacing,
} from "@sokoni-digital/ui";
import { router, type Href } from "expo-router";
import { Alert, Linking, StyleSheet, View } from "react-native";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { clearAssignment } from "@/features/delivery/assignment-cache";
import { mobileSupabase } from "@/lib/supabase";

export default function RiderSettingsScreen() {
  const chevron = <IconSymbol color={colors.textSecondary} name="chevron.right" size={20} />;

  function signOut(): void {
    Alert.alert(
      "Sign out of the rider app?",
      "Do not sign out during a delivery or while proof is waiting to upload.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: () =>
            void mobileSupabase.auth
              .signOut()
              .then(() => clearAssignment())
              .then(() => router.replace("/(public)/sign-in"))
              .catch((error: unknown) =>
                Alert.alert(
                  "Could not sign out",
                  error instanceof Error ? error.message : "Try again.",
                ),
              ),
        },
      ],
    );
  }

  return (
    <AppScreen scroll contentStyle={styles.content}>
      <AppTopBar
        backIcon={<IconSymbol color={colors.textPrimary} name="chevron.left" />}
        onBack={() =>
          router.canGoBack() ? router.back() : router.replace("/(tabs)/profile" as Href)
        }
        title="Settings"
      />
      <View style={styles.intro}>
        <AppText variant="heading1">Rider settings</AppText>
        <AppText color="secondary">
          Manage device access and understand the safeguards around delivery work.
        </AppText>
      </View>

      <SettingsSection title="Delivery preferences">
        <SettingsRow
          description="Go online or offline and update your matching location from the Home tab."
          title="Availability"
          value="Home"
        />
        <SettingsRow
          description="Safe arrival and in-transit events retry when connectivity returns."
          title="Low-data delivery mode"
          value="Automatic"
        />
        <SettingsRow
          description="The current application language."
          title="Language"
          value="English"
        />
      </SettingsSection>

      <SettingsSection title="Permissions">
        <SettingsRow
          description="Manage foreground location, camera, photos, and notification permissions."
          onPress={() => void Linking.openSettings()}
          title="Device permissions"
          trailingIcon={chevron}
        />
        <SettingsRow
          description="E-Katale uses foreground snapshots, not continuous background tracking."
          title="Location sharing"
          value="Foreground only"
        />
      </SettingsSection>

      <SettingsSection title="Privacy and security">
        <SettingsRow
          description="PIN confirmation and proof upload cannot be completed offline."
          title="Protected handover"
          value="Required"
        />
        <SettingsRow
          description="Delivery photos are compressed, stored privately, and shared through expiring links."
          title="Proof evidence"
          value="Private"
        />
        <SettingsRow
          description="Complete or safely hand over active work before ending this session."
          title="Account session"
          value="Secure"
        />
      </SettingsSection>

      <AppButton label="Sign out" onPress={signOut} variant="secondary" />
      <AppText align="center" color="secondary" variant="caption">
        E-Katale Rider · Operational account settings
      </AppText>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  intro: { gap: spacing.xs },
});
