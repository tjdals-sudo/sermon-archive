#!/bin/bash
# 이 파일을 더블클릭하면 설교 업로드 창이 열립니다.

# Homebrew 경로를 확실히 잡아 둡니다 (터미널 설정과 무관하게 동작하도록)
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

cd "$HOME/sermon-archive" || {
  echo "설교 아카이브 폴더를 찾지 못했습니다: $HOME/sermon-archive"
  read -r -p "엔터를 누르면 닫힙니다..."
  exit 1
}

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js가 설치되어 있지 않습니다."
  echo "터미널에서 다음을 실행하세요:  brew install node"
  read -r -p "엔터를 누르면 닫힙니다..."
  exit 1
fi

[ -d node_modules ] || npm install

# 이미 켜져 있으면 새로 켜지 않고 그 창을 엽니다 (두 번 켜면 바로 꺼져 버립니다)
if lsof -iTCP:4321 -sTCP:LISTEN >/dev/null 2>&1; then
  echo ""
  echo "  설교 업로드 창이 이미 켜져 있어서 그 창을 엽니다."
  open "http://localhost:4321"
  read -r -p "  엔터를 누르면 이 창이 닫힙니다..."
  exit 0
fi

echo ""
echo "  설교 업로드 창을 엽니다. 잠시만 기다려 주세요..."
echo "  (다 쓰신 뒤에는 이 창에서 Control + C 를 누르세요)"
echo ""
node admin/server.mjs || {
  # 오류로 꺼졌을 때 창이 바로 닫히지 않게 해서 이유를 볼 수 있게 합니다
  echo ""
  read -r -p "  업로드 창이 꺼졌습니다. 위 메시지를 확인하고 엔터를 누르세요..."
}
