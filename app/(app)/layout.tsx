import { AppHeader } from "@/components/layout/app-header";
import { requirePageUser } from "@/lib/auth/session";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  return (
    <div className="min-h-screen bg-kumo-canvas">
      <AppHeader user={user} />
      {children}
    </div>
  );
}
