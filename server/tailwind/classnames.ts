import parser from "postcss-selector-parser"
import type { Result, Node, Rule } from "postcss"
import chroma from "chroma-js"

export const __INNER_TAILWIND_SEPARATOR__ = "_twsp_"

const selectorProcessor = parser()

const __baseVariants: Record<string, string[]> = {
	hover: ["&:hover"],
	focus: ["&:focus"],
	"group-hover": [".group:hover"],
	"focus-within": ["&:focus-within"],
	active: ["&:active"],
	"group-focus": [".group:focus"],
	"focus-visible": ["&:focus-visible"],
	"motion-safe": ["@media (prefers-reduced-motion: no-preference)"],
	"motion-reduce": ["@media (prefers-reduced-motion: reduce)"],
	disabled: ["&:disabled"],
	visited: ["&:visited"],
	checked: ["&:checked"],
	first: ["&:first-child"],
	last: ["&:last-child"],
	odd: ["&:nth-child(odd)"],
	even: ["&:nth-child(even)"],
}

// source: https://github.com/ben-rogerson/twin.macro/blob/master/src/config/variantConfig.js
//
// In Twin, these are always available on just about any class
const twinVariants: Record<string, string[]> = {
	// Before/after pseudo elements
	// Usage: tw`before:(content block w-10 h-10 bg-black)`
	before: ["&:before"],
	after: ["&:after"],

	// Interactive links/buttons
	hover: ["&:hover"], // Tailwind
	focus: ["&:focus"], // Tailwind
	active: ["&:active"], // Tailwind
	visited: ["&:visited"], // Tailwind
	hocus: ["&:hover", "&:focus"],
	link: ["&:link"],
	target: ["&:target"],
	"focus-visible": ["&:focus-visible"], // Tailwind
	"focus-within": ["&:focus-within"], // Tailwind

	// Form element states
	disabled: ["&:disabled"], // Tailwind
	checked: ["&:checked"], // Tailwind
	"not-checked": ["&:not(:checked)"],
	default: ["&:default"],
	enabled: ["&:enabled"],
	indeterminate: ["&:indeterminate"],
	invalid: ["&:invalid"],
	valid: ["&:valid"],
	optional: ["&:optional"],
	required: ["&:required"],
	"placeholder-shown": ["&:placeholder-shown"],
	"read-only": ["&:read-only"],
	"read-write": ["&:read-write"],

	// Child selectors
	"not-disabled": ["&:not(:disabled)"],
	"first-of-type": ["&:first-of-type"],
	"not-first-of-type": ["&:not(:first-of-type)"],
	"last-of-type": ["&:last-of-type"],
	"not-last-of-type": ["&:not(:last-of-type)"],
	first: ["&:first-child"], // Tailwind
	"not-first": ["&:not(:first-child)"],
	last: ["&:last-child"], // Tailwind
	"not-last": [":not(:last-child)"],
	"only-child": ["&:only-child"],
	"not-only-child": ["&:not(:only-child)"],
	"only-of-type": ["&:only-of-type"],
	"not-only-of-type": ["&:not(:only-of-type)"],
	even: ["&:nth-child(even)"], // Tailwind
	odd: ["&:nth-child(odd)"], // Tailwind
	"even-of-type": ["&:nth-of-type(even)"],
	"odd-of-type": ["&:nth-of-type(odd)"],
	svg: ["svg"],
	all: ["*"],
	"all-child": ["> *"],
	sibling: ["~ *"],

	// Group states
	// You'll need to add className="group" to an ancestor to make these work
	// https://github.com/ben-rogerson/twin.macro/blob/master/docs/group.md
	"group-hover": [".group:hover"],
	"group-focus": [".group:focus"],
	"group-hocus": [".group:hover", ".group:focus"],
	"group-active": [".group:active"],
	"group-visited": [".group:visited"],

	// Motion control
	// https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
	"motion-safe": ["@media (prefers-reduced-motion: no-preference)"],
	"motion-reduce": ["@media (prefers-reduced-motion: reduce)"],

	// Dark mode
	dark: ["@media (prefers-color-scheme: dark)"],
	light: ["@media (prefers-color-scheme: light)"],
}

interface ClassName {
	scope?: string
	name: string
	rule: boolean
	pseudo: string[]
}

