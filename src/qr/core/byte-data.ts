import { BYTE } from "./mode.js"
import type { Segment } from "./segment.js"

export function createByteData(data: string | Uint8Array): Segment {
	const segment: Segment = {
		mode: BYTE,
		data:
			typeof data === "string"
				? new TextEncoder().encode(data)
				: new Uint8Array(data),
		getLength() {
			return (segment.data as Uint8Array).length
		},
		getBitsLength() {
			return getBitsLength((segment.data as Uint8Array).length)
		},
		write(bitBuffer) {
			write(segment as { data: Uint8Array }, bitBuffer)
		},
	}
	return segment
}

export function getBitsLength(length: number): number {
	return length * 8
}

function write(
	segment: { data: Uint8Array },
	bitBuffer: { put(n: number, l: number): void },
): void {
	for (let i = 0, l = segment.data.length; i < l; i++) {
		bitBuffer.put(segment.data[i]!, 8)
	}
}
