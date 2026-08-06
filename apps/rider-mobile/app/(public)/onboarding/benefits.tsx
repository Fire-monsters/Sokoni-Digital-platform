import { AppScreen, OnboardingSlide } from '@sokoni-digital/ui';
import { router } from 'expo-router';

export default function RiderBenefitsScreen() {
  return (
    <AppScreen>
      <OnboardingSlide
        currentStep={2}
        headline="Every delivery, clearly guided"
        illustration="market"
        supportingText="See pickup details, customer contacts and delivery progress even when the network is unstable."
        totalSteps={2}
        primaryActionLabel="Register as a rider"
        secondaryActionLabel="Sign in"
        onPrimaryAction={() => {
          router.push('/(auth)/phone');
        }}
        onSecondaryAction={() => {
          router.push('/(public)/sign-in');
        }}
      />
    </AppScreen>
  );
}
