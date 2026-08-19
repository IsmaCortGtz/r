const VERSION = 0

type SegmentType = "path" | "query" | "hash"

interface Segment {
	type: SegmentType
	value: string
}

import {
	SUBALPHABETS,
	TLD_ENCODE,
	SLD_ENCODE,
	DOMAIN_ENCODE,
	PATH_ENCODE,
	TLD_DECODE,
	SLD_DECODE,
	SLD_LIST,
	DOMAIN_DECODE,
	PATH_DECODE,
	OUTPUT_ALPHABET_ASCII,
} from "./dictionaries"

import {
	numberToString,
	stringToNumber,
	huffmanEncode,
	huffmanDecode,
} from "./numbers"

import { numberToIPv6, ipv6ToNumber } from "./ipv6"

// Reserved percent-encoded sequences that must be preserved as-is
const RESERVED_ESCAPE =
	/(%(?:23|24|26|2B|2C|2F|3A|3B|3D|3F|40))/gi

/**
 * Compresses a URL into a compact payload string.
 * The payload can be appended to a base URL to form a short link.
 *
 * @param input - The URL to compress
 * @param alphabet - Output character set (default: ASCII)
 * @returns The compressed payload (not a full URL)
 */
export function compress(
	input: string,
	alphabet: string[] = OUTPUT_ALPHABET_ASCII,
): string {
	let number = 1n

	// Parse and normalize the input URL
	const url = URL.canParse(input)
		? new URL(input)
		: new URL("http://" + input)

	let hostname = url.hostname.toLowerCase()
	const isIPv6 =
		hostname.startsWith("[") && hostname.endsWith("]")
	const port = BigInt(url.port)
	const tld: string | false =
		!isIPv6 &&
		hostname.includes(".") &&
		hostname.split(".").at(-1)!.toLowerCase()

	if (tld && tld in TLD_ENCODE) {
		hostname = hostname.split(".").slice(0, -1).join(".")
	}

	const isHTTPS = url.protocol === "https:"
	const hasWWW =
		!isIPv6 &&
		url.hostname.toLowerCase().startsWith("www.")
	if (hasWWW) hostname = hostname.slice(4)

	// Find matching SLD by longest suffix
	const knownSLD = !isIPv6
		? SLD_LIST.find((c) => hostname.endsWith(c)) || ""
		: ""
	const subdomain = hostname.slice(0, -knownSLD.length)

	// Parse path into segments
	let path = url.pathname

	// Remove index suffixes (encoded separately)
	const hasIndexHTML = path.endsWith("/index.html")
	const hasIndexPHP = path.endsWith("/index.php")
	if (hasIndexHTML) path = path.slice(0, -11)
	else if (hasIndexPHP) path = path.slice(0, -10)

	// Split path into typed segments
	const pathSegments: Segment[] = path
		.split("/")
		.filter((c) => c.length)
		.map((c) => ({ type: "path", value: c }))

	// Append query parameters
	const queryParams: Segment[] = Array.from(url.searchParams)
		.flat()
		.map((c) => ({ type: "query", value: c }))
	pathSegments.push(...queryParams)

	// Append hash fragment
	if (url.hash && url.hash.length > 1) {
		pathSegments.push({
			type: "hash",
			value: url.hash.slice(1),
		})
	}

	// Normalize segment encoding while preserving reserved escapes
	for (const segment of pathSegments) {
		segment.value = segment.value
			.split(RESERVED_ESCAPE)
			.map((part, index) =>
				index % 2 === 1
					? part
					: encodeURI(decodeURI(part)),
			)
			.join("")
	}

	// Encode path segments (reverse order for bit-packing)
	let lastSegmentType: SegmentType =
		pathSegments.at(-1)?.type ?? "path"
	let queryParamIndex = 0

	for (let j = pathSegments.length - 1; j >= 0; j--) {
		const segment = pathSegments[j]!
		const isFirst = j === pathSegments.length - 1

		// Encode segment type transitions
		if (!isFirst && queryParamIndex % 2 !== 1) {
			number <<= 1n
			if (
				lastSegmentType === "hash" &&
				segment.type === "query"
			) {
				number++
			} else if (
				lastSegmentType === "hash" &&
				segment.type === "path"
			) {
				number++
				number <<= 1n
				number++
			} else if (lastSegmentType !== segment.type) {
				number <<= 1n
				number++
			}
			lastSegmentType = segment.type
		}
		if (segment.type === "query") {
			queryParamIndex++
		}

		// Find smallest subalphabet that fits this segment
		let subalphabetIndex = -1
		let subalphabet: string | null = null
		for (let i = 0; i < SUBALPHABETS.length; i++) {
			if (
				!Array.from(segment.value).some(
					(c) => !SUBALPHABETS[i]!.includes(c),
				)
			) {
				subalphabet = SUBALPHABETS[i]!
				subalphabetIndex = i
				break
			}
		}

		// Compute Huffman-encoded candidate
		let huffmanNumber = isFirst
			? number
			: huffmanEncode(number, PATH_ENCODE["#"]!)
		for (let i = segment.value.length - 1; i >= 0; i--) {
			if (segment.value[i - 2] === "%") {
				const byte = parseInt(
					segment.value.slice(i - 1, i + 1),
					16,
				)
				huffmanNumber *= 256n
				huffmanNumber += BigInt(byte)
				huffmanNumber = huffmanEncode(
					huffmanNumber,
					PATH_ENCODE["%"]!,
				)
				i -= 2
			} else {
				// Tilde is missing from Huffman tree - encode as %7E
				if (segment.value[i] === "~") {
					huffmanNumber *= 256n
					huffmanNumber += BigInt(126)
					huffmanNumber = huffmanEncode(
						huffmanNumber,
						PATH_ENCODE["%"]!,
					)
				} else {
					huffmanNumber = huffmanEncode(
						huffmanNumber,
						PATH_ENCODE[segment.value[i]!]!,
					)
				}
			}
		}

		// Variant 0 = Huffman
		huffmanNumber *= BigInt(SUBALPHABETS.length + 1)

		// If no subalphabet fits, Huffman is the only option
		if (!subalphabet) {
			number = huffmanNumber
			continue
		}

		// Compute subalphabet-encoded candidate
		const subalphabetLength = BigInt(subalphabet.length + 1)
		let subalphabetNumber = isFirst
			? number
			: number * subalphabetLength
		for (
			let i = segment.value.length - 1;
			i >= 0;
			i--
		) {
			subalphabetNumber *= subalphabetLength
			subalphabetNumber += BigInt(
				subalphabet.indexOf(segment.value[i]!) + 1,
			)
		}

		// Variant = subalphabet index + 1
		subalphabetNumber *= BigInt(SUBALPHABETS.length + 1)
		subalphabetNumber += BigInt(subalphabetIndex + 1)

		// Pick the smaller representation
		number =
			huffmanNumber < subalphabetNumber
				? huffmanNumber
				: subalphabetNumber
	}

	// Encode first segment type
	if (pathSegments.length > 0) {
		number *= 3n
		if (pathSegments[0]!.type === "query") {
			number += 1n
		} else if (pathSegments[0]!.type === "hash") {
			number += 2n
		}
	}

	// Encode domain
	if (isIPv6) {
		const ipv6Number = ipv6ToNumber(hostname.slice(1, -1))
		number <<= 128n
		number += ipv6Number
		number = huffmanEncode(number, DOMAIN_ENCODE["END"]!)
	} else if (!knownSLD) {
		if (pathSegments.length > 0)
			number = huffmanEncode(
				number,
				DOMAIN_ENCODE["END"]!,
			)
		for (let i = hostname.length - 1; i >= 0; i--) {
			number = huffmanEncode(
				number,
				DOMAIN_ENCODE[hostname[i]!]!,
			)
		}
	} else {
		if (subdomain) {
			if (pathSegments.length > 0)
				number = huffmanEncode(
					number,
					DOMAIN_ENCODE["END"]!,
				)
			for (
				let i = subdomain.length - 1;
				i >= 0;
				i--
			) {
				number = huffmanEncode(
					number,
					DOMAIN_ENCODE[subdomain[i]!]!,
				)
			}
		}
		number = huffmanEncode(
			number,
			SLD_ENCODE[knownSLD]!,
		)
	}

	// Encode SLD and subdomain presence flags
	if (knownSLD) {
		number <<= 1n
		if (subdomain) number += 1n
	}
	number <<= 1n
	if (knownSLD) number += 1n

	// Encode index suffix
	number <<= 1n
	if (hasIndexPHP) number += 1n
	if (hasIndexHTML || hasIndexPHP) {
		number <<= 1n
		number += 1n
	}

	// Encode protocol (HTTPS flag)
	number <<= 1n
	if (isHTTPS) number += 1n

	// Encode www prefix
	number <<= 1n
	if (hasWWW) number += 1n

	// Encode TLD
	number = huffmanEncode(
		number,
		TLD_ENCODE[tld as string] || TLD_ENCODE[""]!,
	)

	// Encode port number
	if (port) {
		number *= 65536n
		number += port
	}
	number <<= 1n
	if (port) number += 1n

	// Encode version number
	for (let i = 0; i < VERSION; i++) {
		number <<= 1n
		number += 1n
	}
	number <<= 1n

	return numberToString(number, alphabet)
}

