import { AppScreen, OnboardingSlide } from "@sokoni-digital/ui";
import { router } from "expo-router";

export default function VendorOnboardingScreen() {
  return (
    <AppScreen>
      <OnboardingSlide
        currentStep={1}
        headline="Take your stall online"
        illustration="market"
        supportingText="Show customers what is available, receive orders and reach more buyers around Entebbe."
        totalSteps={2}
        primaryActionLabel="Next"
        onPrimaryAction={() => {
          router.push("/(public)/onboarding/benefits");
        }}
      />
    </AppScreen>
  );
}
