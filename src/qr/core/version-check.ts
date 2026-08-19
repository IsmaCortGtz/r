export function isValid(version: unknown): boolean {
	return !isNaN(version as number) && (version as number) >= 1 && (version as number) <= 40
}
