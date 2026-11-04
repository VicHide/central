import { iniciaStudio } from "@/server/jobs";

export const dynamic = "force-dynamic";
export async function POST() {
  iniciaStudio();
  return Response.json({ url: "http://localhost:3001" });
}
