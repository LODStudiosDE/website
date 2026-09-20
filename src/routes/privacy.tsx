import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { LegalPageShell } from "@/components/LegalPageShell";
import { PrivacyContent } from "@/components/PrivacyContent";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "LODStudios | Privacy Policy" },
      { name: "description", content: "How Tebex and LODStudios handle your personal data." },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPageShell
      eyebrow="Privacy"
      title="Privacy Policy"
      description="Tebex Privacy Policy"
      icon={ShieldCheck}
    >
      <PrivacyContent />
    </LegalPageShell>
  );
}
