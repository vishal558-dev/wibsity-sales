import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-muted-foreground">
          wibsity
        </span>
        <h1 className="text-xl font-semibold text-foreground">
          Sign in to wibsity sales
        </h1>
      </div>
      <LoginForm />
    </div>
  );
}
