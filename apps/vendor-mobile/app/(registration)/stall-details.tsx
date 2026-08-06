import { parseVendorStallDetails } from '@sokoni-digital/validation';
import { AppButton, AppScreen, AppText, AppTextField, UploadCard, colors, spacing } from '@sokoni-digital/ui';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

const productCategoryOptions = [
  'Fresh produce',
  'Ready-to-cook foods',
  'Household essentials',
  'Packaged groceries',
];

export default function VendorStallDetailsScreen() {
  const [businessName, setBusinessName] = useState('');
  const [stallNumber, setStallNumber] = useState('');
  const [productCategories, setProductCategories] = useState<string[]>([]);
  const [marketIdentificationNumber, setMarketIdentificationNumber] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    businessName?: string;
    stallNumber?: string;
    productCategories?: string;
    marketIdentificationNumber?: string;
  }>({});

  function toggleProductCategory(category: string) {
    setProductCategories((currentCategories) =>
      currentCategories.includes(category)
        ? currentCategories.filter((currentCategory) => currentCategory !== category)
        : [...currentCategories, category],
    );

    if (fieldErrors.productCategories) {
      setFieldErrors((currentErrors) => ({ ...currentErrors, productCategories: undefined }));
    }
  }

  function continueToVerification() {
    const result = parseVendorStallDetails({
      businessName,
      stallNumber,
      productCategories,
      marketIdentificationNumber,
    });

    if (!result.success) {
      setFieldErrors(result.fieldErrors);
      return;
    }

    setFieldErrors({});
    router.push('./verification');
  }

  return (
    <AppScreen scroll>
      <View style={styles.header}>
        <AppText variant="heading1">Stall details</AppText>
        <AppText color="secondary" variant="bodyLarge">
          Tell us where you sell and what customers can expect from your stall.
        </AppText>
      </View>

      <View style={styles.form}>
        <AppTextField
          autoComplete="organization"
          error={fieldErrors.businessName}
          label="Business or stall name"
          onChangeText={(value) => {
            setBusinessName(value);
            if (fieldErrors.businessName) {
              setFieldErrors((currentErrors) => ({ ...currentErrors, businessName: undefined }));
            }
          }}
          placeholder="Auntie Sarah Fresh Foods"
          textContentType="organizationName"
          value={businessName}
        />
        <AppTextField
          autoComplete="off"
          error={fieldErrors.stallNumber}
          label="Kitooro stall number"
          onChangeText={(value) => {
            setStallNumber(value);
            if (fieldErrors.stallNumber) {
              setFieldErrors((currentErrors) => ({ ...currentErrors, stallNumber: undefined }));
            }
          }}
          placeholder="Block A, Stall 12"
          value={stallNumber}
        />

        <View style={styles.categoryGroup}>
          <AppText variant="label">Product categories</AppText>
          <View style={styles.categoryGrid}>
            {productCategoryOptions.map((category) => {
              const isSelected = productCategories.includes(category);

              return (
                <Pressable
                  accessibilityLabel={category}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isSelected }}
                  key={category}
                  onPress={() => {
                    toggleProductCategory(category);
                  }}
                  style={({ pressed }) => [
                    styles.categoryChip,
                    isSelected ? styles.categoryChipSelected : null,
                    pressed ? styles.categoryChipPressed : null,
                  ]}>
                  <AppText color={isSelected ? 'inverse' : 'primary'} variant="label">
                    {category}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
          {fieldErrors.productCategories ? (
            <AppText color="secondary" style={styles.fieldError} variant="caption">
              {fieldErrors.productCategories}
            </AppText>
          ) : null}
        </View>

        <AppTextField
          autoComplete="off"
          error={fieldErrors.marketIdentificationNumber}
          label="Market identification number"
          onChangeText={(value) => {
            setMarketIdentificationNumber(value);
            if (fieldErrors.marketIdentificationNumber) {
              setFieldErrors((currentErrors) => ({ ...currentErrors, marketIdentificationNumber: undefined }));
            }
          }}
          placeholder="KTM-2026-001"
          value={marketIdentificationNumber}
        />

        <UploadCard
          title="Market identification image"
          description="Upload a clear photo of your market ID or vendor card."
          onPress={() => {
            Alert.alert('Upload market ID', 'Private document upload will be connected in the document upload slice.');
          }}
        />
      </View>

      <View style={styles.actions}>
        <AppButton label="Continue" onPress={continueToVerification} />
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
  header: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  form: {
    gap: spacing.md,
  },
  categoryGroup: {
    gap: spacing.xs,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  categoryChip: {
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  categoryChipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  categoryChipPressed: {
    opacity: 0.78,
  },
  fieldError: {
    color: colors.error,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
});
