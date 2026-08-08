import { AppButton, AppScreen, AppText, colors, spacing } from "@sokoni-digital/ui";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";

import {
  CatalogueLoading,
  CatalogueMessage,
  ProductCard,
  StaleCatalogueNotice,
} from "./components";
import { useCatalogueListings } from "./hooks";

interface CatalogueResultsScreenProps {
  title: string;
  categoryId?: string;
  search?: string;
}

export function CatalogueResultsScreen({ title, categoryId, search }: CatalogueResultsScreenProps) {
  const query = useCatalogueListings({ categoryId, search, limit: 12, reducedData: true });
  const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);

  if (query.isPending) {
    return (
      <AppScreen>
        <CatalogueLoading />
      </AppScreen>
    );
  }

  if (query.isError && items.length === 0) {
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

  return (
    <AppScreen scroll contentStyle={styles.content}>
      <AppText variant="heading1">{title}</AppText>
      {query.isError || query.fetchStatus === "paused" ? <StaleCatalogueNotice /> : null}
      {items.length === 0 ? (
        <CatalogueMessage
          title="No packages found"
          message="Try another search or check back when vendors add more stock."
        />
      ) : (
        <View style={styles.grid}>
          {items.map((item) => (
            <View key={item.id} style={styles.gridItem}>
              <ProductCard item={item} />
            </View>
          ))}
        </View>
      )}
      {query.hasNextPage ? (
        <AppButton
          disabled={query.isFetchingNextPage}
          label={query.isFetchingNextPage ? "Loading…" : "Load more"}
          onPress={() => void query.fetchNextPage()}
          variant="secondary"
        />
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
    backgroundColor: colors.background,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  gridItem: {
    width: "48%",
  },
});
