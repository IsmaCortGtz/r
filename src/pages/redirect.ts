import { decompress } from "../lib/codec"
import { OUTPUT_ALPHABET_ASCII, OUTPUT_ALPHABET_QR } from "../lib/dictionaries"

let payload: string | null = null
let alphabet: string[] = OUTPUT_ALPHABET_ASCII

if (window.location.hash) {
	payload = decodeURIComponent(window.location.hash.slice(1))
	payload = payload.replaceAll(" ", "")
} else {
	const pathPayload = decodeURIComponent(
		window.location.pathname.slice(1),
	)
	if (pathPayload.trim()) {
		payload = pathPayload
		alphabet = OUTPUT_ALPHABET_QR
	}
}

if (payload) {
	try {
		const target = decompress(payload, alphabet)
		window.location.replace(target)
	} catch {
		window.location.replace("./new.html")
	}
} else {
	window.location.replace("./new.html")
}
