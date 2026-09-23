#!/bin/bash
# 이 파일을 더블클릭하면 설교 업로드 창이 열립니다.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js가 설치되어 있지 않습니다."
  echo "터미널에서 다음을 실행하세요:  brew install node"
  read -r -p "엔터를 누르면 닫힙니다..."
  exit 1
fi
[ -d node_modules ] || npm install
node admin/server.mjs
