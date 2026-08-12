import { AppScreen, OnboardingSlide } from "@sokoni-digital/ui";
import { router } from "expo-router";

export default function VendorBenefitsScreen() {
  return (
    <AppScreen>
      <OnboardingSlide
        currentStep={2}
        headline="Manage orders with ease"
        illustration="delivery"
        supportingText="Update availability, prepare customer orders and track your online sales from one simple application."
        totalSteps={2}
        primaryActionLabel="Register my stall"
        secondaryActionLabel="I already have an account"
        onPrimaryAction={() => {
          router.push("/(auth)/phone");
        }}
        onSecondaryAction={() => {
          router.push("/(public)/sign-in");
        }}
      />
    </AppScreen>
  );
}
