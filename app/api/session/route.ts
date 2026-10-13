import { clearSessionCookie, ensureAccessSeeded, getSession, login, logout, sessionCookie } from "@/lib/server/store";

function message(error: unknown) { return error instanceof Error ? error.message : "操作失败，请稍后重试。"; }

export async function GET(request: Request) {
  try { await ensureAccessSeeded(); const session = await getSession(request); return session ? Response.json({ session }) : Response.json({ error: "未登录" }, { status: 401 }); }
  catch (error) { return Response.json({ error: message(error) }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { code?: string }; const result = await login(request, String(body.code ?? ""));
    return new Response(JSON.stringify({ session: result.session, label: result.label }), { status: 200, headers: { "content-type": "application/json; charset=utf-8", "set-cookie": sessionCookie(result.token) } });
  } catch (error) { return Response.json({ error: message(error) }, { status: 400 }); }
}

export async function DELETE(request: Request) {
  try { await logout(request); return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json; charset=utf-8", "set-cookie": clearSessionCookie() } }); }
  catch (error) { return Response.json({ error: message(error) }, { status: 500 }); }
}
