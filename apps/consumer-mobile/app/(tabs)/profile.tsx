import {
  AppButton,
  AppScreen,
  AppText,
  AppTopBar,
  ProfileDetailSection,
  ProfileSummaryCard,
  colors,
  spacing,
} from "@sokoni-digital/ui";
import { router } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { useConsumerAuth } from "@/features/auth/auth-provider";

function textMetadata(metadata: Record<string, unknown>, key: string): string | undefined {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function goBackOrHome(): void {
  if (router.canGoBack()) router.back();
  else router.navigate("/(tabs)");
}

export default function ConsumerProfileScreen() {
  const { session, loading } = useConsumerAuth();

  if (loading) {
    return (
      <AppScreen contentStyle={styles.content}>
        <AppTopBar
          backIcon={<IconSymbol color={colors.textPrimary} name="chevron.left" />}
          onBack={goBackOrHome}
          title="My profile"
        />
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
          <AppText color="secondary">Loading your profile…</AppText>
        </View>
      </AppScreen>
    );
  }

  const user = session?.user;
  const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const displayName =
    textMetadata(metadata, "full_name") ??
    textMetadata(metadata, "name") ??
    user?.phone ??
    user?.email ??
    "E-Katale shopper";
  const contact = user?.phone ?? user?.email;
  const provider = user?.app_metadata.provider;

  return (
    <AppScreen scroll contentStyle={styles.content}>
      <AppTopBar
        actionIcon={<IconSymbol color={colors.textPrimary} name="gearshape.fill" />}
        backIcon={<IconSymbol color={colors.textPrimary} name="chevron.left" />}
        onAction={() => router.push("/settings")}
        onBack={goBackOrHome}
        title="My profile"
      />

      {!user ? (
        <View style={styles.guestCard}>
          <View style={styles.guestIcon}>
            <IconSymbol color={colors.primary} name="person.crop.circle.fill" size={48} />
          </View>
          <AppText align="center" variant="heading2">
            Sign in to view your profile
          </AppText>
          <AppText align="center" color="secondary">
            Your cart can remain on this device while you securely access orders and delivery
            details.
          </AppText>
          <AppButton label="Sign in" onPress={() => router.push("/sign-in")} />
        </View>
      ) : (
        <>
          <ProfileSummaryCard
            contact={contact}
            name={displayName}
            roleLabel="Consumer"
            statusLabel={user.email_confirmed_at || user.phone_confirmed_at ? "Verified" : "Active"}
          />
          <ProfileDetailSection
            title="Personal information"
            details={[
              { label: "Full name", value: displayName },
              {
                label: user.phone ? "Phone number" : "Email address",
                value: contact ?? "Not added",
              },
              {
                label: "Contact verification",
                value: user.email_confirmed_at || user.phone_confirmed_at ? "Verified" : "Pending",
              },
            ]}
          />
          <ProfileDetailSection
            title="Account"
            details={[
              { label: "Account type", value: "Consumer" },
              {
                label: "Sign-in method",
                value: typeof provider === "string" ? provider : "Secure account",
              },
              {
                label: "Member since",
                value: new Date(user.created_at).toLocaleDateString(),
              },
              {
                label: "User ID",
                value: user.id,
                hint: "Use this identifier when contacting support about your account.",
              },
            ]}
          />
        </>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm },
  guestCard: {
    alignItems: "center",
    gap: spacing.md,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.xl,
  },
  guestIcon: {
    width: 84,
    height: 84,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 42,
    backgroundColor: colors.primaryLight,
  },
});
