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
import { mobileSupabase } from "@/lib/supabase";
import { vendorQueryClient } from "@/lib/query-client";

export default function VendorSettingsScreen() {
  const chevron = <IconSymbol color={colors.textSecondary} name="chevron.right" size={20} />;

  function signOut(): void {
    Alert.alert(
      "Sign out of the vendor app?",
      "Uploaded drafts remain on the server. Confirm there are no packing photos waiting to upload.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: () =>
            void mobileSupabase.auth
              .signOut()
              .then(() => vendorQueryClient.clear())
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
        <AppText variant="heading1">Vendor settings</AppText>
        <AppText color="secondary">
          Review order, device, data, and security behavior for this vendor account.
        </AppText>
      </View>

      <SettingsSection title="Business preferences">
        <SettingsRow
          description="Listing availability is changed directly from the Home tab and safely retried."
          title="Stock availability"
          value="Home"
        />
        <SettingsRow
          description="Saved listings and order queues remain visible during weak connectivity."
          title="Low-data mode"
          value="Automatic"
        />
        <SettingsRow
          description="The current application language."
          title="Language"
          value="English"
        />
      </SettingsSection>

      <SettingsSection title="Notifications and permissions">
        <SettingsRow
          description="Manage camera, photo library, and notification permissions for this app."
          onPress={() => void Linking.openSettings()}
          title="Device permissions"
          trailingIcon={chevron}
        />
        <SettingsRow
          description="New orders and operational updates remain available in the Orders tab."
          title="Order updates"
          value="In app"
        />
      </SettingsSection>

      <SettingsSection title="Privacy and security">
        <SettingsRow
          description="Packing photographs are compressed and stored as private order evidence."
          title="Packing evidence"
          value="Private"
        />
        <SettingsRow
          description="Price changes are never public until an administrator approves them."
          title="Price approval"
          value="Required"
        />
        <SettingsRow
          description="Vendor and rider must both confirm a delivery pickup handover."
          title="Custody confirmation"
          value="Two-party"
        />
      </SettingsSection>

      <AppButton label="Sign out" onPress={signOut} variant="secondary" />
      <AppText align="center" color="secondary" variant="caption">
        E-Katale Vendor · Business account settings
      </AppText>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  intro: { gap: spacing.xs },
});
