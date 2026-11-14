export type DetailReadState = 'pending' | 'ready' | 'unavailable' | 'error';
export function detailReadState(row: unknown, error: unknown): DetailReadState {
  return error ? 'error' : row ? 'ready' : 'unavailable';
}
export function isRealPublicLive(stream: {is_demo?: boolean | null; is_private?: boolean | null; status?: string | null}) {
  return stream.status === 'live' && stream.is_demo === false && stream.is_private !== true;
}
export function scannerReturnPath(scan: boolean) { return scan ? '/vault?scan=true' : '/vault'; }
export function catalogEmptyKind(filtered: boolean, error: boolean) {
  return error ? 'error' : filtered ? 'no_matches' : 'empty_catalog';
}