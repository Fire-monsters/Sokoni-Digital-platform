import { AppButton, AppScreen, AppText, AppTextField, colors, spacing } from "@sokoni-digital/ui";
import { router, type Href } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { useListingEditor } from "@/features/listings/editor-store";
import { useCreateVendorListing, useProducts } from "@/features/listings/hooks";

export default function NewListingScreen() {
  const editor = useListingEditor();
  const products = useProducts();
  const createListing = useCreateVendorListing();

  const submit = () => {
    const quantity = Number(editor.packageQuantity);
    const price = Number(editor.proposedPriceUgx);
    if (
      !editor.catalogProductId ||
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      !Number.isInteger(price) ||
      price <= 0
    )
      return;
    createListing.mutate(
      {
        catalogProductId: editor.catalogProductId,
        packageQuantity: quantity,
        packageUnit: editor.packageUnit,
        description: editor.description || undefined,
        proposedPriceUgx: price,
      },
      {
        onSuccess: (listing) => {
          editor.reset();
          router.replace(`/listings/${listing.id}` as Href);
        },
      },
    );
  };

  return (
    <AppScreen scroll contentStyle={styles.content}>
      <AppText variant="heading1">Create a listing</AppText>
      <AppText color="secondary">
        1. Product · 2. Package · 3. Price · 4. Images · 5. Review
      </AppText>

      <View style={styles.section}>
        <AppText variant="heading3">1. Select product</AppText>
        <View style={styles.products}>
          {products.data?.map((product) => (
            <Pressable
              key={product.id}
              onPress={() => editor.setField("catalogProductId", product.id)}
              style={[
                styles.product,
                editor.catalogProductId === product.id ? styles.selected : null,
              ]}
            >
              <AppText variant="label">{product.name}</AppText>
              <AppText color="secondary" variant="caption">
                {product.categoryName}
              </AppText>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <AppText variant="heading3">2. Define package</AppText>
        <AppTextField
          label="Quantity"
          keyboardType="decimal-pad"
          value={editor.packageQuantity}
          onChangeText={(value) => editor.setField("packageQuantity", value)}
        />
        <AppTextField
          label="Unit"
          value={editor.packageUnit}
          onChangeText={(value) => editor.setField("packageUnit", value)}
          placeholder="kg, bunch, tray…"
        />
        <AppTextField
          label="Short description"
          value={editor.description}
          onChangeText={(value) => editor.setField("description", value)}
        />
      </View>

      <View style={styles.section}>
        <AppText variant="heading3">3. Propose price</AppText>
        <AppTextField
          label="Price in UGX"
          keyboardType="number-pad"
          value={editor.proposedPriceUgx}
          onChangeText={(value) => editor.setField("proposedPriceUgx", value)}
        />
        <AppText color="secondary" variant="caption">
          The approved public price will not change until an administrator accepts this proposal.
        </AppText>
      </View>

      {createListing.isError ? (
        <AppText style={styles.error}>{createListing.error.message}</AppText>
      ) : null}
      <AppButton
        label="Create draft and add images"
        loading={createListing.isPending}
        onPress={submit}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  section: { gap: spacing.sm },
  products: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  product: {
    width: "47%",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: spacing.sm,
  },
  selected: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  error: { color: colors.error },
});
