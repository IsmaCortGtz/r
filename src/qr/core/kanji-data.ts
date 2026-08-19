import { KANJI } from "./mode.js"
import * as Utils from "./utils.js"
import type { Segment } from "./segment.js"

export function createKanjiData(data: string): Segment {
	const segment: Segment = {
		mode: KANJI,
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
	return length * 13
}

function write(
	segment: { data: string },
	bitBuffer: { put(n: number, l: number): void },
): void {
	for (let i = 0; i < segment.data.length; i++) {
		let value = Utils.toSJIS(segment.data[i]!)
		if (value >= 0x8140 && value <= 0x9ffc) {
			value -= 0x8140
		} else if (value >= 0xe040 && value <= 0xebbf) {
			value -= 0xc140
		} else {
			throw new Error(
				"Invalid SJIS character: " + segment.data[i] + "\n" + "Make sure your charset is UTF-8",
			)
		}
		value = (((value >>> 8) & 0xff) * 0xc0) + (value & 0xff)
		bitBuffer.put(value, 13)
	}
}
