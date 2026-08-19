import * as Utils from "./utils.js"
import * as ECCode from "./error-correction.js"
import * as ECLevel from "./error-correction-level.js"
import * as Mode from "./mode.js"
import type { Mode as ModeType } from "./mode.js"
import * as VersionCheck from "./version-check.js"
import type { Segment } from "./segment.js"

const G18 =
	(1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0)
const G18_BCH = Utils.getBCHDigit(G18)

function getReservedBitsCount(mode: ModeType, version: number): number {
	return Mode.getCharCountIndicator(mode, version) + 1
}

function getCapacity(version: number, errorCorrectionLevel: ECLevel.ECLevel, mode?: ModeType): number {
	if (!VersionCheck.isValid(version)) throw new Error("Invalid QR Code version")
	if (typeof mode === "undefined") mode = Mode.BYTE
	const totalCodewords = Utils.getSymbolTotalCodewords(version)
	const ecTotalCodewords = ECCode.getTotalCodewordsCount(version, errorCorrectionLevel)!
	const dataTotalCodewordsBits = (totalCodewords - ecTotalCodewords) * 8
	if (mode === Mode.MIXED) return dataTotalCodewordsBits
	const usableBits = dataTotalCodewordsBits - getReservedBitsCount(mode, version)
	switch (mode) {
		case Mode.NUMERIC:
			return Math.floor((usableBits / 10) * 3)
		case Mode.ALPHANUMERIC:
			return Math.floor((usableBits / 11) * 2)
		case Mode.KANJI:
			return Math.floor(usableBits / 13)
		case Mode.BYTE:
		default:
			return Math.floor(usableBits / 8)
	}
}

function getBestVersionForDataLength(mode: ModeType, length: number, errorCorrectionLevel: ECLevel.ECLevel): number | undefined {
	for (let v = 1; v <= 40; v++) {
		if (length <= getCapacity(v, errorCorrectionLevel, mode)) return v
	}
	return undefined
}

function getTotalBitsFromDataArray(segments: Segment[], version: number): number {
	let totalBits = 0
	segments.forEach((data) => {
		totalBits += getReservedBitsCount(data.mode, version) + data.getBitsLength()
	})
	return totalBits
}

function getBestVersionForMixedData(segments: Segment[], errorCorrectionLevel: ECLevel.ECLevel): number | undefined {
	for (let v = 1; v <= 40; v++) {
		if (getTotalBitsFromDataArray(segments, v) <= getCapacity(v, errorCorrectionLevel, Mode.MIXED)) {
			return v
		}
	}
	return undefined
}

export function from(value: unknown, defaultValue: number): number {
	if (VersionCheck.isValid(value)) return parseInt(value as string, 10)
	return defaultValue
}

export function getBestVersionForData(data: Segment | Segment[], errorCorrectionLevel: ECLevel.ECLevel): number | undefined {
	const ecl = ECLevel.from(errorCorrectionLevel, ECLevel.M)
	if (Array.isArray(data)) {
		if (data.length > 1) return getBestVersionForMixedData(data, ecl)
		if (data.length === 0) return 1
		return getBestVersionForDataLength(data[0]!.mode, data[0]!.getLength(), ecl)
	}
	return getBestVersionForDataLength(data.mode, data.getLength(), ecl)
}

export function getEncodedBits(version: number): number {
	if (!VersionCheck.isValid(version) || version < 7) {
		throw new Error("Invalid QR Code version")
	}
	let d = version << 12
	while (Utils.getBCHDigit(d) - G18_BCH >= 0) {
		d ^= G18 << (Utils.getBCHDigit(d) - G18_BCH)
	}
	return (version << 12) | d
}
