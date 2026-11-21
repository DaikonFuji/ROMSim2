#!/bin/sh
# tests/why.sh <ROM> <i> [N] [seed]: both sides' bonus breakdowns for one random build
JSON=1 node "$(dirname "$0")/explain.js" "$2" "${3:-20}" "${4:-1}" > /tmp/why.json
python3 "$(dirname "$0")/explain.py" "$1" < /tmp/why.json | tr -d '\n' ; echo; echo ----
node "$(dirname "$0")/explain.js" "$2" "${3:-20}" "${4:-1}"
