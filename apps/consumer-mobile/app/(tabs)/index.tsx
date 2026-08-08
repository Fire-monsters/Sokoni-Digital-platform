import { AppScreen, AppText, OnboardingSlide, colors, spacing } from "@sokoni-digital/ui";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";

import {
  CatalogueLoading,
  CatalogueMessage,
  ProductCard,
  StaleCatalogueNotice,
} from "@/features/catalogue/components";
import { useCatalogueInterface } from "@/features/catalogue/catalogue-store";
import { useCatalogueHome } from "@/features/catalogue/hooks";

function GuestCatalogueHome() {
  const reducedData = useCatalogueInterface((state) => state.reducedData);
  const toggleReducedData = useCatalogueInterface((state) => state.toggleReducedData);
  const query = useCatalogueHome(reducedData);

  if (query.isPending) {
    return (
      <AppScreen>
        <CatalogueLoading label="Opening Kitooro Market…" />
      </AppScreen>
    );
  }

  if (query.isError && !query.data) {
    return (
      <AppScreen>
        <CatalogueMessage
          title="The market did not load"
          message="Check your connection and try again."
          onRetry={() => void query.refetch()}
        />
      </AppScreen>
    );
  }

  const home = query.data;

  if (!home) {
    return null;
  }

  return (
    <AppScreen scroll contentStyle={styles.content}>
      <View style={styles.marketHeader}>
        <View style={styles.headerCopy}>
          <AppText color="secondary" variant="caption">
            Shopping at
          </AppText>
          <AppText variant="heading2">Kitooro Market</AppText>
        </View>
        <Pressable accessibilityRole="switch" onPress={toggleReducedData} style={styles.dataButton}>
          <AppText variant="caption">{reducedData ? "Data saver on" : "Full images"}</AppText>
        </Pressable>
      </View>

      {query.isError || query.fetchStatus === "paused" ? <StaleCatalogueNotice /> : null}

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push("/explore")}
        style={styles.search}
      >
        <AppText color="secondary">Search tomatoes, matooke, onions…</AppText>
      </Pressable>

      <View style={styles.promotion}>
        <AppText variant="heading2">Fresh packages, market prices</AppText>
        <AppText color="secondary">
          Browse fixed-size packages from approved local vendors before you sign in.
        </AppText>
      </View>

      <View style={styles.section}>
        <AppText variant="heading3">Categories</AppText>
        {home.categories.length === 0 ? (
          <AppText color="secondary">Categories will appear when the market opens.</AppText>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.row}
          >
            {home.categories.map((category) => (
              <Pressable
                key={category.id}
                onPress={() =>
                  router.push({
                    pathname: "/categories/[categoryId]",
                    params: { categoryId: category.id, name: category.name },
                  })
                }
                style={styles.categoryChip}
              >
                <AppText variant="label">{category.name}</AppText>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>

      {home.featured ? (
        <View style={styles.section}>
          <AppText variant="heading3">Popular at Kitooro</AppText>
          <ProductCard compact item={home.featured} />
        </View>
      ) : null}

      {home.sections.map((section) => (
        <View key={section.id} style={styles.section}>
          <View style={styles.sectionHeader}>
            <AppText variant="heading3">{section.title}</AppText>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/categories/[categoryId]",
                  params: { categoryId: section.id, name: section.title },
                })
              }
            >
              <AppText style={styles.seeAll} variant="label">
                See all
              </AppText>
            </Pressable>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.row}
          >
            {section.items.map((item) => (
              <ProductCard compact item={item} key={item.id} />
            ))}
          </ScrollView>
        </View>
      ))}

      {home.sections.length === 0 ? (
        <CatalogueMessage
          title="The stalls are getting ready"
          message="Approved product packages will appear here as vendors add them."
        />
      ) : null}
    </AppScreen>
  );
}

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
            onPrimaryAction={() => setSlideIndex(1)}
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
          supportingText="Choose affordable delivery, schedule your order or collect it from the market."
          totalSteps={2}
          primaryActionLabel="Explore the market"
          secondaryActionLabel="Sign in"
          onPrimaryAction={() => setHasSeenOnboarding(true)}
          onSecondaryAction={() =>
            Alert.alert("Sign in", "Consumer authentication will be added before checkout.")
          }
        />
      </AppScreen>
    );
  }

  return <GuestCatalogueHome />;
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
    backgroundColor: colors.background,
  },
  marketHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  headerCopy: {
    flex: 1,
  },
  dataButton: {
    borderRadius: 999,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  search: {
    minHeight: 50,
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
  promotion: {
    gap: spacing.xs,
    borderRadius: 16,
    backgroundColor: "#FFF2D8",
    padding: spacing.lg,
  },
  section: {
    gap: spacing.sm,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  row: {
    gap: spacing.sm,
    paddingRight: spacing.md,
  },
  categoryChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  seeAll: {
    color: colors.primary,
  },
});
