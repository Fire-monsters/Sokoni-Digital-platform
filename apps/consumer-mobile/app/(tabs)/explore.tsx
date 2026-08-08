import { AppScreen, AppText, colors, spacing } from "@sokoni-digital/ui";
import { useEffect, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";

import { useCatalogueInterface } from "@/features/catalogue/catalogue-store";
import { CatalogueResultsScreen } from "@/features/catalogue/results-screen";

export default function SearchScreen() {
  const search = useCatalogueInterface((state) => state.search);
  const setSearch = useCatalogueInterface((state) => state.setSearch);
  const [draftSearch, setDraftSearch] = useState(search);

  useEffect(() => {
    const timeout = setTimeout(() => setSearch(draftSearch.trim()), 350);
    return () => clearTimeout(timeout);
  }, [draftSearch, setSearch]);

  return (
    <View style={styles.screen}>
      <AppScreen style={styles.searchArea} contentStyle={styles.searchHeader}>
        <AppText variant="heading1">Search the market</AppText>
        <TextInput
          accessibilityLabel="Search products"
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setDraftSearch}
          placeholder="Tomatoes, vegetables, essentials…"
          placeholderTextColor={colors.textSecondary}
          returnKeyType="search"
          style={styles.input}
          value={draftSearch}
        />
      </AppScreen>
      <View style={styles.results}>
        <CatalogueResultsScreen
          search={search || undefined}
          title={search ? `Results for “${search}”` : "Browse all packages"}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  searchHeader: {
    flex: 0,
    gap: spacing.md,
    paddingBottom: 0,
  },
  searchArea: {
    flex: 0,
  },
  input: {
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    fontSize: 16,
  },
  results: {
    flex: 1,
  },
});
