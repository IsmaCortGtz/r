/**
 * Converts a 128-bit BigInt to a compressed IPv6 address string.
 * Uses standard :: notation for longest run of zero hextets.
 */
export function numberToIPv6(number: bigint): string {
	const hextets: string[] = []

	for (let i = 0; i < 8; i++) {
		hextets.unshift((number & 0xffffn).toString(16))
		number >>= 16n
	}

	let bestStart = -1
	let bestLength = 0
	let start = -1

	for (let i = 0; i <= hextets.length; i++) {
		if (i < hextets.length && hextets[i] === "0") {
			if (start === -1) start = i
		} else if (start !== -1) {
			const length = i - start
			if (length > bestLength && length > 1) {
				bestStart = start
				bestLength = length
			}
			start = -1
		}
	}

	if (bestStart === -1) return hextets.join(":")

	const left = hextets.slice(0, bestStart).join(":")
	const right = hextets.slice(bestStart + bestLength).join(":")

	return `${left}::${right}`
}

/**
 * Converts an IPv6 address string to its 128-bit BigInt representation.
 * Supports :: compressed notation.
 */
export function ipv6ToNumber(input: string): bigint {
	const halves = input.split("::")
	const left = halves[0] ? halves[0].split(":") : []
	const right = halves[1] ? halves[1].split(":") : []

	const missing = 8 - left.length - right.length
	const hextets = [...left, ...Array(missing).fill("0"), ...right]

	let number = 0n

	for (const hextet of hextets) {
		number <<= 16n
		number += BigInt(`0x${hextet || "0"}`)
	}

	return number
}