export interface CSSRuleItem {
	__scope?: string
	__rule?: boolean
	decls?: Record<string, string[]>
	__source?: string
	__context: string[]
	__pseudo: string[]
}

export function createSelectorFromNodes(nodes: parser.Selector[]): string {
	if (nodes.length === 0) return null
	const selector = parser.selector({ value: "" })
	for (let i = 0; i < nodes.length; i++) {
		selector.append(nodes[i])
	}
	return String(selector).trim()
}

export function getClassNames(rule: Rule, notRules: Record<string, Set<string>>) {
	const classNames: ClassName[] = []
	const { nodes: selectors } = selectorProcessor.astSync(rule.selector)
	for (let i = 0; i < selectors.length; i++) {
		const scopes: parser.Node[] = []
		for (let j = 0; j < selectors[i].nodes.length; j++) {
			const node = selectors[i].nodes[j]
			const pseudos: parser.Pseudo[] = []
			if (node.type === "class") {
				for (let next: parser.Node; (next = selectors[i].nodes[j + 1]), next?.type === "pseudo"; j++) {
					pseudos.push(next)
				}
				const name = node.value.trim()
				const rule = j === selectors[i].nodes.length - 1
				const pseudo = pseudos.map(String)
				const className: ClassName = { name, rule, pseudo }
				// exception
				if (name.includes("divide-") || name.includes("space-")) {
					className.rule = true
				}
				if (scopes.length > 0) {
					className.scope = createSelectorFromNodes(scopes as parser.Selector[])
				}
				classNames.push(className)
				if (!className.rule) {
					if (!notRules[name]) {
						notRules[name] = new Set<string>()
					}
					for (const p of pseudo) notRules[name].add(p)
				}
			}
			scopes.push(node, ...pseudos)
		}
	}
	return classNames
}

export function dlv(cur: unknown, paths: string[]) {
	if (cur == undefined) {
		return undefined
	}
	for (let i = 0; i < paths.length; ++i) {
		if (cur[paths[i]] == undefined) {
			return undefined
		} else {
			cur = cur[paths[i]]
		}
	}
	return cur
}

export function dset(cur: unknown, paths: Array<string | number>, value: unknown) {
	if (cur == undefined || paths.length === 0) {
		return
	}
	for (let i = 0; i < paths.length - 1; ++i) {
		const key = paths[i]
		if (cur[key] == undefined) {
			// if next key is digit number
			cur[key] = +paths[i + 1] > -1 ? new Array(0) : {}
		}
		cur = cur[key]
	}
	const last = paths[paths.length - 1]
	cur[last] = value
}

export function intersection<T = unknown>(arr1: T[], arr2: T[]) {
	return arr1.filter(value => arr2.indexOf(value) !== -1)
}

