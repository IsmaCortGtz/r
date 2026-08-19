import * as Mode from "./mode.js"
import type { Mode as ModeType } from "./mode.js"
import type { Segment } from "./segment.js"
import * as NumericData from "./numeric-data.js"
import * as AlphanumericData from "./alphanumeric-data.js"
import * as ByteData from "./byte-data.js"
import * as KanjiData from "./kanji-data.js"
import * as Regex from "./regex.js"
import * as Utils from "./utils.js"
import { findPath } from "./dijkstra.js"

export type { Segment } from "./segment.js"

function getSegments(
	regex: RegExp,
	mode: ModeType,
	str: string,
): { data: string; index: number; mode: ModeType; length: number }[] {
	const segments: { data: string; index: number; mode: ModeType; length: number }[] = []
	let result: RegExpExecArray | null
	while ((result = regex.exec(str)) !== null) {
		segments.push({ data: result[0], index: result.index, mode, length: result[0].length })
	}
	return segments
}

function getSegmentsFromString(dataStr: string) {
	const numSegs = getSegments(Regex.NUMERIC, Mode.NUMERIC, dataStr)
	const alphaNumSegs = getSegments(Regex.ALPHANUMERIC, Mode.ALPHANUMERIC, dataStr)
	let byteSegs: { data: string; index: number; mode: ModeType; length: number }[]
	let kanjiSegs: { data: string; index: number; mode: ModeType; length: number }[]
	if (Utils.isKanjiModeEnabled()) {
		byteSegs = getSegments(Regex.BYTE, Mode.BYTE, dataStr)
		kanjiSegs = getSegments(Regex.KANJI, Mode.KANJI, dataStr)
	} else {
		byteSegs = getSegments(Regex.BYTE_KANJI, Mode.BYTE, dataStr)
		kanjiSegs = []
	}
	return numSegs
		.concat(alphaNumSegs, byteSegs, kanjiSegs)
		.sort((s1, s2) => s1.index - s2.index)
		.map((obj) => ({ data: obj.data, mode: obj.mode, length: obj.length }))
}

function getSegmentBitsLength(length: number, mode: ModeType): number {
	switch (mode) {
		case Mode.NUMERIC:
			return NumericData.getBitsLength(length)
		case Mode.ALPHANUMERIC:
			return AlphanumericData.getBitsLength(length)
		case Mode.KANJI:
			return KanjiData.getBitsLength(length)
		case Mode.BYTE:
			return ByteData.getBitsLength(length)
	}
	return 0
}

function mergeSegments(segs: Segment[]): Segment[] {
	return segs.reduce<Segment[]>((acc, curr) => {
		const prevSeg = acc.length - 1 >= 0 ? acc[acc.length - 1] : null
		if (prevSeg && prevSeg.mode === curr.mode) {
			if (typeof prevSeg.data === "string" && typeof curr.data === "string") {
				prevSeg.data += curr.data
			} else if (prevSeg.data instanceof Uint8Array && curr.data instanceof Uint8Array) {
				const merged = new Uint8Array(prevSeg.data.length + curr.data.length)
				merged.set(prevSeg.data)
				merged.set(curr.data, prevSeg.data.length)
				prevSeg.data = merged
			}
			return acc
		}
		acc.push(curr)
		return acc
	}, [])
}

function buildNodes(segs: { data: string; mode: ModeType; length: number }[]): Segment[][] {
	const nodes: Segment[][] = []
	for (let i = 0; i < segs.length; i++) {
		const seg = segs[i]!
		switch (seg.mode) {
			case Mode.NUMERIC:
				nodes.push([
					NumericData.createNumericData(seg.data),
					AlphanumericData.createAlphanumericData(seg.data),
					ByteData.createByteData(seg.data),
				])
				break
			case Mode.ALPHANUMERIC:
				nodes.push([
					AlphanumericData.createAlphanumericData(seg.data),
					ByteData.createByteData(seg.data),
				])
				break
			case Mode.KANJI:
				nodes.push([
					KanjiData.createKanjiData(seg.data),
					ByteData.createByteData(seg.data),
				])
				break
			case Mode.BYTE:
				nodes.push([ByteData.createByteData(seg.data)])
		}
	}
	return nodes
}

function buildGraph(
	nodes: Segment[][],
	version: number,
): { map: Record<string, Record<string, number>>; table: Record<string, { node: Segment; lastCount: number }> } {
	const table: Record<string, { node: Segment; lastCount: number }> = {}
	const graph: Record<string, Record<string, number>> = { start: {} }
	let prevNodeIds = ["start"]

	for (let i = 0; i < nodes.length; i++) {
		const nodeGroup = nodes[i]!
		const currentNodeIds: string[] = []

		for (let j = 0; j < nodeGroup.length; j++) {
			const node = nodeGroup[j]!
			const key = "" + i + j

			currentNodeIds.push(key)
			table[key] = { node, lastCount: 0 }
			graph[key] = {}

			for (let n = 0; n < prevNodeIds.length; n++) {
				const prevNodeId = prevNodeIds[n]!

				if (table[prevNodeId] && table[prevNodeId]!.node.mode === node.mode) {
					graph[prevNodeId]![key] =
						getSegmentBitsLength(table[prevNodeId]!.lastCount + node.getLength(), node.mode) -
						getSegmentBitsLength(table[prevNodeId]!.lastCount, node.mode)
					table[prevNodeId]!.lastCount += node.getLength()
				} else {
					if (table[prevNodeId]) table[prevNodeId]!.lastCount = node.getLength()
					graph[prevNodeId]![key] =
						getSegmentBitsLength(node.getLength(), node.mode) +
						4 +
						Mode.getCharCountIndicator(node.mode, version)
				}
			}
		}

		prevNodeIds = currentNodeIds
	}

	for (let n = 0; n < prevNodeIds.length; n++) {
		graph[prevNodeIds[n]!]!.end = 0
	}

	return { map: graph, table }
}

function buildSingleSegment(data: string, modesHint: ModeType | null): Segment {
	const bestMode = Mode.getBestModeForData(data)
	let mode = Mode.from(modesHint, bestMode)
	if (mode !== Mode.BYTE && mode.bit < bestMode.bit) {
		throw new Error(
			'"' + data + '" cannot be encoded with mode ' +
			Mode.modeToString(mode) + ".\n Suggested mode is: " + Mode.modeToString(bestMode),
		)
	}
	if (mode === Mode.KANJI && !Utils.isKanjiModeEnabled()) {
		mode = Mode.BYTE
	}
	switch (mode) {
		case Mode.NUMERIC:
			return NumericData.createNumericData(data)
		case Mode.ALPHANUMERIC:
			return AlphanumericData.createAlphanumericData(data)
		case Mode.KANJI:
			return KanjiData.createKanjiData(data)
		case Mode.BYTE:
			return ByteData.createByteData(data)
	}
	return ByteData.createByteData(data)
}

export function fromString(data: string, version: number): Segment[] {
	const segs = getSegmentsFromString(data)
	const nodes = buildNodes(segs)
	const graph = buildGraph(nodes, version)
	const path = findPath(graph.map, "start", "end")
	const optimizedSegs: Segment[] = []
	for (let i = 1; i < path.length - 1; i++) {
		optimizedSegs.push(graph.table[path[i]!]!.node)
	}
	return mergeSegments(optimizedSegs)
}

export function rawSplit(data: string): Segment[] {
	return getSegmentsFromString(data).map((s) =>
		buildSingleSegment(s.data, s.mode),
	)
}
