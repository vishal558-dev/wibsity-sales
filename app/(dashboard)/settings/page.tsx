import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <>
      <PageHeader title="Settings" description="Your account for wibsity sales." />
      <Card className="max-w-sm">
        <CardHeader>
          <CardTitle className="text-sm font-medium">Signed in as</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-foreground">{user?.email}</p>
        </CardContent>
      </Card>
    </>
  );
}
