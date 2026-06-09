const SCHOOL_CODE = "46043";
const ENDPOINT = "36179";
const COMCI_BASE = "http://comci.net:4082";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store"
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

function textResponse(text, status = 200) {
  return new Response(text, {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function isValidDateParam(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || "");
}

function makeComciTimestamp(dateParam) {
  // 컴시간 요청 문자열은 "YYYY-MM-DD HH:mm:ss" 형식이다.
  // 날짜는 사용자가 선택한 날짜를 쓰고, 시각은 현재 한국 시각을 쓴다.
  const nowParts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(new Date());

  const parts = Object.fromEntries(nowParts.map((p) => [p.type, p.value]));
  const hh = pad(parts.hour === "24" ? "00" : parts.hour);
  const mm = pad(parts.minute);
  const ss = pad(parts.second);

  return `${dateParam} ${hh}:${mm}:${ss}`;
}

function toBase64Ascii(text) {
  return btoa(text);
}

async function requestComci(url) {
  return fetch(url, {
    method: "GET",
    headers: {
      "Accept": "*/*",
      "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
      "Referer": "http://comci.net:4082/st",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
      "X-Requested-With": "XMLHttpRequest"
    },
    cf: {
      cacheTtl: 0,
      cacheEverything: false
    }
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders()
  });
}

export async function onRequestGet(context) {
  try {
    const requestUrl = new URL(context.request.url);
    const dateParam = requestUrl.searchParams.get("date");

    if (!isValidDateParam(dateParam)) {
      return jsonResponse({
        ok: false,
        error: "date 파라미터가 필요합니다. 예: /api/timetable?date=2026-05-27"
      }, 400);
    }

    // 학교 확인 요청. 응답 본문은 사용하지 않지만, 컴시간 사이트 흐름에 맞춰 선행 호출한다.
    await requestComci(`${COMCI_BASE}/${ENDPOINT}?17384l${SCHOOL_CODE}`);

    const timestamp = makeComciTimestamp(dateParam);
    const payload = `73629_${SCHOOL_CODE}_${timestamp}_1`;
    const encoded = toBase64Ascii(payload);
    const targetUrl = `${COMCI_BASE}/${ENDPOINT}?${encoded}`;

    const upstream = await requestComci(targetUrl);
    const text = await upstream.text();

    if (!upstream.ok) {
      return jsonResponse({
        ok: false,
        error: `컴시간 서버 응답 오류: ${upstream.status}`,
        body: text.slice(0, 800)
      }, 502);
    }

    const end = text.lastIndexOf("}");
    const jsonText = end >= 0 ? text.slice(0, end + 1) : text;

    try {
      JSON.parse(jsonText);
    } catch (error) {
      return jsonResponse({
        ok: false,
        error: "컴시간 응답을 JSON으로 해석하지 못했습니다.",
        body: text.slice(0, 1200)
      }, 502);
    }

    return textResponse(jsonText, 200);
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: error?.message || String(error)
    }, 500);
  }
}
