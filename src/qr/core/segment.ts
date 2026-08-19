import type { Mode } from "./mode.js"

export interface Segment {
	mode: Mode
	data: string | Uint8Array
	getLength(): number
	getBitsLength(): number
	write(bitBuffer: { put(n: number, l: number): void }): void
}
