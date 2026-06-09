
const CLASSES_PER_GRADE = 7;
const PERIODS = 7;
const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];
const ALLERGEN_MAP = {
  "1": "난류",
  "2": "우유",
  "3": "메밀",
  "4": "땅콩",
  "5": "대두",
  "6": "밀",
  "7": "고등어",
  "8": "게",
  "9": "새우",
  "10": "돼지고기",
  "11": "복숭아",
  "12": "토마토",
  "13": "아황산류",
  "14": "호두",
  "15": "닭고기",
  "16": "쇠고기",
  "17": "오징어",
  "18": "조개류",
  "19": "잣"
};

const state = {
  grade: 1,
  date: "",
  data: null,
  updatedAt: null,
  noticeEditing: false,
  noticeText: "",
  noticeLoading: false,
  timetableSignature: ""
};

const $ = (id) => document.getElementById(id);

function getKstDate() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + 9 * 60 * 60 * 1000);
}

function toDateInputValue(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dateFromInput(value) {
  return new Date(`${value}T00:00:00+09:00`);
}

function formatDateKST(value) {
  const date = typeof value === "string" ? dateFromInput(value) : value;
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const w = WEEKDAY_KO[date.getDay()];
  return `${y}년 ${m}월 ${d}일 (${w})`;
}

function formatTableTitleDate(value) {
  const date = typeof value === "string" ? dateFromInput(value) : value;
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const w = WEEKDAY_KO[date.getDay()];
  return `${m}월 ${d}일(${w})`;
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function setStatus(main, sub, badge) {
  // 상단 상태 카드는 제거했습니다. 로딩/오류 상태는 표와 오류 박스에서만 표시합니다.
}

function updateClock() {
  const now = getKstDate();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  $("clockText").textContent = `${hh}:${mm}:${ss}`;
}

function showError(message) {
  const box = $("errorBox");
  box.style.display = "block";
  box.textContent = message;
}

function clearError() {
  const box = $("errorBox");
  box.style.display = "none";
  box.textContent = "";
}

function setLoading(message = "컴시간알리미 서버에서 시간표를 불러오고 있습니다.") {
  $("timetable").innerHTML = `<tbody><tr><td class="loading">${escapeHtml(message)}</td></tr></tbody>`;
}

async function fetchTimetable(dateValue) {
  const res = await fetch(`/api/timetable?date=${encodeURIComponent(dateValue)}`, { cache: "no-store" });
  const text = await res.text();

  if (!res.ok) throw new Error(`API 오류 ${res.status}\n${text.slice(0, 600)}`);

  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error("API 응답을 JSON으로 해석하지 못했습니다.\n" + text.slice(0, 600));
  }
}

async function fetchMeal(dateValue) {
  const res = await fetch(`/api/meal?date=${encodeURIComponent(dateValue)}`, { cache: "no-store" });
  const text = await res.text();

  if (!res.ok) throw new Error(`급식 API 오류 ${res.status}\n${text.slice(0, 600)}`);

  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error("급식 API 응답을 JSON으로 해석하지 못했습니다.\n" + text.slice(0, 600));
  }
}

function makeTimetableSignature(data) {
  // 화면 표시와 관련된 원본 시간표 데이터만 비교합니다.
  return JSON.stringify({
    자료147: data?.["자료147"] || null,
    자료481: data?.["자료481"] || null,
    자료492: data?.["자료492"] || null,
    자료446: data?.["자료446"] || null,
    자료244: data?.["자료244"] || null
  });
}

async function refreshTimetableOnly({ force = false, showLoading = false } = {}) {
  clearError();
  if (showLoading) setLoading();

  const timetable = await fetchTimetable(state.date);
  const nextSignature = makeTimetableSignature(timetable);
  const changed = force || !state.timetableSignature || nextSignature !== state.timetableSignature;

  if (changed) {
    state.data = timetable;
    state.timetableSignature = nextSignature;
    state.updatedAt = new Date();
    render();
  }

  return changed;
}

function decodeLessonCode(value, data) {
  if (value === undefined || value === null || value === 0 || value === "0") {
    return { subject: "", teacher: "", changed: false, raw: value };
  }

  const raw = String(value);
  const changed = raw.startsWith(">");
  const numeric = Number(raw.replace(">", ""));

  if (!numeric) return { subject: "", teacher: "", changed, raw: value };

  const subjectIndex = Math.floor(numeric / 1000);
  const teacherIndex = numeric % 1000;

  return {
    subject: data["자료492"]?.[subjectIndex] || "",
    teacher: data["자료446"]?.[teacherIndex] || "",
    changed,
    raw: value
  };
}

function getDayArray(data, grade, classNo, dayIndex) {
  const changedDay = data?.["자료147"]?.[grade]?.[classNo]?.[dayIndex];
  const baseDay = data?.["자료481"]?.[grade]?.[classNo]?.[dayIndex];

  if (Array.isArray(changedDay) && changedDay.length > 1 && changedDay.slice(1).some((v) => v !== 0 && v !== "0")) {
    return changedDay;
  }

  return baseDay;
}

