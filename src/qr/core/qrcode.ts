import * as Utils from "./utils.js"
import * as ECLevel from "./error-correction-level.js"
import type { ECLevel as ECLevelType } from "./error-correction-level.js"
import * as BitBuffer from "./bit-buffer.js"
import * as BitMatrix from "./bit-matrix.js"
import * as AlignmentPattern from "./alignment-pattern.js"
import * as FinderPattern from "./finder-pattern.js"
import * as MaskPattern from "./mask-pattern.js"
import * as ECCode from "./error-correction.js"
import { createReedSolomonEncoder } from "./reed-solomon.js"
import * as Version from "./version.js"
import * as FormatInfo from "./format-info.js"
import * as Mode from "./mode.js"
import * as Segments from "./segments.js"
import type { Segment } from "./segment.js"

export interface QRCodeData {
	modules: BitMatrix.BitMatrix
	version: number
	errorCorrectionLevel: ECLevelType
	maskPattern: number
	segments: Segment[]
}

function setupFinderPattern(matrix: BitMatrix.BitMatrix, version: number): void {
	const size = matrix.size
	const pos = FinderPattern.getPositions(version)
	for (let i = 0; i < pos.length; i++) {
		const row = pos[i]![0]
		const col = pos[i]![1]
		for (let r = -1; r <= 7; r++) {
			if (row + r <= -1 || size <= row + r) continue
			for (let c = -1; c <= 7; c++) {
				if (col + c <= -1 || size <= col + c) continue
				if (
					(r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
					(c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
					(r >= 2 && r <= 4 && c >= 2 && c <= 4)
				) {
					BitMatrix.set(matrix, row + r, col + c, true, true)
				} else {
					BitMatrix.set(matrix, row + r, col + c, false, true)
				}
			}
		}
	}
}

function setupTimingPattern(matrix: BitMatrix.BitMatrix): void {
	const size = matrix.size
	for (let r = 8; r < size - 8; r++) {
		const value = r % 2 === 0
		BitMatrix.set(matrix, r, 6, value, true)
		BitMatrix.set(matrix, 6, r, value, true)
	}
}

function setupAlignmentPattern(matrix: BitMatrix.BitMatrix, version: number): void {
	const pos = AlignmentPattern.getPositions(version)
	for (let i = 0; i < pos.length; i++) {
		const row = pos[i]![0]
		const col = pos[i]![1]
		for (let r = -2; r <= 2; r++) {
			for (let c = -2; c <= 2; c++) {
				if (r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0)) {
					BitMatrix.set(matrix, row + r, col + c, true, true)
				} else {
					BitMatrix.set(matrix, row + r, col + c, false, true)
				}
			}
		}
	}
}

function setupVersionInfo(matrix: BitMatrix.BitMatrix, version: number): void {
	const size = matrix.size
	const bits = Version.getEncodedBits(version)
	for (let i = 0; i < 18; i++) {
		const row = Math.floor(i / 3)
		const col = (i % 3) + size - 8 - 3
		const mod = ((bits >> i) & 1) === 1
		BitMatrix.set(matrix, row, col, mod, true)
		BitMatrix.set(matrix, col, row, mod, true)
	}
}

function setupFormatInfo(
	matrix: BitMatrix.BitMatrix,
	errorCorrectionLevel: ECLevelType,
	maskPattern: number,
): void {
	const size = matrix.size
	const bits = FormatInfo.getEncodedBits(errorCorrectionLevel, maskPattern)
	for (let i = 0; i < 15; i++) {
		const mod = ((bits >> i) & 1) === 1
		if (i < 6) {
			BitMatrix.set(matrix, i, 8, mod, true)
		} else if (i < 8) {
			BitMatrix.set(matrix, i + 1, 8, mod, true)
		} else {
			BitMatrix.set(matrix, size - 15 + i, 8, mod, true)
		}
		if (i < 8) {
			BitMatrix.set(matrix, 8, size - i - 1, mod, true)
		} else if (i < 9) {
			BitMatrix.set(matrix, 8, 15 - i - 1 + 1, mod, true)
		} else {
			BitMatrix.set(matrix, 8, 15 - i - 1, mod, true)
		}
	}
	BitMatrix.set(matrix, size - 8, 8, true, true)
}

function setupData(matrix: BitMatrix.BitMatrix, data: Uint8Array): void {
	const size = matrix.size
	let inc = -1
	let row = size - 1
	let bitIndex = 7
	let byteIndex = 0

	for (let col = size - 1; col > 0; col -= 2) {
		if (col === 6) col--
		while (true) {
			for (let c = 0; c < 2; c++) {
				if (!BitMatrix.isReserved(matrix, row, col - c)) {
					let dark = false
					if (byteIndex < data.length) {
						dark = ((data[byteIndex]! >>> bitIndex) & 1) === 1
					}
					BitMatrix.set(matrix, row, col - c, dark)
					bitIndex--
					if (bitIndex === -1) {
						byteIndex++
						bitIndex = 7
					}
				}
			}
			row += inc
			if (row < 0 || size <= row) {
				row -= inc
				inc = -inc
				break
			}
		}
	}
}

function createData(
	version: number,
	errorCorrectionLevel: ECLevelType,
	segments: Segment[],
): Uint8Array {
	const buffer = BitBuffer.createBitBuffer()

	segments.forEach((data) => {
		BitBuffer.put(buffer, data.mode.bit, 4)
		BitBuffer.put(buffer, data.getLength(), Mode.getCharCountIndicator(data.mode, version))
		data.write(buffer)
	})

	const totalCodewords = Utils.getSymbolTotalCodewords(version)
	const ecTotalCodewords = ECCode.getTotalCodewordsCount(version, errorCorrectionLevel)!
	const dataTotalCodewordsBits = (totalCodewords - ecTotalCodewords) * 8

	if (BitBuffer.getLengthInBits(buffer) + 4 <= dataTotalCodewordsBits) {
		BitBuffer.put(buffer, 0, 4)
	}
	while (BitBuffer.getLengthInBits(buffer) % 8 !== 0) {
		BitBuffer.putBit(buffer, false)
	}
	const remainingByte = (dataTotalCodewordsBits - BitBuffer.getLengthInBits(buffer)) / 8
	for (let i = 0; i < remainingByte; i++) {
		BitBuffer.put(buffer, i % 2 ? 0x11 : 0xec, 8)
	}

	return createCodewords(buffer, version, errorCorrectionLevel)
}

function createCodewords(
	bitBuffer: BitBuffer.BitBuffer,
	version: number,
	errorCorrectionLevel: ECLevelType,
): Uint8Array {
	const totalCodewords = Utils.getSymbolTotalCodewords(version)
	const ecTotalCodewords = ECCode.getTotalCodewordsCount(version, errorCorrectionLevel)!
	const dataTotalCodewords = totalCodewords - ecTotalCodewords
	const ecTotalBlocks = ECCode.getBlocksCount(version, errorCorrectionLevel)!
	const blocksInGroup2 = totalCodewords % ecTotalBlocks
	const blocksInGroup1 = ecTotalBlocks - blocksInGroup2
	const dataCodewordsInGroup1 = Math.floor(dataTotalCodewords / ecTotalBlocks)
	const dataCodewordsInGroup2 = dataCodewordsInGroup1 + 1
	const ecCount = Math.floor(totalCodewords / ecTotalBlocks) - dataCodewordsInGroup1
	const rs = createReedSolomonEncoder(ecCount)

	let offset = 0
	const dcData = new Array<Uint8Array>(ecTotalBlocks)
	const ecData = new Array<Uint8Array>(ecTotalBlocks)
	let maxDataSize = 0
	const buffer = new Uint8Array(bitBuffer.buffer)

	for (let b = 0; b < ecTotalBlocks; b++) {
		const dataSize = b < blocksInGroup1 ? dataCodewordsInGroup1 : dataCodewordsInGroup2
		dcData[b] = buffer.slice(offset, offset + dataSize)
		ecData[b] = rs.encode(dcData[b]!)
		offset += dataSize
		maxDataSize = Math.max(maxDataSize, dataSize)
	}

	const data = new Uint8Array(totalCodewords)
	let index = 0
	for (let i = 0; i < maxDataSize; i++) {
		for (let r = 0; r < ecTotalBlocks; r++) {
			if (i < dcData[r]!.length) {
				data[index++] = dcData[r]![i]!
			}
		}
	}
	for (let i = 0; i < ecCount; i++) {
		for (let r = 0; r < ecTotalBlocks; r++) {
			data[index++] = ecData[r]![i]!
		}
	}
	return data
}

function createSymbol(
	data: string | Segment[],
	version: number | undefined,
	errorCorrectionLevel: ECLevelType,
	maskPattern: number | undefined,
): QRCodeData {
	let segments: Segment[]

	if (Array.isArray(data)) {
		segments = data
	} else if (typeof data === "string") {
		let estimatedVersion = version
		if (!estimatedVersion) {
			const rawSegments = Segments.rawSplit(data)
			estimatedVersion = Version.getBestVersionForData(rawSegments, errorCorrectionLevel)
		}
		segments = Segments.fromString(data, estimatedVersion || 40)
	} else {
		throw new Error("Invalid data")
	}

	const bestVersion = Version.getBestVersionForData(segments, errorCorrectionLevel)
	if (!bestVersion) {
		throw new Error("The amount of data is too big to be stored in a QR Code")
	}

	if (!version) {
		version = bestVersion
	} else if (version < bestVersion) {
		throw new Error(
			"\nThe chosen QR Code version cannot contain this amount of data.\n" +
			"Minimum version required to store current data is: " + bestVersion + ".\n",
		)
	}

	const dataBits = createData(version, errorCorrectionLevel, segments)
	const moduleCount = Utils.getSymbolSize(version)
	const modules = BitMatrix.createBitMatrix(moduleCount)

	setupFinderPattern(modules, version)
	setupTimingPattern(modules)
	setupAlignmentPattern(modules, version)
	setupFormatInfo(modules, errorCorrectionLevel, 0)
	if (version >= 7) {
		setupVersionInfo(modules, version)
	}
	setupData(modules, dataBits)

	if (maskPattern === undefined || isNaN(maskPattern)) {
		maskPattern = MaskPattern.getBestMask(
			modules,
			(p) => setupFormatInfo(modules, errorCorrectionLevel, p),
		)
	}

	MaskPattern.applyMask(maskPattern!, modules)
	setupFormatInfo(modules, errorCorrectionLevel, maskPattern!)

	return { modules, version, errorCorrectionLevel, maskPattern: maskPattern!, segments }
}

export interface QRCodeOptions {
	width?: number
	margin?: number
	scale?: number
	errorCorrectionLevel?: "L" | "M" | "Q" | "H"
	version?: number
	maskPattern?: number
	color?: { dark?: string; light?: string }
	toSJISFunc?: (char: string) => number
	moduleStyle?: "square" | "dots" | "rounded"
	cornerRadius?: number
	logo?: {
		src: string
		size?: number
		position?: "center" | "bottom-right"
		padding?: number
		naturalWidth?: number
		naturalHeight?: number
	}
}

export function create(data: string, options?: QRCodeOptions): QRCodeData {
	if (typeof data === "undefined" || data === "") {
		throw new Error("No input text")
	}

	let errorCorrectionLevel: ECLevelType = ECLevel.M
	let version: number | undefined
	let mask: number | undefined

	if (typeof options !== "undefined") {
		errorCorrectionLevel = ECLevel.from(options.errorCorrectionLevel, ECLevel.M)
		version = Version.from(options.version, 0) || undefined
		mask = MaskPattern.from(options.maskPattern)
		if (options.toSJISFunc) {
			Utils.setToSJISFunction(options.toSJISFunc)
		}
	}

	return createSymbol(data, version, errorCorrectionLevel, mask)
}
