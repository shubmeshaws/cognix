import { AdminSsoPanel } from "@/components/admin/AdminSsoPanel";
import { AdminUsersPanel } from "@/components/admin/AdminUsersPanel";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function AdminPage() {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-8">
      <AdminUsersPanel />
      <AdminSsoPanel />
    </div>
  );
}
