import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const applicationInput = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  email: z.string().trim().email().max(255),
  origin: z.string().trim().min(2).max(80),
  birthdate: z.string().trim().min(1).max(40),
  hobbies: z.string().trim().min(3).max(500),
  // experience (previous stations) and references (portfolio) are position-dependent;
  // exactly one is filled on the client, so both are optional here.
  experience: z.string().trim().max(1500).optional().default(""),
  references: z.string().trim().max(1500).optional().default(""),
  position: z.string().trim().min(1).max(120),
});

export const submitJobApplication = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => applicationInput.parse(data))
  .handler(async ({ data }) => {
    const { sendApplicationEmail } = await import("./job-application.server");
    await sendApplicationEmail(data);
    return { ok: true as const };
  });
