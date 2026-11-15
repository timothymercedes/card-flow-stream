/** Supplier-neutral contract so PB Bazaar is never locked to one supplier. */
export type SupplierKind = "cj" | "temu" | "wish" | "shein";

export type SupplierSearchParams = { keyword?: string; categoryId?: string; page?: number; pageSize?: number; countryCode?: string };
export type SupplierProductSummary = { ref: string; title: string; imageUrl: string | null; costCents: number | null; categoryName: string | null };
export type SupplierVariant = { vid: string; sku: string | null; name: string | null; costCents: number; weightGrams: number | null; options: Record<string, string> };
export type SupplierProductDetail = { ref: string; title: string; description: string | null; images: string[]; categoryName: string | null; variants: SupplierVariant[] };
export type SupplierStock = { vid: string; warehouse: string | null; countryCode: string | null; quantity: number };
export type ShippingQuoteParams = { startCountryCode: string; endCountryCode: string; zip?: string; products: { vid: string; quantity: number }[] };
export type ShippingQuote = { method: string; costCents: number; minDays: number | null; maxDays: number | null };
export type SupplierOrderPayload = {
  /** Our deterministic reference (idempotency key at the supplier). */
  orderNumber: string;
  shippingMethod: string;
  recipient: { name: string; phone: string; address: string; address2?: string; city: string; province: string; zip: string; countryCode: string; country: string };
  products: { vid: string; quantity: number }[];
};
export type SupplierOrderResult = { supplierOrderId: string; orderNumber: string; status: string };
export type SupplierOrderStatus = { supplierOrderId: string; status: string; trackingNumber: string | null; carrier: string | null; raw: unknown };

export interface SupplierAdapter {
  readonly kind: SupplierKind;
  testConnection(): Promise<{ ok: boolean; message: string }>;
  searchProducts(p: SupplierSearchParams): Promise<{ items: SupplierProductSummary[]; total: number }>;
  getProductDetail(ref: string): Promise<SupplierProductDetail>;
  getStock(vid: string): Promise<SupplierStock[]>;
  calculateShipping(p: ShippingQuoteParams): Promise<ShippingQuote[]>;
  createOrder(o: SupplierOrderPayload): Promise<SupplierOrderResult>;
  getOrderStatus(supplierOrderId: string): Promise<SupplierOrderStatus>;
  cancelOrder(supplierOrderId: string): Promise<{ success: boolean }>;
}

export class SupplierError extends Error {
  constructor(message: string, readonly code: "config" | "auth" | "rate_limited" | "upstream" | "invalid_response" | "blocked" | "not_found", readonly retryable = false, readonly status?: number) { super(message); this.name = "SupplierError"; }
}
