import { notFound } from "next/navigation";
import { connection } from "next/server";

export { NOT_FOUND_SEGMENT } from "./not-found-segment";

/**
 * A 404 for a URL the build didn't make. Rendered per request, so Next doesn't send
 * it with the long cache lifetime it gives a built page. Not in a static export,
 * where there's no request and a missing page is just left out.
 */
export async function uncachedNotFound(): Promise<never> {
  if (process.env.MARKLINE_EXPORT !== "1") await connection();
  notFound();
}
