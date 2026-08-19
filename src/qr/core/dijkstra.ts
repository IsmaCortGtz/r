/**
 * Minimal Dijkstra shortest path implementation.
 */
export function findPath(
	graph: Record<string, Record<string, number>>,
	start: string,
	end: string,
): string[] {
	const distances: Record<string, number> = {}
	const previous: Record<string, string | null> = {}
	const visited = new Set<string>()
	const queue: { node: string; dist: number }[] = []

	for (const node in graph) {
		distances[node] = Infinity
		previous[node] = null
	}
	distances[start] = 0
	queue.push({ node: start, dist: 0 })

	while (queue.length > 0) {
		queue.sort((a, b) => a.dist - b.dist)
		const { node: current } = queue.shift()!

		if (visited.has(current)) continue
		visited.add(current)

		if (current === end) break

		const neighbors = graph[current]
		if (!neighbors) continue

		for (const neighbor in neighbors) {
			if (visited.has(neighbor)) continue
			if (!(neighbor in distances)) {
				distances[neighbor] = Infinity
				previous[neighbor] = null
			}
			const newDist = distances[current]! + neighbors[neighbor]!
			if (newDist < distances[neighbor]!) {
				distances[neighbor] = newDist
				previous[neighbor] = current
				queue.push({ node: neighbor, dist: newDist })
			}
		}
	}

	const path: string[] = []
	let current: string | null = end
	while (current) {
		path.unshift(current)
		current = previous[current]
	}

	if (path[0] !== start) return []
	return path
}
