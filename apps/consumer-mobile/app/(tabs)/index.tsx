import {
  AppButton,
  AppScreen,
  AppText,
  InfoCard,
  OnboardingSlide,
  colors,
  spacing,
} from '@sokoni-digital/ui';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

export default function HomeScreen() {
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);

  if (!hasSeenOnboarding) {
    if (slideIndex === 0) {
      return (
        <AppScreen>
          <OnboardingSlide
            currentStep={1}
            headline={`Kitooro Market,\ncloser to you`}
            illustration="market"
            supportingText="Find fresh produce, ready-to-cook food and household essentials from trusted local vendors."
            totalSteps={2}
            primaryActionLabel="Next"
            onPrimaryAction={() => {
              setSlideIndex(1);
            }}
          />
        </AppScreen>
      );
    }

    return (
      <AppScreen>
        <OnboardingSlide
          currentStep={2}
          headline="Delivery or market pickup"
          illustration="delivery"
          supportingText="Choose affordable delivery by a registered rider, schedule your order or collect it from the market."
          totalSteps={2}
          primaryActionLabel="Explore the market"
          secondaryActionLabel="Sign in"
          onPrimaryAction={() => {
            setHasSeenOnboarding(true);
          }}
          onSecondaryAction={() => {
            Alert.alert('Sign in', 'Google authentication will be added in the next consumer auth slice.');
          }}
        />
      </AppScreen>
    );
  }

  return (
    <AppScreen scroll>
      <View style={styles.header}>
        <AppText variant="heading1">Browse Kitooro Market</AppText>
        <AppText color="secondary" variant="bodyLarge">
          Continue as a guest and discover fresh produce before signing in at checkout.
        </AppText>
      </View>

      <View style={styles.searchStub}>
        <AppText color="secondary">Search produce, prepared food or essentials</AppText>
      </View>

      <View style={styles.section}>
        <AppText variant="heading3">{"Today's market picks"}</AppText>
        <InfoCard
          title="Fresh produce"
          description="Matooke, tomatoes, onions and greens from verified market stalls."
          aside={<AppText style={styles.price}>UGX 2k+</AppText>}
        />
        <InfoCard
          title="Ready-to-cook"
          description="Cleaned vegetables and meal bundles prepared for faster home cooking."
          aside={<AppText style={styles.price}>UGX 8k+</AppText>}
        />
        <InfoCard
          title="Market pickup"
          description="Reserve items now and collect them from Kitooro Market later."
          aside={<AppText style={styles.price}>Free</AppText>}
        />
      </View>

      <View style={styles.footer}>
        <AppButton
          label="Continue browsing"
          onPress={() => {
            Alert.alert('Guest browsing', 'Catalogue data will connect in a later marketplace slice.');
          }}
        />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  searchStub: {
    minHeight: 48,
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  section: {
    gap: spacing.sm,
  },
  price: {
    color: colors.primary,
    fontWeight: '700',
  },
  footer: {
    marginTop: spacing.lg,
  },
});
