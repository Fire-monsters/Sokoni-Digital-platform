import { useLocalSearchParams } from "expo-router";

import { CatalogueResultsScreen } from "@/features/catalogue/results-screen";

export default function CategoryScreen() {
  const params = useLocalSearchParams<{ categoryId: string; name?: string }>();

  return (
    <CatalogueResultsScreen categoryId={params.categoryId} title={params.name ?? "Category"} />
  );
}
