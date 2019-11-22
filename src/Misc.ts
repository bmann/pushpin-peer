export function getOrCreate<K, V>(
  map: Map<K, V>,
  key: K,
  create: (key: K) => V,
) {
  if (!map.has(key)) {
    const val = create(key)
    map.set(key, val)
  }
  return map.get(key)!
}
