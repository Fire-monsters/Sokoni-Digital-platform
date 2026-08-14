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
import { useVendorListings } from "@/features/listings/hooks";
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

export default function VendorProfileScreen() {
  const { isAllowed } = useProtectedRoute("operations");
  const { user, loading } = useMobileUser();
  const listings = useVendorListings();

  if (!isAllowed) return null;
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
          <AppText color="secondary">Loading vendor profile…</AppText>
        </View>
      </AppScreen>
    );
  }

  const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const name =
    textMetadata(metadata, "business_name") ??
    textMetadata(metadata, "full_name") ??
    textMetadata(metadata, "name") ??
    user?.phone ??
    "E-Katale vendor";
  const contact = user?.phone ?? user?.email ?? "Contact not available";
  const listingItems = listings.data ?? [];
  const activeListings = listingItems.filter((listing) => listing.status === "active").length;
  const pendingListings = listingItems.filter(
    (listing) => listing.status === "pending_approval",
  ).length;

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
        roleLabel="Marketplace vendor"
        statusLabel={listings.isError ? "Needs connection" : "Approved"}
      />
      <ProfileDetailSection
        title="Personal information"
        details={[
          { label: "Account name", value: name },
          { label: user?.phone ? "Phone number" : "Email address", value: contact },
          {
            label: "Contact verification",
            value: user?.phone_confirmed_at || user?.email_confirmed_at ? "Verified" : "Pending",
          },
        ]}
      />
      <ProfileDetailSection
        title="Vendor account"
        details={[
          {
            label: "Approval status",
            value: listings.isError ? "Could not verify" : "Approved",
            hint: "Operational access remains subject to marketplace approval.",
          },
          { label: "Active listings", value: String(activeListings) },
          { label: "Listings pending approval", value: String(pendingListings) },
          {
            label: "Total listings",
            value: listings.isPending ? "Loading…" : String(listingItems.length),
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
