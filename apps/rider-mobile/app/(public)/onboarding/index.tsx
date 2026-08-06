import { AppScreen, OnboardingSlide } from '@sokoni-digital/ui';
import { router } from 'expo-router';

export default function RiderOnboardingScreen() {
  return (
    <AppScreen>
      <OnboardingSlide
        currentStep={1}
        headline="Deliver and earn"
        illustration="delivery"
        supportingText="Receive nearby delivery requests from Kitooro Market and choose the trips that work for you."
        totalSteps={2}
        primaryActionLabel="Next"
        onPrimaryAction={() => {
          router.push('/(public)/onboarding/benefits');
        }}
      />
    </AppScreen>
  );
}
