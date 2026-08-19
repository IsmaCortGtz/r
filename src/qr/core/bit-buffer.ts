export interface BitBuffer {
	buffer: number[]
	length: number
	put(n: number, l: number): void
}

export function createBitBuffer(): BitBuffer {
	const buf: BitBuffer = {
		buffer: [],
		length: 0,
		put(n: number, l: number) {
			put(buf, n, l)
		},
	}
	return buf
}

export function get(buf: BitBuffer, index: number): boolean {
	const bufIndex = Math.floor(index / 8)
	return ((buf.buffer[bufIndex]! >>> (7 - (index % 8))) & 1) === 1
}

export function put(buf: BitBuffer, num: number, length: number): void {
	for (let i = 0; i < length; i++) {
		putBit(buf, ((num >>> (length - i - 1)) & 1) === 1)
	}
}

export function getLengthInBits(buf: BitBuffer): number {
	return buf.length
}

export function putBit(buf: BitBuffer, bit: boolean | number): void {
	const bufIndex = Math.floor(buf.length / 8)
	if (buf.buffer.length <= bufIndex) {
		buf.buffer.push(0)
	}
	if (bit) {
		buf.buffer[bufIndex]! |= 0x80 >>> buf.length % 8
	}
	buf.length++
}
