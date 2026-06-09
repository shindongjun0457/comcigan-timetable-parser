const ATPT_OFCDC_SC_CODE = "T10"; // 제주특별자치도교육청
const SD_SCHUL_CODE = "9296032"; // 오현중학교
const NEIS_BASE = "https://open.neis.go.kr/hub/mealServiceDietInfo";

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

function isValidDateParam(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || "");
}

function compactDate(value) {
  return value.replaceAll("-", "");
}

function parseMealItems(text = "") {
  return String(text)
    .replace(/<br\s*\/?>/gi, "\n")
    .split("\n")
    .map((line) => line.replace(/[•·]/g, "").trim())
    .filter(Boolean)
    .map((line) => {
      const allergens = [];

      line.replace(/\(([^)]*)\)/g, (_, inside) => {
        const value = String(inside).trim();
        if (/^[0-9.\s]+$/.test(value)) {
          value
            .split(".")
            .map((code) => code.trim())
            .filter((code) => /^\d+$/.test(code))
            .forEach((code) => {
              const n = Number(code);
              if (n >= 1 && n <= 19 && !allergens.includes(String(n))) {
                allergens.push(String(n));
              }
            });
        }
        return "";
      });

      const name = line
        .replace(/\([^)]*\)/g, "")
        .replace(/\d+\./g, "")
        .replace(/\s+/g, " ")
        .trim();

      return { name, allergens };
    })
    .filter((item) => item.name);
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
        error: "date 파라미터가 필요합니다. 예: /api/meal?date=2026-05-27"
      }, 400);
    }

    const target = new URL(NEIS_BASE);
    const key = context.env?.NEIS_API_KEY || context.env?.NEIS_KEY || "";

    if (!key) {
      return jsonResponse({
        ok: false,
        error: "NEIS_API_KEY 환경변수가 설정되지 않았습니다. Cloudflare Pages Settings > Variables and Secrets에 NEIS_API_KEY를 추가하세요."
      }, 500);
    }

    target.searchParams.set("KEY", key);
    target.searchParams.set("Type", "json");
    target.searchParams.set("pIndex", "1");
    target.searchParams.set("pSize", "5");
    target.searchParams.set("ATPT_OFCDC_SC_CODE", ATPT_OFCDC_SC_CODE);
    target.searchParams.set("SD_SCHUL_CODE", SD_SCHUL_CODE);
    target.searchParams.set("MLSV_YMD", compactDate(dateParam));

    const upstream = await fetch(target.toString(), {
      cf: {
        cacheTtl: 0,
        cacheEverything: false
      }
    });

    const text = await upstream.text();
    let data;

    try {
      data = JSON.parse(text);
    } catch (error) {
      return jsonResponse({
        ok: false,
        error: "나이스 급식 응답을 JSON으로 해석하지 못했습니다.",
        body: text.slice(0, 1000)
      }, 502);
    }

    const rows = data?.mealServiceDietInfo?.[1]?.row || [];

    if (!rows.length) {
      return jsonResponse({
        ok: true,
        date: dateParam,
        menu: [],
        message: "해당 날짜의 급식 정보가 없습니다."
      });
    }

    const row = rows[0];

    return jsonResponse({
      ok: true,
      date: dateParam,
      mealName: row.MMEAL_SC_NM || "급식",
      calories: row.CAL_INFO || "",
      menu: parseMealItems(row.DDISH_NM || ""),
      raw: row
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: error?.message || String(error)
    }, 500);
  }
}
