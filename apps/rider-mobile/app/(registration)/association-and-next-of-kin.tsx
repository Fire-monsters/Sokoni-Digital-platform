import { parseRiderAssociationDetails } from '@sokoni-digital/validation';
import { AppButton, AppScreen, AppText, AppTextField, PhoneNumberField, spacing } from '@sokoni-digital/ui';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

export default function RiderAssociationAndNextOfKinScreen() {
  const [riderAssociation, setRiderAssociation] = useState('');
  const [associationIdentifier, setAssociationIdentifier] = useState('');
  const [nextOfKinName, setNextOfKinName] = useState('');
  const [nextOfKinPhone, setNextOfKinPhone] = useState('');
  const [nextOfKinRelationship, setNextOfKinRelationship] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    riderAssociation?: string;
    associationIdentifier?: string;
    nextOfKinName?: string;
    nextOfKinPhone?: string;
    nextOfKinRelationship?: string;
  }>({});

  function continueToVerification() {
    const result = parseRiderAssociationDetails({
      riderAssociation,
      associationIdentifier,
      nextOfKinName,
      nextOfKinPhone,
      nextOfKinRelationship,
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
        <AppText variant="heading1">Association and next-of-kin</AppText>
        <AppText color="secondary" variant="bodyLarge">
          Add the safety contact and rider association details used during approval.
        </AppText>
      </View>

      <View style={styles.form}>
        <AppTextField
          autoComplete="organization"
          error={fieldErrors.riderAssociation}
          label="Rider association"
          onChangeText={(value) => {
            setRiderAssociation(value);
            if (fieldErrors.riderAssociation) {
              setFieldErrors((currentErrors) => ({ ...currentErrors, riderAssociation: undefined }));
            }
          }}
          placeholder="Kitooro Riders Association"
          textContentType="organizationName"
          value={riderAssociation}
        />
        <AppTextField
          autoComplete="off"
          error={fieldErrors.associationIdentifier}
          label="Association identifier"
          onChangeText={(value) => {
            setAssociationIdentifier(value);
            if (fieldErrors.associationIdentifier) {
              setFieldErrors((currentErrors) => ({ ...currentErrors, associationIdentifier: undefined }));
            }
          }}
          placeholder="KRA-001"
          value={associationIdentifier}
        />
        <AppTextField
          autoComplete="name"
          error={fieldErrors.nextOfKinName}
          label="Next-of-kin name"
          onChangeText={(value) => {
            setNextOfKinName(value);
            if (fieldErrors.nextOfKinName) {
              setFieldErrors((currentErrors) => ({ ...currentErrors, nextOfKinName: undefined }));
            }
          }}
          placeholder="Full name"
          textContentType="name"
          value={nextOfKinName}
        />
        <PhoneNumberField
          error={fieldErrors.nextOfKinPhone}
          onChangeText={(value) => {
            setNextOfKinPhone(value);
            if (fieldErrors.nextOfKinPhone) {
              setFieldErrors((currentErrors) => ({ ...currentErrors, nextOfKinPhone: undefined }));
            }
          }}
          value={nextOfKinPhone}
        />
        <AppTextField
          autoComplete="off"
          error={fieldErrors.nextOfKinRelationship}
          label="Next-of-kin relationship"
          onChangeText={(value) => {
            setNextOfKinRelationship(value);
            if (fieldErrors.nextOfKinRelationship) {
              setFieldErrors((currentErrors) => ({ ...currentErrors, nextOfKinRelationship: undefined }));
            }
          }}
          placeholder="Sibling, spouse, parent"
          value={nextOfKinRelationship}
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
  actions: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
});
