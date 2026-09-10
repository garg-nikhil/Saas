import { redirect } from "react-router";
import type { Route } from "./+types/app.parametres.index";

export async function loader() {
  throw redirect("/app/parametres/profil");
}

export default function ParametresIndex() {
  return null;
}
