import { compress } from "../lib/codec"
import { OUTPUT_ALPHABET_ASCII } from "../lib/dictionaries"
import { BASE_URL } from "../lib/config"

function countSymbols(string: string, alphabet: string[]): number {
	let count = 0
	while (string) {
		const symbol = alphabet.find((c) => string.endsWith(c))
		string = string.slice(0, symbol ? -symbol.length : -1)
		count++
	}
	return count
}

const inputLink = document.querySelector<HTMLInputElement>("#input-link")!
const outputLink = document.querySelector<HTMLAnchorElement>("#output-link")!
const outputRatio = document.querySelector<HTMLSpanElement>("#output-ratio")!

function updateOutput() {
	const input = inputLink.value.trim()

	try {
		const output = compress(input, OUTPUT_ALPHABET_ASCII)

		let inputNormalized = input
		const inputLower = input.toLowerCase()
		if (inputLower.startsWith("https://")) {
			inputNormalized = input.slice(8)
		} else if (inputLower.startsWith("http://")) {
			inputNormalized = input.slice(7)
		}

		const ratio =
			(1 -
				(countSymbols(String(output), OUTPUT_ALPHABET_ASCII) +
					6) /
					inputNormalized.length) *
			100

		if (ratio < -300) {
			outputRatio.textContent =
				"Output is much larger than the input"
			outputRatio.style.color = "rgb(255, 50, 50)"
		} else if (ratio < 0) {
			outputRatio.textContent = `Output is ${Math.floor(-ratio)}% larger than the input`
			outputRatio.style.color = "rgb(255, 50, 50)"
		} else if (ratio > 0) {
			outputRatio.textContent = `Output is ${Math.ceil(ratio)}% smaller than the input`
			outputRatio.style.color = "rgb(15, 190, 15)"
		} else {
			outputRatio.textContent =
				"Output is the same length as the input"
			outputRatio.style.color = "gray"
		}

		const shortUrl = `${BASE_URL}#${output}`
		outputLink.textContent = shortUrl
		outputLink.href = shortUrl
		outputLink.style.color = ""
	} catch (e) {
		if (!input.trim()) {
			outputLink.textContent =
				"Enter a link above to compress"
		} else {
			outputLink.textContent = "Invalid link"
			outputLink.style.color = "rgb(255, 50, 50)"
			console.error(e)
		}
		outputRatio.style.color = "rgba(255, 255, 255, 0)"
		outputLink.removeAttribute("href")
	}
}

inputLink.addEventListener("input", updateOutput)
