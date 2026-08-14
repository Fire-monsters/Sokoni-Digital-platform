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
import { router } from "expo-router";
import { Alert, Linking, StyleSheet, View } from "react-native";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { useConsumerAuth } from "@/features/auth/auth-provider";
import { useCatalogueInterface } from "@/features/catalogue/catalogue-store";

export default function ConsumerSettingsScreen() {
  const auth = useConsumerAuth();
  const reducedData = useCatalogueInterface((state) => state.reducedData);
  const toggleReducedData = useCatalogueInterface((state) => state.toggleReducedData);
  const chevron = <IconSymbol color={colors.textSecondary} name="chevron.right" size={20} />;

  function signOut(): void {
    Alert.alert("Sign out?", "Your saved guest cart will remain on this device.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: () =>
          void auth
            .signOut()
            .then(() => router.replace("/(tabs)"))
            .catch((error: unknown) =>
              Alert.alert(
                "Could not sign out",
                error instanceof Error ? error.message : "Try again.",
              ),
            ),
      },
    ]);
  }

  return (
    <AppScreen scroll contentStyle={styles.content}>
      <AppTopBar
        backIcon={<IconSymbol color={colors.textPrimary} name="chevron.left" />}
        onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/profile"))}
        title="Settings"
      />
      <View style={styles.intro}>
        <AppText variant="heading1">Your preferences</AppText>
        <AppText color="secondary">
          Control data use, device permissions, privacy, and your authenticated session.
        </AppText>
      </View>

      <SettingsSection title="Shopping preferences">
        <SettingsRow
          description="Use thumbnails and avoid automatically loading large product images."
          onPress={toggleReducedData}
          title="Data saver"
          value={reducedData ? "On" : "Off"}
        />
        <SettingsRow
          description="The current application language."
          title="Language"
          value="English"
        />
      </SettingsSection>

      <SettingsSection title="Notifications and permissions">
        <SettingsRow
          description="Open device settings to manage notification and application permissions."
          onPress={() => void Linking.openSettings()}
          title="Device permissions"
          trailingIcon={chevron}
        />
        <SettingsRow
          description="Order and delivery events also remain available inside the application."
          title="Order updates"
          value="In app"
        />
      </SettingsSection>

      <SettingsSection title="Privacy and security">
        <SettingsRow
          description="Delivery evidence uses private, short-lived links and is never a public gallery."
          title="Private delivery evidence"
          value="Protected"
        />
        <SettingsRow
          description="Your delivery PIN should be shared only after checking the order and rider."
          title="Secure handover"
          value="PIN protected"
        />
      </SettingsSection>

      {auth.session ? <AppButton label="Sign out" onPress={signOut} variant="secondary" /> : null}
      <AppText align="center" color="secondary" variant="caption">
        E-Katale Consumer · Account and privacy settings
      </AppText>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  intro: { gap: spacing.xs },
});
