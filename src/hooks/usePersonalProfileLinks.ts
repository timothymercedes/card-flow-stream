/** Social links always open /@username; visitor access is enforced server-side
 * by the release gate, so the link itself exposes nothing. */
export function usePersonalProfileLinks() {
  return true;
}
