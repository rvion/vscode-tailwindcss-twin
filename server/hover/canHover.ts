import { Range, TextDocumentPositionParams } from "vscode-languageserver"

import { documents } from "~/server"
import { getPatterns, canMatch } from "~/patterns"
import { findClasses } from "~/find"
import { getSeparator } from "~/common"

export function canHover({ textDocument, position }: TextDocumentPositionParams) {
	const document = documents.get(textDocument.uri)
	const patterns = getPatterns({ document })
	for (const { type, lpat, rpat, handleBrackets, handleImportant, ...meta } of patterns) {
		let range: Range
		if (type === "single") {
			range = {
				start: { line: position.line, character: 0 },
				end: { line: position.line + 1, character: 0 },
			}
		} else if (type === "multiple") {
			range = {
				start: { line: position.line - 20, character: 0 },
				end: { line: position.line + 20, character: 0 },
			}
		}
		const text = document.getText(range)
		const offset = document.offsetAt(position)
		const base = document.offsetAt(range.start)
		const match = canMatch({
			text,
			lpat,
			rpat,
			type,
			index: offset - document.offsetAt(range.start),
		})
		if (!match) {
			continue
		}
		range = {
			start: document.positionAt(base + match[0]),
			end: document.positionAt(base + match[1]),
		}
		const result = findClasses({
			classes: match[2],
			index: document.offsetAt(position) - document.offsetAt(range.start),
			separator: getSeparator(),
			handleBrackets,
			handleImportant,
			greedy: false,
			hover: true,
		})
		if (!result.selection.selected) {
			continue
		}

		const { selected, ...rest } = result.selection
		const b = document.offsetAt(range.start)
		return {
			...meta,
			range: {
				start: document.positionAt(b + selected[0]),
				end: document.positionAt(b + selected[1]),
			},
			value: selected[2],
			...rest,
		}
	}
	return null
}