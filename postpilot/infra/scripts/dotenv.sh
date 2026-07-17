#!/usr/bin/env bash

# Read a single NAME=value entry from the restricted dotenv files shipped with
# this repository. Values are returned as data and are never evaluated as shell
# code. Keep one assignment per line and do not add inline comments to values.
dotenv_get() {
  local file="$1"
  local name="$2"
  local line=""
  local value=""

  if [[ ! "$name" =~ ^[A-Z][A-Z0-9_]*$ ]]; then
    echo "Invalid dotenv variable name: $name" >&2
    return 64
  fi

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    if [[ "$line" == "$name="* ]]; then
      value="${line#*=}"

      # Accept matching outer quotes for convenience, but deliberately do not
      # interpret escapes, substitutions, backticks, or shell metacharacters.
      if (( ${#value} >= 2 )); then
        if [[ "${value:0:1}" == '"' && "${value: -1}" == '"' ]]; then
          value="${value:1:${#value}-2}"
        elif [[ "${value:0:1}" == "'" && "${value: -1}" == "'" ]]; then
          value="${value:1:${#value}-2}"
        fi
      fi

      printf '%s' "$value"
      return 0
    fi
  done <"$file"

  return 0
}
