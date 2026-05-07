#!/usr/bin/env bash
set -euo pipefail

check_textinput_overrides() {
	local -a violations=()

	while IFS= read -r -d '' file; do
		if awk '
			BEGIN { in_tag=0; bad=0 }
			{
				if ($0 ~ /<TextInput([[:space:]>]|$)/) in_tag=1
				if (in_tag && $0 ~ /(^|[[:space:]])(:?class|style)=/) bad=1
				if (in_tag && $0 ~ />/) in_tag=0
			}
			END { exit bad ? 0 : 1 }
		' "$file"; then
			violations+=("$file")
		fi
	done < <(find src/renderer -type f -name '*.vue' -print0)

	if ((${#violations[@]} > 0)); then
		echo ""
		echo "TextInput usage check failed: do not add class/style directly on <TextInput>."
		echo "Use wrapper containers and Frappe UI props (variant, size, disabled) instead."
		echo ""
		echo "Files with violations:"
		printf ' - %s\n' "${violations[@]}"
		echo ""
		return 1
	fi
}

check_native_html_inputs() {
	local -a violations=()

	while IFS= read -r match; do
		violations+=("$match")
	done < <(grep -RInE --include='*.vue' '<(input|textarea|select)([[:space:]>])' src/renderer || true)

	if ((${#violations[@]} > 0)); then
		echo ""
		echo "Native HTML input check failed: use Frappe UI components instead of native tags."
		echo "Replace <input>, <textarea>, and <select> with Frappe components such as TextInput and Select."
		echo ""
		echo "Violations:"
		printf ' - %s\n' "${violations[@]}"
		echo ""
		return 1
	fi
}

check_input_style_hijacks() {
	local -a violations=()

	while IFS= read -r match; do
		violations+=("$match")
	done < <(grep -RInE --include='*.vue' ':deep\([^)]*\b(input|textarea|select)\b|::v-deep[^\n]*\b(input|textarea|select)\b' src/renderer || true)

	if ((${#violations[@]} > 0)); then
		echo ""
		echo "Input style isolation check failed: do not target input internals via deep selectors."
		echo "Avoid selectors such as :deep(input...), :deep(textarea...), :deep(select...), or ::v-deep ... input."
		echo "Use component props and wrapper layout styles only."
		echo ""
		echo "Violations:"
		printf ' - %s\n' "${violations[@]}"
		echo ""
		return 1
	fi
}

check_global_form_control_css_overrides() {
	local -a violations=()

	while IFS= read -r match; do
		violations+=("$match")
	done < <(grep -nE '(^|,)[[:space:]]*(input|textarea|select)(\b|:|\[)' src/renderer/styles.css || true)

	if ((${#violations[@]} > 0)); then
		echo ""
		echo "Global form-control CSS check failed: do not style input/select/textarea in src/renderer/styles.css."
		echo "Frappe UI components must control their own input internals."
		echo ""
		echo "Violations:"
		printf ' - %s\n' "${violations[@]}"
		echo ""
		return 1
	fi
}

check_textinput_overrides
check_native_html_inputs
check_input_style_hijacks
check_global_form_control_css_overrides
npm run lint
npm run typecheck
npm run test
