export interface ECLevel {
	bit: number
}

export const L: ECLevel = { bit: 1 }
export const M: ECLevel = { bit: 0 }
export const Q: ECLevel = { bit: 3 }
export const H: ECLevel = { bit: 2 }

function fromString(string: string): ECLevel {
	switch (string.toLowerCase()) {
		case "l":
		case "low":
			return L
		case "m":
		case "medium":
			return M
		case "q":
		case "quartile":
			return Q
		case "h":
		case "high":
			return H
		default:
			throw new Error("Unknown EC Level: " + string)
	}
}

export function isValid(level: unknown): boolean {
	return (
		level != null &&
		typeof (level as ECLevel).bit !== "undefined" &&
		(level as ECLevel).bit >= 0 &&
		(level as ECLevel).bit < 4
	)
}

export function from(
	value: unknown,
	defaultValue: ECLevel,
): ECLevel {
	if (isValid(value)) return value as ECLevel
	try {
		return fromString(value as string)
	} catch {
		return defaultValue
	}
}
