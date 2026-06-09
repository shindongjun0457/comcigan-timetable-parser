오현중학교 시간표 게시판 배포 파일

변경된 파일
1. index.html
2. functions/api/notice.js
3. school-logo.png

그대로 유지한 파일
- functions/api/meal.js
- functions/api/timetable.js
- script.js

배포 방법
- 저장소 루트의 index.html을 교체합니다.
- 저장소 루트에 school-logo.png를 추가합니다.
- functions/api/notice.js를 교체합니다.
- GitHub에 커밋·푸시하면 Cloudflare Pages가 다시 배포됩니다.

기능
- 화면 전체가 5분마다 최대 ±3px 미세 이동
- 10분마다 약 10초간 학교 로고 및 비전 연출
- tt.djcom.kr: 학교 비전
- tt1.djcom.kr: 1학년 비전
- tt2.djcom.kr: 2학년 비전
- tt3.djcom.kr: 3학년 비전
- 공지사항 옆 버튼으로 학교·학년 비전 저장
- 저장한 문구는 기존 NOTICES KV에 함께 저장
