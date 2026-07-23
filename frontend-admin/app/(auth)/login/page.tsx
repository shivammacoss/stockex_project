"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ShieldCheck, Rocket } from "lucide-react";
import { useAdminAuthStore } from "@/stores/authStore";
import { AdminAuthAPI, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandLogo } from "@/components/layout/BrandLogo";
import { InstallPWAButton } from "@/components/pwa/InstallPWAButton";

const schema = z.object({
  identifier: z.string().min(3, "Enter your admin email or user code"),
  password: z.string().min(8, "Minimum 8 characters"),
});
type FormValues = z.infer<typeof schema>;

const demoSchema = z.object({
  full_name: z.string().min(2, "Enter your full name").max(128),
  email: z.string().email("Invalid email"),
  mobile: z.string().regex(/^[6-9]\d{9}$/, "10-digit Indian mobile"),
  password: z
    .string()
    .min(8, "Min 8 chars")
    .regex(/[A-Z]/, "One uppercase")
    .regex(/[a-z]/, "One lowercase")
    .regex(/\d/, "One digit")
    .regex(/[^A-Za-z0-9]/, "One special char"),
});
type DemoValues = z.infer<typeof demoSchema>;

export default function AdminLoginPage() {
  const router = useRouter();
  const login = useAdminAuthStore((s) => s.login);
  const setSession = useAdminAuthStore((s) => s.setSession);
  const [demoOpen, setDemoOpen] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { identifier: "", password: "" },
  });

  const demoForm = useForm<DemoValues>({
    resolver: zodResolver(demoSchema),
    defaultValues: { full_name: "", email: "", mobile: "", password: "" },
  });

  async function onSubmit(values: FormValues) {
    try {
      await login(values.identifier, values.password);
      toast.success("Authenticated");
      router.push("/dashboard");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Login failed");
    }
  }

  async function onDemoSubmit(values: DemoValues) {
    try {
      const pair = await AdminAuthAPI.brokerDemoRegister(values);
      setSession(pair);
      toast.success("Demo broker ready — 🪙50,00,000 virtual float");
      router.push("/dashboard");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not start broker demo");
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3">
          <BrandLogo href={null} size="md" showAdminBadge={false} />
          <div className="inline-flex w-fit items-center gap-2 rounded-md bg-destructive/10 px-2 py-1 text-xs uppercase tracking-wider text-destructive">
            <ShieldCheck className="size-3" />
            Restricted access · Admin only
          </div>
          <CardTitle className="text-2xl">Super Admin Login</CardTitle>
          <CardDescription>
            StockEx control panel — sign in with your admin credentials.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="identifier">Admin email or user code</Label>
              <Input id="identifier" autoComplete="username" {...form.register("identifier")} />
              {form.formState.errors.identifier && (
                <p className="text-xs text-destructive">{form.formState.errors.identifier.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="current-password" {...form.register("password")} />
              {form.formState.errors.password && (
                <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
              )}
            </div>
            <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
              Sign in
            </Button>
            <p className="text-xs text-muted-foreground">
              Activity is logged. IP allow-listing and rate-limiting are enforced server-side.
            </p>
          </form>

          {/* Install web app — sits below the form so it doesn't compete
              with the primary "Sign in" CTA. Only renders a real button
              when the browser actually supports install (Chromium fires
              `beforeinstallprompt`) or when the visitor is on iOS where
              we surface a manual "Add to Home Screen" walkthrough. */}
          <div className="mt-5 space-y-2 border-t border-border pt-4">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs font-semibold">Install MP Admin app</div>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  One-tap home-screen launcher. Stays signed in like a native app.
                </p>
              </div>
            </div>
            <InstallPWAButton />
          </div>

          {/* ── Broker demo signup ─────────────────────────────────────
              Anyone can spin up a personal DEMO BROKER dashboard with 50L
              virtual float. Blocked from creating users until they switch
              to a real broker account (from inside the dashboard). */}
          <div className="mt-5 border-t border-border pt-4">
            {!demoOpen ? (
              <button
                type="button"
                onClick={() => setDemoOpen(true)}
                className="flex w-full items-center gap-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5 text-left transition-colors hover:bg-emerald-500/10"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-md bg-emerald-600 text-white">
                  <Rocket className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">Try a Broker Demo</span>
                  <span className="block text-[11px] text-muted-foreground">
                    Free broker dashboard · 🪙50,00,000 virtual · switch to real anytime
                  </span>
                </span>
              </button>
            ) : (
              <form onSubmit={demoForm.handleSubmit(onDemoSubmit)} className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Create broker demo</div>
                  <button
                    type="button"
                    onClick={() => setDemoOpen(false)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="demo_full_name">Full name</Label>
                  <Input id="demo_full_name" placeholder="Your name" {...demoForm.register("full_name")} />
                  {demoForm.formState.errors.full_name && (
                    <p className="text-xs text-destructive">{demoForm.formState.errors.full_name.message}</p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="demo_email">Email</Label>
                    <Input id="demo_email" type="email" placeholder="you@example.com" {...demoForm.register("email")} />
                    {demoForm.formState.errors.email && (
                      <p className="text-xs text-destructive">{demoForm.formState.errors.email.message}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="demo_mobile">Mobile</Label>
                    <Input id="demo_mobile" inputMode="numeric" maxLength={10} placeholder="9999900000" {...demoForm.register("mobile")} />
                    {demoForm.formState.errors.mobile && (
                      <p className="text-xs text-destructive">{demoForm.formState.errors.mobile.message}</p>
                    )}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="demo_password">Password</Label>
                  <Input id="demo_password" type="password" placeholder="Abc@1234" {...demoForm.register("password")} />
                  {demoForm.formState.errors.password && (
                    <p className="text-xs text-destructive">{demoForm.formState.errors.password.message}</p>
                  )}
                </div>
                <Button
                  type="submit"
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                  loading={demoForm.formState.isSubmitting}
                >
                  <Rocket className="mr-1.5 size-4" /> Start broker demo
                </Button>
              </form>
            )}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
