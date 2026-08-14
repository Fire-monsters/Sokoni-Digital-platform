import {
  AppScreen,
  AppText,
  AppTopBar,
  ProfileDetailSection,
  ProfileSummaryCard,
  colors,
  spacing,
} from "@sokoni-digital/ui";
import { router, type Href } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { useRiderStatus } from "@/features/delivery/hooks";
import { useMobileUser } from "@/features/profile/use-mobile-user";
import { useProtectedRoute } from "@/hooks/use-auth-session";

function textMetadata(metadata: Record<string, unknown>, key: string): string | undefined {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function goBackOrHome(): void {
  if (router.canGoBack()) router.back();
  else router.navigate("/(tabs)");
}

export default function RiderProfileScreen() {
  const { isAllowed } = useProtectedRoute("operations");
  const { user, loading } = useMobileUser();
  const status = useRiderStatus();

  if (!isAllowed) return null;
  if (loading || status.isPending) {
    return (
      <AppScreen contentStyle={styles.content}>
        <AppTopBar
          backIcon={<IconSymbol color={colors.textPrimary} name="chevron.left" />}
          onBack={goBackOrHome}
          title="My profile"
        />
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
          <AppText color="secondary">Loading rider profile…</AppText>
        </View>
      </AppScreen>
    );
  }

  const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const name =
    status.data?.displayName ??
    textMetadata(metadata, "full_name") ??
    textMetadata(metadata, "name") ??
    user?.phone ??
    "E-Katale rider";
  const contact = user?.phone ?? user?.email ?? "Contact not available";
  const verification = status.data?.verificationStatus ?? "pending";

  return (
    <AppScreen scroll contentStyle={styles.content}>
      <AppTopBar
        actionIcon={<IconSymbol color={colors.textPrimary} name="gearshape.fill" />}
        backIcon={<IconSymbol color={colors.textPrimary} name="chevron.left" />}
        onAction={() => router.push("/settings" as Href)}
        onBack={goBackOrHome}
        title="My profile"
      />
      <ProfileSummaryCard
        contact={contact}
        name={name}
        roleLabel="Delivery rider"
        statusLabel={verification.replaceAll("_", " ")}
      />
      <ProfileDetailSection
        title="Personal information"
        details={[
          { label: "Full name", value: name },
          { label: user?.phone ? "Phone number" : "Email address", value: contact },
          {
            label: "Contact verification",
            value: user?.phone_confirmed_at || user?.email_confirmed_at ? "Verified" : "Pending",
          },
        ]}
      />
      <ProfileDetailSection
        title="Rider account"
        details={[
          { label: "Approval status", value: verification.replaceAll("_", " ") },
          {
            label: "Availability",
            value: status.data?.availability.replaceAll("_", " ") ?? "Unavailable",
            hint: "Availability and active-trip states are managed from the rider home screen.",
          },
          {
            label: "Offer location",
            value: status.data?.locationIsFresh ? "Current" : "Update needed",
            hint: "Only foreground snapshots are shared for offers and active delivery progress.",
          },
          {
            label: "Transporter ID",
            value: status.data?.transporterId ?? "Not assigned",
          },
        ]}
      />
      {user ? (
        <ProfileDetailSection
          title="Security"
          details={[
            { label: "User ID", value: user.id },
            { label: "Member since", value: new Date(user.created_at).toLocaleDateString() },
          ]}
        />
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm },
});
