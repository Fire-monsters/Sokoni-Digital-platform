import { parseRiderMotorcycleDetails } from '@sokoni-digital/validation';
import { AppButton, AppScreen, AppText, AppTextField, UploadCard, colors, spacing } from '@sokoni-digital/ui';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

const vehicleTypeOptions = [
  { label: 'Motorcycle', value: 'motorcycle' },
  { label: 'Bicycle', value: 'bicycle' },
  { label: 'Tuk-tuk', value: 'tuk-tuk' },
] as const;

type VehicleType = (typeof vehicleTypeOptions)[number]['value'];

export default function RiderMotorcycleDetailsScreen() {
  const [motorcycleNumberPlate, setMotorcycleNumberPlate] = useState('');
  const [vehicleType, setVehicleType] = useState<VehicleType | ''>('');
  const [primaryOperatingArea, setPrimaryOperatingArea] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    motorcycleNumberPlate?: string;
    vehicleType?: string;
    primaryOperatingArea?: string;
  }>({});

  function continueToAssociationDetails() {
    const result = parseRiderMotorcycleDetails({
      motorcycleNumberPlate,
      vehicleType,
      primaryOperatingArea,
    });

    if (!result.success) {
      setFieldErrors(result.fieldErrors);
      return;
    }

    setFieldErrors({});
    router.push('./association-and-next-of-kin');
  }

  return (
    <AppScreen scroll>
      <View style={styles.header}>
        <AppText variant="heading1">Motorcycle details</AppText>
        <AppText color="secondary" variant="bodyLarge">
          Add the vehicle and operating area information used for delivery approval.
        </AppText>
      </View>

      <View style={styles.form}>
        <AppTextField
          autoComplete="off"
          error={fieldErrors.motorcycleNumberPlate}
          label="Motorcycle number plate"
          onChangeText={(value) => {
            setMotorcycleNumberPlate(value);
            if (fieldErrors.motorcycleNumberPlate) {
              setFieldErrors((currentErrors) => ({ ...currentErrors, motorcycleNumberPlate: undefined }));
            }
          }}
          placeholder="UXX 123X"
          value={motorcycleNumberPlate}
        />

        <View style={styles.optionGroup}>
          <AppText variant="label">Vehicle type</AppText>
          <View style={styles.optionGrid}>
            {vehicleTypeOptions.map((option) => {
              const isSelected = vehicleType === option.value;

              return (
                <Pressable
                  accessibilityLabel={option.label}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isSelected }}
                  key={option.value}
                  onPress={() => {
                    setVehicleType(option.value);
                    if (fieldErrors.vehicleType) {
                      setFieldErrors((currentErrors) => ({ ...currentErrors, vehicleType: undefined }));
                    }
                  }}
                  style={({ pressed }) => [
                    styles.optionChip,
                    isSelected ? styles.optionChipSelected : null,
                    pressed ? styles.optionChipPressed : null,
                  ]}>
                  <AppText color={isSelected ? 'inverse' : 'primary'} variant="label">
                    {option.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
          {fieldErrors.vehicleType ? (
            <AppText color="secondary" style={styles.fieldError} variant="caption">
              {fieldErrors.vehicleType}
            </AppText>
          ) : null}
        </View>

        <AppTextField
          autoComplete="street-address"
          error={fieldErrors.primaryOperatingArea}
          label="Primary operating area"
          onChangeText={(value) => {
            setPrimaryOperatingArea(value);
            if (fieldErrors.primaryOperatingArea) {
              setFieldErrors((currentErrors) => ({ ...currentErrors, primaryOperatingArea: undefined }));
            }
          }}
          placeholder="Kitooro, Entebbe"
          textContentType="location"
          value={primaryOperatingArea}
        />

        <UploadCard
          title="Motorcycle photograph"
          description="Upload a clear side view of the vehicle used for deliveries."
          onPress={() => {
            Alert.alert('Upload motorcycle photo', 'Camera capture and compression will be connected in the document upload slice.');
          }}
        />
      </View>

      <View style={styles.actions}>
        <AppButton label="Continue" onPress={continueToAssociationDetails} />
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
  optionGroup: {
    gap: spacing.xs,
  },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  optionChip: {
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  optionChipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  optionChipPressed: {
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
