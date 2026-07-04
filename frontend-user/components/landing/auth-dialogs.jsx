"use client";

// Lightweight shims. The original Stockex dialogs embedded full login/signup/
// deposit forms wired to that app's backend. On this marketing landing every
// CTA simply routes to THIS project's auth pages so the buttons stay clickable
// and look identical.
import { useRouter } from "next/navigation";

function Cta({ trigger, href }) {
  const router = useRouter();
  return (
    <span onClick={() => router.push(href)} className="contents cursor-pointer">
      {trigger}
    </span>
  );
}

export function LoginDialog({ trigger }) {
  return <Cta trigger={trigger} href="/login" />;
}
export function OpenAccountDialog({ trigger }) {
  return <Cta trigger={trigger} href="/register" />;
}
export function TalkToTeamDialog({ trigger }) {
  return <Cta trigger={trigger} href="/register" />;
}
export function DemoTradingDialog({ trigger }) {
  return <Cta trigger={trigger} href="/register" />;
}
export function BrokerProgramDialog({ trigger }) {
  return <Cta trigger={trigger} href="/register" />;
}
export function DepositDialog({ trigger }) {
  return <Cta trigger={trigger} href="/login" />;
}
export function StartTradingDialog({ trigger }) {
  return <Cta trigger={trigger} href="/register" />;
}
export function BecomePartnerDialog({ trigger }) {
  return <Cta trigger={trigger} href="/register" />;
}