function render() {
  const grade = Number(state.grade);
  const date = dateFromInput(state.date);
  const dayIndex = date.getDay();

  updateGradeButtons();
  $("dateInput").value = state.date;
  $("tableTitle").textContent = `${formatTableTitleDate(state.date)} ${grade}학년 시간표`;

  if (!state.data) return;

  const updated = state.updatedAt
    ? state.updatedAt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
    : "";

  $("refreshInfo").textContent = updated ? `마지막 새로고침: ${updated}` : "마지막 새로고침: -";

  if (dayIndex === 0 || dayIndex === 6) {
    setStatus(formatDateKST(state.date), "주말입니다. 해당 날짜 데이터가 없으면 빈칸으로 표시됩니다.", `${grade}학년`);
  } else {
    setStatus(formatDateKST(state.date), "", `${grade}학년`);
  }

  let thead = `
    <thead>
      <tr>
        <th class="period class-head">교시</th>
        ${Array.from({ length: CLASSES_PER_GRADE }, (_, i) => `<th class="class-head">${i + 1}반</th>`).join("")}
      </tr>
    </thead>
  `;

  let tbody = "<tbody>";

  for (let period = 1; period <= PERIODS; period++) {
    tbody += `<tr><th class="period">${period}교시</th>`;

    for (let classNo = 1; classNo <= CLASSES_PER_GRADE; classNo++) {
      const dayArray = getDayArray(state.data, grade, classNo, dayIndex);
      const lesson = decodeLessonCode(dayArray?.[period], state.data);
      const subject = lesson.subject || "";

      tbody += `
        <td class="${lesson.changed ? "changed" : ""}" title="${escapeHtml(lesson.teacher || "")}">
          <div class="cell ${subject ? "" : "empty"}">${escapeHtml(subject || "-")}</div>
        </td>
      `;
    }

    tbody += "</tr>";
  }

  tbody += "</tbody>";
  $("timetable").innerHTML = thead + tbody;
}

function renderMealLoading() {
  $("mealBadge").textContent = "불러오는 중";
  $("mealBox").className = "meal-empty";
  $("mealBox").textContent = "급식 정보를 불러오는 중입니다.";
  $("mealMeta").textContent = "";
}

function renderMeal(data) {
  if (!data?.ok || !Array.isArray(data.menu) || data.menu.length === 0) {
    $("mealBadge").textContent = "정보 없음";
    $("mealBox").className = "meal-empty";
    $("mealBox").textContent = data?.message || "해당 날짜의 급식 정보가 없습니다.";
    $("mealMeta").textContent = "";
    return;
  }

  $("mealBadge").textContent = data.mealName || "중식";
  $("mealBox").className = "meal-menu-card";
  $("mealBox").innerHTML = data.menu.map((item) => {
    const name = typeof item === "string" ? item : item.name;
    const allergens = Array.isArray(item?.allergens) ? item.allergens : [];
    const allergenNames = allergens
      .map((code) => ALLERGEN_MAP[String(code)] || String(code))
      .filter(Boolean)
      .join(" · ");

    return `
      <div class="meal-line">
        <span class="meal-name">${escapeHtml(name)}</span>
        ${allergenNames ? `<span class="allergen-names">(${escapeHtml(allergenNames)})</span>` : ""}
      </div>
    `;
  }).join("");
  $("mealMeta").textContent = data.calories ? `열량: ${data.calories}` : "";
  requestAnimationFrame(fitMealTextToCard);
}

function fitMealTextToCard() {
  const box = $("mealBox");
  if (!box || !box.classList.contains("meal-menu-card")) return;

  const maxFont = 22;
  const minFont = 13;

  box.style.setProperty("--meal-font-size", `${maxFont}px`);

  let size = maxFont;
  while (size > minFont && box.scrollHeight > box.clientHeight) {
    size -= 0.5;
    box.style.setProperty("--meal-font-size", `${size}px`);
  }
}

window.addEventListener("resize", () => {
  requestAnimationFrame(fitMealTextToCard);
});

async function loadMeal() {
  renderMealLoading();
  try {
    const meal = await fetchMeal(state.date);
    renderMeal(meal);
  } catch (err) {
    console.error(err);
    $("mealBadge").textContent = "오류";
    $("mealBox").className = "meal-empty";
    $("mealBox").textContent = "급식 정보를 불러오지 못했습니다.";
    $("mealMeta").textContent = err?.message || String(err);
  }
}

async function loadTimetable({ includeMeal = true, force = true, showLoading = true } = {}) {
  clearError();
  if (showLoading) setLoading();
  $("reloadBtn").disabled = true;

  try {
    setStatus(formatDateKST(state.date), "내 사이트 API를 통해 컴시간 서버에 연결 중입니다.", "연결 중");

    if (includeMeal) {
      await Promise.all([
        refreshTimetableOnly({ force, showLoading: false }),
        loadMeal()
      ]);
    } else {
      await refreshTimetableOnly({ force, showLoading: false });
    }
  } catch (err) {
    console.error(err);
    showError("시간표를 불러오지 못했습니다.\n" + (err?.message || err));
    setStatus(formatDateKST(state.date), "시간표 로딩 실패", "오류");
  } finally {
    $("reloadBtn").disabled = false;
  }
}

