import * as THREE from 'three';

export function disposeObjectResources(
  roots: Iterable<THREE.Object3D>,
  isSharedMaterial: (material: THREE.Material) => boolean = () => false
): void {
  const disposedGeometries = new Set<THREE.BufferGeometry>();
  const disposedMaterials = new Set<THREE.Material>();
  const disposedTextures = new Set<THREE.Texture>();

  for (const root of roots) {
    root.traverse((object) => {
      if (
        object instanceof THREE.Mesh ||
        object instanceof THREE.Points ||
        object instanceof THREE.Line
      ) {
        if (!disposedGeometries.has(object.geometry)) {
          object.geometry.dispose();
          disposedGeometries.add(object.geometry);
        }

        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          if (isSharedMaterial(material) || disposedMaterials.has(material)) continue;
          for (const value of Object.values(material)) {
            if (value instanceof THREE.Texture && !disposedTextures.has(value)) {
              value.dispose();
              disposedTextures.add(value);
            }
          }
          material.dispose();
          disposedMaterials.add(material);
        }
      }

      if (object instanceof THREE.DirectionalLight && object.shadow.map) {
        object.shadow.map.dispose();
        object.shadow.map = null;
      }
    });
  }
}
