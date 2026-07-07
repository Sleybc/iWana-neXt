const openDrawerLayers: number[] = [];

export function registerPortalSideDrawerLayer(layerId: number): void {
  if (!openDrawerLayers.includes(layerId)) {
    openDrawerLayers.push(layerId);
  }
}

export function unregisterPortalSideDrawerLayer(layerId: number): void {
  const index = openDrawerLayers.lastIndexOf(layerId);
  if (index >= 0) {
    openDrawerLayers.splice(index, 1);
  }
}

export function isTopMostPortalSideDrawerLayer(layerId: number): boolean {
  return openDrawerLayers[openDrawerLayers.length - 1] === layerId;
}