async function refreshAllManually() {
  clearError();
  await Promise.all([
    loadTimetable({ includeMeal: true, force: true, showLoading: true }),
    loadNotice()
  ]);
}

async function checkDateHourly() {
  const today = toDateInputValue(getKstDate());
  if (today !== state.date) {
    state.date = today;
    $("dateInput").value = today;
    await loadTimetable({ includeMeal: true, force: true, showLoading: false });
  }
}

async function checkTimetableEveryFiveMinutes() {
  try {
    await loadTimetable({ includeMeal: false, force: false, showLoading: false });
  } catch (error) {
    console.error(error);
  }
}

async function fetchNotice(grade) {
  const res = await fetch(`/api/notice?grade=${encodeURIComponent(grade)}`, { cache: "no-store" });
  const text = await res.text();
  if (!res.ok) throw new Error(`공지사항 API 오류 ${res.status}\n${text.slice(0, 400)}`);
  return JSON.parse(text);
}

async function loadNotice() {
  state.noticeLoading = true;
  renderNotice();

  try {
    const data = await fetchNotice(state.grade);
    state.noticeText = data?.content || "";
  } catch (error) {
    console.error(error);
    state.noticeText = "";
    showError("공지사항을 불러오지 못했습니다.\n" + (error?.message || error));
  } finally {
    state.noticeLoading = false;
    renderNotice();
  }
}

async function saveNotice(value) {
  const res = await fetch(`/api/notice?grade=${encodeURIComponent(state.grade)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ content: value })
  });

  const text = await res.text();

  if (!res.ok) throw new Error(`공지사항 저장 오류 ${res.status}\n${text.slice(0, 400)}`);

  const data = JSON.parse(text);
  state.noticeText = data?.content || "";
  return true;
}

async function clearNotice() {
  return saveNotice("");
}

function renderNotice() {
  const value = state.noticeText || "";
  const view = $("noticeView");
  const input = $("noticeInput");

  if (!state.noticeEditing) input.value = value;

  if (state.noticeEditing) {
    view.style.display = "none";
    input.style.display = "block";
    $("noticeEditBtn").textContent = "보기";
    setTimeout(() => input.focus(), 0);
  } else {
    input.style.display = "none";
    view.style.display = "block";
    $("noticeEditBtn").textContent = "수정";
    view.textContent = state.noticeLoading ? "공지사항을 불러오는 중입니다." : (value || "공지사항을 입력하세요.");
    view.classList.toggle("notice-placeholder", state.noticeLoading || !value);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function updateGradeButtons() {
  document.querySelectorAll(".grade-btn").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.grade) === Number(state.grade));
  });
}

document.querySelectorAll(".grade-btn").forEach((button) => {
  button.addEventListener("click", async () => {
    state.grade = Number(button.dataset.grade);
    state.noticeEditing = false;
    render();
    await loadNotice();
  });
});

$("dateInput").addEventListener("change", async (e) => {
  state.date = e.target.value;
  await loadTimetable({ includeMeal: true, force: true, showLoading: true });
});

$("reloadBtn").addEventListener("click", refreshAllManually);

$("noticeEditBtn").addEventListener("click", () => {
  state.noticeEditing = !state.noticeEditing;
  renderNotice();
});

$("noticeSaveBtn").addEventListener("click", async () => {
  try {
    const ok = await saveNotice($("noticeInput").value.trim());
    if (ok) {
      state.noticeEditing = false;
      renderNotice();
    }
  } catch (error) {
    console.error(error);
    showError("공지사항을 저장하지 못했습니다.\n" + (error?.message || error));
  }
});

$("noticeClearBtn").addEventListener("click", async () => {
  try {
    const ok = await clearNotice();
    if (ok) {
      state.noticeEditing = false;
      renderNotice();
    }
  } catch (error) {
    console.error(error);
    showError("공지사항을 비우지 못했습니다.\n" + (error?.message || error));
  }
});

$("noticeInput").addEventListener("keydown", async (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    try {
      const ok = await saveNotice($("noticeInput").value.trim());
      if (ok) {
        state.noticeEditing = false;
        renderNotice();
      }
    } catch (error) {
      console.error(error);
      showError("공지사항을 저장하지 못했습니다.\n" + (error?.message || error));
    }
  }
});

(async function init() {
  state.grade = 1;
  state.date = toDateInputValue(getKstDate());
  updateGradeButtons();
  $("dateInput").value = state.date;
  setStatus(formatDateKST(state.date), "시간표를 준비 중입니다.", "준비 중");
  renderNotice();
  await loadNotice();
  updateClock();
  setInterval(updateClock, 1000);
  setInterval(checkDateHourly, 60 * 60 * 1000);
  setInterval(checkTimetableEveryFiveMinutes, 5 * 60 * 1000);
  await loadTimetable({ includeMeal: true, force: true, showLoading: true });
})();
