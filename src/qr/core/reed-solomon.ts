import * as Polynomial from "./polynomial.js"

export function createReedSolomonEncoder(degree: number) {
	const genPoly = Polynomial.generateECPolynomial(degree)
	return {
		degree,
		encode(data: Uint8Array): Uint8Array {
			const paddedData = new Uint8Array(data.length + degree)
			paddedData.set(data)
			const remainder = Polynomial.mod(paddedData, genPoly)
			const start = degree - remainder.length
			if (start > 0) {
				const buff = new Uint8Array(degree)
				buff.set(remainder, start)
				return buff
			}
			return remainder
		},
	}
}