export function parseResults(groups: Array<{ source: string; result: Result }>, twin = false) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const tree: Record<string, any> = {}
	const variants: Record<string, string[]> = {}

	for (const { source, result } of groups) {
		const notRules: Record<string, Set<string>> = {}
		result.root.walkRules(rule => {
			const classNames = getClassNames(rule, notRules)
			const decls: Record<string, string[]> = {}
			rule.walkDecls(decl => {
				const d = decls[decl.prop]
				if (d) {
					decls[decl.prop] = [...(d instanceof Array ? d : [d]), decl.value]
				} else {
					decls[decl.prop] = [decl.value]
				}
			})

			let p = rule as Node
			const keys: string[] = []
			while (p.parent.type !== "root") {
				p = p.parent
				if (p.type === "atrule") {
					keys.push(`@${p["name"]} ${p["params"]}`)
				}
			}

			for (let i = 0; i < classNames.length; i++) {
				const context = keys.slice()
				const baseKeys = classNames[i].name.split(__INNER_TAILWIND_SEPARATOR__)
				const variantKeys = baseKeys.slice(0, baseKeys.length - 1)
				let index: number[] = []

				const info = dlv(tree, [...baseKeys])
				if (info instanceof Array) {
					index = [info.length]
				} else if (classNames[i].rule) {
					index = [0]
					dset(tree, [...baseKeys], [])
				}
				if (classNames[i].scope) {
					dset(tree, [...baseKeys, ...index, "__scope"], classNames[i].scope)
				}
				if (classNames[i].rule) {
					dset(tree, [...baseKeys, ...index, "__rule"], true)
					for (const key in decls) {
						dset(tree, [...baseKeys, ...index, "decls", key], decls[key])
					}
					dset(tree, [...baseKeys, ...index, "__source"], source)
					dset(tree, [...baseKeys, ...index, "__pseudo"], classNames[i].pseudo)
					dset(tree, [...baseKeys, ...index, "__context"], context.slice().reverse())
				}

				// common context
				context.push(...classNames[i].pseudo.map(x => `&${x}`))
				for (let i = 0; i < variantKeys.length; i++) {
					if (!variants[variantKeys[i]]) {
						variants[variantKeys[i]] = context
					} else {
						variants[variantKeys[i]] = intersection(variants[variantKeys[i]], context)
					}
				}
				if (classNames[i].scope === ".dark") {
					for (const p of classNames[i].pseudo) notRules["dark"].add(`&${p}`)
				}
			}
		})

		for (const [name, pesudos] of Object.entries(notRules)) {
			if (name === "dark") {
				variants["dark"] = Array.from(pesudos)
				continue
			}
			dset(tree, [name, "__source"], source)
			dset(tree, [name, "__pseudo"], Array.from(pesudos))
			dset(tree, [name, "__context"], [])
		}
	}

	for (const k in variants) {
		if (__baseVariants[k]) {
			variants[k] = __baseVariants[k]
		}
	}
	const baseVariants = { ...variants }
	if (twin) {
		for (const k in twinVariants) {
			variants[k] = twinVariants[k]
		}
	}
	return {
		dictionary: tree,
		baseVariants,
		twinVariants,
		variants,
		colors: collectColors(tree),
		breakingPoints: collectBreakingPoints(variants),
	}
}

function collectBreakingPoints(variants: Record<string, string[]>) {
	const reg = /@media\s\(.*width:\s*(\d+)px/
	const result: Record<string, number> = {}
	for (const label in variants) {
		for (const value of variants[label]) {
			const match = value.match(reg)
			if (match) {
				const [, v] = match
				result[label] = Number(v)
				break
			}
		}
	}
	return result
}

function collectColors(tree: Record<string, CSSRuleItem | CSSRuleItem[]>) {
	const colors: Record<string, string> = {}
	Object.entries(tree).forEach(([label, info]) => {
		if (!(info instanceof Array)) {
			return
		}
		const decls = (info as CSSRuleItem[])
			.filter(i => i.__rule)
			.flatMap(v => {
				const ret: Array<[string, string]> = []
				for (const key in v.decls) {
					for (const value of v.decls[key]) {
						ret.unshift([key, value])
					}
				}
				return ret
			})
		if (decls.length === 0) {
			return
		}

		const index = decls.findIndex(
			v => v[0].includes("color") || v[0].includes("gradient") || v[0] === "fill" || v[0] === "stroke",
		)
		if (index === -1) {
			return
		}

		if (label.includes("current")) {
			colors[label] = "currentColor"
			return
		}

		if (label.includes("transparent")) {
			colors[label] = "transparent"
			return
		}
		let lastVal = decls[index][1]

		lastVal = lastVal.replace(/,\s*var\(\s*[\w-]+\s*\)/g, ", 1")
		const reg = /#[0-9a-fA-F]{3}\b|#[0-9a-fA-F]{6}\b|rgba\(\s*(?<r>\d{1,3})\s*,\s*(?<g>\d{1,3})\s*,\s*(?<b>\d{1,3})\s*,\s*(?<a>\d{1,3})\s*\)/
		const m = lastVal.match(reg)
		if (m == null) {
			return
		}
		let color: chroma.Color
		if (m.groups?.r) {
			const { r, g, b } = m.groups
			color = chroma(+r, +g, +b)
		} else {
			color = chroma(m[0])
		}

		colors[label] = color.hex()
	})
	return colors
}

export function extractClassNames([base, components, utilities]: [Result, Result, Result], twin = false) {
	return parseResults(
		[
			// { source: "base", result: base },
			{ source: "components", result: components },
			{ source: "utilities", result: utilities },
		],
		twin,
	)
}