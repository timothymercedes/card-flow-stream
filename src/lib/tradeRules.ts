export type Side = "from" | "to";
export function participantSide(from: string, to: string, user: string): Side {
  if (user === from) return "from";
  if (user === to) return "to";
  throw new Error("Not a trade participant");
}
export function oppositeSide(side: Side): Side { return side === "from" ? "to" : "from"; }
export function receiptsComplete(requiredFrom: boolean, requiredTo: boolean, fromReceived: boolean, toReceived: boolean, unresolved: boolean) {
  return (requiredFrom || requiredTo) && (!requiredFrom || toReceived) && (!requiredTo || fromReceived) && !unresolved;
}
export function retainsTradeLock(status: string, unresolved: boolean) {
  return unresolved || ["pending", "accepted", "shipped", "delivered"].includes(status);
}