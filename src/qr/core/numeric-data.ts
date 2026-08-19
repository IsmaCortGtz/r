import { NUMERIC } from "./mode.js"
import type { Segment } from "./segment.js"

export function createNumericData(data: string | number): Segment {
	const segment: Segment = {
		mode: NUMERIC,
		data: data.toString(),
		getLength() {
			return (segment.data as string).length
		},
		getBitsLength() {
			return getBitsLength((segment.data as string).length)
		},
		write(bitBuffer) {
			write(segment as { data: string }, bitBuffer)
		},
	}
	return segment
}

export function getBitsLength(length: number): number {
	return (
		10 * Math.floor(length / 3) +
		(length % 3 ? length % 3 * 3 + 1 : 0)
	)
}

function write(
	segment: { data: string },
	bitBuffer: { put(n: number, l: number): void },
): void {
	let i: number
	let group: string
	let value: number

	for (i = 0; i + 3 <= segment.data.length; i += 3) {
		group = segment.data.substr(i, 3)
		value = parseInt(group, 10)
		bitBuffer.put(value, 10)
	}

	const remainingNum = segment.data.length - i
	if (remainingNum > 0) {
		group = segment.data.substr(i)
		value = parseInt(group, 10)
		bitBuffer.put(value, remainingNum * 3 + 1)
	}
}
