export interface BitMatrix {
	size: number
	data: Uint8Array
	reservedBit: Uint8Array
}

export function createBitMatrix(size: number): BitMatrix {
	if (!size || size < 1) {
		throw new Error("BitMatrix size must be defined and greater than 0")
	}
	return {
		size,
		data: new Uint8Array(size * size),
		reservedBit: new Uint8Array(size * size),
	}
}

export function set(matrix: BitMatrix, row: number, col: number, value: boolean, reserved?: boolean): void {
	const index = row * matrix.size + col
	matrix.data[index] = value ? 1 : 0
	if (reserved) matrix.reservedBit[index] = 1
}

export function get(matrix: BitMatrix, row: number, col: number): number {
	return matrix.data[row * matrix.size + col]!
}

export function xor(matrix: BitMatrix, row: number, col: number, value: boolean | number): void {
	matrix.data[row * matrix.size + col] ^= value ? 1 : 0
}

export function isReserved(matrix: BitMatrix, row: number, col: number): boolean {
	return matrix.reservedBit[row * matrix.size + col] === 1
}
