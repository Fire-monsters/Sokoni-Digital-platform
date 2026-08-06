import { parsePersonalIdentityDetails } from '@sokoni-digital/validation';
import { AppButton, AppScreen, AppText, AppTextField, UploadCard, colors, spacing } from '@sokoni-digital/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

export default function RiderPersonalDetailsScreen() {
  const { phoneNumber } = useLocalSearchParams<{ phoneNumber?: string }>();
  const [fullName, setFullName] = useState('');
  const [nationalIdNumber, setNationalIdNumber] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ fullName?: string; nationalIdNumber?: string }>({});

  function continueToMotorcycleDetails() {
    const result = parsePersonalIdentityDetails({ fullName, nationalIdNumber });

    if (!result.success) {
      setFieldErrors(result.fieldErrors);
      return;
    }

    setFieldErrors({});
    router.push('./motorcycle-details');
  }

  return (
    <AppScreen scroll>
      <View style={styles.header}>
        <AppText variant="heading1">Personal details</AppText>
        <AppText color="secondary" variant="bodyLarge">
          Add the identity information linked to {phoneNumber ?? 'your verified phone number'}.
        </AppText>
      </View>

      <View style={styles.form}>
        <AppTextField
          autoComplete="name"
          error={fieldErrors.fullName}
          label="Full name"
          onChangeText={(value) => {
            setFullName(value);
            if (fieldErrors.fullName) {
              setFieldErrors((currentErrors) => ({ ...currentErrors, fullName: undefined }));
            }
          }}
          placeholder="Name on your National ID"
          textContentType="name"
          value={fullName}
        />
        <AppTextField
          autoComplete="off"
          error={fieldErrors.nationalIdNumber}
          label="National ID number"
          onChangeText={(value) => {
            setNationalIdNumber(value);
            if (fieldErrors.nationalIdNumber) {
              setFieldErrors((currentErrors) => ({ ...currentErrors, nationalIdNumber: undefined }));
            }
          }}
          placeholder="CM..."
          value={nationalIdNumber}
        />

        <View style={styles.uploads}>
          <UploadCard
            title="Rider photograph"
            description="A clear photo of the registered rider."
            onPress={() => {
              Alert.alert('Upload photo', 'Camera capture and compression will be connected in the document upload slice.');
            }}
          />
          <UploadCard
            title="National ID front"
            description="Upload the front side of your National ID."
            onPress={() => {
              Alert.alert('Upload ID front', 'Private document upload will be connected in the document upload slice.');
            }}
          />
          <UploadCard
            title="National ID back"
            description="Upload the back side of your National ID."
            onPress={() => {
              Alert.alert('Upload ID back', 'Private document upload will be connected in the document upload slice.');
            }}
          />
        </View>

        <View style={styles.notice}>
          <AppText color="secondary" variant="caption">
            Submitted identity details will require a controlled correction workflow after review.
          </AppText>
        </View>
      </View>

      <View style={styles.actions}>
        <AppButton label="Continue" onPress={continueToMotorcycleDetails} />
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
  uploads: {
    gap: spacing.sm,
  },
  notice: {
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
    paddingLeft: spacing.sm,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
});
