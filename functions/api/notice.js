const ALLOWED_GRADES = new Set(["1", "2", "3"]);
const MAX_NOTICE_LENGTH = 2000;
const MAX_VISION_LENGTH = 120;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function getGrade(request) {
  const url = new URL(request.url);
  const grade = url.searchParams.get("grade") || "1";

  if (!ALLOWED_GRADES.has(grade)) return null;
  return grade;
}

function getNoticeKey(grade) {
  return `notice:grade:${grade}`;
}

function getVisionKey(grade) {
  return `vision:grade:${grade}`;
}

function getSchoolVisionKey() {
  return "vision:school";
}

function normalizeOptionalText(value) {
  if (value === undefined) return undefined;
  return String(value || "").trim();
}

export async function onRequestGet(context) {
  const grade = getGrade(context.request);

  if (!grade) {
    return json({
      ok: false,
      message: "grade는 1, 2, 3 중 하나여야 합니다."
    }, 400);
  }

  if (!context.env.NOTICES) {
    return json({
      ok: false,
      message: "Cloudflare KV 바인딩 NOTICES가 설정되지 않았습니다."
    }, 500);
  }

  const [content, vision, schoolVision] = await Promise.all([
    context.env.NOTICES.get(getNoticeKey(grade)),
    context.env.NOTICES.get(getVisionKey(grade)),
    context.env.NOTICES.get(getSchoolVisionKey())
  ]);

  return json({
    ok: true,
    grade,
    content: content || "",
    vision: vision || "",
    schoolVision: schoolVision || ""
  });
}

export async function onRequestPost(context) {
  const grade = getGrade(context.request);

  if (!grade) {
    return json({
      ok: false,
      message: "grade는 1, 2, 3 중 하나여야 합니다."
    }, 400);
  }

  if (!context.env.NOTICES) {
    return json({
      ok: false,
      message: "Cloudflare KV 바인딩 NOTICES가 설정되지 않았습니다."
    }, 500);
  }

  let body;

  try {
    body = await context.request.json();
  } catch (error) {
    return json({
      ok: false,
      message: "JSON 본문을 해석하지 못했습니다."
    }, 400);
  }

  const content = normalizeOptionalText(body?.content);
  const vision = normalizeOptionalText(body?.vision);
  const schoolVision = normalizeOptionalText(body?.schoolVision);

  if (content === undefined && vision === undefined && schoolVision === undefined) {
    return json({
      ok: false,
      message: "저장할 content, vision 또는 schoolVision 값이 필요합니다."
    }, 400);
  }

  if (content !== undefined && content.length > MAX_NOTICE_LENGTH) {
    return json({
      ok: false,
      message: `공지사항은 ${MAX_NOTICE_LENGTH}자 이내로 입력해 주세요.`
    }, 400);
  }

  if (vision !== undefined && vision.length > MAX_VISION_LENGTH) {
    return json({
      ok: false,
      message: `학년 비전은 ${MAX_VISION_LENGTH}자 이내로 입력해 주세요.`
    }, 400);
  }

  if (schoolVision !== undefined && schoolVision.length > MAX_VISION_LENGTH) {
    return json({
      ok: false,
      message: `학교 비전은 ${MAX_VISION_LENGTH}자 이내로 입력해 주세요.`
    }, 400);
  }

  const writes = [];

  if (content !== undefined) {
    writes.push(context.env.NOTICES.put(getNoticeKey(grade), content));
  }

  if (vision !== undefined) {
    writes.push(context.env.NOTICES.put(getVisionKey(grade), vision));
  }

  if (schoolVision !== undefined) {
    writes.push(context.env.NOTICES.put(getSchoolVisionKey(), schoolVision));
  }

  await Promise.all(writes);

  const [savedContent, savedVision, savedSchoolVision] = await Promise.all([
    context.env.NOTICES.get(getNoticeKey(grade)),
    context.env.NOTICES.get(getVisionKey(grade)),
    context.env.NOTICES.get(getSchoolVisionKey())
  ]);

  return json({
    ok: true,
    grade,
    content: savedContent || "",
    vision: savedVision || "",
    schoolVision: savedSchoolVision || "",
    updatedAt: new Date().toISOString()
  });
}
