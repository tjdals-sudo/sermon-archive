# 인천온누리교회 소년부 설교 아카이브

주일 설교 원고와 PPT를 올리면 날짜별로 정리되어 공개되는 웹사이트입니다.

---

## 🙋 매주 하는 일 (운영 매뉴얼)

1. **`설교올리기.command`를 더블클릭**하면 업로드 창이 열립니다.
2. 원고(**.docx**)와 발표자료(**.pptx**)를 네모 칸에 **끌어다 놓습니다.** (10~30초 기다림)
3. 자동으로 채워진 **제목·날짜·설교자·본문 구절을 확인**하고, 요약이 필요하면 `① 프롬프트 복사` → Claude에 붙여넣기 → 답을 `②` 칸에 붙여넣습니다.
4. **⚠ 빨간 경고(실명)** 가 뜨면 원고를 고치거나, 괜찮으면 `확인했습니다`를 체크합니다.
5. **`게시하기`** 를 누르면 끝. 2분 뒤 웹사이트에 나옵니다. (검토 중인 글은 인터넷에 올라가지 않습니다)

> 한글(hwp) 원고라면 한글에서 **`다른 이름으로 저장 → .docx`** 로 저장한 뒤 올리세요.

---

## 🖥 처음 한 번만 하는 설치

```bash
brew install node                        # 프로그램 실행기
brew install --cask libreoffice          # PPT를 변환하는 무료 프로그램
brew install poppler                     # 슬라이드를 이미지로 바꾸는 도구 (★ 한글 깨짐 방지에도 필요)
cd ~/sermon-archive && npm install       # 필요한 부품 내려받기
```

## 🚀 웹사이트 배포 (처음 한 번)

1. 깃헙에서 저장소를 새로 만듭니다. (이름 예: `sermon-archive`, **Public**)
2. 터미널에서:
   ```bash
   cd ~/sermon-archive
   git add -A && git commit -m "설교 아카이브 시작"
   git branch -M main
   git remote add origin https://github.com/<내아이디>/sermon-archive.git
   git push -u origin main
   ```
3. 깃헙 저장소 → **Settings → Pages → Source를 `GitHub Actions`** 로 선택합니다.
4. `site.config.mjs` 를 열어 **`url`** 과 **`base`** 를 내 주소로 고칩니다.
   ```js
   url:  'https://<내아이디>.github.io/sermon-archive',
   base: '/sermon-archive',
   ```
   (카카오톡 공유 미리보기가 이 주소를 씁니다. 꼭 고쳐야 합니다.)

---

## 📁 폴더 설명 (다음 담당자를 위해)

| 위치 | 무엇 |
|---|---|
| `src/content/sermons/*.json` | **설교 1편 = 파일 1개.** 여기 있는 것만 웹에 보입니다 |
| `public/files/<날짜>/` | 그 설교의 PDF·PPT·썸네일 |
| `.drafts/` | 검토 중인 원고. **인터넷에 올라가지 않습니다** (git 제외) |
| `.manuscripts/` | 게시된 설교의 원고 전문. **공개되지 않습니다** (git 제외) |
| `.summaries/` | 미리 써 둔 요약. `node admin/apply-summaries.mjs` 로 반영 |
| `site.config.mjs` | 교회 이름·주소 등 설정. 바꿀 일이 생기면 여기부터 |
| `admin/` | 업로드 프로그램 (내 컴퓨터에서만 돎) |
| `src/pages/`, `src/layouts/` | 성도들이 보는 화면 |

### 설교를 지우거나 고치려면
`src/content/sermons/2026-09-21.json` 파일을 직접 고치거나 지운 뒤,
```bash
git add -A && git commit -m "설교 수정" && git push
```

---

## 📦 과거 설교 한꺼번에 가져오기 (처음 한 번)

폴더에 쌓여 있는 원고·PPT를 날짜별로 짝지어 통째로 가져옵니다.

```bash
cd ~/sermon-archive
node admin/bulk-import.mjs "<설교 폴더 경로>"          # 전부
node admin/bulk-import.mjs "<폴더>" --only 20260104    # 특정 날짜만
node admin/bulk-import.mjs "<폴더>" --no-ppt           # 원고만 (빠름)
```

파일 이름에 `20260104` 처럼 날짜 8자리만 들어 있으면 자동으로 짝을 찾습니다.
가져온 뒤 **제목이 비어 있는 설교와 실명 의심 설교 목록**을 알려주니, 그것만 손보면 됩니다.

## 🖼 미리보기 (배포 전에 눈으로 확인)

```bash
node admin/make-sample.mjs
```
`다운로드/설교아카이브-샘플/` 폴더가 만들어집니다. 그 안의 **`미리보기 열기.command`** 를 더블클릭하면 브라우저에서 실제 화면을 볼 수 있습니다.

## 💾 슬라이드 화질과 용량

PPT는 PDF를 거쳐 **한 장씩 이미지로** 바뀝니다. 성도들은 폰에서 쭉 스크롤하며 봅니다.
- 화질을 올리려면 `admin/lib/convert.mjs` 의 `MaxImageResolution`(기본 150)과
  `pdfToImages` 의 `-scale-to-x 1200` 값을 키우세요. 용량은 그만큼 늘어납니다.
- 슬라이드 1장이 평균 60KB 안팎, 설교 한 편이 약 1.7MB입니다.

### ⚠️ PPT 한글이 깨져 보인다면
LibreOffice가 맥의 한글 폰트를 못 찾는 경우입니다. `brew install poppler` 로 fontconfig가 설치되면
자동으로 해결됩니다. 업로드 창 아래쪽에 경고가 뜨는지 확인하세요.

---

## ⚖️ 저작권·개인정보 원칙

- **성경 본문은 싣지 않습니다.** 구절 표기와 외부 성경 사이트 링크만 제공합니다.
- **PPT는 기본이 "보기만 허용"** 입니다. 찬양 가사·사진이 들어간 자료는 다운로드를 열지 마세요.
- 게시 전 **실명·연락처 자동 검사**를 지나야 합니다. 경고를 무시하려면 체크가 필요합니다.
- **설교 원고 전문은 웹에 올리지 않습니다.** 요약과 핵심 포인트만 공개하고,
  원고는 `.manuscripts/` 폴더에 내 컴퓨터에만 보관합니다 (git 제외).
- 설교 원고의 저작권은 설교자에게 있습니다.
