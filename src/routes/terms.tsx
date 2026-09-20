import { createFileRoute } from "@tanstack/react-router";
import { ScrollText } from "lucide-react";
import { LegalPageShell } from "@/components/LegalPageShell";
import { TermsContent } from "@/components/TermsContent";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "LODStudios | Terms & Conditions" },
      { name: "description", content: "Tebex Terms and Conditions for LODStudios purchases." },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPageShell
      eyebrow="Legal"
      title="Terms & Conditions"
      description="Tebex Terms and Conditions"
      icon={ScrollText}
    >
      <TermsContent />
    </LegalPageShell>
  );
}
