// This is unused module

function findRightBracket(classes: string, start = 0) {
	const stack = []
	for (let index = start; index < classes.length; index++) {
		if (classes[index] === "(") {
			stack.push(index)
		} else if (classes[index] === ")") {
			if (stack.length === 0) {
				return undefined
			}

			if (stack.length === 1) {
				return index
			}

			stack.pop()
		}
	}
	return undefined
}

function spreadVariantGroups(classes: string, context = "", importantContext = false, start = 0, end?: number) {
	if (classes === "") {
		return []
	}
	const results: string[] = []
	classes = classes.slice(start, end).trim()

	const reg = /([\w-]+:)|([\w-./]+!?)|\(|(\S+)/g
	let match: RegExpExecArray
	const baseContext = context
	while ((match = reg.exec(classes))) {
		const [, variant, className, weird] = match
		if (variant) {
			context += variant

			if (/\s/.test(classes[reg.lastIndex])) {
				context = baseContext
				continue
			}

			if (classes[reg.lastIndex] === "(") {
				const closeBracket = findRightBracket(classes, reg.lastIndex)
				if (typeof closeBracket !== "number") {
					throw `"${classes}" except to find a ')' to match the '('`
				} else {
					const importantGroup = classes[closeBracket + 1] === "!"
					results.push(
						...spreadVariantGroups(
							classes,
							context,
							importantContext || importantGroup,
							reg.lastIndex + 1,
							closeBracket,
						),
					)
					reg.lastIndex = closeBracket + (importantGroup ? 2 : 1)
					context = baseContext
				}
			}
		} else if (className) {
			const tail = !className.endsWith("!") && importantContext ? "!" : ""
			results.push(context + className + tail)
			context = baseContext
		} else if (weird) {
			throw `${weird} unexpected token`
		} else {
			const closeBracket = findRightBracket(classes, match.index)
			if (typeof closeBracket !== "number") {
				throw `"${classes}" except to find a ')' to match the '('`
			} else {
				const importantGroup = classes[closeBracket + 1] === "!"
				results.push(
					...spreadVariantGroups(
						classes,
						context,
						importantContext || importantGroup,
						match.index + 1,
						closeBracket,
					),
				)
				reg.lastIndex = closeBracket + (importantGroup ? 2 : 1)
			}
		}
	}

	return results
}

const handleVariantGroups = (classes: string) => spreadVariantGroups(classes).join(" ")

export { handleVariantGroups, spreadVariantGroups }
