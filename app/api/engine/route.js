import { getEngineState, setEngineState } from "@/lib/engine";

export async function GET() {
  try {
    const enabled = await getEngineState();
    return Response.json({ ok: true, enabled });
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 502 });
  }
}

export async function POST(request) {
  const body = await request.json();
  try {
    const enabled = await setEngineState(!!body.enabled);
    return Response.json({ ok: true, enabled });
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 502 });
  }
}
