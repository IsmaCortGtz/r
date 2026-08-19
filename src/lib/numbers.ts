/**
 * Encodes a BigInt into a string using the given alphabet.
 * Treats the entire data stream as a single arbitrary-precision number
 * and converts it to the chosen base (alphabet size).
 */
export function numberToString(
	number: bigint,
	alphabet: string[],
): string {
	const alphabetSize = BigInt(alphabet.length)
	let result = ""

	while (number > 0n) {
		number--
		result += alphabet[Number(number % alphabetSize)]
		number /= alphabetSize
	}

	return result
}

/**
 * Decodes a string back into a BigInt using the given alphabet.
 * Handles multi-character alphabet entries by matching longest first.
 */
export function stringToNumber(
	string: string,
	alphabet: string[],
): bigint {
	const alphabetSize = BigInt(alphabet.length)
	let number = 0n

	while (string) {
		const digit = BigInt(
			alphabet.findIndex((c) => string.endsWith(c)),
		)
		if (digit < 0n)
			throw `Invalid character: "${string.at(-1)}"`
		number *= alphabetSize
		number += digit
		number++
		const sequence = alphabet[Number(digit)]
		string = string.slice(0, -sequence.length)
	}

	return number
}

/**
 * Encodes a binary sequence (Huffman code) into the data stream.
 * Bits are appended LSB-first from the input sequence string.
 */
export function huffmanEncode(
	number: bigint,
	sequence: string,
): bigint {
	for (let i = sequence.length - 1; i >= 0; i--) {
		number <<= 1n
		if (sequence[i] === "1") number++
	}
	return number
}

/**
 * Decodes a Huffman-coded string from the data stream.
 * Reads bits until a valid dictionary key is found.
 */
export function huffmanDecode(
	number: bigint,
	lookup: Record<string, string>,
): { newNumber: bigint; digit: string } {
	let sequence = ""
	do {
		sequence += number & 1n
		number >>= 1n
		if (sequence.length > 20) {
			throw `Huffman sequence too long: "${sequence}".`
		}
	} while (!(sequence in lookup))
	return { newNumber: number, digit: lookup[sequence] }
}
