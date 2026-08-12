import { AppButton, AppScreen, AppText, AppTextField, spacing } from "@sokoni-digital/ui";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet } from "react-native";

import { useUpdateVendorListing, useVendorListing } from "@/features/listings/hooks";

export default function EditListingScreen() {
  const { listingId = "" } = useLocalSearchParams<{ listingId: string }>();
  const listing = useVendorListing(listingId);
  const update = useUpdateVendorListing(listingId);
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (listing.data) {
      setQuantity(String(listing.data.packageQuantity));
      setUnit(listing.data.packageUnit);
      setDescription(listing.data.description ?? "");
    }
  }, [listing.data]);

  const save = () => {
    const packageQuantity = Number(quantity);
    if (!Number.isFinite(packageQuantity) || packageQuantity <= 0 || !unit.trim()) return;
    update.mutate(
      { packageQuantity, packageUnit: unit.trim(), description: description.trim() },
      { onSuccess: () => router.back() },
    );
  };

  return (
    <AppScreen scroll contentStyle={styles.content}>
      <AppText variant="heading1">Edit package</AppText>
      <AppText color="secondary">
        Changes-requested listings return to draft while you edit.
      </AppText>
      <AppTextField
        label="Quantity"
        keyboardType="decimal-pad"
        value={quantity}
        onChangeText={setQuantity}
      />
      <AppTextField label="Unit" value={unit} onChangeText={setUnit} />
      <AppTextField label="Description" value={description} onChangeText={setDescription} />
      {update.isError ? <AppText>{update.error.message}</AppText> : null}
      <AppButton label="Save draft" loading={update.isPending} onPress={save} />
    </AppScreen>
  );
}

const styles = StyleSheet.create({ content: { gap: spacing.lg } });
