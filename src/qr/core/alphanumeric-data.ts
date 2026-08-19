import { ALPHANUMERIC } from "./mode.js"
import type { Segment } from "./segment.js"

const ALPHA_NUM_CHARS = [
	"0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
	"A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
	"N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
	" ", "$", "%", "*", "+", "-", ".", "/", ":",
]

export function createAlphanumericData(data: string): Segment {
	const segment: Segment = {
		mode: ALPHANUMERIC,
		data,
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
	return 11 * Math.floor(length / 2) + 6 * (length % 2)
}

function write(
	segment: { data: string },
	bitBuffer: { put(n: number, l: number): void },
): void {
	let i: number
	for (i = 0; i + 2 <= segment.data.length; i += 2) {
		let value = ALPHA_NUM_CHARS.indexOf(segment.data[i]!) * 45
		value += ALPHA_NUM_CHARS.indexOf(segment.data[i + 1]!)
		bitBuffer.put(value, 11)
	}
	if (segment.data.length % 2) {
		bitBuffer.put(ALPHA_NUM_CHARS.indexOf(segment.data[i]!), 6)
	}
}
