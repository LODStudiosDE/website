// Public server function that exposes the partner/client list for the
// homepage. Returns only the fields needed to render the logo marquee.
import { createServerFn } from "@tanstack/react-start";
import { dbConfigured, readPartners } from "./db.server";

export type PublicPartner = {
  id: string;
  name: string;
  image: string;
  link: string;
};

export const getPartners = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicPartner[]> => {
    // Not configured yet (fresh checkout / env not filled in): render nothing
    // instead of failing the homepage.
    if (!dbConfigured()) return [];
    const partners = await readPartners();
    return partners
      .filter((p) => p.image && p.name)
      .map((p) => ({ id: p.id, name: p.name, image: p.image, link: p.link }));
  },
);
