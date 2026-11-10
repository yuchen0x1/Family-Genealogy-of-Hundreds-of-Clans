import { ok, route, assertSameOrigin } from "@/lib/api";
import { destroySession, getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const POST = route(async (req: Request) => {
  assertSameOrigin(req);
  const user = await getCurrentUser();
  await destroySession();
  await audit(req, user?.id ?? null, "auth.logout", "user", user?.id ?? null);
  return ok({ loggedOut: true });
});
