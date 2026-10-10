import { BufferGeometry, Group, Material, Matrix4, type Mesh, type MeshPhysicalMaterial, type Object3D } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** Bake static parts in root-local space; animated wheels/beacon remain separate. */
export function batchStaticMeshes(root: Group, excluded: Object3D | null, beacon: Material | null) {
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert();
  const matrix = new Matrix4();
  const buckets = new Map<string, { material: Material; meshes: Mesh[]; geometries: BufferGeometry[]; castShadow: boolean; receiveShadow: boolean }>();
  root.traverse(object => {
    const mesh = object as Mesh;
    if (!mesh.isMesh || !mesh.visible || Array.isArray(mesh.material) || mesh.material === beacon) return;
    for (let parent: Object3D | null = object; parent && parent !== root; parent = parent.parent)
      if (parent === excluded) return;
    const surface = mesh.material as MeshPhysicalMaterial;
    const key = JSON.stringify([surface.type, surface.color?.getHex(), surface.emissive?.getHex(), surface.emissiveIntensity, surface.roughness, surface.metalness, surface.clearcoat, surface.clearcoatRoughness, surface.transparent, surface.opacity, surface.side, surface.flatShading, surface.map?.uuid, mesh.castShadow, mesh.receiveShadow]);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { material: mesh.material, meshes: [], geometries: [], castShadow: mesh.castShadow, receiveShadow: mesh.receiveShadow };
      buckets.set(key, bucket);
    }
    const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    geometry.applyMatrix4(matrix.multiplyMatrices(inverse, object.matrixWorld));
    bucket.meshes.push(mesh);
    bucket.geometries.push(geometry);
  });
  const batches: { geometry: BufferGeometry; material: Material; castShadow: boolean; receiveShadow: boolean }[] = [];
  const hidden: Mesh[] = [];
  for (const bucket of buckets.values()) {
    const geometry = mergeGeometries(bucket.geometries);
    bucket.geometries.forEach(part => part.dispose());
    if (!geometry) continue;
    geometry.computeBoundingSphere();
    batches.push({ geometry, material: bucket.material.clone(), castShadow: bucket.castShadow, receiveShadow: bucket.receiveShadow });
    bucket.meshes.forEach(mesh => { mesh.visible = false; hidden.push(mesh); });
  }
  return { batches, restore: () => hidden.forEach(mesh => { mesh.visible = true; }) };
}
