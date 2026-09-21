import { createFileRoute } from "@tanstack/react-router";
import { Gavel } from "lucide-react";
import { LegalPageShell } from "@/components/LegalPageShell";
import { TermsOfServiceContent } from "@/components/TermsOfServiceContent";

export const Route = createFileRoute("/tos")({
  head: () => ({
    meta: [
      { title: "LODStudios | Terms of Service" },
      { name: "description", content: "LODStudios Terms of Service for digital content and services." },
    ],
  }),
  component: TosPage,
});

function TosPage() {
  return (
    <LegalPageShell
      eyebrow="Legal"
      title="Terms of Service"
      description="LODStudios Terms of Service"
      lastUpdated="June 24, 2026"
      icon={Gavel}
    >
      <TermsOfServiceContent />
    </LegalPageShell>
  );
}
