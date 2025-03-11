export function serializeRouteIds(routeIds: number[]): string {
  return routeIds.join(':');
}

export function deserializeRouteIds(routeIds: string): number[] {
  return routeIds.split(':').map(Number);
}
