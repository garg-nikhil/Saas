import { redirect } from "react-router";
import type { Route } from "./+types/logout";
import { getAppEnv } from "../context";
import { createAuthService } from "../auth";

export async function action({ request, context }: Route.ActionArgs) {
  const env = getAppEnv(context);
  const { authService, responseHeaders } = createAuthService(request, env);

  await authService.signOut();

  return redirect("/login", {
    headers: responseHeaders,
  });
}

export async function loader() {
  return redirect("/login");
}

export default function Logout() {
  return null;
}
