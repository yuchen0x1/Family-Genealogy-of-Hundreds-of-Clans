import { ok, route } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const GET = route(async () => {
  const user = await getCurrentUser();
  if (!user) return ok({ authenticated: false, user: null });
  const profile = await prisma.userProfile.findUnique({ where: { userId: user.id } });
  const [familyCount, collaboratorCount, documentCount] = await Promise.all([
    prisma.family.count({ where: { ownerId: user.id, deletedAt: null } }),
    prisma.familyCollaborator.count({ where: { userId: user.id, status: "ACTIVE" } }),
    prisma.familyDocument.count({ where: { uploadedById: user.id, deletedAt: null } }),
  ]);
  return ok({
    authenticated: true,
    user: {
      ...user,
      profile: profile ? { displayName: profile.displayName, bio: profile.bio, surname: profile.surname, location: profile.location, privacySettings: profile.privacySettings } : null,
      stats: { familyCount, collaboratorCount, documentCount },
    },
  });
});