/**
 * Decompresses a payload back into the original URL.
 *
 * @param input - Compressed payload string
 * @param alphabet - Character set used during compression
 * @returns The decompressed full URL
 */
export function decompress(
	input: string,
	alphabet: string[] = OUTPUT_ALPHABET_ASCII,
): string {
	let number = stringToNumber(input, alphabet)

	// Version number (currently unused)
	let _version = 0
	while (number & 1n) {
		_version++
		number >>= 1n
	}
	number >>= 1n

	// Decode port
	const hasPort = number & 1n
	number >>= 1n
	let port: bigint | undefined
	if (hasPort) {
		port = number % 65536n
		number /= 65536n
	}

	// Decode TLD
	const tldResult = huffmanDecode(number, TLD_DECODE)
	number = tldResult.newNumber
	const tld = tldResult.digit

	// Decode www flag
	const hasWWW = number & 1n
	number >>= 1n

	// Decode protocol
	const isHTTPS = number & 1n
	number >>= 1n

	// Decode index suffix
	let indexSuffix = ""
	if (number & 1n) {
		number >>= 1n
		if (number & 1n) {
			indexSuffix = "/index.php"
		} else {
			indexSuffix = "/index.html"
		}
	}
	number >>= 1n

	// Decode domain format flags
	const hasKnownSLD = number & 1n
	number >>= 1n
	let hasSubdomain = false
	if (hasKnownSLD) {
		hasSubdomain = !!(number & 1n)
		number >>= 1n
	}

	let domain = ""
	let subdomain = ""
	let path = ""

	// Decode domain
	if (hasKnownSLD) {
		const sldResult = huffmanDecode(number, SLD_DECODE)
		number = sldResult.newNumber
		domain = sldResult.digit
		if (hasSubdomain) {
			while (number > 1n) {
				const result = huffmanDecode(
					number,
					DOMAIN_DECODE,
				)
				number = result.newNumber
				if (result.digit === "END") break
				subdomain += result.digit
			}
		}
	} else {
		const firstResult = huffmanDecode(
			number,
			DOMAIN_DECODE,
		)
		number = firstResult.newNumber

		if (firstResult.digit === "END") {
			const ipv6Number =
				number & ((1n << 128n) - 1n)
			number >>= 128n
			domain = `[${numberToIPv6(ipv6Number)}]`
		} else {
			domain += firstResult.digit
			while (number > 1n) {
				const result = huffmanDecode(
					number,
					DOMAIN_DECODE,
				)
				number = result.newNumber
				if (result.digit === "END") break
				domain += result.digit
			}
		}
	}

	// Decode path segments
	const segmentTypeIndex = number % 3n
	number /= 3n
	const segmentTypes: SegmentType[] = [
		"path",
		"query",
		"hash",
	]
	let currentSegmentType: SegmentType =
		segmentTypes[Number(segmentTypeIndex)]!
	let queryParamIndex = 0

	while (number > 1n) {
		// Add segment separator
		if (currentSegmentType === "path") {
			path += "/"
		} else if (currentSegmentType === "hash") {
			path += "#"
		} else {
			if (queryParamIndex % 2) {
				path += "="
			} else if (queryParamIndex === 0) {
				path += "?"
			} else {
				path += "&"
			}
			queryParamIndex++
		}

		// Decode segment variant
		const variant = Number(
			number % BigInt(SUBALPHABETS.length + 1),
		)
		number /= BigInt(SUBALPHABETS.length + 1)

		if (variant === 0) {
			// Huffman decoding
			while (number > 1n) {
				const result = huffmanDecode(
					number,
					PATH_DECODE,
				)
				number = result.newNumber
				if (
					result.digit === "#" &&
					currentSegmentType !== "hash"
				)
					break
				path += result.digit
				if (result.digit === "%") {
					const byte = number % 256n
					path += byte.toString(16).padStart(2, "0")
					number /= 256n
				}
			}
		} else {
			// Subalphabet decoding
			const subalphabet = SUBALPHABETS[variant - 1]!
			const subalphabetLength = BigInt(
				subalphabet.length + 1,
			)
			while (number > 1n) {
				const index = Number(
					number % subalphabetLength,
				)
				number /= subalphabetLength
				if (index === 0) break
				path += subalphabet[index - 1]
			}
		}

		// Handle segment type transitions
		if (queryParamIndex % 2) continue
		if (number & 1n) {
			if (currentSegmentType === "path") {
				number >>= 1n
				if (number & 1n) {
					currentSegmentType = "hash"
				} else {
					currentSegmentType = "query"
				}
			} else {
				currentSegmentType = "hash"
			}
		}
		number >>= 1n
	}

	// Reconstruct the full URL
	const pathSplitIndex = path.search(/[?#]/)
	const pathBeforeQuery =
		pathSplitIndex === -1
			? path
			: path.slice(0, pathSplitIndex)
	const pathFromQuery =
		pathSplitIndex === -1
			? ""
			: path.slice(pathSplitIndex)

	return (
		(isHTTPS ? "https://" : "http://") +
		(hasWWW ? "www." : "") +
		subdomain +
		domain +
		(tld ? "." + tld : "") +
		(hasPort ? ":" + port : "") +
		pathBeforeQuery +
		indexSuffix +
		pathFromQuery
	)
}
