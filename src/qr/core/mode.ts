export interface Mode {
	id: string
	bit: number
	ccBits: number[]
}

export const NUMERIC: Mode = { id: "Numeric", bit: 1 << 0, ccBits: [10, 12, 14] }
export const ALPHANUMERIC: Mode = { id: "Alphanumeric", bit: 1 << 1, ccBits: [9, 11, 13] }
export const BYTE: Mode = { id: "Byte", bit: 1 << 2, ccBits: [8, 16, 16] }
export const KANJI: Mode = { id: "Kanji", bit: 1 << 3, ccBits: [8, 10, 12] }
export const MIXED: Mode = { id: "Mixed", bit: -1, ccBits: [] }

import * as VersionCheck from "./version-check.js"
import * as Regex from "./regex.js"

export function getCharCountIndicator(mode: Mode, version: number): number {
	if (!mode.ccBits.length) throw new Error("Invalid mode: " + mode.id)
	if (!VersionCheck.isValid(version)) throw new Error("Invalid version: " + version)
	if (version >= 1 && version < 10) return mode.ccBits[0]!
	else if (version < 27) return mode.ccBits[1]!
	return mode.ccBits[2]!
}

export function getBestModeForData(dataStr: string): Mode {
	if (Regex.testNumeric(dataStr)) return NUMERIC
	else if (Regex.testAlphanumeric(dataStr)) return ALPHANUMERIC
	else if (Regex.testKanji(dataStr)) return KANJI
	else return BYTE
}

export function modeToString(mode: Mode): string {
	return mode.id
}

export function isValid(mode: unknown): boolean {
	const m = mode as Mode
	return !!(m && m.bit && m.ccBits && m.ccBits.length)
}

function fromString(string: string): Mode {
	switch (string.toLowerCase()) {
		case "numeric": return NUMERIC
		case "alphanumeric": return ALPHANUMERIC
		case "kanji": return KANJI
		case "byte": return BYTE
		default: throw new Error("Unknown mode: " + string)
	}
}

export function from(value: unknown, defaultValue: Mode): Mode {
	if (isValid(value)) return value as Mode
	try {
		return fromString(value as string)
	} catch {
		return defaultValue
	}
}
