/** Page sizes bound requests, never the size of the catalog. */
export const CATALOG_PAGE_SIZE = 25;
export const catalogRange = (page: number) => {
  const start = (Math.max(1, Math.floor(page)) - 1) * CATALOG_PAGE_SIZE;
  return [start, start + CATALOG_PAGE_SIZE - 1] as const;
};
export const catalogSort = {
  newest: { column: "created_at", ascending: false },
  oldest: { column: "created_at", ascending: true },
  title: { column: "title", ascending: true },
} as const;
export type CatalogSort = keyof typeof catalogSort;
export const draftBulkStatus = { draft: "draft", pause: "paused" } as const;